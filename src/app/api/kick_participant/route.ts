import { Controller, getSessionFromReq } from "@/lib/controller";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const controller = new Controller();
  try {
    const session = await getSessionFromReq(req);
    const { identity } = await req.json();
    if (!identity) return new Response("identity requis", { status: 400 });
    await controller.kickParticipant(session.room_name, identity);
    console.log("[kick_participant] excluded:", identity, "from", session.room_name);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[kick_participant] error:", err);
    return new Response(err instanceof Error ? err.message : null, { status: 500 });
  }
}
