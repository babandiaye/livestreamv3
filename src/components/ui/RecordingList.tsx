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
  const [playing, setPlaying] = useState<Recording | null>(null)

  const proxyUrl = (rec: Recording) =>
    `/api/download-recording?key=${encodeURIComponent(rec.s3Key)}`

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
      <div style={{ padding: "32px 16px", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
        Aucun enregistrement disponible
      </div>
    )
  }

  return (
    <>
      {/* ── MODAL LECTEUR ── */}
      {playing && (
        <div
          onClick={() => setPlaying(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 1000, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 900, background: "#1a1a2e", borderRadius: 12, overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,.7)" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #2d3748" }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                🎬 {playing.filename}
              </span>
              <div style={{ display: "flex", gap: 8, flexShrink: 0, marginLeft: 12 }}>
                <a
                  href={proxyUrl(playing)}
                  download={playing.filename}
                  style={{ padding: "4px 12px", background: "#2d3748", color: "#e2e8f0", borderRadius: 6, fontSize: 12, textDecoration: "none", fontWeight: 500 }}
                >
                  ⬇ Télécharger
                </a>
                <button
                  onClick={() => setPlaying(null)}
                  style={{ padding: "4px 12px", background: "#dc2626", color: "white", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }}
                >
                  ✕ Fermer
                </button>
              </div>
            </div>
            <video
              src={proxyUrl(playing)}
              controls
              autoPlay
              style={{ width: "100%", maxHeight: "70vh", background: "black", display: "block" }}
            />
          </div>
        </div>
      )}

      <div>
        {recordings.map((rec) => (
          <div
            key={rec.id}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #f0f7ff", gap: 12 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: rec.status === "READY" ? "#e8f4ff" : rec.status === "FAILED" ? "#fee2e2" : "#fefce8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: rec.status === "READY" ? "#0065b1" : rec.status === "FAILED" ? "#dc2626" : "#ca8a04" }}>
                {rec.status === "READY" ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="23 7 16 12 23 17 23 7"/>
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                  </svg>
                ) : rec.status === "FAILED" ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#1a1a2e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {showSession && rec.session ? rec.session.title : rec.filename || "Enregistrement en cours…"}
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2, display: "flex", gap: 8 }}>
                  <span>{new Date(rec.createdAt).toLocaleDateString("fr-FR")}</span>
                  {rec.duration && <span>· {formatDuration(rec.duration)}</span>}
                  {rec.size && <span>· {formatSize(Number(rec.size))}</span>}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <RecordingBadge status={rec.status} />
              {rec.status === "READY" && (
                <>
                  <button onClick={() => setPlaying(rec)} style={btn("#0065b1", "white")}>
                    ▶ Voir
                  </button>
                  <a
                    href={proxyUrl(rec)}
                    download={rec.filename}
                    style={{ ...btn("#f3f4f6", "#374151"), textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                  >
                    ⬇ Télécharger
                  </a>
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
    </>
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
