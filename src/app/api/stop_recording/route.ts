import { EgressClient } from "livekit-server-sdk";
import { getSessionFromReq } from "@/lib/controller";

const egressClient = new EgressClient(
  process.env.LIVEKIT_WS_URL!.replace("wss://", "https://").replace("ws://", "http://"),
  process.env.LIVEKIT_API_KEY!,
  process.env.LIVEKIT_API_SECRET!
);

export async function POST(req: Request) {
  try {
    await getSessionFromReq(req);
    const { egress_id } = await req.json();
    if (!egress_id) return new Response("egress_id required", { status: 400 });
    const info = await egressClient.stopEgress(egress_id);
    return Response.json({ status: info.status });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Error", { status: 500 });
  }
}
