import { prisma } from "@/lib/prisma"

export async function getEnrollments(sessionId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: { sessionId },
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
    },
    orderBy: { createdAt: "asc" },
  })

  return enrollments.map((e) => ({
    id: e.id,
    userId: e.userId,
    name: e.user.name,
    email: e.user.email,
    role: e.user.role,
    enrolledAt: e.createdAt.toISOString(),
  }))
}

export async function enrollUser(
  sessionId: string,
  userId: string,
  createdBy: string
) {
  const existing = await prisma.enrollment.findUnique({
    where: { userId_sessionId: { userId, sessionId } },
  })
  if (existing) throw new Error("ALREADY_ENROLLED")

  const enrollment = await prisma.enrollment.create({
    data: { userId, sessionId, createdBy },
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
    },
  })

  return {
    id: enrollment.id,
    userId: enrollment.userId,
    name: enrollment.user.name,
    email: enrollment.user.email,
    role: enrollment.user.role,
    enrolledAt: enrollment.createdAt.toISOString(),
  }
}

export async function unenrollUser(sessionId: string, userId: string) {
  await prisma.enrollment.deleteMany({ where: { userId, sessionId } })
}

export async function importEnrollmentsFromCSV(
  sessionId: string,
  rows: { email: string; prenom?: string; nom?: string }[],
  createdBy: string
) {
  const BATCH = 500
  let created = 0
  let enrolled = 0
  const skipped: string[] = []

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)

    await Promise.all(
      batch.map(async (row) => {
        if (!row.email?.trim()) return
        const email = row.email.trim().toLowerCase()
        const name = [row.prenom, row.nom].filter(Boolean).join(" ") || email

        try {
          let user = await prisma.user.findUnique({ where: { email } })
          if (!user) {
            user = await prisma.user.create({
              data: {
                email,
                name,
                keycloakId: `csv-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                role: "VIEWER",
              },
            })
            created++
          }

          const existingEnroll = await prisma.enrollment.findUnique({
            where: { userId_sessionId: { userId: user.id, sessionId } },
          })
          if (!existingEnroll) {
            await prisma.enrollment.create({
              data: { userId: user.id, sessionId, createdBy },
            })
            enrolled++
          } else {
            skipped.push(email)
          }
        } catch {
          skipped.push(email)
        }
      })
    )
  }

  return {
    summary: { total: rows.length, created, enrolled, skipped: skipped.length },
    skipped,
  }
}

export async function searchUsers(query: string, excludeSessionId?: string) {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, email: true, role: true },
    take: 10,
  })

  if (!excludeSessionId) return users

  const existing = await prisma.enrollment.findMany({
    where: { sessionId: excludeSessionId },
    select: { userId: true },
  })
  const existingIds = new Set(existing.map((e) => e.userId))

  return users.filter((u) => !existingIds.has(u.id))
}
