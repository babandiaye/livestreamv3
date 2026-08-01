import { getSessionFromReq, hasOtherHostConnected } from "@/lib/controller"

export const dynamic = "force-dynamic"

// Indique au client host s'il reste un AUTRE animateur connecté que l'appelant.
// Utilisé par « Quitter » pour avertir quand on est le dernier animateur (la
// session resterait ouverte sans pilote). Authentifié par le jeton de session.
export async function GET(req: Request) {
  try {
    const session = await getSessionFromReq(req)
    const otherHost = await hasOtherHostConnected(session)
    return Response.json({ otherHost })
  } catch {
    // Non authentifié / erreur → conservateur : on considère qu'il n'y a pas
    // d'autre animateur, le client affichera l'avertissement fort.
    return Response.json({ otherHost: false })
  }
}
