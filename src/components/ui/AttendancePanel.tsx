"use client"

import { useState, useEffect, useCallback } from "react"
import Pagination from "@/components/ui/Pagination"
import { PAGE_SIZE } from "@/types"
import { User, Clock, Download, RefreshCw, Circle, Eye, ChevronDown } from "@/components/ui/icons"

type Attendee = {
  identity: string
  name: string
  isModerator: boolean
  verified: boolean
  totalDurationSec: number
  firstJoinedAt: string
  lastLeftAt: string | null
  connections: number
}

type Group = {
  key: string
  startedAt: string
  endedAt: string | null
  participants: Attendee[]
}

function fmtDur(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h) return `${h}h ${m.toString().padStart(2, "0")}m`
  if (m) return `${m}m ${sec.toString().padStart(2, "0")}s`
  return `${sec}s`
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
}

// Identifiant lisible d'une session : nom de salle + horodatage de début.
function sessionLabel(roomTitle: string, key: string): string {
  return `${roomTitle}-${key}`
}

export default function AttendancePanel({ sessionId, roomTitle }: { sessionId: string; roomTitle: string }) {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [sessionPage, setSessionPage] = useState(1)
  const [partPage, setPartPage] = useState<Record<string, number>>({})

  const fetchAttendance = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/rooms/${sessionId}/attendance`)
      if (!res.ok) { setGroups([]); return }
      const d = await res.json()
      setGroups(d.groups ?? [])
    } catch {
      setGroups([])
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => { fetchAttendance() }, [fetchAttendance])

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })

  const exportCsv = () => {
    const rows: string[] = ["Session;Nom;Type;Rôle;Première connexion;Dernier départ;Temps total (s);Temps total;Reconnexions"]
    for (const g of groups) {
      const label = sessionLabel(roomTitle, g.key)
      for (const p of g.participants) {
        rows.push([
          label,
          `"${p.name.replace(/"/g, '""')}"`,
          p.verified ? "Compte" : "Invité",
          p.isModerator ? "Animateur" : "Participant",
          fmtTime(p.firstJoinedAt),
          p.lastLeftAt ? fmtTime(p.lastLeftAt) : "en cours",
          String(p.totalDurationSec),
          fmtDur(p.totalDurationSec),
          String(p.connections),
        ].join(";"))
      }
    }
    const blob = new Blob(["﻿" + rows.join("\n")], { type: "text/csv;charset=utf-8" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `presence-${roomTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const totalParticipants = groups.reduce((n, g) => n + g.participants.length, 0)
  const pagedGroups = groups.slice((sessionPage - 1) * PAGE_SIZE, sessionPage * PAGE_SIZE)

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#1a1a2e" }}>Liste de présence</h3>
          <button
            onClick={fetchAttendance}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", background: "white", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 12, color: "#6b7280", cursor: "pointer", fontFamily: "inherit" }}
          >
            <RefreshCw size={13} /> Actualiser
          </button>
        </div>
        {groups.length > 0 && (
          <button
            onClick={exportCsv}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "#0065b1", color: "white", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
          >
            <Download size={15} /> Exporter CSV
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: "32px 16px", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>Chargement…</div>
      ) : totalParticipants === 0 ? (
        <div style={{ padding: "32px 16px", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
          Aucune présence enregistrée pour le moment.
        </div>
      ) : (
        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
          {pagedGroups.map((g) => {
            const isOpen = expanded.has(g.key)
            const pp = partPage[g.key] ?? 1
            const pagedParts = g.participants.slice((pp - 1) * PAGE_SIZE, pp * PAGE_SIZE)
            return (
              <div key={g.key} style={{ borderBottom: "1px solid #f0f7ff" }}>
                {/* En-tête de session : nom de salle + timestamp, dépliable */}
                <div
                  onClick={() => toggle(g.key)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 14px", background: isOpen ? "#f0f7ff" : "#f8fbff", cursor: "pointer", flexWrap: "wrap" }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0065b1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {sessionLabel(roomTitle, g.key)}
                    </div>
                    <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                      {fmtDate(g.startedAt)} · {fmtTime(g.startedAt)}{g.endedAt ? ` → ${fmtTime(g.endedAt)}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: g.endedAt ? "#6b7280" : "#15803d" }}>
                      {!g.endedAt && <Circle size={7} fill="currentColor" strokeWidth={0} />}
                      {g.endedAt ? "Terminée" : "En cours"} · {g.participants.length}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggle(g.key) }}
                      aria-label={isOpen ? "Masquer le détail" : "Voir le détail"}
                      title={isOpen ? "Masquer le détail" : "Voir le détail"}
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", background: "white", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 12, color: "#374151", cursor: "pointer", fontFamily: "inherit" }}
                    >
                      {isOpen ? <ChevronDown size={14} /> : <Eye size={14} />} Détail
                    </button>
                  </div>
                </div>

                {/* Détail : liste des participants (paginée) */}
                {isOpen && (
                  <div>
                    {pagedParts.map((p) => (
                      <div key={p.identity} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderTop: "1px solid #f6f9ff", flexWrap: "wrap" }}>
                        <div style={{ width: 34, height: 34, borderRadius: "50%", background: p.isModerator ? "#0065b1" : "#e8f4ff", color: p.isModerator ? "white" : "#0065b1", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <User size={17} />
                        </div>
                        <div style={{ flex: 1, minWidth: 140 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 14, fontWeight: 500, color: "#1a1a2e" }}>{p.name}</span>
                            {p.isModerator && <Tag text="Animateur" bg="#dbeafe" color="#1e40af" />}
                            {p.verified ? <Tag text="Compte" bg="#dcfce7" color="#15803d" /> : <Tag text="Invité" bg="#fef3c7" color="#92400e" />}
                            {p.connections > 1 && <Tag text={`${p.connections} connexions`} bg="#f3f4f6" color="#6b7280" />}
                          </div>
                          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 3 }}>
                            Arrivé {fmtTime(p.firstJoinedAt)}{p.lastLeftAt ? ` · Parti ${fmtTime(p.lastLeftAt)}` : " · encore connecté"}
                          </div>
                        </div>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 600, color: "#0065b1", flexShrink: 0 }}>
                          <Clock size={14} /> {fmtDur(p.totalDurationSec)}
                        </div>
                      </div>
                    ))}
                    <Pagination
                      total={g.participants.length}
                      page={pp}
                      onPage={(np) => setPartPage((prev) => ({ ...prev, [g.key]: np }))}
                    />
                  </div>
                )}
              </div>
            )
          })}
          <Pagination total={groups.length} page={sessionPage} onPage={setSessionPage} />
        </div>
      )}
    </div>
  )
}

function Tag({ text, bg, color }: { text: string; bg: string; color: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: "1px 7px", borderRadius: 10, background: bg, color }}>{text}</span>
  )
}
