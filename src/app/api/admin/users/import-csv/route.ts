import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const BATCH_SIZE = 500
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Import global d'utilisateurs depuis un CSV (email, prenom, nom).
// Crée les comptes manquants (rôle VIEWER) sans les enrôler à une salle.
// Les utilisateurs déjà présents (par email) sont ignorés.
export async function POST(req: Request) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 })

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
    nomCol    = headers.findIndex(h => (h.includes("nom") && !h.includes("prenom")) || h.includes("lastname") || h.includes("last"))
    if (emailCol === -1) emailCol = 0
  }

  // Parser les lignes
  type CsvRow = { email: string; prenom: string; nom: string }
  const rows: CsvRow[] = []

  for (const line of dataLines) {
    const cols = line.split(sep).map(c => c.trim().replace(/^["']|["']$/g, ""))
    const email = cols[emailCol] ?? cols.find(c => EMAIL_RE.test(c)) ?? ""
    if (!EMAIL_RE.test(email)) continue

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

  // Récupérer les utilisateurs existants par batch
  const existing: { email: string }[] = []
  for (let i = 0; i < uniqueEmails.length; i += BATCH_SIZE) {
    const batch = uniqueEmails.slice(i, i + BATCH_SIZE)
    const found = await prisma.user.findMany({
      where: { email: { in: batch } },
      select: { email: true },
    })
    existing.push(...found)
  }
  const existingEmails = new Set(existing.map(u => u.email))

  // Créer les utilisateurs manquants par batch
  const missingRows = uniqueRows.filter(r => !existingEmails.has(r.email))
  let created = 0

  for (let i = 0; i < missingRows.length; i += BATCH_SIZE) {
    const batch = missingRows.slice(i, i + BATCH_SIZE)
    const res = await prisma.user.createMany({
      data: batch.map(r => ({
        email:      r.email,
        keycloakId: `csv-import-${r.email}`,
        name:       [r.prenom, r.nom].filter(Boolean).join(" ") || r.email.split("@")[0],
        role:       "VIEWER" as const,
      })),
      skipDuplicates: true,
    })
    created += res.count
  }

  return NextResponse.json({
    summary: {
      total:   uniqueEmails.length,
      created,
      skipped: uniqueEmails.length - created,
    },
  })
}
