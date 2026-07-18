import { WebhookReceiver } from "livekit-server-sdk"
import { prisma } from "@/lib/prisma"
import { egressClient, isRecordingEgress } from "@/lib/egress"
import { recordJoin, recordLeave, closeOrphans } from "@/lib/attendance"
import { NextRequest, NextResponse } from "next/server"
export const dynamic = "force-dynamic"

const receiver = new WebhookReceiver(
  process.env.LIVEKIT_API_KEY!,
  process.env.LIVEKIT_API_SECRET!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const authHeader = req.headers.get("Authorization") ?? ""
    const event = await receiver.receive(body, authHeader)
    console.log("[webhook] event:", event.event)

    // ── Room créée / démarrée → LIVE ──
    if (event.event === "room_started" && event.room) {
      const roomName = event.room.name
      await prisma.session.updateMany({
        where: { roomName, status: { in: ["SCHEDULED", "ENDED"] } },
        data: { status: "LIVE", startedAt: new Date() },
      })
      console.log("[webhook] Session LIVE:", roomName)
    }

    // ── Premier participant rejoint → LIVE (fallback) ──
    if (event.event === "participant_joined" && event.room) {
      const roomName = event.room.name
      await prisma.session.updateMany({
        where: { roomName, status: "SCHEDULED" },
        data: { status: "LIVE", startedAt: new Date() },
      })
      console.log("[webhook] Session LIVE via participant_joined:", roomName)

      // ── Présence : enregistrer la connexion (hors egress/OBS) ──
      if (event.participant) {
        const p = event.participant
        const joinedAt = p.joinedAt ? new Date(Number(p.joinedAt) * 1000) : new Date()
        await recordJoin(roomName, p.identity, p.name || p.identity, p.metadata, joinedAt)
      }
    }

    // ── Présence : participant parti → fermer sa connexion ──
    if (event.event === "participant_left" && event.room && event.participant) {
      await recordLeave(event.room.name, event.participant.identity, new Date())
    }

    // ── Room terminée → ENDED ──
    if (event.event === "room_finished" && event.room) {
      const roomName = event.room.name
      await prisma.session.updateMany({
        where: { roomName, status: "LIVE" },
        data: { status: "ENDED", endedAt: new Date() },
      })
      console.log("[webhook] Session ENDED:", roomName)

      // ── Présence : refermer les connexions restées ouvertes ──
      await closeOrphans(roomName, new Date())

      // #3 — Filet de sécurité : arrêter tout enregistrement encore actif pour
      // cette room. Le web egress n'est PAS lié au cycle de vie de la room ; si
      // l'animateur a fermé l'onglet / perdu le réseau sans cliquer sur Stop,
      // le Chrome egress tournerait indéfiniment. On retrouve l'egressId via
      // notre base (roomName absent côté web egress) et on l'arrête.
      const endedSession = await prisma.session.findUnique({ where: { roomName } })
      if (endedSession) {
        const active = await prisma.recording.findMany({
          where: { sessionId: endedSession.id, status: "PROCESSING", egressId: { not: null } },
        })
        for (const rec of active) {
          try {
            await egressClient.stopEgress(rec.egressId!)
            console.log("[webhook] egress arrêté (room_finished):", rec.egressId)
          } catch (e) {
            // Déjà terminé côté LiveKit : la fin sera traitée par egress_ended,
            // ou restera réconciliable. On ignore l'erreur.
            console.warn("[webhook] stopEgress (room_finished) ignoré:", rec.egressId, e instanceof Error ? e.message : e)
          }
        }
      }
    }

    // ── Egress démarré → Recording PROCESSING ──
    // #1 — Uniquement pour les egress d'ENREGISTREMENT (sortie fichier). Les
    // diffusions RTMP (room_composite/stream) ne doivent pas créer de Recording.
    if (event.event === "egress_started" && event.egressInfo && isRecordingEgress(event.egressInfo)) {
      const egress = event.egressInfo

      let roomName = egress.roomName
      if (!roomName && egress.request?.case === "web") {
        const url = (egress.request.value as any)?.url ?? ""
        const match = url.match(/roomName=([^&]+)/)
        if (match) roomName = decodeURIComponent(match[1])
      }
      console.log("[webhook] egress_started:", egress.egressId, roomName)

      if (roomName) {
        const dbSession = await prisma.session.findUnique({ where: { roomName } })
        if (dbSession) {
          const existing = await prisma.recording.findFirst({
            where: { egressId: egress.egressId },
          })
          if (!existing) {
            await prisma.recording.create({
              data: {
                sessionId: dbSession.id,
                s3Key: "",
                s3Bucket: process.env.S3_BUCKET ?? "preprod-webinairerecordings",
                filename: "Enregistrement en cours…",
                egressId: egress.egressId,
                status: "PROCESSING",
                startedAt: new Date(),
              },
            })
            console.log("[webhook] Recording PROCESSING créé:", egress.egressId)
          }
        }
      }
    }

    // ── Egress terminé → Recording READY ou FAILED ──
    // #1 — Idem : on ignore la fin des egress de diffusion RTMP (pas de fichier),
    // qui sinon seraient marqués FAILED à tort.
    if (event.event === "egress_ended" && event.egressInfo && isRecordingEgress(event.egressInfo)) {
      const egress = event.egressInfo

      let roomName = egress.roomName
      if (!roomName && egress.request?.case === "web") {
        const url = (egress.request.value as any)?.url ?? ""
        const match = url.match(/roomName=([^&]+)/)
        if (match) roomName = decodeURIComponent(match[1])
      }
      console.log("[webhook] egress_ended:", egress.egressId, "status:", egress.status, "room:", roomName)

      const fileResults = egress.fileResults
      if (fileResults && fileResults.length > 0) {
        const file = fileResults[0]
        const s3Key = file.filename ?? ""
        const filename = s3Key.split("/").pop() ?? s3Key
        const size = file.size ? BigInt(file.size.toString()) : null
        const duration = file.duration
          ? Math.round(Number(file.duration) / 1_000_000_000)
          : null

        const existing = await prisma.recording.findFirst({
          where: { egressId: egress.egressId },
        })

        if (existing) {
          await prisma.recording.update({
            where: { id: existing.id },
            data: { s3Key, filename, size, duration, status: "READY" },
          })
          console.log("[webhook] Recording READY:", filename)
        } else {
          const dbSession = roomName
            ? await prisma.session.findUnique({ where: { roomName } })
            : null
          if (dbSession) {
            await prisma.recording.create({
              data: {
                sessionId: dbSession.id,
                s3Key,
                s3Bucket: process.env.S3_BUCKET ?? "preprod-webinairerecordings",
                filename,
                size,
                duration,
                egressId: egress.egressId,
                status: "READY",
              },
            })
            console.log("[webhook] Recording READY (fallback):", filename)
          }
        }
      } else {
        const existing = await prisma.recording.findFirst({
          where: { egressId: egress.egressId },
        })
        if (existing) {
          await prisma.recording.update({
            where: { id: existing.id },
            data: { status: "FAILED" },
          })
          console.log("[webhook] Recording FAILED:", egress.egressId)
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[webhook] error:", err)
    return NextResponse.json({ error: "Invalid webhook" }, { status: 400 })
  }
}
