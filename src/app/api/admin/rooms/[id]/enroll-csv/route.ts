import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const BATCH_SIZE = 500

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session || !["ADMIN", "MODERATOR"].includes(session.user.role))
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 })

  const { id: sessionId } = await params

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  const room = await prisma.session.findUnique({ where: { id: sessionId } })
  if (!room) return NextResponse.json({ error: "Salle introuvable" }, { status: 404 })
  if (user?.role === "MODERATOR" && room.creatorId !== user.id)
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "Fichier manquant" }, { status: 400 })

  const text = await file.text()
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length === 0)
    return NextResponse.json({ error: "Fichier vide" }, { status: 400 })

  const sep = lines[0].includes(";") ? ";" : ","
  const firstLower = lines[0].toLowerCase()
  const hasHeader = firstLower.includes("email") || firstLower.includes("mail")
  const dataLines = hasHeader ? lines.slice(1) : lines

  // Détecter les colonnes depuis le header
  let emailCol = 0, prenomCol = -1, nomCol = -1
  if (hasHeader) {
    const headers = lines[0].toLowerCase().split(sep).map(h => h.trim())
    emailCol  = headers.findIndex(h => h.includes("email") || h.includes("mail"))
    prenomCol = headers.findIndex(h => h.includes("prenom") || h.includes("prénom") || h.includes("firstname") || h.includes("first"))
    nomCol    = headers.findIndex(h => h.includes("nom") && !h.includes("prenom") || h.includes("lastname") || h.includes("last"))
    if (emailCol === -1) emailCol = 0
  }

  // Parser les lignes
  type CsvRow = { email: string; prenom: string; nom: string }
  const rows: CsvRow[] = []

  for (const line of dataLines) {
    const cols = line.split(sep).map(c => c.trim().replace(/^["']|["']$/g, ""))
    const email = cols[emailCol] ?? cols.find(c => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) ?? ""
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue

    const prenom = prenomCol >= 0 ? (cols[prenomCol] ?? "") : ""
    const nom    = nomCol >= 0    ? (cols[nomCol] ?? "")    :
                   prenomCol >= 0 && cols.length > prenomCol + 1 ? (cols[prenomCol + 1] ?? "") : ""

    rows.push({ email: email.toLowerCase(), prenom, nom })
  }

  if (rows.length === 0)
    return NextResponse.json({ error: "Aucun email valide trouvé" }, { status: 400 })

  // Dédupliquer par email
  const rowsByEmail = new Map<string, CsvRow>()
  for (const row of rows) rowsByEmail.set(row.email, row)
  const uniqueRows = [...rowsByEmail.values()]
  const uniqueEmails = uniqueRows.map(r => r.email)

  console.log(`[enroll-csv] ${uniqueEmails.length} emails uniques à traiter`)

  // Récupérer les utilisateurs existants par batch
  const allUsers: { id: string; email: string }[] = []
  for (let i = 0; i < uniqueEmails.length; i += BATCH_SIZE) {
    const batch = uniqueEmails.slice(i, i + BATCH_SIZE)
    const found = await prisma.user.findMany({
      where: { email: { in: batch } },
      select: { id: true, email: true },
    })
    allUsers.push(...found)
  }
  const usersByEmail = new Map(allUsers.map(u => [u.email, u]))

  // Créer les utilisateurs manquants par batch
  const missingRows = uniqueRows.filter(r => !usersByEmail.has(r.email))
  let created = 0

  for (let i = 0; i < missingRows.length; i += BATCH_SIZE) {
    const batch = missingRows.slice(i, i + BATCH_SIZE)
    await prisma.user.createMany({
      data: batch.map(r => ({
        email:      r.email,
        keycloakId: `csv-import-${r.email}`,
        name:       [r.prenom, r.nom].filter(Boolean).join(" ") || r.email.split("@")[0],
        role:       "VIEWER" as const,
      })),
      skipDuplicates: true,
    })
    created += batch.length
    console.log(`[enroll-csv] ${created}/${missingRows.length} utilisateurs créés`)
  }

  // Recharger tous les utilisateurs (incluant les nouveaux)
  const allUsersRefreshed: { id: string; email: string }[] = []
  for (let i = 0; i < uniqueEmails.length; i += BATCH_SIZE) {
    const batch = uniqueEmails.slice(i, i + BATCH_SIZE)
    const found = await prisma.user.findMany({
      where: { email: { in: batch } },
      select: { id: true, email: true },
    })
    allUsersRefreshed.push(...found)
  }
  const usersRefreshedByEmail = new Map(allUsersRefreshed.map(u => [u.email, u]))

  // Récupérer les enrollments existants par batch
  const allUserIds = allUsersRefreshed.map(u => u.id)
  const existingEnrollments: { userId: string }[] = []
  for (let i = 0; i < allUserIds.length; i += BATCH_SIZE) {
    const batch = allUserIds.slice(i, i + BATCH_SIZE)
    const found = await prisma.enrollment.findMany({
      where: { sessionId, userId: { in: batch } },
      select: { userId: true },
    })
    existingEnrollments.push(...found)
  }
  const alreadyEnrolledIds = new Set(existingEnrollments.map(e => e.userId))

  const toEnroll: string[] = []
  const skipped: string[] = []

  for (const email of uniqueEmails) {
    const u = usersRefreshedByEmail.get(email)
    if (!u) continue
    if (alreadyEnrolledIds.has(u.id)) { skipped.push(email); continue }
    toEnroll.push(u.id)
  }

  // Enrôler par batch
  let enrolled = 0
  for (let i = 0; i < toEnroll.length; i += BATCH_SIZE) {
    const batch = toEnroll.slice(i, i + BATCH_SIZE)
    await prisma.enrollment.createMany({
      data: batch.map(userId => ({
        userId,
        sessionId,
        createdBy: session.user.id,
      })),
      skipDuplicates: true,
    })
    enrolled += batch.length
    console.log(`[enroll-csv] batch ${Math.floor(i / BATCH_SIZE) + 1} — ${enrolled}/${toEnroll.length} enrôlés`)
  }

  return NextResponse.json({
    summary: {
      total:   uniqueEmails.length,
      created,
      enrolled,
      skipped: skipped.length,
    },
    skipped: skipped.slice(0, 100),
  })
}
