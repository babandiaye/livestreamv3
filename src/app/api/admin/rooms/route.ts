import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const session = await auth()
  if (!session || !["ADMIN", "MODERATOR"].includes(session.user.role))
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 })

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user) return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 })

  const where = user.role === "MODERATOR" ? { creatorId: user.id } : {}

  const rooms = await prisma.session.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      creator: { select: { name: true, email: true } },
      _count: { select: { enrollments: true, recordings: true } },
    },
  })

  return NextResponse.json({
    rooms: rooms.map(r => ({
      id: r.id,
      title: r.title,
      roomName: r.roomName,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      creator: r.creator,
      enrollments: r._count.enrollments,
      recordings: r._count.recordings,
    })),
  })
}
