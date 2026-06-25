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

type RecLike = { id: string; egressId: string | null; status: string }

// #2 — Réconcilie une ligne Recording bloquée en PROCESSING avec l'état réel de
// l'egress côté LiveKit (utile si le webhook egress_ended n'a jamais été reçu).
// Ne modifie rien tant que l'egress est encore actif ou si LiveKit est injoignable.
export async function reconcileRecording(rec: RecLike): Promise<string> {
  if (rec.status !== "PROCESSING" || !rec.egressId) return rec.status

  let list: any[] | undefined
  try {
    list = await egressClient.listEgress({ egressId: rec.egressId })
  } catch {
    return rec.status // LiveKit injoignable → on laisse tel quel, on réessaiera
  }

  const info = list?.[0]
  if (!info) {
    // L'egress n'existe plus côté LiveKit et aucune fin n'a été enregistrée → échec.
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
