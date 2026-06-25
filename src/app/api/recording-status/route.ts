import { prisma } from "@/lib/prisma"
import { getSessionFromReq } from "@/lib/controller"
import { reconcileRecording } from "@/lib/egress"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  // 1. Vérifier l'authentification via le token Bearer
  let session
  try {
    session = await getSessionFromReq(req)
  } catch {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  }

  const egressId = req.nextUrl.searchParams.get("egressId")
  if (!egressId) {
    return NextResponse.json({ error: "egressId requis" }, { status: 400 })
  }

  // 2. Vérifier que le recording appartient bien à la room du demandeur
  const recording = await prisma.recording.findFirst({
    where: { egressId },
    include: { session: { select: { roomName: true } } },
  })

  if (!recording) {
    return NextResponse.json({ status: "NOT_FOUND" })
  }

  if (recording.session.roomName !== session.room_name) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  // #2 — Auto-réparation : si l'enregistrement traîne en PROCESSING depuis plus
  // d'une minute (webhook egress_ended jamais reçu ?), on interroge LiveKit pour
  // réconcilier l'état réel. On ne le fait pas pendant la première minute pour ne
  // pas surcharger l'API durant la confirmation normale du démarrage.
  let status = recording.status
  const ageMs = Date.now() - recording.createdAt.getTime()
  if (status === "PROCESSING" && ageMs > 60_000) {
    status = (await reconcileRecording(recording)) as typeof status
  }

  return NextResponse.json({ status })
}
