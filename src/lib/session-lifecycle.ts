import { RoomServiceClient } from "livekit-server-sdk"
import { prisma } from "@/lib/prisma"
import { getRoomOccupancy } from "@/lib/controller"
import { sendMail } from "@/lib/mailer"

// Cycle de vie « salon sans animateur ».
//
// Quand un salon LIVE n'a plus de modérateur mais garde des spectateurs, on
// démarre un compteur de 15 min (stocké dans les métadonnées de la salle
// LiveKit, champ `no_moderator_since` = epoch ms). Le retour d'un modérateur
// EFFACE le marqueur (compteur remis à zéro) ; s'il repart, il redémarre. À
// expiration, la session est arrêtée (deleteRoom) et l'enseignant prévenu.

export const NO_MODERATOR_GRACE_MS = 15 * 60 * 1000

function roomService(): RoomServiceClient {
  return new RoomServiceClient(
    process.env.LIVEKIT_WS_URL!.replace("wss://", "https://").replace("ws://", "http://"),
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!
  )
}

export type NoModeratorState = {
  exists: boolean
  moderatorPresent: boolean
  noModeratorSince: number | null // epoch ms
  graceMs: number
  expired: boolean
}

// Évalue l'état du salon ET met à jour le marqueur `no_moderator_since` :
//  - modérateur présent → marqueur effacé (compteur à zéro) ;
//  - pas de modérateur mais des spectateurs → marqueur posé/maintenu ;
//  - salle vide (hors système) → marqueur effacé (empty_timeout s'en chargera).
export async function evaluateNoModerator(roomName: string): Promise<NoModeratorState> {
  const svc = roomService()
  const rooms = await svc.listRooms([roomName])
  const empty: NoModeratorState = {
    exists: false, moderatorPresent: false, noModeratorSince: null,
    graceMs: NO_MODERATOR_GRACE_MS, expired: false,
  }
  if (!rooms.length) return empty

  let meta: Record<string, any> = {}
  try { meta = JSON.parse(rooms[0].metadata || "{}") } catch { meta = {} }

  const { moderatorPresent, viewersPresent } = await getRoomOccupancy(roomName)

  const clearMarker = async () => {
    if (meta.no_moderator_since != null) {
      delete meta.no_moderator_since
      await svc.updateRoomMetadata(roomName, JSON.stringify(meta))
    }
  }

  if (moderatorPresent || !viewersPresent) {
    await clearMarker()
    return { exists: true, moderatorPresent, noModeratorSince: null, graceMs: NO_MODERATOR_GRACE_MS, expired: false }
  }

  // Pas de modérateur, des spectateurs présents → compteur.
  let since = typeof meta.no_moderator_since === "number" ? meta.no_moderator_since : null
  if (!since) {
    since = Date.now()
    meta.no_moderator_since = since
    await svc.updateRoomMetadata(roomName, JSON.stringify(meta))
  }
  const expired = Date.now() - since >= NO_MODERATOR_GRACE_MS
  return { exists: true, moderatorPresent: false, noModeratorSince: since, graceMs: NO_MODERATOR_GRACE_MS, expired }
}

// Ferme une session (deleteRoom + ENDED) et prévient l'enseignant. Idempotent.
export async function closeSessionNoModerator(roomName: string): Promise<void> {
  const svc = roomService()
  try {
    await svc.deleteRoom(roomName)
  } catch (e) {
    console.warn("[no-moderator] deleteRoom ignoré:", roomName, e instanceof Error ? e.message : e)
  }
  await prisma.session.updateMany({
    where: { roomName, status: "LIVE" },
    data: { status: "ENDED", endedAt: new Date() },
  })
  console.log("[no-moderator] session fermée (15 min sans animateur):", roomName)
  await emailSessionClosed(roomName, "no_moderator")
}

// E-mail à l'enseignant (créateur) quand sa session est arrêtée automatiquement.
// Partagé par la fermeture « sans animateur » et le plafond de durée (3 h).
export async function emailSessionClosed(
  roomName: string,
  reason: "no_moderator" | "max_duration"
): Promise<void> {
  const session = await prisma.session.findUnique({
    where: { roomName },
    include: { creator: { select: { name: true, email: true } } },
  })
  const to = session?.creator?.email
  if (!to) return

  const reasonText =
    reason === "no_moderator"
      ? "aucun animateur n'était présent dans la salle pendant 15 minutes"
      : "la durée maximale d'enregistrement de 3 heures a été atteinte"

  await sendMail({
    to,
    subject: `Votre session « ${session!.title} » a été arrêtée`,
    text:
      `Bonjour ${session!.creator?.name ?? ""},\n\n` +
      `Votre session « ${session!.title} » sur la plateforme Webinaire UN-CHK a été ` +
      `arrêtée automatiquement : ${reasonText}.\n\n` +
      `Vous pouvez la relancer à tout moment depuis Moodle ou depuis la plateforme.\n\n` +
      `— Plateforme Webinaire UN-CHK (DITSI)`,
  })
}
