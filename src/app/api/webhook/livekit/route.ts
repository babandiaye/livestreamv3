import { WebhookReceiver } from "livekit-server-sdk"
import { prisma } from "@/lib/prisma"
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
    }

    // ── Room terminée → ENDED ──
    if (event.event === "room_finished" && event.room) {
      const roomName = event.room.name
      await prisma.session.updateMany({
        where: { roomName, status: "LIVE" },
        data: { status: "ENDED", endedAt: new Date() },
      })
      console.log("[webhook] Session ENDED:", roomName)
    }

    // ── Egress démarré → Recording PROCESSING ──
    if (event.event === "egress_started" && event.egressInfo) {
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
    if (event.event === "egress_ended" && event.egressInfo) {
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
