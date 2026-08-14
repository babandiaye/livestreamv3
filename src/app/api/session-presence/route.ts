import { NextRequest, NextResponse } from "next/server"
import { evaluateNoModerator } from "@/lib/session-lifecycle"

export const dynamic = "force-dynamic"

// Sondé par la page /watch : renvoie l'état « animateur présent ? » et, le cas
// échéant, l'instant de début d'absence (pour le chronomètre 15 min). Effet de
// bord : pose/efface le marqueur no_moderator_since. Sans authentification (les
// invités par lien sondent aussi), comme /api/room-status.
export async function GET(req: NextRequest) {
  const roomName = req.nextUrl.searchParams.get("roomName")
  if (!roomName)
    return NextResponse.json({ error: "roomName requis" }, { status: 400 })
  try {
    const state = await evaluateNoModerator(roomName)
    return NextResponse.json(state)
  } catch (e) {
    console.error("[session-presence] échec:", e instanceof Error ? e.message : e)
    // En cas d'incertitude, ne pas alarmer le client (pas de bandeau).
    return NextResponse.json({
      exists: true, moderatorPresent: true, noModeratorSince: null,
      graceMs: 15 * 60 * 1000, expired: false,
    })
  }
}
