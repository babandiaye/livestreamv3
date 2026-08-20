import { EgressClient, EgressStatus } from "livekit-server-sdk"
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3"
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

// A3 — Le stockage est l'arbitre final. Un egress peut annoncer un fichier
// (fileResults) sans l'avoir réellement monté sur le bucket (upload échoué,
// egress avorté). On confronte donc la clé au stockage :
//   present : l'objet existe avec une taille > 0
//   absent  : 404 / NoSuchKey, ou taille nulle
//   unknown : stockage injoignable (réseau, 5xx, permission) → on ne tranche pas
async function objectPresence(bucket: string, key: string): Promise<"present" | "absent" | "unknown"> {
  if (!bucket || !key) return "unknown"
  try {
    const s3 = new S3Client({
      region: process.env.S3_REGION || "us-east-1",
      endpoint: process.env.S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY!,
        secretAccessKey: process.env.S3_SECRET!,
      },
      forcePathStyle: true,
    })
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return (head.ContentLength ?? 0) > 0 ? "present" : "absent"
  } catch (e: any) {
    const notFound =
      e?.$metadata?.httpStatusCode === 404 ||
      /NotFound|NoSuchKey/i.test(String(e?.name ?? e?.Code ?? ""))
    if (notFound) return "absent"
    console.warn("[finalize] HeadObject injoignable:", bucket, key, e instanceof Error ? e.message : e)
    return "unknown"
  }
}

export type EgressOutcome = {
  status: "READY" | "FAILED" | "PROCESSING"
  s3Key: string
  filename: string
  size: bigint | null
  duration: number | null
  reason: string | null
}

// A1+A2+A3 — Cœur UNIQUE de finalisation, partagé par le webhook egress_ended et
// la réconciliation (avant, chaque chemin dupliquait la logique — et le défaut du
// faux READY). READY exige TROIS conditions (modèle suitenumerique/meet) :
//   1. egress.status ∈ {EGRESS_COMPLETE, EGRESS_LIMIT_REACHED} ;
//   2. fileResults[0].size > 0 (taille annoncée non nulle) ;
//   3. l'objet existe RÉELLEMENT sur le stockage (objectPresence === "present").
// Un egress FAILED/ABORTED, ou un « complete » sans fichier monté, donne FAILED
// (fin du faux READY). Si le stockage est injoignable, on renvoie PROCESSING : on
// ne conclut pas sur une incertitude, la réconciliation réessaiera.
export async function computeEgressOutcome(egress: any): Promise<EgressOutcome> {
  const fileResults = egress?.fileResults
  const file = Array.isArray(fileResults) && fileResults.length > 0 ? fileResults[0] : null
  const s3Key = file?.filename ?? ""
  const filename = s3Key.split("/").pop() ?? s3Key
  const size = file?.size ? BigInt(file.size.toString()) : null
  const duration = file?.duration ? Math.round(Number(file.duration) / 1_000_000_000) : null
  const reason = egress?.error ? String(egress.error) : null
  const fields = { s3Key, filename, size, duration, reason }

  const status = egress?.status
  // Encore en cours : ne devrait pas arriver sur egress_ended, mais protège la
  // réconciliation d'un passage prématuré en FAILED.
  if (
    status === EgressStatus.EGRESS_STARTING ||
    status === EgressStatus.EGRESS_ACTIVE ||
    status === EgressStatus.EGRESS_ENDING
  ) {
    return { status: "PROCESSING", ...fields }
  }

  // 1. Seuls COMPLETE et LIMIT_REACHED peuvent avoir produit un fichier exploitable.
  const producedFile =
    status === EgressStatus.EGRESS_COMPLETE || status === EgressStatus.EGRESS_LIMIT_REACHED
  if (!producedFile) return { status: "FAILED", ...fields } // FAILED / ABORTED

  // 2. Taille annoncée > 0.
  if (!size || size <= BigInt(0)) return { status: "FAILED", ...fields }

  // 3. Confirmation par le stockage (l'arbitre final).
  // Bucket absent → objectPresence renvoie "unknown" → PROCESSING (jamais un faux
  // READY ni un FAILED erroné) : la réconciliation repassera, comportement sûr.
  const bucket = process.env.S3_BUCKET ?? ""
  const presence = await objectPresence(bucket, s3Key)
  if (presence === "present") return { status: "READY", ...fields }
  if (presence === "absent") return { status: "FAILED", ...fields }
  return { status: "PROCESSING", ...fields } // injoignable → réessai ultérieur
}

// Applique l'issue calculée à la ligne Recording, de façon IDEMPOTENTE (A4) : on
// ne finalise QUE depuis PROCESSING. Un READY/FAILED déjà écrit n'est jamais
// réécrit — indispensable quand le webhook ET la réconciliation traitent le même
// egress. Renvoie le statut final (ou l'ancien si rien n'a changé).
export async function finalizeRecording(rec: RecLike, egress: any): Promise<string> {
  if (rec.status !== "PROCESSING") return rec.status

  const outcome = await computeEgressOutcome(egress)
  if (outcome.status === "PROCESSING") return rec.status // incertitude → on réessaiera

  if (outcome.status === "READY") {
    await prisma.recording.update({
      where: { id: rec.id },
      data: {
        s3Key: outcome.s3Key,
        filename: outcome.filename,
        size: outcome.size,
        duration: outcome.duration,
        status: "READY",
      },
    })
    console.log("[finalize] READY:", outcome.filename, rec.egressId)
    return "READY"
  }

  await prisma.recording.update({ where: { id: rec.id }, data: { status: "FAILED" } })
  console.warn("[finalize] FAILED:", rec.egressId, "— motif:", outcome.reason ?? "sans fichier valide")
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

  // Chemin de finalisation UNIQUE (statut + taille + existence réelle du fichier).
  // Les états en cours (STARTING/ACTIVE/ENDING) en ressortent PROCESSING inchangés.
  return await finalizeRecording(rec, info)
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
