import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { reconcileStuckRecordings } from "@/lib/egress"

export const dynamic = "force-dynamic"

// Réconciliation périodique des enregistrements bloqués en PROCESSING.
//
// reconcileStuckRecordings existait déjà mais n'était appelée QUE par le GET de
// la page admin /api/admin/recordings : si aucun administrateur n'ouvrait cette
// page, un enregistrement bloqué le restait indéfiniment (blocages 22-23-30/07).
// Cette route l'expose à un cron système (voir /etc/cron.d) pour un déclenchement
// automatique toutes les ~10 min, indépendamment de toute présence humaine.
//
// Protégée par CRON_SECRET : elle déclenche des écritures en base et des appels
// LiveKit, elle ne doit pas être publique. Comparaison à temps constant.

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false // pas de secret configuré → route fermée
  // Accepte "Authorization: Bearer <secret>" ou "?key=<secret>".
  const header = req.headers.get("authorization") ?? ""
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : ""
  const provided = bearer || req.nextUrl.searchParams.get("key") || ""
  if (provided.length !== secret.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret))
  } catch {
    return false
  }
}

async function run(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  }
  const started = Date.now()
  const result = await reconcileStuckRecordings()
  const ms = Date.now() - started
  console.log(
    `[cron/reconcile] vérifiés=${result.checked} mis à jour=${result.updated} (${ms}ms)`
  )
  return NextResponse.json({ ...result, ms })
}

// POST (usage cron normal) et GET (test manuel) — même logique.
export async function POST(req: NextRequest) {
  return run(req)
}
export async function GET(req: NextRequest) {
  return run(req)
}
