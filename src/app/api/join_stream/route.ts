import { Controller, JoinStreamParams } from "@/lib/controller";

export async function POST(req: Request) {
  const controller = new Controller();
  try {
    const body = await req.json();
    const response = await controller.joinStream(body as JoinStreamParams);
    return Response.json(response);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : null, { status: 500 });
  }
}
