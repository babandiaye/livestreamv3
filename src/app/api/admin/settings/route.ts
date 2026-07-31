import { auth } from "@/auth"
import { getSetting, setSetting, SETTING_BLOCK_STUDENTS, SETTING_MOODLE_AUTO_MODERATOR } from "@/lib/settings"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// Réglages globaux de la plateforme. Réservé ADMIN. La liste s'enrichira au fil
// des besoins ; pour l'instant : blocage de l'accès étudiant.
export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 })

  return NextResponse.json({
    blockStudents: (await getSetting(SETTING_BLOCK_STUDENTS)) === "on",
    moodleAutoModerator: (await getSetting(SETTING_MOODLE_AUTO_MODERATOR)) === "on",
  })
}

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 })

  const body = await req.json().catch(() => ({}))

  if (typeof body.blockStudents === "boolean") {
    await setSetting(SETTING_BLOCK_STUDENTS, body.blockStudents ? "on" : "off")
  }

  if (typeof body.moodleAutoModerator === "boolean") {
    await setSetting(SETTING_MOODLE_AUTO_MODERATOR, body.moodleAutoModerator ? "on" : "off")
  }

  return NextResponse.json({
    blockStudents: (await getSetting(SETTING_BLOCK_STUDENTS)) === "on",
    moodleAutoModerator: (await getSetting(SETTING_MOODLE_AUTO_MODERATOR)) === "on",
  })
}
