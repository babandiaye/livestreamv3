import { NextRequest, NextResponse } from "next/server"
import { validateMoodleKey } from "@/lib/moodle-auth"
import { prisma } from "@/lib/prisma"
import { AccessToken } from "livekit-server-sdk"
import { RoomServiceClient } from "livekit-server-sdk"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const authError = validateMoodleKey(req)
  if (authError) return authError

  const { roomId, moderatorEmail, moderatorName } = await req.json()

  if (!roomId || !moderatorEmail || !moderatorName)
    return NextResponse.json({ error: "roomId, moderatorEmail et moderatorName requis" }, { status: 400 })

  const room = await prisma.session.findUnique({ where: { id: roomId } })
  if (!room)
    return NextResponse.json({ error: "Salle introuvable" }, { status: 404 })

  const moderator = await prisma.user.findUnique({ where: { email: moderatorEmail } })
  if (!moderator || !["ADMIN", "MODERATOR"].includes(moderator.role))
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })

  const httpUrl = process.env.LIVEKIT_WS_URL!
    .replace("wss://", "https://")
    .replace("ws://", "http://")

  const roomService = new RoomServiceClient(
    httpUrl,
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!
  )

  await roomService.createRoom({
    name: room.roomName,
    metadata: JSON.stringify({
      creator_identity: moderatorEmail,
      enable_chat: true,
      allow_participation: false,
    }),
  })

  // Mettre à jour le statut
  await prisma.session.update({
    where: { id: roomId },
    data: { status: "LIVE", startedAt: new Date() },
  })

  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
    { identity: moderatorEmail, name: moderatorName, ttl: "8h" }
  )
  at.addGrant({
    room: room.roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  })

  const roomToken = await at.toJwt()

  const atAuth = new AccessToken(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
    { identity: moderatorEmail, name: moderatorName, ttl: "8h" }
  )
  atAuth.addGrant({ room: room.roomName, roomJoin: false })
  const authToken = await atAuth.toJwt()

  const base = process.env.NEXT_PUBLIC_SITE_URL

  return NextResponse.json({
    url: `${base}/host?at=${authToken}&rt=${roomToken}`,
    roomName: room.roomName,
    authToken,
    roomToken,
  })
}
