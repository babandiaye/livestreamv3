import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import type { Role } from "@/types"

export const dynamic = "force-dynamic"

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 })

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { sessions: true } } },
  })

  return NextResponse.json({
    users: users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      sessionCount: u._count.sessions,
      createdAt: u.createdAt.toISOString(),
    })),
  })
}

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 })

  const { userId, role } = await req.json()
  if (!userId || !role || !["ADMIN", "MODERATOR", "VIEWER"].includes(role))
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 })

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role },
  })

  return NextResponse.json({ user: { id: updated.id, role: updated.role } })
}
