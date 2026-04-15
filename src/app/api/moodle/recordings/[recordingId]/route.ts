import { NextRequest, NextResponse } from "next/server"
import { validateMoodleKey } from "@/lib/moodle-auth"
import { prisma } from "@/lib/prisma"
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3"

export const dynamic = "force-dynamic"

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ recordingId: string }> }
) {
  const authError = validateMoodleKey(req)
  if (authError) return authError

  const { recordingId } = await params

  const recording = await prisma.recording.findUnique({ where: { id: recordingId } })
  if (!recording)
    return NextResponse.json({ error: "Enregistrement introuvable" }, { status: 404 })

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
    console.error("[moodle/recordings DELETE] S3 error:", e)
  }

  await prisma.recording.delete({ where: { id: recordingId } })
  return NextResponse.json({ success: true })
}
