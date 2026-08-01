import { Controller, getSessionFromReq } from "@/lib/controller";
import { prisma } from "@/lib/prisma";
import { egressClient } from "@/lib/egress";

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

    // Correctif A — arrêter DIRECTEMENT l'egress encore PROCESSING de cette
    // session, sans dépendre du webhook room_finished. Le web egress n'est PAS
    // lié au cycle de vie de la room : deleteRoom ne l'arrête pas. Jusqu'ici on
    // comptait sur (a) le client qui appelle stopRecording() AVANT — mais
    // seulement si SON état `recording` est vrai (faux pour un co-animateur qui
    // n'a pas lancé la capture) — et (b) le webhook room_finished, qui peut être
    // perdu. On l'arrête donc ici, de façon idempotente (double-arrêt inoffensif).
    try {
      const endedSession = await prisma.session.findUnique({ where: { roomName: session.room_name } });
      if (endedSession) {
        const active = await prisma.recording.findMany({
          where: { sessionId: endedSession.id, status: "PROCESSING", egressId: { not: null } },
        });
        for (const rec of active) {
          try {
            await egressClient.stopEgress(rec.egressId!);
            console.log("[stop_stream] egress arrêté:", rec.egressId);
          } catch (e) {
            // Déjà terminé côté LiveKit → egress_ended / la réconciliation s'en chargent.
            console.warn("[stop_stream] stopEgress ignoré:", rec.egressId, e instanceof Error ? e.message : e);
          }
        }
      }
    } catch (e) {
      console.warn("[stop_stream] arrêt egress ignoré:", e instanceof Error ? e.message : e);
    }

    // Salle supprimée (ou déjà absente) ET egress arrêté → on marque ENDED sans
    // risque de mentir. egress_ended + palier A finalisent l'enregistrement.
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
