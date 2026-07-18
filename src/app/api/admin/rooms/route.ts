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

  // Un modérateur voit les salles qu'il a créées ET celles où il est enrôlé
  // (ex. salle créée depuis Moodle par un administrateur, enseignant enrôlé au
  // cours) — il peut ainsi la voir et démarrer la session depuis la plateforme.
  const where =
    user.role === "MODERATOR"
      ? {
          OR: [
            { creatorId: user.id },
            { enrollments: { some: { userId: user.id } } },
          ],
        }
      : {}

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
      chatEnabled: r.chatEnabled,
      participationEnabled: r.participationEnabled,
    })),
  })
}
