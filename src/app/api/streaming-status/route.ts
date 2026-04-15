import { EgressClient } from "livekit-server-sdk"
import { getSessionFromReq } from "@/lib/controller"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  // Vérifier l'authentification
  let session
  try {
    session = await getSessionFromReq(req)
  } catch {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  }

  const egressId = req.nextUrl.searchParams.get("egressId")
  if (!egressId) {
    return NextResponse.json({ error: "egressId requis" }, { status: 400 })
  }

  try {
    const httpUrl = process.env.LIVEKIT_WS_URL!
      .replace("wss://", "https://")
      .replace("ws://", "http://")

    const egressClient = new EgressClient(
      httpUrl,
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!
    )

    // Lister les egress de la room du demandeur
    const egresses = await egressClient.listEgress({ roomName: session.room_name })
    const target = egresses.find((e: any) => e.egressId === egressId)

    if (!target) {
      return NextResponse.json({ status: "NOT_FOUND", active: false })
    }

    // Statuts LiveKit egress :
    // 0 = EGRESS_STARTING, 1 = EGRESS_ACTIVE, 2 = EGRESS_ENDING
    // 3 = EGRESS_COMPLETE, 4 = EGRESS_FAILED, 5 = EGRESS_ABORTED, 6 = EGRESS_LIMIT_REACHED
    const statusCode = (target as any).status ?? -1
    const active = statusCode === 0 || statusCode === 1 || statusCode === 2
    const failed = statusCode === 4 || statusCode === 5 || statusCode === 6
    const error = (target as any).error ?? ""

    let statusLabel = "unknown"
    if (statusCode === 0) statusLabel = "starting"
    else if (statusCode === 1) statusLabel = "active"
    else if (statusCode === 2) statusLabel = "ending"
    else if (statusCode === 3) statusLabel = "complete"
    else if (statusCode === 4) statusLabel = "failed"
    else if (statusCode === 5) statusLabel = "aborted"
    else if (statusCode === 6) statusLabel = "limit_reached"

    return NextResponse.json({
      status: statusLabel,
      active,
      failed,
      error: error || null,
    })
  } catch (e) {
    console.error("[streaming-status] error:", e)
    return NextResponse.json(
      { status: "error", active: false, failed: true, error: e instanceof Error ? e.message : "Erreur interne" },
      { status: 500 }
    )
  }
}
