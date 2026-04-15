import { Controller, CreateIngressParams } from "@/lib/controller";
import { auth } from "@/auth";

export async function POST(req: Request) {
  if (process.env.KEYCLOAK_ENABLED === "true") {
    const session = await auth();
    if (!session) return new Response("Non authentifié", { status: 401 });
  }
  const controller = new Controller();
  try {
    const body = await req.json();
    const response = await controller.createIngress(body as CreateIngressParams);
    return Response.json(response);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : null, { status: 500 });
  }
}
