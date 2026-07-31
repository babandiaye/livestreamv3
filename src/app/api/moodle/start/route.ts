import { NextRequest, NextResponse } from "next/server"
import { validateMoodleKey } from "@/lib/moodle-auth"
import { ensureMoodleModerator } from "@/lib/moodle-moderator"
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

  // Crée le compte s'il n'existe pas, promeut un VIEWER en MODERATOR (jamais de
  // rétrogradation d'un ADMIN). Sans cela, un enseignant qui n'avait jamais
  // ouvert la plateforme ne pouvait pas démarrer sa propre session. Le contrôle
  // de rôle ci-dessous reste en place : il redevient bloquant si un
  // administrateur coupe le provisionnement automatique.
  const moderator = await ensureMoodleModerator(moderatorEmail, moderatorName)
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

  const roomMetadata = JSON.stringify({
    creator_identity: moderatorEmail,
    enable_chat: true,
    allow_participation: false,
  })

  // DÉMARRER ou REJOINDRE ? La décision se prend sur l'état réel de la salle côté
  // LiveKit, jamais sur Session.status : ce statut reste bloqué à LIVE quand le
  // webhook room_finished est perdu (même raison qui a fait écrire
  // isModeratorPresent). S'y fier ferait fusionner deux séances distinctes.
  let existingCreator: string | undefined
  try {
    const existing = await roomService.listRooms([room.roomName])
    existingCreator = existing.length
      ? JSON.parse(existing[0].metadata || "{}").creator_identity
      : undefined
  } catch {
    existingCreator = undefined
  }

  if (existingCreator) {
    // REJOINDRE — on ne touche NI aux métadonnées de la salle (le premier
    // animateur reste créateur) NI à startedAt : le re-estampiller scinderait la
    // feuille de présence en deux cycles, puisque recordJoin copie startedAt à
    // chaque connexion. On réaligne seulement un statut qui aurait dérivé.
    await prisma.session.updateMany({
      where: { id: roomId, status: { not: "LIVE" } },
      data: { status: "LIVE" }, // sans startedAt, volontairement
    })
  } else {
    // DÉMARRER — salle absente, ou auto-créée sans créateur par un spectateur.
    await roomService.createRoom({ name: room.roomName, metadata: roomMetadata })
    // createRoom n'écrase pas les métadonnées d'une salle déjà auto-créée (vide) :
    // on force donc creator_identity, sinon l'animateur ne peut pas inviter/exclure.
    await roomService.updateRoomMetadata(room.roomName, roomMetadata)

    await prisma.session.update({
      where: { id: roomId },
      data: { status: "LIVE", startedAt: new Date() },
    })
  }

  // Métadonnées d'animateur sur le jeton de connexion. Elles manquaient : un
  // enseignant venu de Moodle n'était donc ni reconnu comme co-animateur par
  // assertRoomHost, ni marqué modérateur dans la feuille de présence (recordJoin
  // lit isModerator ici même). Frappées côté serveur : un spectateur ne peut pas
  // se les attribuer.
  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
    {
      identity: moderatorEmail,
      name: moderatorName,
      ttl: "8h",
      metadata: JSON.stringify({
        isModerator: true,
        userId: moderator.id,
        email: moderatorEmail,
      }),
    }
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
