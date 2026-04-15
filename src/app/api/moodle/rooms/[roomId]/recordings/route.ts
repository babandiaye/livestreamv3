import { NextRequest, NextResponse } from "next/server"
import { validateMoodleKey } from "@/lib/moodle-auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const authError = validateMoodleKey(req)
  if (authError) return authError

  const { roomId } = await params

  const room = await prisma.session.findUnique({ where: { id: roomId } })
  if (!room)
    return NextResponse.json({ error: "Salle introuvable" }, { status: 404 })

  const recordings = await prisma.recording.findMany({
    where: { sessionId: roomId },
    orderBy: { createdAt: "desc" },
  })

  const base = process.env.NEXT_PUBLIC_SITE_URL

  return NextResponse.json({
    recordings: recordings.map(r => ({
      id: r.id,
      name: r.filename,
      duration: r.duration ?? 0,
      size: r.size ? Number(r.size) : 0,
      date: r.createdAt.toISOString(),
      playUrl: `${base}/api/download-recording?key=${encodeURIComponent(r.s3Key)}`,
      deleteUrl: `${base}/api/moodle/recordings/${r.id}`,
    })),
  })
}
