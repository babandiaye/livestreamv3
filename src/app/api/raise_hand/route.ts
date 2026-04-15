import { Controller, getSessionFromReq } from "@/lib/controller";

export async function POST(req: Request) {
  const controller = new Controller();
  try {
    const session = await getSessionFromReq(req);
    await controller.raiseHand(session);
    return Response.json({});
  } catch (err) {
    return new Response(err instanceof Error ? err.message : null, { status: 500 });
  }
}
