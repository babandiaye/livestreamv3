import { NextRequest, NextResponse } from "next/server"
import { validateMoodleKey } from "@/lib/moodle-auth"
import { prisma } from "@/lib/prisma"
import { AccessToken } from "livekit-server-sdk"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const authError = validateMoodleKey(req)
  if (authError) return authError

  const { roomId, userEmail, userName } = await req.json()

  if (!roomId || !userEmail || !userName)
    return NextResponse.json({ error: "roomId, userEmail et userName requis" }, { status: 400 })

  const room = await prisma.session.findUnique({ where: { id: roomId } })
  if (!room)
    return NextResponse.json({ error: "Salle introuvable" }, { status: 404 })

  // C3/M1 — auto-provision : les étudiants viennent du cours Moodle (déjà enrôlés côté LMS).
  // On crée l'utilisateur s'il n'existe pas, puis on l'inscrit à la session (idempotent).
  const user = await prisma.user.upsert({
    where: { email: userEmail },
    update: {},
    create: {
      keycloakId: `moodle:${userEmail}`,
      email: userEmail,
      name: userName,
      role: "VIEWER",
    },
  })

  await prisma.enrollment.upsert({
    where: { userId_sessionId: { userId: user.id, sessionId: roomId } },
    update: {},
    create: {
      userId: user.id,
      sessionId: roomId,
      createdBy: "moodle-auto",
    },
  })

  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
    // metadata : rattache la présence au compte (lu par le webhook au join)
    { identity: userEmail, name: userName, metadata: JSON.stringify({ userId: user.id, email: userEmail, isModerator: false }), ttl: "8h" }
  )
  at.addGrant({
    room: room.roomName,
    roomJoin: true,
    canPublish: false,
    canSubscribe: true,
    canPublishData: true,
  })

  const token = await at.toJwt()
  const base = process.env.NEXT_PUBLIC_SITE_URL

  return NextResponse.json({
    url: `${base}/watch/${room.roomName}?token=${token}`,
    token,
    roomName: room.roomName,
  })
}
