import { NextRequest, NextResponse } from "next/server"
import { isModeratorPresent } from "@/lib/controller"

export const dynamic = "force-dynamic"

// Consulté par la page /watch avant toute connexion, pour afficher l'écran
// d'attente au lieu de laisser entrer dans une salle sans animateur.
//
// Volontairement PUBLIQUE et sans authentification : les participants invités
// rejoignent par simple lien, sans compte. La réponse ne divulgue rien de plus
// que ce qu'un spectateur légitime constaterait en entrant — un booléen, aucun
// nom de participant ni métadonnée.
export async function GET(req: NextRequest) {
  const roomName = req.nextUrl.searchParams.get("roomName")
  if (!roomName)
    return NextResponse.json({ error: "roomName requis" }, { status: 400 })

  try {
    // cached : cette route est sondée en boucle par tous les spectateurs en
    // attente. Le cache ramène la charge SFU à un appel par salle toutes les 5 s,
    // quel que soit leur nombre.
    const moderatorPresent = await isModeratorPresent(roomName, { cached: true })
    return NextResponse.json({ moderatorPresent }, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (err) {
    console.error("[room-status] échec:", err instanceof Error ? err.message : err)
    // En cas d'indisponibilité du SFU, on ne débloque pas l'accès par défaut :
    // mieux vaut un écran d'attente injustifié qu'une salle fantôme rouverte.
    return NextResponse.json({ moderatorPresent: false }, { status: 200 })
  }
}
