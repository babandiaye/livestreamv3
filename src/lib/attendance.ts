import { prisma } from "@/lib/prisma"

// L'egress (enregistrement) et l'ingress OBS se connectent à la room comme des
// participants LiveKit — jamais de vrais utilisateurs, ne doivent jamais figurer
// dans la liste de présence.
const EGRESS_PREFIX = "egress-recorder-"
const OBS_SUFFIX = " (via OBS)"

export function isSystemParticipant(identity: string): boolean {
  return identity.startsWith(EGRESS_PREFIX) || identity.endsWith(OBS_SUFFIX)
}

// Référence utilisateur transportée dans la metadata du token de connexion.
type AttendeeMeta = {
  userId?: string
  email?: string
  isModerator?: boolean
}

function parseMeta(metadata?: string | null): AttendeeMeta {
  if (!metadata) return {}
  try {
    const m = JSON.parse(metadata) as Record<string, unknown>
    return {
      userId: typeof m.userId === "string" ? m.userId : undefined,
      email: typeof m.email === "string" ? m.email : undefined,
      isModerator: m.isModerator === true,
    }
  } catch {
    return {}
  }
}

// Résout l'utilisateur applicatif à partir de la metadata (userId puis email).
// Retourne null pour un invité anonyme (/watch sans compte).
async function resolveUserId(meta: AttendeeMeta): Promise<string | null> {
  if (meta.userId) {
    const u = await prisma.user.findUnique({ where: { id: meta.userId }, select: { id: true } })
    if (u) return u.id
  }
  if (meta.email) {
    const u = await prisma.user.findUnique({ where: { email: meta.email.toLowerCase() }, select: { id: true } })
    if (u) return u.id
  }
  return null
}

// Enregistre une connexion (participant_joined). Une ligne par connexion réelle.
export async function recordJoin(
  roomName: string,
  identity: string,
  name: string,
  metadata: string | null | undefined,
  joinedAt: Date
): Promise<void> {
  if (isSystemParticipant(identity)) return

  const session = await prisma.session.findUnique({
    where: { roomName },
    select: { id: true, startedAt: true },
  })
  if (!session) return

  const meta = parseMeta(metadata)
  const userId = await resolveUserId(meta)

  await prisma.attendance.create({
    data: {
      sessionId: session.id,
      userId,
      identity,
      name: name || identity,
      isModerator: meta.isModerator ?? false,
      // startedAt est à jour à ce stade (room_started / participant_joined l'ont fixé).
      sessionStartedAt: session.startedAt ?? joinedAt,
      joinedAt,
    },
  })
}

// Ferme la connexion ouverte la plus récente pour cette identité (participant_left).
export async function recordLeave(
  roomName: string,
  identity: string,
  leftAt: Date
): Promise<void> {
  if (isSystemParticipant(identity)) return

  const session = await prisma.session.findUnique({
    where: { roomName },
    select: { id: true },
  })
  if (!session) return

  const open = await prisma.attendance.findFirst({
    where: { sessionId: session.id, identity, leftAt: null },
    orderBy: { joinedAt: "desc" },
    select: { id: true },
  })
  if (!open) return

  await prisma.attendance.update({ where: { id: open.id }, data: { leftAt } })
}

// Filet de sécurité : à la fin de la salle, referme toutes les connexions restées
// ouvertes (participant_left perdu, redémarrage serveur) avec l'heure de fin.
export async function closeOrphans(roomName: string, endedAt: Date): Promise<void> {
  const session = await prisma.session.findUnique({
    where: { roomName },
    select: { id: true },
  })
  if (!session) return

  await prisma.attendance.updateMany({
    where: { sessionId: session.id, leftAt: null },
    data: { leftAt: endedAt },
  })
}

// ─── Restitution ────────────────────────────────────────────────────────────

export type AttendeeSummary = {
  identity: string
  name: string
  isModerator: boolean
  verified: boolean // rattaché à un compte (userId non null)
  totalDurationSec: number
  firstJoinedAt: string
  lastLeftAt: string | null
  connections: number
}

export type AttendanceSessionGroup = {
  key: string
  startedAt: string
  endedAt: string | null
  participants: AttendeeSummary[]
}

// Regroupe la présence par cycle de réunion (sessionStartedAt) puis agrège par
// identité (somme des durées, nb de reconnexions). Plus récent en premier.
export async function listAttendance(sessionId: string): Promise<AttendanceSessionGroup[]> {
  const records = await prisma.attendance.findMany({
    where: { sessionId },
    orderBy: { joinedAt: "asc" },
  })

  const byCycle = new Map<number, typeof records>()
  for (const r of records) {
    const key = r.sessionStartedAt.getTime()
    const list = byCycle.get(key) ?? []
    list.push(r)
    byCycle.set(key, list)
  }

  const now = Date.now()
  const groups: AttendanceSessionGroup[] = []

  for (const [cycleMs, cycleRecords] of byCycle) {
    // Agrégation par identité
    const byIdentity = new Map<string, typeof records>()
    for (const r of cycleRecords) {
      const list = byIdentity.get(r.identity) ?? []
      list.push(r)
      byIdentity.set(r.identity, list)
    }

    const participants: AttendeeSummary[] = []
    for (const [identity, conns] of byIdentity) {
      const last = conns[conns.length - 1]
      // Une connexion encore ouverte compte jusqu'à maintenant.
      const totalDurationSec = conns.reduce((sum, c) => {
        const end = c.leftAt ? c.leftAt.getTime() : now
        return sum + Math.max(0, Math.round((end - c.joinedAt.getTime()) / 1000))
      }, 0)

      participants.push({
        identity,
        name: last.name,
        isModerator: conns.some((c) => c.isModerator),
        verified: conns.some((c) => c.userId !== null),
        totalDurationSec,
        firstJoinedAt: conns[0].joinedAt.toISOString(),
        lastLeftAt: last.leftAt ? last.leftAt.toISOString() : null,
        connections: conns.length,
      })
    }

    // Modérateur(s) d'abord, puis par temps de présence décroissant.
    participants.sort((a, b) => {
      if (a.isModerator !== b.isModerator) return a.isModerator ? -1 : 1
      return b.totalDurationSec - a.totalDurationSec
    })

    const allLeft = cycleRecords.every((r) => r.leftAt !== null)
    const endedAt = allLeft
      ? new Date(Math.max(...cycleRecords.map((r) => r.leftAt!.getTime()))).toISOString()
      : null

    groups.push({
      key: String(cycleMs),
      startedAt: new Date(cycleMs).toISOString(),
      endedAt,
      participants,
    })
  }

  groups.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
  return groups
}
