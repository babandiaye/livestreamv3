import { EgressClient, EncodedFileOutput, EncodedFileType, S3Upload, EncodingOptions, RoomServiceClient, TrackSource } from "livekit-server-sdk"
import { getSessionFromReq, assertRoomHost } from "@/lib/controller"
import { findActiveRecordingEgress } from "@/lib/egress"
import { appendEgressAccess } from "@/lib/egress-access"

const egressClient = new EgressClient(
  process.env.LIVEKIT_WS_URL!.replace("wss://", "https://").replace("ws://", "http://"),
  process.env.LIVEKIT_API_KEY!,
  process.env.LIVEKIT_API_SECRET!
)

export async function POST(req: Request) {
  try {
    const session = await getSessionFromReq(req)
    await assertRoomHost(session) // C2 — créateur OU co-animateur connecté peut enregistrer

    // #6 — Verrou anti-doublon. Côté client, le seul garde-fou était l'état React
    // `recording` : un rafraîchissement de l'onglet /host le remet à false alors
    // que l'egress tourne toujours, et un 2e clic lançait un second Chrome
    // headless sur la même salle. Coût réel : deux fichiers stockés pour un même
    // cours et un slot egress perdu (la capacité est de 2 à 3 captures 1080p
    // simultanées). Constaté en base : jusqu'à 3 enregistrements pour une session.
    // On renvoie l'egressId existant pour que le client reprenne la main dessus
    // (sinon l'animateur ne pourrait plus arrêter son propre enregistrement).
    const active = await findActiveRecordingEgress(session.room_name)
    if (active) {
      console.log("[start_recording] déjà en cours:", active.egressId, "room:", session.room_name)
      return Response.json(
        {
          error: "ALREADY_RECORDING",
          egress_id: active.egressId,
          started_at: active.startedAt?.toISOString() ?? null,
          message: "Un enregistrement est déjà en cours pour cette salle.",
        },
        { status: 409 }
      )
    }

    // A2 — Garde-source serveur. L'egress n'a AUCUNE vérification native qu'une
    // source existe : sur une salle vide, le Chrome enregistre une page blanche
    // et finit souvent en « page load error: timed out ». On confirme donc côté
    // serveur qu'au moins une source est présente — une piste vidéo publiée par
    // n'importe quel animateur, OU le tableau blanc ouvert. Non contournable
    // (contrairement au verrou client) et ferme la cause des egress ratés (R5.6).
    try {
      const httpUrl = process.env.LIVEKIT_WS_URL!
        .replace("wss://", "https://").replace("ws://", "http://")
      const roomService = new RoomServiceClient(
        httpUrl, process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!
      )
      const rooms = await roomService.listRooms([session.room_name])
      let whiteboardOpen = false
      try { whiteboardOpen = JSON.parse(rooms[0]?.metadata || "{}").whiteboard_open === true } catch {}
      const participants = await roomService.listParticipants(session.room_name)
      const hasVideoSource = participants.some(p =>
        (p.tracks ?? []).some(t =>
          (t.source === TrackSource.CAMERA || t.source === TrackSource.SCREEN_SHARE) && !t.muted
        )
      )
      if (!hasVideoSource && !whiteboardOpen) {
        console.log("[start_recording] refusé (aucune source):", session.room_name)
        return Response.json(
          {
            error: "NO_SOURCE",
            message: "Aucune source à enregistrer : activez une caméra, partagez un écran ou ouvrez le tableau blanc.",
          },
          { status: 422 }
        )
      }
    } catch (e) {
      // LiveKit injoignable : on ne bloque pas sur l'incertitude (le verrou client
      // a déjà filtré ; un egress réellement vide finira FAILED via le palier A).
      // startWebEgress échouera juste après avec un 503 explicite si besoin.
      console.warn("[start_recording] garde-source ignorée (LiveKit injoignable):", e instanceof Error ? e.message : e)
    }

    const s3 = new S3Upload({
      accessKey: process.env.S3_ACCESS_KEY!,
      secret: process.env.S3_SECRET!,
      endpoint: process.env.S3_ENDPOINT!,
      region: process.env.S3_REGION || "us-east-1",
      bucket: process.env.S3_BUCKET!,
      forcePathStyle: true,
    })
    const fileOutput = new EncodedFileOutput({
      fileType: EncodedFileType.MP4,
      filepath: `webinaire/${session.room_name}-{time}`,
      output: { case: "s3", value: s3 },
    } as any)

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL!
    // Mandat signé : /api/egress-token n'accepte de délivrer un jeton
    // « hidden + recorder » qu'à un enregistreur lancé par nous (cf. egress-access).
    const layoutUrl = appendEgressAccess(
      `${baseUrl}/egress-layout?roomName=${encodeURIComponent(session.room_name)}`,
      session.room_name
    )

    // #4 — 1080p30 (au lieu de 60 fps / 6000 kbps) : largement suffisant pour un
    // cours, et bien moins coûteux en CPU/mémoire pour le Chrome egress, ce qui
    // réduit fortement le risque de crash en cours de capture sous charge réelle.
    const encodingOptions = new EncodingOptions({
      width: 1920,
      height: 1080,
      framerate: 30,
      videoBitrate: 4500,
      videoCodec: 2,
      audioBitrate: 128,
      audioCodec: 1,
      keyFrameInterval: 2,
    })

    const info = await egressClient.startWebEgress(
      layoutUrl,
      fileOutput,
      { encodingOptions } as any
    )

    // Ne JAMAIS logguer layoutUrl : depuis la sécurisation d'egress-token, l'URL
    // porte le mandat signé (exp + sig) valable plusieurs heures. Le journaliser
    // rendrait ce mandat récupérable dans les logs applicatifs — soit l'écoute
    // invisible que ce correctif ferme. room_name suffit au diagnostic.
    console.log("[start_recording] web egress started:", info.egressId, "room:", session.room_name)
    return Response.json({ egress_id: info.egressId })
  } catch (err) {
    if (err instanceof Error && err.message === "FORBIDDEN")
      return new Response("Seul l'animateur peut effectuer cette action", { status: 403 })
    // #5 — Le service egress dépend de Redis et d'un worker egress disponible.
    // Si l'un est indisponible, la requête échoue par timeout / "no response".
    // On renvoie un message explicite (503) plutôt qu'une 500 opaque.
    const msg = err instanceof Error ? err.message : "Error"
    if (/no response|timeout|deadline|unavailable|connection refused/i.test(msg)) {
      console.error("start_recording: service egress indisponible:", msg)
      return new Response(
        "Le service d'enregistrement est momentanément indisponible. Réessayez dans quelques instants.",
        { status: 503 }
      )
    }
    console.error("start_recording error:", err)
    return new Response(msg, { status: 500 })
  }
}
