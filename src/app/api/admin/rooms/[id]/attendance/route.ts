import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { listAttendance } from "@/lib/attendance"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// Autorisation commune aux deux verbes. Renvoie la réponse de refus, ou null si
// l'accès est accordé.
//
// `requireOwner` durcit la règle pour la suppression : la consultation est
// ouverte aux modérateurs enrôlés, mais effacer des présences est irréversible
// et engage la valeur probante de la feuille — on la réserve à l'ADMIN et au
// créateur de la salle.
async function refusEventuel(roomId: string, requireOwner: boolean): Promise<NextResponse | null> {
  const session = await auth()
  if (!session || !["ADMIN", "MODERATOR"].includes(session.user.role))
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 })

  if (session.user.role === "MODERATOR") {
    const room = await prisma.session.findUnique({
      where: { id: roomId },
      select: { creatorId: true, enrollments: { where: { userId: session.user.id }, select: { id: true } } },
    })
    if (!room) return NextResponse.json({ error: "Salle introuvable" }, { status: 404 })

    const isOwner = room.creatorId === session.user.id
    const allowed = requireOwner ? isOwner : isOwner || room.enrollments.length > 0
    if (!allowed) return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  return null
}

// Liste de présence d'une salle, groupée par cycle de réunion.
// Autorisation : ADMIN, ou modérateur créateur/enrôlé de la salle.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const refus = await refusEventuel(id, false)
  if (refus) return refus

  const groups = await listAttendance(id)
  return NextResponse.json({ groups })
}

// Suppression de présences.
//   ?cycle=<ms>                 → toute la séance
//   ?cycle=<ms>&identity=<id>   → un seul participant de cette séance
//
// `cycle` est obligatoire dans les deux cas : sans lui, on effacerait la
// présence de TOUTES les séances de la salle, une salle étant réutilisée d'une
// réunion à l'autre. Ce garde-fou est délibéré — pas de suppression globale
// accessible par omission d'un paramètre.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const refus = await refusEventuel(id, true)
  if (refus) return refus

  const cycle = req.nextUrl.searchParams.get("cycle")
  const identity = req.nextUrl.searchParams.get("identity")

  if (!cycle) return NextResponse.json({ error: "cycle requis" }, { status: 400 })

  const cycleMs = Number(cycle)
  if (!Number.isFinite(cycleMs))
    return NextResponse.json({ error: "cycle invalide" }, { status: 400 })

  const { count } = await prisma.attendance.deleteMany({
    where: {
      sessionId: id,
      sessionStartedAt: new Date(cycleMs),
      ...(identity ? { identity } : {}),
    },
  })

  console.log(`[attendance] suppression: salle=${id} cycle=${cycle}${identity ? ` identity=${identity}` : " (séance entière)"} → ${count} ligne(s)`)
  return NextResponse.json({ deleted: count })
}
