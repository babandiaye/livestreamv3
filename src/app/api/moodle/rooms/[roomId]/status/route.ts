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

  const room = await prisma.session.findUnique({
    where: { id: roomId },
    include: { _count: { select: { recordings: true } } },
  })

  if (!room)
    return NextResponse.json({ error: "Salle introuvable" }, { status: 404 })

  return NextResponse.json({
    roomId: room.id,
    roomName: room.roomName,
    title: room.title,
    status: room.status,
    recordingCount: room._count.recordings,
    startedAt: room.startedAt?.toISOString() ?? null,
    endedAt: room.endedAt?.toISOString() ?? null,
  })
}
