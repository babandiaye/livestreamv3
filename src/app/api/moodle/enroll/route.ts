import { NextRequest, NextResponse } from "next/server"
import { validateMoodleKey } from "@/lib/moodle-auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const authError = validateMoodleKey(req)
  if (authError) return authError

  const { roomId, emails } = await req.json()

  if (!roomId || !Array.isArray(emails) || emails.length === 0)
    return NextResponse.json({ error: "roomId et emails requis" }, { status: 400 })

  const room = await prisma.session.findUnique({ where: { id: roomId } })
  if (!room)
    return NextResponse.json({ error: "Salle introuvable" }, { status: 404 })

  const uniqueEmails = [...new Set(emails.map((e: string) => e.toLowerCase().trim()))]

  const users = await prisma.user.findMany({
    where: { email: { in: uniqueEmails } },
    select: { id: true, email: true },
  })

  const existing = await prisma.enrollment.findMany({
    where: { sessionId: roomId },
    select: { userId: true },
  })
  const alreadyEnrolledIds = new Set(existing.map(e => e.userId))

  const toEnroll = users.filter(u => !alreadyEnrolledIds.has(u.id))

  if (toEnroll.length > 0) {
    await prisma.enrollment.createMany({
      data: toEnroll.map(u => ({
        userId: u.id,
        sessionId: roomId,
        createdBy: "moodle-sync",
      })),
      skipDuplicates: true,
    })
  }

  const notFound = uniqueEmails.filter(
    e => !users.find(u => u.email === e)
  )

  return NextResponse.json({
    summary: {
      total: uniqueEmails.length,
      enrolled: toEnroll.length,
      skipped: users.length - toEnroll.length,
      notFound: notFound.length,
    },
    notFound,
  })
}
