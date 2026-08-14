import { NextRequest, NextResponse } from "next/server"
import { evaluateNoModerator, closeSessionNoModerator } from "@/lib/session-lifecycle"

export const dynamic = "force-dynamic"

// Appelé par /watch quand le chronomètre 15 min atteint zéro. Le serveur
// RE-VÉRIFIE la condition (aucun modérateur ET délai expiré, via le marqueur
// horodaté côté serveur) avant d'arrêter : un client ne peut donc pas fermer
// une session prématurément. Idempotent.
export async function POST(req: NextRequest) {
  const roomName = req.nextUrl.searchParams.get("roomName")
  if (!roomName)
    return NextResponse.json({ error: "roomName requis" }, { status: 400 })
  try {
    const state = await evaluateNoModerator(roomName)
    if (state.exists && !state.moderatorPresent && state.expired) {
      await closeSessionNoModerator(roomName)
      return NextResponse.json({ closed: true })
    }
    return NextResponse.json({ closed: false, ...state })
  } catch (e) {
    console.error("[session-timeout] échec:", e instanceof Error ? e.message : e)
    return NextResponse.json({ closed: false })
  }
}
