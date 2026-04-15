"use client"

import { useState, useEffect, useCallback } from "react"
import Sidebar from "@/components/layout/Sidebar"
import Footer from "@/components/layout/Footer"
import Pagination from "@/components/ui/Pagination"
import { SessionBadge } from "@/components/ui/Badge"
import RecordingList from "@/components/ui/RecordingList"
import EnrollPanel from "@/components/ui/EnrollPanel"
import type { Room, Recording, Role } from "@/types"
import { PAGE_SIZE } from "@/types"

const NAV_ITEMS = [
  { key: "rooms",      label: "Mes salles",       icon: "🏠" },
  { key: "recordings", label: "Enregistrements",  icon: "🎬" },
]

export default function ModeratorClient({
  user,
}: {
  user: { id: string; name?: string | null; email?: string | null; role: Role }
}) {
  const [nav, setNav] = useState<"rooms" | "recordings">("rooms")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [rooms, setRooms] = useState<Room[]>([])
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
  const [roomSubTab, setRoomSubTab] = useState<"enroll" | "settings">("enroll")
  const [roomPage, setRoomPage] = useState(1)
  const [recPage, setRecPage] = useState(1)

  // Formulaire création
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [chatEnabled, setChatEnabled] = useState(true)
  const [participationEnabled, setParticipationEnabled] = useState(false)
  const [creating, setCreating] = useState(false)

  const fetchRooms = useCallback(async () => {
    setLoading(true)
    const d = await (await fetch("/api/admin/rooms")).json()
    setRooms(d.rooms ?? [])
    setLoading(false)
  }, [])

  const fetchRecordings = useCallback(async () => {
    setLoading(true)
    const d = await (await fetch("/api/recordings/me")).json()
    setRecordings(d.recordings ?? [])
    setRecPage(1)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (nav === "rooms")      fetchRooms()
    if (nav === "recordings") fetchRecordings()
  }, [nav, fetchRooms, fetchRecordings])

  const createRoom = async () => {
    if (!title.trim()) return
    setCreating(true)
    await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, chatEnabled, participationEnabled }),
    })
    setTitle("")
    setDescription("")
    setChatEnabled(true)
    setParticipationEnabled(false)
    setShowCreate(false)
    setCreating(false)
    await fetchRooms()
  }

  const deleteRoom = async (id: string) => {
    if (!confirm("Supprimer cette salle ?")) return
    await fetch(`/api/rooms/${id}`, { method: "DELETE" })
    setRooms((prev) => prev.filter((r) => r.id !== id))
    if (selectedRoom?.id === id) setSelectedRoom(null)
  }

  const startMeeting = async (room: Room) => {
    const res = await fetch("/api/create_stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room_name: room.roomName,
        metadata: {
          creator_identity: user.name ?? user.email ?? "Modérateur",
          enable_chat: room.chatEnabled,
          allow_participation: room.participationEnabled,
        },
      }),
    })
    if (!res.ok) { alert("Erreur démarrage"); return }
    const data = await res.json()
    window.location.href = `/host?at=${data.auth_token}&rt=${data.connection_details.token}`
  }

  const copyLink = (roomName: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/watch/${roomName}`)
    alert("Lien copié !")
  }

  const pagedRooms      = rooms.slice((roomPage - 1) * PAGE_SIZE, roomPage * PAGE_SIZE)
  const pagedRecordings = recordings.slice((recPage - 1) * PAGE_SIZE, recPage * PAGE_SIZE)

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f8fafd", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      <Sidebar
        user={user}
        nav={nav}
        onNav={(k) => setNav(k as typeof nav)}
        items={NAV_ITEMS}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
      />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ flex: 1, padding: "24px 28px" }}>

          {/* ── SALLES ── */}
          {nav === "rooms" && (
            <div style={{ display: "flex", gap: 20 }}>
              <div style={{ flex: selectedRoom ? "0 0 380px" : 1, minWidth: 0 }}>

                {/* Header + bouton créer */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1a1a2e" }}>Mes salles</h2>
                    <span style={{ background: "#e8f4ff", color: "#0065b1", fontSize: 13, fontWeight: 700, padding: "2px 8px", borderRadius: 10 }}>
                      {rooms.length}
                    </span>
                  </div>
                  <button
                    onClick={() => setShowCreate((v) => !v)}
                    style={{ padding: "7px 16px", background: "#0065b1", color: "white", border: "none", borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    + Nouvelle salle
                  </button>
                </div>

                {/* Formulaire création */}
                {showCreate && (
                  <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16, marginBottom: 16 }}>
                    <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600, color: "#1a1a2e" }}>Nouvelle salle</h3>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Titre de la salle *"
                      style={inputStyle}
                    />
                    <input
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Description (optionnel)"
                      style={{ ...inputStyle, marginTop: 8 }}
                    />
                    <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
                      <ToggleRow label="Chat" checked={chatEnabled} onChange={setChatEnabled} />
                      <ToggleRow label="Participation" checked={participationEnabled} onChange={setParticipationEnabled} />
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                      <button
                        onClick={createRoom}
                        disabled={creating || !title.trim()}
                        style={{ padding: "8px 20px", background: "#0065b1", color: "white", border: "none", borderRadius: 7, fontSize: 14, cursor: "pointer", fontFamily: "inherit", opacity: creating || !title.trim() ? 0.6 : 1 }}
                      >
                        {creating ? "Création…" : "Créer"}
                      </button>
                      <button
                        onClick={() => setShowCreate(false)}
                        style={{ padding: "8px 16px", background: "white", color: "#6b7280", border: "1px solid #e2e8f0", borderRadius: 7, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}

                {/* Liste salles */}
                <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                  {loading ? <Spinner /> : pagedRooms.length === 0 ? <Empty text="Aucune salle" /> : pagedRooms.map((room) => (
                    <div
                      key={room.id}
                      onClick={() => { setSelectedRoom(room); setRoomSubTab("enroll") }}
                      style={{ padding: "12px 16px", borderBottom: "1px solid #f0f7ff", cursor: "pointer", background: selectedRoom?.id === room.id ? "#f0f7ff" : "white", transition: "background 0.1s" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e" }}>{room.title}</span>
                        <SessionBadge status={room.status} />
                      </div>
                      <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 8 }}>
                        {new Date(room.createdAt).toLocaleDateString("fr-FR")}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); startMeeting(room) }}
                          style={{ padding: "3px 10px", background: "#0065b1", color: "white", border: "none", borderRadius: 5, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                        >
                          ▶ Démarrer
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); copyLink(room.roomName) }}
                          style={{ padding: "3px 10px", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 5, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                        >
                          🔗 Lien
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteRoom(room.id) }}
                          style={{ padding: "3px 10px", background: "white", color: "#dc2626", border: "1px solid #dc2626", borderRadius: 5, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  ))}
                  <Pagination total={rooms.length} page={roomPage} onPage={setRoomPage} />
                </div>
              </div>

              {/* Panneau détail */}
              {selectedRoom && (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#1a1a2e" }}>{selectedRoom.title}</h2>
                    <button onClick={() => setSelectedRoom(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#9ca3af" }}>✕</button>
                  </div>
                  <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
                    {(["enroll", "settings"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setRoomSubTab(t)}
                        style={{ padding: "6px 14px", border: "1px solid", borderColor: roomSubTab === t ? "#0065b1" : "#e2e8f0", background: roomSubTab === t ? "#0065b1" : "white", color: roomSubTab === t ? "white" : "#374151", borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
                      >
                        {t === "enroll" ? "Participants" : "Paramètres"}
                      </button>
                    ))}
                  </div>
                  <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                    {roomSubTab === "enroll" && <EnrollPanel sessionId={selectedRoom.id} />}
                    {roomSubTab === "settings" && (
                      <RoomSettings
                        room={selectedRoom}
                        onUpdate={(r) => { setSelectedRoom(r); setRooms((prev) => prev.map((x) => x.id === r.id ? r : x)) }}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── ENREGISTREMENTS ── */}
          {nav === "recordings" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1a1a2e" }}>Enregistrements</h2>
                <span style={{ background: "#e8f4ff", color: "#0065b1", fontSize: 13, fontWeight: 700, padding: "2px 8px", borderRadius: 10 }}>{recordings.length}</span>
              </div>
              <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                {loading ? <Spinner /> : (
                  <>
                    <RecordingList
                      recordings={pagedRecordings}
                      showSession
                      onDelete={(id) => setRecordings((prev) => prev.filter((r) => r.id !== id))}
                    />
                    <Pagination total={recordings.length} page={recPage} onPage={setRecPage} />
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

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  border: "1px solid #e2e8f0",
  borderRadius: 7,
  fontSize: 14,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
}

function Spinner() {
  return (
    <div style={{ padding: "20px 16px", color: "#9ca3af", fontSize: 14, display: "flex", gap: 8, alignItems: "center" }}>
      <span style={{ display: "inline-block", width: 13, height: 13, border: "2px solid #e2e8f0", borderTopColor: "#0065b1", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
      Chargement…
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ padding: "24px 16px", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>{text}</div>
  )
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        onClick={() => onChange(!checked)}
        style={{ width: 36, height: 20, borderRadius: 10, border: "none", cursor: "pointer", background: checked ? "#0065b1" : "#e2e8f0", position: "relative", transition: "background 0.2s", flexShrink: 0 }}
      >
        <span style={{ position: "absolute", top: 2, left: checked ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "white", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
      </button>
      <span style={{ fontSize: 13, color: "#374151" }}>{label}</span>
    </div>
  )
}

function RoomSettings({ room, onUpdate }: { room: Room; onUpdate: (r: Room) => void }) {
  const [chatEnabled, setChatEnabled] = useState(room.chatEnabled)
  const [participationEnabled, setParticipationEnabled] = useState(room.participationEnabled)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    await fetch(`/api/rooms/${room.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatEnabled, participationEnabled }),
    })
    onUpdate({ ...room, chatEnabled, participationEnabled })
    setSaving(false)
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <ToggleRow label="Chat activé" checked={chatEnabled} onChange={setChatEnabled} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <ToggleRow label="Participation activée" checked={participationEnabled} onChange={setParticipationEnabled} />
      </div>
      <button
        onClick={save}
        disabled={saving}
        style={{ padding: "8px 20px", background: "#0065b1", color: "white", border: "none", borderRadius: 7, fontSize: 14, cursor: "pointer", fontFamily: "inherit", opacity: saving ? 0.6 : 1 }}
      >
        {saving ? "Sauvegarde…" : "Sauvegarder"}
      </button>
    </div>
  )
}
