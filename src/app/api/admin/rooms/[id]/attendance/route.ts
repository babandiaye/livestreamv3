import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { listAttendance } from "@/lib/attendance"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// Liste de présence d'une salle, groupée par cycle de réunion.
// Autorisation : ADMIN, ou modérateur créateur/enrôlé de la salle.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session || !["ADMIN", "MODERATOR"].includes(session.user.role))
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 })

  const { id } = await params

  if (session.user.role === "MODERATOR") {
    const room = await prisma.session.findUnique({
      where: { id },
      select: { creatorId: true, enrollments: { where: { userId: session.user.id }, select: { id: true } } },
    })
    if (!room) return NextResponse.json({ error: "Salle introuvable" }, { status: 404 })
    const allowed = room.creatorId === session.user.id || room.enrollments.length > 0
    if (!allowed) return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const groups = await listAttendance(id)
  return NextResponse.json({ groups })
}
