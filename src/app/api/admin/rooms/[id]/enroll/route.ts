import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session || !["ADMIN", "MODERATOR"].includes(session.user.role))
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 })

  const { id: sessionId } = await params
  const enrollments = await prisma.enrollment.findMany({
    where: { sessionId },
    include: { user: { select: { id: true, name: true, email: true, role: true } } },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json({
    enrollments: enrollments.map(e => ({
      id: e.id,
      userId: e.userId,
      name: e.user.name,
      email: e.user.email,
      role: e.user.role,
      enrolledAt: e.createdAt.toISOString(),
    })),
  })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session || !["ADMIN", "MODERATOR"].includes(session.user.role))
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 })

  const { id: sessionId } = await params
  const { userId } = await req.json()
  if (!userId) return NextResponse.json({ error: "userId requis" }, { status: 400 })

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  const room = await prisma.session.findUnique({ where: { id: sessionId } })
  if (!room) return NextResponse.json({ error: "Salle introuvable" }, { status: 404 })
  if (user?.role === "MODERATOR" && room.creatorId !== user.id)
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })

  try {
    const enrollment = await prisma.enrollment.create({
      data: { userId, sessionId, createdBy: session.user.id },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    })
    return NextResponse.json({ enrollment })
  } catch {
    return NextResponse.json({ error: "Déjà enrôlé" }, { status: 409 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session || !["ADMIN", "MODERATOR"].includes(session.user.role))
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 })

  const { id: sessionId } = await params
  const { userId } = await req.json()

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  const room = await prisma.session.findUnique({ where: { id: sessionId } })
  if (!room) return NextResponse.json({ error: "Salle introuvable" }, { status: 404 })
  if (user?.role === "MODERATOR" && room.creatorId !== user.id)
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })

  await prisma.enrollment.deleteMany({ where: { userId, sessionId } })
  return NextResponse.json({ success: true })
}
