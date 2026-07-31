import { Controller, getSessionFromReq } from "@/lib/controller";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const controller = new Controller();
  try {
    const session = await getSessionFromReq(req);
    console.log("[stop_stream] session:", session.room_name, session.identity);

    // Correctif 3 — on supprime la salle D'ABORD, et on ne marque ENDED QUE si
    // l'arrêt a réellement réussi. Avant, ENDED était écrit d'emblée puis l'échec
    // de stopStream était avalé (console.warn) et la route renvoyait un faux
    // succès {} : la base disait « terminé » alors que la salle vivait encore,
    // l'egress tournait et l'animateur croyait avoir arrêté (constaté dans les
    // logs : « Only the creator can stop the stream » suivi d'un ENDED).
    // stopStream applique désormais assertRoomHost : un non-animateur reçoit 403.
    try {
      await controller.stopStream(session); // assertRoomHost + deleteRoom
      console.log("[stop_stream] room deleted:", session.room_name);
    } catch (stopErr) {
      const msg = stopErr instanceof Error ? stopErr.message : String(stopErr);
      if (msg === "FORBIDDEN") {
        // Non-animateur : on ne touche à rien, on ne ment pas.
        return new Response("Seul l'animateur peut arrêter la session", { status: 403 });
      }
      if (!/does not exist/i.test(msg)) {
        // Vraie erreur (LiveKit injoignable…) → surtout NE PAS marquer ENDED.
        console.error("[stop_stream] échec de l'arrêt:", msg);
        return new Response("Impossible d'arrêter la session. Réessayez.", { status: 502 });
      }
      // « Room does not exist » : salle déjà supprimée → arrêt idempotent.
      console.log("[stop_stream] salle déjà absente (idempotent):", session.room_name);
    }

    // Salle réellement supprimée (ou déjà absente) → sa suppression déclenche
    // room_finished côté LiveKit, qui arrête l'egress encore actif (filet du
    // webhook) ; le palier A + la réconciliation finalisent l'enregistrement.
    // On peut donc marquer ENDED sans risque de mentir.
    await prisma.session.updateMany({
      where: { roomName: session.room_name, status: "LIVE" },
      data: { status: "ENDED", endedAt: new Date() },
    });
    console.log("[stop_stream] Session ENDED:", session.room_name);

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[stop_stream] error:", err);
    return new Response(err instanceof Error ? err.message : null, { status: 500 });
  }
}
