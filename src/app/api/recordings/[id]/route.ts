import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// Suppression d'un enregistrement par son id (appelée par RecordingList).
// Autorisation : ADMIN, ou créateur de la session (un modérateur peut supprimer
// les enregistrements de ses propres salles).
export async function DELETE(
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

  const allowed = user.role === "ADMIN" || recording.session.creatorId === user.id
  if (!allowed) return NextResponse.json({ error: "Accès refusé" }, { status: 403 })

  // Supprimer le fichier S3 (best-effort — un fichier orphelin ne doit pas
  // empêcher la suppression de la ligne en base).
  if (recording.s3Key) {
    try {
      const s3 = new S3Client({
        region: process.env.S3_REGION || "us-east-1",
        endpoint: process.env.S3_ENDPOINT,
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY!,
          secretAccessKey: process.env.S3_SECRET!,
        },
        forcePathStyle: true,
      })
      await s3.send(new DeleteObjectCommand({
        Bucket: recording.s3Bucket,
        Key: recording.s3Key,
      }))
    } catch (e) {
      console.error("[recordings/[id] DELETE] S3 error:", e)
    }
  }

  await prisma.recording.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
