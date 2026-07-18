import { Controller, InviteToStageParams, getSessionFromReq } from "@/lib/controller";

export async function POST(req: Request) {
  const controller = new Controller();
  try {
    const session = await getSessionFromReq(req);
    const body = await req.json();
    await controller.inviteToStage(session, body as InviteToStageParams);
    return Response.json({});
  } catch (err) {
    console.error("[invite_to_stage] échec:", err instanceof Error ? err.message : err);
    return new Response(err instanceof Error ? err.message : null, { status: 500 });
  }
}
