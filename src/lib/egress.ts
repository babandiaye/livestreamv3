import { EgressClient, EgressStatus } from "livekit-server-sdk"
import { prisma } from "@/lib/prisma"

// Client egress partagé (utilisé par le webhook, la réconciliation et les routes
// de listing). Pointe sur l'API LiveKit en HTTP(S).
export const egressClient = new EgressClient(
  process.env.LIVEKIT_WS_URL!.replace("wss://", "https://").replace("ws://", "http://"),
  process.env.LIVEKIT_API_KEY!,
  process.env.LIVEKIT_API_SECRET!
)

// #1 — Distingue un egress d'ENREGISTREMENT (web egress → sortie fichier) d'un egress
// de DIFFUSION RTMP (room_composite → sortie stream). Seuls les enregistrements
// doivent donner lieu à une ligne Recording ; sinon chaque diffusion crée un faux
// enregistrement marqué FAILED faute de fichier en sortie.
export function isRecordingEgress(egress: any): boolean {
  if (egress?.request?.case === "web") return true
  if (Array.isArray(egress?.fileResults) && egress.fileResults.length > 0) return true
  return false
}

// Applique les résultats d'un egress terminé à la ligne Recording : READY si un
// fichier est présent, FAILED sinon.
async function finalizeFromInfo(recordingId: string, egress: any): Promise<"READY" | "FAILED"> {
  const fileResults = egress?.fileResults
  if (fileResults && fileResults.length > 0) {
    const file = fileResults[0]
    const s3Key = file.filename ?? ""
    const filename = s3Key.split("/").pop() ?? s3Key
    const size = file.size ? BigInt(file.size.toString()) : null
    const duration = file.duration ? Math.round(Number(file.duration) / 1_000_000_000) : null
    await prisma.recording.update({
      where: { id: recordingId },
      data: { s3Key, filename, size, duration, status: "READY" },
    })
    return "READY"
  }
  await prisma.recording.update({
    where: { id: recordingId },
    data: { status: "FAILED" },
  })
  return "FAILED"
}

// #6 — Retrouve la salle d'un egress. Un web egress ne porte PAS de roomName
// (contrairement à un room_composite) : la salle n'est connue que par le paramètre
// de l'URL du layout passée à startWebEgress.
export function egressRoomName(egress: any): string | undefined {
  if (egress?.roomName) return egress.roomName
  if (egress?.request?.case === "web") {
    const url = (egress.request.value as any)?.url ?? ""
    const match = url.match(/roomName=([^&]+)/)
    if (match) return decodeURIComponent(match[1])
  }
  return undefined
}

export type ActiveRecording = { egressId: string; startedAt: Date | null }

// #6 — Verrou anti-doublon : retourne l'enregistrement DÉJÀ en cours sur cette
// salle, sinon null.
//
// La source de vérité est LIVEKIT, jamais la base :
//  - un egress qui tourne réellement figure toujours dans listEgress({active}),
//    y compris en EGRESS_STARTING — le cas visé (onglet /host rafraîchi, le state
//    React `recording` repart à false alors que la capture continue) est donc
//    couvert sans passer par la base ;
//  - la base, elle, peut garder une ligne PROCESSING fantôme quand le webhook
//    egress_ended a été perdu. S'y fier bloquerait l'enregistrement de la salle
//    DÉFINITIVEMENT, car listEgress({egressId}) lève « egress does not exist »
//    une fois l'egress purgé côté LiveKit — la réconciliation ne peut alors pas
//    trancher et conserve le statut PROCESSING.
//
// Reste une fenêtre de quelques centaines de ms, entre l'appel à startWebEgress
// et sa prise en compte côté LiveKit, où deux requêtes concurrentes passeraient.
// Côté client `recordingLoading` désarme déjà le bouton pendant ce laps de temps.
export async function findActiveRecordingEgress(roomName: string): Promise<ActiveRecording | null> {
  let active: any[]
  try {
    active = await egressClient.listEgress({ active: true })
  } catch {
    // LiveKit injoignable : on ne bloque pas ici. startWebEgress échouera juste
    // après et la route répondra 503 avec un message explicite.
    return null
  }

  const match = active.find(e => isRecordingEgress(e) && egressRoomName(e) === roomName)
  if (!match) return null

  // startedAt est en nanosecondes, et vaut 0 tant que la capture n'a pas démarré.
  const startedNs = Number(match.startedAt ?? 0)
  return {
    egressId: match.egressId,
    startedAt: startedNs > 0 ? new Date(startedNs / 1_000_000) : null,
  }
}

type RecLike = { id: string; egressId: string | null; status: string }

// #2 — Réconcilie une ligne Recording bloquée en PROCESSING avec l'état réel de
// l'egress côté LiveKit (utile si le webhook egress_ended n'a jamais été reçu).
// Ne modifie rien tant que l'egress est encore actif ou si LiveKit est injoignable.
export async function reconcileRecording(rec: RecLike): Promise<string> {
  if (rec.status !== "PROCESSING" || !rec.egressId) return rec.status

  let list: any[] | undefined
  try {
    list = await egressClient.listEgress({ egressId: rec.egressId })
  } catch (e) {
    // Distinction cruciale : LiveKit PURGE les egress terminés au bout d'un
    // moment, et listEgress({egressId}) lève alors « egress does not exist »
    // (vérifié empiriquement). Sans ce tri, TOUTE erreur retournait PROCESSING,
    // rendant le bloc `if (!info)` ci-dessous INATTEIGNABLE : un enregistrement
    // dont l'egress avait disparu restait PROCESSING pour toujours (blocages des
    // 22-23-30/07). On distingue donc l'egress purgé du service injoignable.
    const msg = e instanceof Error ? e.message.toLowerCase() : ""
    if (msg.includes("does not exist") || msg.includes("not found")) {
      // Egress purgé + fin jamais enregistrée (webhook egress_ended perdu). On
      // marque FAILED : l'info n'expose plus de fichier. NB : un fichier a PEUT-
      // ÊTRE été écrit sur S3 sans qu'on ait ses métadonnées (chemin {time}
      // résolu côté LiveKit, inconnu ici) ; mieux vaut FAILED visible que
      // PROCESSING éternel — l'admin peut retrouver un éventuel fichier sur MinIO.
      await prisma.recording.update({ where: { id: rec.id }, data: { status: "FAILED" } })
      return "FAILED"
    }
    return rec.status // injoignable/timeout → on laisse PROCESSING, on réessaiera
  }

  const info = list?.[0]
  if (!info) {
    // Réponse vide sans exception (cas théorique) → même traitement que purgé.
    await prisma.recording.update({ where: { id: rec.id }, data: { status: "FAILED" } })
    return "FAILED"
  }

  switch (info.status) {
    case EgressStatus.EGRESS_COMPLETE:
      return await finalizeFromInfo(rec.id, info)
    case EgressStatus.EGRESS_FAILED:
    case EgressStatus.EGRESS_ABORTED:
    case EgressStatus.EGRESS_LIMIT_REACHED:
      await prisma.recording.update({ where: { id: rec.id }, data: { status: "FAILED" } })
      return "FAILED"
    default:
      return rec.status // EGRESS_STARTING / EGRESS_ACTIVE / EGRESS_ENDING → encore en cours
  }
}

// Réconcilie en lot les enregistrements PROCESSING plus vieux que `olderThanMs`
// (filet de sécurité appelable par une route admin ou un cron).
export async function reconcileStuckRecordings(olderThanMs = 90_000): Promise<{ checked: number; updated: number }> {
  const cutoff = new Date(Date.now() - olderThanMs)
  const stuck = await prisma.recording.findMany({
    where: { status: "PROCESSING", egressId: { not: null }, createdAt: { lt: cutoff } },
    select: { id: true, egressId: true, status: true },
  })
  let updated = 0
  for (const rec of stuck) {
    const next = await reconcileRecording(rec)
    if (next !== "PROCESSING") updated++
  }
  return { checked: stuck.length, updated }
}
