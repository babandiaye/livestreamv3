import { Controller, JoinStreamParams } from "@/lib/controller";

export async function POST(req: Request) {
  const controller = new Controller();
  try {
    const body = await req.json();
    const response = await controller.joinStream(body as JoinStreamParams);
    return Response.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : null;
    // Pas d'animateur dans la salle : ce n'est pas une panne, c'est un refus
    // attendu. On le distingue par un 403 pour que le client affiche l'écran
    // d'attente plutôt qu'une erreur technique.
    if (message === "NO_MODERATOR") {
      return new Response("NO_MODERATOR", { status: 403 });
    }
    return new Response(message, { status: 500 });
  }
}
