import { NextRequest, NextResponse } from "next/server"
import { validateMoodleKey } from "@/lib/moodle-auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const authError = validateMoodleKey(req)
  if (authError) return authError

  const { courseId, meetingId, title, description, moderatorEmail } = await req.json()

  if (!courseId || !title || !moderatorEmail)
    return NextResponse.json({ error: "courseId, title et moderatorEmail requis" }, { status: 400 })

  const moderator = await prisma.user.findUnique({
    where: { email: moderatorEmail },
  })
  if (!moderator)
    return NextResponse.json({ error: "Modérateur introuvable — doit se connecter une fois sur la plateforme" }, { status: 404 })

  // Toujours créer une salle neuve, identifiée par le cuid généré ici. On NE
  // recherche PLUS de salle existante par moodleMeetingId : cet entier n'est
  // unique qu'au sein d'UN Moodle, donc deux plateformes Moodle distinctes
  // finissaient par se rattacher à la même salle (collision — incident du
  // 27/07/2026 : « TEST Integration DISIDEV » rattachée à « Introduction au
  // droit »). L'idempotence — ne pas recréer pour une activité qui a déjà sa
  // salle — est garantie CÔTÉ PLUGIN : livestream_create_room n'est appelé qu'à
  // la création de l'activité (add_instance) ou via « Créer la salle » gardé par
  // empty(roomid). Même principe que le plugin matrix : décision locale avant
  // création, identité (cuid) possédée par le backend. moodleCourseId /
  // moodleMeetingId restent enregistrés comme métadonnées de provenance, jamais
  // comme clé de réutilisation.
  const roomName = title.toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    + "-" + Math.random().toString(36).slice(2, 6)

  const room = await prisma.session.create({
    data: {
      roomName,
      title,
      description: description ?? null,
      creatorId: moderator.id,
      moodleCourseId: courseId,
      moodleMeetingId: meetingId ?? null,
      chatEnabled: true,
      participationEnabled: false,
    },
  })

  const base = process.env.NEXT_PUBLIC_SITE_URL

  return NextResponse.json({
    roomId: room.id,
    roomName: room.roomName,
    title: room.title,
    status: room.status,
    joinUrlModerator: `${base}/api/moodle/start`,
    joinUrlViewer: `${base}/api/moodle/join`,
    createdAt: room.createdAt.toISOString(),
  })
}
