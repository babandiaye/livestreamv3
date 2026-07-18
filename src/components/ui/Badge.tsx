"use client"

import { Circle, Clock, X } from "@/components/ui/icons"
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
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "2px 9px",
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 600,
      background: bg,
      color,
      whiteSpace: "nowrap",
    }}>
      {status === "LIVE" && <Circle size={7} fill="currentColor" strokeWidth={0} />}
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
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "2px 9px",
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 600,
      background: bg,
      color,
      whiteSpace: "nowrap",
    }}>
      {status === "PROCESSING" && <Clock size={12} />}
      {status === "FAILED"     && <X size={12} />}
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
