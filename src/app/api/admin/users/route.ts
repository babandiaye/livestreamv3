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

  const { userId, userIds, role } = await req.json()
  if (!role || !["ADMIN", "MODERATOR", "VIEWER"].includes(role))
    return NextResponse.json({ error: "Rôle invalide" }, { status: 400 })

  // Modification en lot : liste d'identifiants
  if (Array.isArray(userIds)) {
    const ids = userIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    if (ids.length === 0)
      return NextResponse.json({ error: "Aucun utilisateur sélectionné" }, { status: 400 })

    const res = await prisma.user.updateMany({
      where: { id: { in: ids } },
      data: { role },
    })
    return NextResponse.json({ updated: res.count, role })
  }

  // Modification unitaire
  if (!userId)
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 })

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role },
  })

  return NextResponse.json({ user: { id: updated.id, role: updated.role } })
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 })

  const { userId } = await req.json()
  if (!userId || typeof userId !== "string")
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 })

  // Garde-fou : un admin ne peut pas supprimer son propre compte (il perdrait
  // l'accès et, s'il est le dernier admin, la plateforme deviendrait ingérable).
  if (userId === session.user.id)
    return NextResponse.json({ error: "Vous ne pouvez pas supprimer votre propre compte." }, { status: 409 })

  // Un créateur de salles ne peut pas être supprimé : Session.creatorId est
  // obligatoire et SANS cascade (ON DELETE par défaut = RESTRICT). La suppression
  // échouerait au niveau FK et, si on la forçait, orphelinerait salles,
  // enregistrements et présences. On bloque avec un message actionnable.
  const sessionsCreated = await prisma.session.count({ where: { creatorId: userId } })
  if (sessionsCreated > 0)
    return NextResponse.json({
      error: `Impossible de supprimer : cet utilisateur a créé ${sessionsCreated} salle(s). Supprimez-les d'abord ou changez leur créateur.`,
    }, { status: 409 })

  // Sûr : les inscriptions suivent en cascade, les présences sont conservées
  // (Attendance.userId passe à NULL — l'historique reste exploitable).
  await prisma.user.delete({ where: { id: userId } })
  return NextResponse.json({ deleted: true })
}
