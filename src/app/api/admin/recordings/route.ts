import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3"

export const dynamic = "force-dynamic"

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 })

  const { id, deleteFromS3 } = await req.json()
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 })

  const recording = await prisma.recording.findUnique({ where: { id } })
  if (!recording)
    return NextResponse.json({ error: "Enregistrement non trouvé" }, { status: 404 })

  if (deleteFromS3) {
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
      console.error("[admin/recordings DELETE] S3 error:", e)
    }
  }

  await prisma.recording.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
