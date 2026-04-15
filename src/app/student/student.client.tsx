"use client"

import { useState, useEffect, useCallback } from "react"
import Sidebar from "@/components/layout/Sidebar"
import Footer from "@/components/layout/Footer"
import Pagination from "@/components/ui/Pagination"
import { SessionBadge } from "@/components/ui/Badge"
import RecordingList from "@/components/ui/RecordingList"
import type { Room, Role } from "@/types"
import { PAGE_SIZE } from "@/types"

const IconGrad = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
    <path d="M6 12v5c3 3 9 3 12 0v-5"/>
  </svg>
)
const IconVideo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7"/>
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
  </svg>
)

const NAV_GROUPS = [
  {
    title: "Mes cours",
    items: [
      { key: "rooms",      label: "Mes sessions",    icon: <IconGrad /> },
      { key: "recordings", label: "Enregistrements", icon: <IconVideo /> },
    ],
  },
]

export default function StudentClient({
  user,
}: {
  user: { id: string; name?: string | null; email?: string | null; role: Role }
}) {
  const [nav, setNav] = useState<"rooms" | "recordings">("rooms")
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
  const [joining, setJoining] = useState(false)
  const [roomPage, setRoomPage] = useState(1)
  const [recPage, setRecPage] = useState(1)

  const fetchRooms = useCallback(async () => {
    const d = await (await fetch("/api/rooms")).json()
    setRooms(d.rooms ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchRooms()
    const interval = setInterval(fetchRooms, 30000)
    return () => clearInterval(interval)
  }, [fetchRooms])

  const allRecordings = rooms.flatMap((r) => r.recordings)

  const joinSession = async (room: Room, suffix = "") => {
    setJoining(true)
    const baseName = user.name ?? user.email ?? "spectateur"
    const identity = suffix ? `${baseName} (${suffix})` : baseName

    try {
      const res = await fetch("/api/join_stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_name: room.roomName,
          identity,
        }),
      })

      if (!res.ok) {
        const msg = await res.text()
        if (msg.includes("already exists") || msg.includes("Participant already")) {
          setJoining(false)
          const choice = window.prompt(
            `Le nom "${identity}" est déjà utilisé.\nEntrez un suffixe (ex: 2, 3…) :`,
            "2"
          )
          if (choice) joinSession(room, choice.trim())
          return
        }
        alert("Erreur lors de la connexion : " + msg)
        setJoining(false)
        return
      }

      const data = await res.json()
      window.location.href = `/watch/${room.roomName}?token=${data.connection_details.token}`
    } catch {
      alert("Erreur réseau")
      setJoining(false)
    }
  }

  const pagedRooms      = rooms.slice((roomPage - 1) * PAGE_SIZE, roomPage * PAGE_SIZE)
  const pagedRecordings = allRecordings.slice((recPage - 1) * PAGE_SIZE, recPage * PAGE_SIZE)

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f8fafd", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      <Sidebar
        user={user}
        nav={nav}
        onNav={(k) => setNav(k as typeof nav)}
        groups={NAV_GROUPS}
      />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ flex: 1, padding: "24px 28px" }}>

          {/* ── SESSIONS ── */}
          {nav === "rooms" && (
            <div style={{ display: "flex", gap: 20 }}>
              <div style={{ flex: selectedRoom ? "0 0 380px" : 1, minWidth: 0 }}>

                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1a1a2e" }}>Mes sessions</h2>
                  <span style={{ background: "#e8f4ff", color: "#0065b1", fontSize: 13, fontWeight: 700, padding: "2px 8px", borderRadius: 10 }}>
                    {rooms.length}
                  </span>
                  <button
                    onClick={fetchRooms}
                    style={{ marginLeft: 4, padding: "4px 10px", background: "white", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 12, color: "#6b7280", cursor: "pointer", fontFamily: "inherit" }}
                  >
                    ↻ Actualiser
                  </button>
                </div>

                <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                  {loading ? (
                    <div style={{ padding: "20px 16px", color: "#9ca3af", fontSize: 14, display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ display: "inline-block", width: 13, height: 13, border: "2px solid #e2e8f0", borderTopColor: "#0065b1", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
                      Chargement…
                    </div>
                  ) : pagedRooms.length === 0 ? (
                    <div style={{ padding: "32px 16px", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
                      Aucune session disponible
                    </div>
                  ) : pagedRooms.map((room) => (
                    <div
                      key={room.id}
                      onClick={() => setSelectedRoom(selectedRoom?.id === room.id ? null : room)}
                      style={{ padding: "12px 16px", borderBottom: "1px solid #f0f7ff", cursor: "pointer", background: selectedRoom?.id === room.id ? "#f0f7ff" : "white", transition: "background 0.1s" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e" }}>{room.title}</span>
                        <SessionBadge status={room.status} />
                      </div>
                      {room.description && (
                        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 6 }}>{room.description}</div>
                      )}
                      <div style={{ fontSize: 12, color: "#9ca3af", display: "flex", gap: 12, marginBottom: 8 }}>
                        {room.creator && <span>👤 {room.creator.name}</span>}
                        <span>📅 {new Date(room.createdAt).toLocaleDateString("fr-FR")}</span>
                        {room.recordings.length > 0 && <span>🎬 {room.recordings.length} enreg.</span>}
                      </div>

                      {room.status !== "ENDED" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); joinSession(room) }}
                          disabled={joining}
                          style={{
                            padding: "4px 14px",
                            background: room.status === "LIVE" ? "#16a34a" : "#0065b1",
                            color: "white",
                            border: "none",
                            borderRadius: 6,
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: joining ? "not-allowed" : "pointer",
                            fontFamily: "inherit",
                            opacity: joining ? 0.6 : 1,
                          }}
                        >
                          {joining ? "Connexion…" : room.status === "LIVE" ? "● Rejoindre en direct" : "Rejoindre"}
                        </button>
                      )}
                    </div>
                  ))}
                  <Pagination total={rooms.length} page={roomPage} onPage={setRoomPage} />
                </div>
              </div>

              {/* Détail session */}
              {selectedRoom && (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#1a1a2e" }}>{selectedRoom.title}</h2>
                    <button onClick={() => setSelectedRoom(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#9ca3af" }}>✕</button>
                  </div>

                  {selectedRoom.description && (
                    <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 16px" }}>{selectedRoom.description}</p>
                  )}

                  {selectedRoom.status !== "ENDED" && (
                    <button
                      onClick={() => joinSession(selectedRoom)}
                      disabled={joining}
                      style={{
                        marginBottom: 16,
                        padding: "10px 24px",
                        background: selectedRoom.status === "LIVE" ? "#16a34a" : "#0065b1",
                        color: "white",
                        border: "none",
                        borderRadius: 8,
                        fontSize: 15,
                        fontWeight: 600,
                        cursor: joining ? "not-allowed" : "pointer",
                        fontFamily: "inherit",
                        opacity: joining ? 0.6 : 1,
                      }}
                    >
                      {joining ? "Connexion…" : selectedRoom.status === "LIVE" ? "● Rejoindre la session en direct" : "Rejoindre la session"}
                    </button>
                  )}

                  {selectedRoom.recordings.length > 0 && (
                    <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                      <div style={{ padding: "10px 16px", borderBottom: "1px solid #f0f7ff", fontSize: 14, fontWeight: 600, color: "#1a1a2e" }}>
                        Enregistrements
                      </div>
                      <RecordingList recordings={selectedRoom.recordings} />
                    </div>
                  )}

                  {selectedRoom.recordings.length === 0 && selectedRoom.status === "ENDED" && (
                    <div style={{ padding: "24px 16px", textAlign: "center", color: "#9ca3af", fontSize: 14, background: "white", border: "1px solid #e2e8f0", borderRadius: 10 }}>
                      Aucun enregistrement disponible
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── ENREGISTREMENTS ── */}
          {nav === "recordings" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1a1a2e" }}>Enregistrements</h2>
                <span style={{ background: "#e8f4ff", color: "#0065b1", fontSize: 13, fontWeight: 700, padding: "2px 8px", borderRadius: 10 }}>
                  {allRecordings.length}
                </span>
              </div>
              <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                {loading ? (
                  <div style={{ padding: "20px 16px", color: "#9ca3af", fontSize: 14, display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ display: "inline-block", width: 13, height: 13, border: "2px solid #e2e8f0", borderTopColor: "#0065b1", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
                    Chargement…
                  </div>
                ) : (
                  <>
                    <RecordingList recordings={pagedRecordings} showSession />
                    <Pagination total={allRecordings.length} page={recPage} onPage={setRecPage} />
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <Footer />
      </div>
    </div>
  )
}
