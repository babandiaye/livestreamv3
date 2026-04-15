import { EgressClient, EncodedFileOutput, EncodedFileType, S3Upload, EncodingOptions } from "livekit-server-sdk"
import { getSessionFromReq } from "@/lib/controller"

const egressClient = new EgressClient(
  process.env.LIVEKIT_WS_URL!.replace("wss://", "https://").replace("ws://", "http://"),
  process.env.LIVEKIT_API_KEY!,
  process.env.LIVEKIT_API_SECRET!
)

export async function POST(req: Request) {
  try {
    const session = await getSessionFromReq(req)
    const s3 = new S3Upload({
      accessKey: process.env.S3_ACCESS_KEY!,
      secret: process.env.S3_SECRET!,
      endpoint: process.env.S3_ENDPOINT!,
      region: process.env.S3_REGION || "us-east-1",
      bucket: process.env.S3_BUCKET!,
      forcePathStyle: true,
    })
    const fileOutput = new EncodedFileOutput({
      fileType: EncodedFileType.MP4,
      filepath: `webinaire/${session.room_name}-{time}`,
      output: { case: "s3", value: s3 },
    } as any)

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL!
    const layoutUrl = `${baseUrl}/egress-layout?roomName=${encodeURIComponent(session.room_name)}`

    const encodingOptions = new EncodingOptions({
      width: 1920,
      height: 1080,
      framerate: 60,
      videoBitrate: 6000,
      videoCodec: 2,
      audioBitrate: 128,
      audioCodec: 1,
      keyFrameInterval: 2,
    })

    const info = await egressClient.startWebEgress(
      layoutUrl,
      fileOutput,
      { encodingOptions } as any
    )

    console.log("[start_recording] web egress started:", info.egressId, "url:", layoutUrl)
    return Response.json({ egress_id: info.egressId })
  } catch (err) {
    console.error("start_recording error:", err)
    return new Response(err instanceof Error ? err.message : "Error", { status: 500 })
  }
}
