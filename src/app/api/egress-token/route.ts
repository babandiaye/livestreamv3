import { AccessToken } from "livekit-server-sdk"
import { NextRequest, NextResponse } from "next/server"
import { verifyEgressAccess } from "@/lib/egress-access"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const roomName = req.nextUrl.searchParams.get("roomName")
  if (!roomName)
    return NextResponse.json({ error: "roomName requis" }, { status: 400 })

  // Le jeton délivré plus bas est « hidden + recorder » : il donne accès à tout
  // l'audio/vidéo de la salle sans apparaître nulle part et sans passer par le
  // contrôle NO_MODERATOR. Il ne peut donc être remis qu'à un enregistreur
  // MANDATÉ par le serveur (signature posée dans l'URL du layout par
  // start_recording). Le roomName seul ne prouve rien : il est public, c'est
  // celui du lien /watch diffusé aux étudiants.
  const exp = req.nextUrl.searchParams.get("exp")
  const sig = req.nextUrl.searchParams.get("sig")
  if (!verifyEgressAccess(roomName, exp, sig)) {
    console.warn("[egress-token] mandat invalide ou expiré pour:", roomName)
    return NextResponse.json({ error: "Mandat invalide ou expiré" }, { status: 403 })
  }

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
    // true : le recorder doit pouvoir émettre « __wb_request_init__ » pour
    // récupérer l'historique du tableau blanc s'il démarre en cours de session
    // (sinon l'enregistrement capture un tableau vide). Reste hidden + recorder.
    canPublishData: true,
    hidden: true,
    recorder: true,
  })

  const token = await at.toJwt()
  return NextResponse.json({ token })
}
