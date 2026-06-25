import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { signDownloadPath } from "@/lib/download-token"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user) return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 })

  const { id } = await params
  const recording = await prisma.recording.findUnique({
    where: { id },
    include: { session: { select: { creatorId: true } } },
  })
  if (!recording) return NextResponse.json({ error: "Introuvable" }, { status: 404 })
  if (!recording.s3Key || !recording.s3Bucket) {
    return NextResponse.json({ error: "Fichier non disponible" }, { status: 404 })
  }

  // Autorisation : ADMIN, créateur de la session, ou utilisateur enrôlé.
  let allowed = user.role === "ADMIN" || recording.session.creatorId === user.id
  if (!allowed) {
    const enrollment = await prisma.enrollment.findUnique({
      where: { userId_sessionId: { userId: user.id, sessionId: recording.sessionId } },
    })
    allowed = !!enrollment
  }
  if (!allowed) return NextResponse.json({ error: "Accès refusé" }, { status: 403 })

  // Lien de proxy signé (MinIO non exposé publiquement) — expirant.
  return NextResponse.json({ url: signDownloadPath(recording.s3Key) })
}
