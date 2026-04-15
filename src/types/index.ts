export type Role = "ADMIN" | "MODERATOR" | "VIEWER"
export type SessionStatus = "SCHEDULED" | "LIVE" | "ENDED"
export type RecordingStatus = "PROCESSING" | "READY" | "FAILED"

export interface AppUser {
  id: string
  name: string | null
  email: string | null
  role: Role
}

export interface UserRecord {
  id: string
  name: string
  email: string
  role: Role
  sessionCount: number
  createdAt: string
}

export interface Creator {
  name: string
  email: string
}

export interface Recording {
  id: string
  filename: string
  s3Key: string
  s3Bucket: string
  duration: number | null
  size: number | null
  createdAt: string
  startedAt: string | null
  status: RecordingStatus
  publishable: boolean
  egressId: string | null
  session?: {
    id: string
    title: string
    roomName: string
    creator: Creator
  }
}

export interface Room {
  id: string
  roomName: string
  title: string
  description: string | null
  status: SessionStatus
  createdAt: string
  startedAt: string | null
  endedAt: string | null
  chatEnabled: boolean
  participationEnabled: boolean
  moodleCourseId: string | null
  moodleMeetingId: string | null
  creator?: Creator
  enrollments?: number
  recordings: Recording[]
}

export interface Enrollment {
  id: string
  userId: string
  name: string
  email: string
  role: Role
  enrolledAt: string
}

export interface SearchUser {
  id: string
  name: string
  email: string
  role: Role
}

export interface ImportResult {
  summary: {
    total: number
    created: number
    enrolled: number
    skipped: number
  }
  skipped: string[]
}

export const PAGE_SIZE = 20

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrateur",
  MODERATOR: "Modérateur",
  VIEWER: "Spectateur",
}

export const STATUS_LABELS: Record<SessionStatus, string> = {
  SCHEDULED: "Planifiée",
  LIVE: "En direct",
  ENDED: "Terminée",
}

export function formatDuration(seconds: number | null): string {
  if (!seconds) return "—"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return h > 0
    ? `${h}h${m.toString().padStart(2, "0")}m`
    : `${m}:${s.toString().padStart(2, "0")}`
}

export function formatSize(bytes: number | null): string {
  if (!bytes) return "—"
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  if (bytes < 1024 ** 3) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
  return `${(bytes / 1024 ** 3).toFixed(2)} Go`
}

export function initials(name: string): string {
  return (name || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}
