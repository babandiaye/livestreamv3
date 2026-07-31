import { Controller, getSessionFromReq, assertRoomHost } from "@/lib/controller";

// Diffusion OBS (ingress RTMP/WHIP) vers le salon courant. Appelée depuis /host
// avec le token Bearer de l'animateur — même modèle d'auth que les autres actions
// host (C1+C2), ce qui marche aussi pour un animateur Moodle (pas de session NextAuth).
export async function POST(req: Request) {
  const controller = new Controller();
  try {
    const session = await getSessionFromReq(req);
    await assertRoomHost(session); // seul l'animateur du salon peut créer un ingress
    const { ingress_type } = (await req.json()) as { ingress_type?: string };

    const response = await controller.createIngress({
      room_name: session.room_name,
      ingress_type: ingress_type === "whip" ? "whip" : "rtmp",
      create_room: false, // le salon est déjà ouvert
      metadata: {
        creator_identity: session.identity,
        enable_chat: true,
        allow_participation: false,
      },
    });
    return Response.json(response);
  } catch (err) {
    if (err instanceof Error && err.message === "FORBIDDEN")
      return new Response("Seul l'animateur peut effectuer cette action", { status: 403 });
    return new Response(err instanceof Error ? err.message : null, { status: 500 });
  }
}
