import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const session = await auth()
  if (!session || !["ADMIN", "MODERATOR"].includes(session.user.role))
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 })

  const user = await prisma.user.findUnique({
    where: { keycloakId: session.user.id },
  })
  if (!user) return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 })

  const isAdmin = user.role === "ADMIN"
  const sessionWhere = isAdmin ? {} : { creatorId: user.id }

  const [
    totalUsers,
    totalSessions,
    liveSessions,
    totalRecordings,
    recordingAgg,
    usersByRole,
    recentSessions,
  ] = await Promise.all([
    isAdmin ? prisma.user.count() : Promise.resolve(null),
    prisma.session.count({ where: sessionWhere }),
    prisma.session.count({ where: { ...sessionWhere, status: "LIVE" } }),
    prisma.recording.count({
      where: isAdmin ? {} : {
        session: { creatorId: user.id },
      },
    }),
    prisma.recording.aggregate({
      where: isAdmin ? {} : {
        session: { creatorId: user.id },
      },
      _sum: { size: true },
    }),
    isAdmin
      ? prisma.user.groupBy({ by: ["role"], _count: { role: true } })
      : Promise.resolve(null),
    prisma.session.findMany({
      where: sessionWhere,
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        _count: { select: { enrollments: true, recordings: true } },
      },
    }),
  ])

  const totalSize = recordingAgg._sum.size
    ? Number(recordingAgg._sum.size)
    : 0

  return NextResponse.json({
    totalUsers,
    totalSessions,
    liveSessions,
    totalRecordings,
    totalSize,
    usersByRole,
    recentSessions: recentSessions.map(s => ({
      id: s.id,
      title: s.title,
      status: s.status,
      createdAt: s.createdAt.toISOString(),
      enrollments: s._count.enrollments,
      recordings: s._count.recordings,
    })),
  })
}
