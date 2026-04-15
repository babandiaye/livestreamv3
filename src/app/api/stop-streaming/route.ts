import { EgressClient } from "livekit-server-sdk";
import { getSessionFromReq } from "@/lib/controller";

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

    await getSessionFromReq(req);
    const { egress_id } = await req.json() as { egress_id: string };

    if (!egress_id) return new Response("egress_id requis", { status: 400 });

    await egressClient.stopEgress(egress_id);
    return Response.json({ success: true });
  } catch (err) {
    console.error("stop-streaming error:", err);
    return new Response(err instanceof Error ? err.message : "Error", { status: 500 });
  }
}
