import { AccessToken } from "livekit-server-sdk"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const roomName = req.nextUrl.searchParams.get("roomName")
  if (!roomName)
    return NextResponse.json({ error: "roomName requis" }, { status: 400 })

  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
    { identity: `egress-recorder-${Date.now()}`, ttl: "8h" }
  )
  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: false,
    canSubscribe: true,
    canPublishData: false,
    hidden: true,
    recorder: true,
  })

  const token = await at.toJwt()
  return NextResponse.json({ token })
}
