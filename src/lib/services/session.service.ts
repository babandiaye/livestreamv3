import { prisma } from "@/lib/prisma"
import type { Role } from "@/types"

const recordingSelect = {
  id: true,
  filename: true,
  s3Key: true,
  s3Bucket: true,
  duration: true,
  size: true,
  status: true,
  publishable: true,
  egressId: true,
  startedAt: true,
  createdAt: true,
}

const sessionInclude = {
  recordings: { select: recordingSelect },
  creator: { select: { name: true, email: true } },
  _count: { select: { enrollments: true } },
}

function serializeSession(s: any) {
  return {
    id: s.id,
    roomName: s.roomName,
    title: s.title,
    description: s.description ?? null,
    status: s.status,
    createdAt: s.createdAt.toISOString(),
    startedAt: s.startedAt?.toISOString() ?? null,
    endedAt: s.endedAt?.toISOString() ?? null,
    chatEnabled: s.chatEnabled,
    participationEnabled: s.participationEnabled,
    moodleCourseId: s.moodleCourseId ?? null,
    moodleMeetingId: s.moodleMeetingId ?? null,
    creator: s.creator ?? null,
    enrollments: s._count?.enrollments ?? 0,
    recordings: s.recordings.map((r: any) => ({
      ...r,
      size: r.size ? Number(r.size) : null,
      startedAt: r.startedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  }
}

export async function getSessionsForUser(userId: string, role: Role) {
  if (role === "ADMIN") {
    const sessions = await prisma.session.findMany({
      orderBy: { createdAt: "desc" },
      include: sessionInclude,
    })
    return sessions.map(serializeSession)
  }

  if (role === "MODERATOR") {
    const sessions = await prisma.session.findMany({
      where: { creatorId: userId },
      orderBy: { createdAt: "desc" },
      include: sessionInclude,
    })
    return sessions.map(serializeSession)
  }

  const enrollments = await prisma.enrollment.findMany({
    where: { userId },
    include: { session: { include: sessionInclude } },
  })
  return enrollments.map((e) => serializeSession(e.session))
}

export async function getSessionById(id: string) {
  const session = await prisma.session.findUnique({
    where: { id },
    include: sessionInclude,
  })
  if (!session) return null
  return serializeSession(session)
}

export async function createSession(data: {
  title: string
  description?: string
  chatEnabled: boolean
  participationEnabled: boolean
  creatorId: string
}) {
  const roomName =
    data.title
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "") +
    "-" +
    Math.random().toString(36).slice(2, 6)

  const session = await prisma.session.create({
    data: {
      roomName,
      title: data.title.trim(),
      description: data.description?.trim() || null,
      chatEnabled: data.chatEnabled ?? true,
      participationEnabled: data.participationEnabled ?? false,
      creatorId: data.creatorId,
    },
    include: sessionInclude,
  })
  return serializeSession(session)
}

export async function deleteSession(id: string) {
  await prisma.session.delete({ where: { id } })
}

export async function updateSessionStatus(
  roomName: string,
  status: "LIVE" | "ENDED" | "SCHEDULED",
  extra?: { startedAt?: Date; endedAt?: Date }
) {
  await prisma.session.updateMany({
    where: { roomName },
    data: { status, ...extra },
  })
}
