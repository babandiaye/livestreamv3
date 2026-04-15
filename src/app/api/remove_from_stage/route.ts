import { Controller, RemoveFromStageParams, getSessionFromReq } from "@/lib/controller";

export async function POST(req: Request) {
  const controller = new Controller();
  try {
    const session = await getSessionFromReq(req);
    const body = await req.json();
    await controller.removeFromStage(session, body as RemoveFromStageParams);
    return Response.json({});
  } catch (err) {
    return new Response(err instanceof Error ? err.message : null, { status: 500 });
  }
}
