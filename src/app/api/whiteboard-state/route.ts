import { Controller, getSessionFromReq, assertRoomCreator } from "@/lib/controller";

// Bascule l'état du tableau blanc via les métadonnées de room (state sync).
// Protégée par le pattern C2 : token vérifié + assertion créateur — seul
// l'animateur peut ouvrir/fermer le tableau pour toute la salle.
// Réf. doc : https://docs.livekit.io/transport/data/state/
export async function POST(req: Request) {
  const controller = new Controller();
  try {
    const session = await getSessionFromReq(req);
    await assertRoomCreator(session);
    const { open } = await req.json();
    await controller.setWhiteboardOpen(session, open === true);
    return Response.json({});
  } catch (err) {
    if (err instanceof Error && err.message === "FORBIDDEN")
      return new Response("Seul l'animateur peut effectuer cette action", { status: 403 });
    console.error("[whiteboard-state] échec:", err instanceof Error ? err.message : err);
    return new Response(err instanceof Error ? err.message : null, { status: 500 });
  }
}
