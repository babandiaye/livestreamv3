import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { reconcileRecording } from "@/lib/egress"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  })
  if (!user) return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 })

  let sessionIds: string[] | undefined

  if (user.role === "ADMIN") {
    sessionIds = undefined
  } else if (user.role === "MODERATOR") {
    const rooms = await prisma.session.findMany({
      where: { creatorId: user.id },
      select: { id: true },
    })
    sessionIds = rooms.map(r => r.id)
  } else {
    const enrollments = await prisma.enrollment.findMany({
      where: { userId: user.id },
      select: { sessionId: true },
    })
    sessionIds = enrollments.map(e => e.sessionId)
  }

  if (sessionIds !== undefined && sessionIds.length === 0)
    return NextResponse.json({ recordings: [] })

  const recordings = await prisma.recording.findMany({
    where: sessionIds !== undefined ? { sessionId: { in: sessionIds } } : {},
    orderBy: { createdAt: "desc" },
    include: {
      session: {
        select: {
          id: true,
          title: true,
          roomName: true,
          creator: { select: { name: true, email: true } },
        },
      },
    },
  })

  // #2 — Auto-réparation paresseuse : réconcilier les enregistrements bloqués en
  // PROCESSING depuis plus de 90 s avant de répondre.
  const statusById = new Map<string, string>()
  await Promise.all(
    recordings
      .filter(r => r.status === "PROCESSING" && r.egressId && Date.now() - r.createdAt.getTime() > 90_000)
      .map(async r => { statusById.set(r.id, await reconcileRecording(r)) })
  )

  return NextResponse.json({
    recordings: recordings.map(r => ({
      id: r.id,
      filename: r.filename,
      s3Key: r.s3Key,
      s3Bucket: r.s3Bucket,
      duration: r.duration,
      size: r.size ? Number(r.size) : null,
      egressId: r.egressId,
      status: statusById.get(r.id) ?? r.status,
      createdAt: r.createdAt.toISOString(),
      session: r.session,
    })),
  })
}
