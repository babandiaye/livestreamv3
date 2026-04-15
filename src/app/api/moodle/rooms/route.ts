import { NextRequest, NextResponse } from "next/server"
import { validateMoodleKey } from "@/lib/moodle-auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const authError = validateMoodleKey(req)
  if (authError) return authError

  const { courseId, meetingId, title, description, moderatorEmail } = await req.json()

  if (!courseId || !title || !moderatorEmail)
    return NextResponse.json({ error: "courseId, title et moderatorEmail requis" }, { status: 400 })

  const moderator = await prisma.user.findUnique({
    where: { email: moderatorEmail },
  })
  if (!moderator)
    return NextResponse.json({ error: "Modérateur introuvable — doit se connecter une fois sur la plateforme" }, { status: 404 })

  // Chercher par meetingId si fourni, sinon par courseId
  let room = null
  if (meetingId) {
    room = await prisma.session.findFirst({
      where: { moodleMeetingId: meetingId },
    })
  } else {
    room = await prisma.session.findFirst({
      where: { moodleCourseId: courseId },
    })
  }

  if (!room) {
    const roomName = title.toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      + "-" + Math.random().toString(36).slice(2, 6)

    room = await prisma.session.create({
      data: {
        roomName,
        title,
        description: description ?? null,
        creatorId: moderator.id,
        moodleCourseId: courseId,
        moodleMeetingId: meetingId ?? null,
        chatEnabled: true,
        participationEnabled: false,
      },
    })
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL

  return NextResponse.json({
    roomId: room.id,
    roomName: room.roomName,
    title: room.title,
    status: room.status,
    joinUrlModerator: `${base}/api/moodle/start`,
    joinUrlViewer: `${base}/api/moodle/join`,
    createdAt: room.createdAt.toISOString(),
  })
}
