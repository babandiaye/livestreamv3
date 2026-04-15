import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const { id } = await params
  const recording = await prisma.recording.findUnique({ where: { id } })
  if (!recording) return NextResponse.json({ error: "Introuvable" }, { status: 404 })
  if (!recording.s3Key || !recording.s3Bucket) {
    return NextResponse.json({ error: "Fichier non disponible" }, { status: 404 })
  }

  const s3 = new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET!,
    },
    forcePathStyle: true,
  })

  const command = new GetObjectCommand({
    Bucket: recording.s3Bucket,
    Key: recording.s3Key,
  })

  const url = await getSignedUrl(s3, command, { expiresIn: 3600 })
  return NextResponse.json({ url })
}
