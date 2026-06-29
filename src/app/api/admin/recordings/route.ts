import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { reconcileStuckRecordings } from "@/lib/egress"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 })

  // #2 — Réconcilier les enregistrements bloqués en PROCESSING avant d'afficher
  // la liste (filet de sécurité si un webhook egress_ended a été manqué).
  await reconcileStuckRecordings().catch(() => {})

  const recordings = await prisma.recording.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      session: {
        select: { id: true, title: true, roomName: true },
      },
    },
  })

  return NextResponse.json({
    recordings: recordings.map(r => ({
      id: r.id,
      filename: r.filename,
      status: r.status,
      duration: r.duration,
      size: r.size ? Number(r.size) : null,
      s3Key: r.s3Key,
      s3Bucket: r.s3Bucket,
      egressId: r.egressId,
      publishable: r.publishable,
      startedAt: r.startedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      sessionId: r.sessionId,
      sessionTitle: r.session?.title ?? null,
      roomName: r.session?.roomName ?? null,
    })),
  })
}
