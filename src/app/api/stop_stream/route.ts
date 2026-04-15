import { Controller, getSessionFromReq } from "@/lib/controller";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const controller = new Controller();
  try {
    const session = await getSessionFromReq(req);
    console.log("[stop_stream] session:", session.room_name, session.identity);

    // Mettre à jour le statut AVANT de supprimer la room
    await prisma.session.updateMany({
      where: { roomName: session.room_name },
      data: { status: "ENDED", endedAt: new Date() },
    });
    console.log("[stop_stream] Session ENDED:", session.room_name);

    // Supprimer la room LiveKit — ignorer si elle n'existe plus
    try {
      await controller.stopStream(session);
      console.log("[stop_stream] room deleted:", session.room_name);
    } catch (stopErr) {
      console.warn("[stop_stream] room delete warning:", stopErr instanceof Error ? stopErr.message : stopErr);
    }

    return Response.json({});
  } catch (err) {
    console.error("[stop_stream] error:", err);
    return new Response(err instanceof Error ? err.message : null, { status: 500 });
  }
}
