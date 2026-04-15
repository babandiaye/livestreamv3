import { prisma } from "@/lib/prisma"

function serializeRecording(r: any) {
  return {
    id: r.id,
    filename: r.filename,
    s3Key: r.s3Key,
    s3Bucket: r.s3Bucket,
    duration: r.duration ?? null,
    size: r.size ? Number(r.size) : null,
    status: r.status,
    publishable: r.publishable,
    egressId: r.egressId ?? null,
    startedAt: r.startedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    session: r.session
      ? {
          id: r.session.id,
          title: r.session.title,
          roomName: r.session.roomName,
          creator: r.session.creator,
        }
      : undefined,
  }
}

const sessionSelect = {
  id: true,
  title: true,
  roomName: true,
  creator: { select: { name: true, email: true } },
}

export async function getAllRecordings() {
  const recordings = await prisma.recording.findMany({
    orderBy: { createdAt: "desc" },
    include: { session: { select: sessionSelect } },
  })
  return recordings.map(serializeRecording)
}

export async function getRecordingsByCreator(userId: string) {
  const recordings = await prisma.recording.findMany({
    where: { session: { creatorId: userId } },
    orderBy: { createdAt: "desc" },
    include: { session: { select: sessionSelect } },
  })
  return recordings.map(serializeRecording)
}

export async function getRecordingById(id: string) {
  const recording = await prisma.recording.findUnique({
    where: { id },
    include: { session: { select: sessionSelect } },
  })
  if (!recording) return null
  return serializeRecording(recording)
}

export async function getRecordingByEgressId(egressId: string) {
  return prisma.recording.findFirst({ where: { egressId } })
}

export async function updateRecordingStatus(
  egressId: string,
  data: {
    status: "PROCESSING" | "READY" | "FAILED"
    filename?: string
    s3Key?: string
    duration?: number
    size?: bigint
  }
) {
  await prisma.recording.updateMany({ where: { egressId }, data })
}

export async function deleteRecording(id: string) {
  const recording = await prisma.recording.findUnique({ where: { id } })
  if (!recording) throw new Error("NOT_FOUND")
  await prisma.recording.delete({ where: { id } })
}
