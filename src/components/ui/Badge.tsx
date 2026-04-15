"use client"

import type { SessionStatus, RecordingStatus, Role } from "@/types"

const SESSION_BADGE: Record<SessionStatus, { label: string; bg: string; color: string }> = {
  SCHEDULED: { label: "Planifiée",  bg: "#f0f9ff", color: "#0369a1" },
  LIVE:      { label: "En direct",  bg: "#dcfce7", color: "#15803d" },
  ENDED:     { label: "Terminée",   bg: "#f3f4f6", color: "#6b7280" },
}

export function SessionBadge({ status }: { status: SessionStatus }) {
  const { label, bg, color } = SESSION_BADGE[status] ?? SESSION_BADGE.SCHEDULED
  return (
    <span style={{
      padding: "2px 9px",
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 600,
      background: bg,
      color,
      whiteSpace: "nowrap",
    }}>
      {status === "LIVE" && <span style={{ marginRight: 4 }}>●</span>}
      {label}
    </span>
  )
}

const RECORDING_BADGE: Record<RecordingStatus, { label: string; bg: string; color: string }> = {
  PROCESSING: { label: "En cours",   bg: "#fefce8", color: "#a16207" },
  READY:      { label: "Disponible", bg: "#dcfce7", color: "#15803d" },
  FAILED:     { label: "Échec",      bg: "#fee2e2", color: "#dc2626" },
}

export function RecordingBadge({ status }: { status: RecordingStatus }) {
  const { label, bg, color } = RECORDING_BADGE[status] ?? RECORDING_BADGE.PROCESSING
  return (
    <span style={{
      padding: "2px 9px",
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 600,
      background: bg,
      color,
      whiteSpace: "nowrap",
    }}>
      {status === "PROCESSING" && <span style={{ marginRight: 4 }}>⏳</span>}
      {status === "FAILED"     && <span style={{ marginRight: 4 }}>✕</span>}
      {label}
    </span>
  )
}

const ROLE_BADGE: Record<Role, { label: string; bg: string; color: string }> = {
  ADMIN:     { label: "Administrateur", bg: "#fee2e2", color: "#b91c1c" },
  MODERATOR: { label: "Modérateur",     bg: "#dbeafe", color: "#1e40af" },
  VIEWER:    { label: "Spectateur",     bg: "#f3f4f6", color: "#374151" },
}

export function RoleBadge({ role }: { role: Role }) {
  const { label, bg, color } = ROLE_BADGE[role] ?? ROLE_BADGE.VIEWER
  return (
    <span style={{
      padding: "3px 8px",
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 600,
      background: bg,
      color,
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  )
}
