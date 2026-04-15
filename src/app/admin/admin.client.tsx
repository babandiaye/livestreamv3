"use client"

import { useState, useEffect, useCallback } from "react"
import Sidebar from "@/components/layout/Sidebar"
import Footer from "@/components/layout/Footer"
import Avatar from "@/components/ui/Avatar"
import Pagination from "@/components/ui/Pagination"
import { SessionBadge, RoleBadge } from "@/components/ui/Badge"
import RecordingList from "@/components/ui/RecordingList"
import EnrollPanel from "@/components/ui/EnrollPanel"
import StatusPanel from "@/components/StatusPanel"
import type { Room, UserRecord, Recording, Role } from "@/types"
import { PAGE_SIZE } from "@/types"

const NAV_ITEMS = [
  { key: "rooms",      label: "Salles",          icon: "🏠" },
  { key: "users",      label: "Utilisateurs",    icon: "👥" },
  { key: "recordings", label: "Enregistrements", icon: "🎬" },
  { key: "status",     label: "Statut services", icon: "⚙️" },
]

export default function AdminClient({
  user,
}: {
  user: { id: string; name?: string | null; email?: string | null; role: Role }
}) {
  const [nav, setNav] = useState<"rooms" | "users" | "recordings" | "status">("rooms")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [users, setUsers] = useState<UserRecord[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [loading, setLoading] = useState(false)
  const [updatingRole, setUpdatingRole] = useState<string | null>(null)
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
  const [roomSubTab, setRoomSubTab] = useState<"enroll" | "settings">("enroll")
  const [userPage, setUserPage] = useState(1)
  const [recPage, setRecPage] = useState(1)
  const [roomPage, setRoomPage] = useState(1)
  const [userSearch, setUserSearch] = useState("")

  // Création salle
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [chatEnabled, setChatEnabled] = useState(true)
  const [participationEnabled, setParticipationEnabled] = useState(false)
  const [creating, setCreating] = useState(false)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    const d = await (await fetch("/api/admin/users")).json()
    setUsers(d.users ?? [])
    setLoading(false)
  }, [])

  const fetchRooms = useCallback(async () => {
    setLoading(true)
    const d = await (await fetch("/api/admin/rooms")).json()
    setRooms(d.rooms ?? [])
    setLoading(false)
  }, [])

  const fetchRecordings = useCallback(async () => {
    setLoading(true)
    const d = await (await fetch("/api/admin/recordings")).json()
    setRecordings(d.recordings ?? [])
    setRecPage(1)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (nav === "users")      fetchUsers()
    if (nav === "rooms")      fetchRooms()
    if (nav === "recordings") fetchRecordings()
  }, [nav, fetchUsers, fetchRooms, fetchRecordings])

  const changeRole = async (userId: string, role: string) => {
    setUpdatingRole(userId)
    await fetch(`/api/admin/users/${userId}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    })
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: role as Role } : u))
    setUpdatingRole(null)
  }

  const deleteRoom = async (id: string) => {
    if (!confirm("Supprimer cette salle ?")) return
    await fetch(`/api/rooms/${id}`, { method: "DELETE" })
    setRooms((prev) => prev.filter((r) => r.id !== id))
    if (selectedRoom?.id === id) setSelectedRoom(null)
  }

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

  const startMeeting = async (room: Room) => {
    const res = await fetch("/api/create_stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room_name: room.roomName,
        metadata: {
          creator_identity: user.name ?? user.email ?? "Administrateur",
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

  const filteredUsers = userSearch.trim().length > 0
    ? users.filter((u) =>
        u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.email.toLowerCase().includes(userSearch.toLowerCase())
      )
    : users

  const pagedUsers      = filteredUsers.slice((userPage - 1) * PAGE_SIZE, userPage * PAGE_SIZE)
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
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1a1a2e" }}>Salles</h2>
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
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 7, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                    />
                    <input
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Description (optionnel)"
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 7, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginTop: 8 }}
                    />
                    <div style={{ display: "flex", gap: 20, marginTop: 12 }}>
                      <ToggleRow label="Chat" desc="" checked={chatEnabled} onChange={setChatEnabled} />
                      <ToggleRow label="Participation" desc="" checked={participationEnabled} onChange={setParticipationEnabled} />
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
                      <div style={{ fontSize: 12, color: "#9ca3af", display: "flex", gap: 12, marginBottom: 8 }}>
                        <span>👤 {room.creator?.name}</span>
                        <span>📋 {room.enrollments ?? 0} enrôlés</span>
                        <span>🎬 {room.recordings.length} enreg.</span>
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

              {/* Panneau détail salle */}
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

          {/* ── UTILISATEURS ── */}
          {nav === "users" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1a1a2e" }}>Utilisateurs</h2>
                  <span style={{ background: "#e8f4ff", color: "#0065b1", fontSize: 13, fontWeight: 700, padding: "2px 8px", borderRadius: 10 }}>{filteredUsers.length}</span>
                </div>
                <input
                  value={userSearch}
                  onChange={(e) => { setUserSearch(e.target.value); setUserPage(1) }}
                  placeholder="Rechercher…"
                  style={{ padding: "7px 12px", border: "1px solid #e2e8f0", borderRadius: 7, fontSize: 14, fontFamily: "inherit", outline: "none", width: 220 }}
                />
              </div>
              <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                {loading ? <Spinner /> : (
                  <>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #f0f7ff", background: "#f8fbff" }}>
                          {["Nom", "Email", "Rôle", "Sessions", "Depuis", "Changer rôle"].map((h) => (
                            <th key={h} style={{ padding: "10px 16px", fontSize: 12, fontWeight: 600, color: "#6b7280", textAlign: "left" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pagedUsers.map((u) => (
                          <tr key={u.id} style={{ borderBottom: "1px solid #f9fbff" }}>
                            <td style={{ padding: "10px 16px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <Avatar name={u.name} size={26} color={u.role === "ADMIN" ? "#b91c1c" : u.role === "MODERATOR" ? "#0065b1" : "#6b7280"} />
                                <span style={{ fontSize: 14, fontWeight: 500, color: "#1a1a2e" }}>{u.name}</span>
                              </div>
                            </td>
                            <td style={{ padding: "10px 16px", fontSize: 13, color: "#6b7280" }}>{u.email}</td>
                            <td style={{ padding: "10px 16px" }}><RoleBadge role={u.role} /></td>
                            <td style={{ padding: "10px 16px", fontSize: 14, color: "#6b7280", textAlign: "center" }}>{u.sessionCount}</td>
                            <td style={{ padding: "10px 16px", fontSize: 13, color: "#6b7280" }}>{new Date(u.createdAt).toLocaleDateString("fr-FR")}</td>
                            <td style={{ padding: "10px 16px" }}>
                              <select
                                value={u.role}
                                disabled={updatingRole === u.id}
                                onChange={(e) => changeRole(u.id, e.target.value)}
                                style={{ padding: "5px 8px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}
                              >
                                <option value="VIEWER">Spectateur</option>
                                <option value="MODERATOR">Modérateur</option>
                                <option value="ADMIN">Administrateur</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <Pagination total={filteredUsers.length} page={userPage} onPage={setUserPage} />
                  </>
                )}
              </div>
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
                      canDelete
                      showSession
                      onDelete={(id) => setRecordings((prev) => prev.filter((r) => r.id !== id))}
                    />
                    <Pagination total={recordings.length} page={recPage} onPage={setRecPage} />
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── STATUT ── */}
          {nav === "status" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1a1a2e" }}>Statut des services</h2>
              </div>
              <StatusPanel />
            </div>
          )}
        </div>

        <Footer />
      </div>
    </div>
  )
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
      <ToggleRow label="Chat activé" desc="Les participants peuvent envoyer des messages" checked={chatEnabled} onChange={setChatEnabled} />
      <ToggleRow label="Participation activée" desc="Les spectateurs peuvent lever la main" checked={participationEnabled} onChange={setParticipationEnabled} />
      <button
        onClick={save}
        disabled={saving}
        style={{ marginTop: 16, padding: "8px 20px", background: "#0065b1", color: "white", border: "none", borderRadius: 7, fontSize: 14, cursor: "pointer", fontFamily: "inherit", opacity: saving ? 0.6 : 1 }}
      >
        {saving ? "Sauvegarde…" : "Sauvegarder"}
      </button>
    </div>
  )
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f0f7ff" }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: "#1a1a2e" }}>{label}</div>
        {desc && <div style={{ fontSize: 12, color: "#9ca3af" }}>{desc}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        style={{ width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer", background: checked ? "#0065b1" : "#e2e8f0", position: "relative", transition: "background 0.2s", flexShrink: 0 }}
      >
        <span style={{ position: "absolute", top: 2, left: checked ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: "white", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
      </button>
    </div>
  )
}
