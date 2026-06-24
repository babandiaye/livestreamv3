import { EgressClient, StreamOutput, StreamProtocol, EncodingOptionsPreset } from "livekit-server-sdk";
import { getSessionFromReq, assertRoomCreator } from "@/lib/controller";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const wsUrl = process.env.LIVEKIT_WS_URL;
    if (!wsUrl) return new Response("LIVEKIT_WS_URL not configured", { status: 500 });

    const egressClient = new EgressClient(
      wsUrl.replace("wss://", "https://").replace("ws://", "http://"),
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!
    );

    const session = await getSessionFromReq(req);
    await assertRoomCreator(session); // C2 — seul l'animateur peut diffuser
    const { destinations } = await req.json() as {
      destinations: { url: string; key: string }[];
    };

    if (!destinations || destinations.length === 0) {
      return new Response("Au moins une destination requise", { status: 400 });
    }

    const streamUrls = destinations.map(d => {
      const base = d.url.endsWith("/") ? d.url.slice(0, -1) : d.url;
      return `${base}/${d.key}`;
    });

    const streamOutput = new StreamOutput({
      protocol: StreamProtocol.RTMP,
      urls: streamUrls,
    });

    const info = await egressClient.startRoomCompositeEgress(
      session.room_name,
      { stream: streamOutput },
      {
        layout: "speaker-dark",
        encodingOptions: EncodingOptionsPreset.H264_1080P_30,
      }
    );

    return Response.json({ egress_id: info.egressId });
  } catch (err) {
    if (err instanceof Error && err.message === "FORBIDDEN")
      return new Response("Seul l'animateur peut effectuer cette action", { status: 403 });
    console.error("start-streaming error:", err);
    return new Response(err instanceof Error ? err.message : "Error", { status: 500 });
  }
}
