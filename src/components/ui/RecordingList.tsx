"use client"

import { useState } from "react"
import { RecordingBadge } from "./Badge"
import { formatDuration, formatSize } from "@/types"
import type { Recording } from "@/types"

interface RecordingListProps {
  recordings: Recording[]
  canDelete?: boolean
  onDelete?: (id: string) => void
  showSession?: boolean
}

export default function RecordingList({
  recordings,
  canDelete = false,
  onDelete,
  showSession = false,
}: RecordingListProps) {
  const [deleting, setDeleting] = useState<string | null>(null)
  const [loadingUrl, setLoadingUrl] = useState<string | null>(null)

  const handlePlay = async (rec: Recording) => {
    setLoadingUrl(rec.id)
    try {
      const res = await fetch(`/api/recordings/${rec.id}/url`)
      const data = await res.json()
      if (data.url) window.open(data.url, "_blank")
    } finally {
      setLoadingUrl(null)
    }
  }

  const handleDownload = async (rec: Recording) => {
    setLoadingUrl(rec.id + "-dl")
    try {
      const res = await fetch(`/api/recordings/${rec.id}/url`)
      const data = await res.json()
      if (data.url) {
        const a = document.createElement("a")
        a.href = data.url
        a.download = rec.filename
        a.click()
      }
    } finally {
      setLoadingUrl(null)
    }
  }

  const handleDelete = async (rec: Recording) => {
    if (!confirm(`Supprimer « ${rec.filename} » ?`)) return
    setDeleting(rec.id)
    try {
      await fetch(`/api/recordings/${rec.id}`, { method: "DELETE" })
      onDelete?.(rec.id)
    } finally {
      setDeleting(null)
    }
  }

  if (recordings.length === 0) {
    return (
      <div style={{
        padding: "32px 16px",
        textAlign: "center",
        color: "#9ca3af",
        fontSize: 14,
      }}>
        Aucun enregistrement disponible
      </div>
    )
  }

  return (
    <div>
      {recordings.map((rec) => (
        <div
          key={rec.id}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid #f0f7ff",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: rec.status === "READY" ? "#dcfce7" : rec.status === "FAILED" ? "#fee2e2" : "#fefce8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              flexShrink: 0,
            }}>
              {rec.status === "READY" ? "🎬" : rec.status === "FAILED" ? "⚠️" : "⏳"}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 14,
                fontWeight: 500,
                color: "#1a1a2e",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {showSession && rec.session ? rec.session.title : rec.filename || "Enregistrement en cours…"}
              </div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2, display: "flex", gap: 8 }}>
                <span>{new Date(rec.createdAt).toLocaleDateString("fr-FR")}</span>
                {rec.duration && <span>· {formatDuration(rec.duration)}</span>}
                {rec.size && <span>· {formatSize(rec.size)}</span>}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <RecordingBadge status={rec.status} />
            {rec.status === "READY" && (
              <>
                <button
                  onClick={() => handlePlay(rec)}
                  disabled={loadingUrl === rec.id}
                  style={btn("#0065b1", "white")}
                >
                  {loadingUrl === rec.id ? "…" : "▶ Voir"}
                </button>
                <button
                  onClick={() => handleDownload(rec)}
                  disabled={loadingUrl === rec.id + "-dl"}
                  style={btn("#f3f4f6", "#374151")}
                >
                  {loadingUrl === rec.id + "-dl" ? "…" : "⬇ Télécharger"}
                </button>
              </>
            )}
            {canDelete && (
              <button
                onClick={() => handleDelete(rec)}
                disabled={deleting === rec.id}
                style={btn("#fee2e2", "#dc2626")}
              >
                {deleting === rec.id ? "…" : "Supprimer"}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function btn(bg: string, color: string) {
  return {
    padding: "4px 12px",
    background: bg,
    color,
    border: "none",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap" as const,
  }
}
