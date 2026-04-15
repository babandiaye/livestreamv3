import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })

  const { id } = await params
  const room = await prisma.session.findUnique({ where: { id } })
  if (!room) return NextResponse.json({ error: "Salle non trouvée" }, { status: 404 })

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 403 })

  // Admin peut supprimer n'importe quelle salle, modérateur seulement les siennes
  if (user.role !== "ADMIN" && room.creatorId !== user.id)
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 })

  await prisma.enrollment.deleteMany({ where: { sessionId: id } })
  await prisma.recording.deleteMany({ where: { sessionId: id } })
  await prisma.session.delete({ where: { id } })
  return NextResponse.json({ success: true })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const room = await prisma.session.findUnique({ where: { id } })
  if (!room) return NextResponse.json({ error: "Salle non trouvée" }, { status: 404 })

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 403 })

  // Admin peut modifier n'importe quelle salle, modérateur seulement les siennes
  if (user.role !== "ADMIN" && room.creatorId !== user.id)
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 })

  const updated = await prisma.session.update({
    where: { id },
    data: {
      title: body.title ?? room.title,
      description: body.description ?? room.description,
      chatEnabled: body.chatEnabled ?? room.chatEnabled,
      participationEnabled: body.participationEnabled ?? room.participationEnabled,
    },
  })
  return NextResponse.json({ room: updated })
}
