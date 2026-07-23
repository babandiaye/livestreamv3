"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Sidebar from "@/components/layout/Sidebar"
import Footer from "@/components/layout/Footer"
import Avatar from "@/components/ui/Avatar"
import RoomIcon from "@/components/ui/RoomIcon"
import { Play, Link, Download, Upload, RefreshCw, X, User, Users, Calendar, Mail, Check, Clapperboard, Trash2 } from "@/components/ui/icons"
import Pagination from "@/components/ui/Pagination"
import { SessionBadge, RoleBadge } from "@/components/ui/Badge"
import RecordingList from "@/components/ui/RecordingList"
import EnrollPanel from "@/components/ui/EnrollPanel"
import AttendancePanel from "@/components/ui/AttendancePanel"
import StatusPanel from "@/components/StatusPanel"
import type { Room, UserRecord, Recording, Role } from "@/types"
import { PAGE_SIZE } from "@/types"

const IconMonitor = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2"/>
    <line x1="8" y1="21" x2="16" y2="21"/>
    <line x1="12" y1="17" x2="12" y2="21"/>
  </svg>
)
const IconUsers = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
)
const IconVideo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7"/>
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
  </svg>
)
const IconActivity = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
)
const IconSettings = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
)

// Style partagé pour une métadonnée « icône + texte » alignée dans une ligne d'infos.
const metaSpan = { display: "inline-flex", alignItems: "center", gap: 4 } as const
// Style partagé pour un bouton « icône + libellé ».
const iconBtn = { display: "inline-flex", alignItems: "center", gap: 6 } as const

const NAV_GROUPS = [
  {
    title: "Gestion",
    items: [
      { key: "rooms",      label: "Salles",       icon: <IconMonitor /> },
      { key: "users",      label: "Utilisateurs", icon: <IconUsers /> },
    ],
  },
  {
    title: "Contenu",
    items: [
      { key: "recordings", label: "Enregistrements", icon: <IconVideo /> },
    ],
  },
  {
    title: "Système",
    items: [
      { key: "status", label: "Statut services", icon: <IconActivity /> },
      { key: "settings", label: "Paramètres", icon: <IconSettings /> },
    ],
  },
]

export default function AdminClient({
  user,
}: {
  user: { id: string; name?: string | null; email?: string | null; role: Role }
}) {
  const [nav, setNav] = useState<"rooms" | "users" | "recordings" | "status" | "settings">("rooms")
  const [blockStudents, setBlockStudents] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [savingSetting, setSavingSetting] = useState(false)
  const [users, setUsers] = useState<UserRecord[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [loading, setLoading] = useState(false)
  const [updatingRole, setUpdatingRole] = useState<string | null>(null)
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
  const [roomSubTab, setRoomSubTab] = useState<"enroll" | "settings" | "attendance">("enroll")
  const [userPage, setUserPage] = useState(1)
  const [recPage, setRecPage] = useState(1)
  const [roomPage, setRoomPage] = useState(1)
  const [userSearch, setUserSearch] = useState("")
  // Tri de la liste utilisateurs. Par défaut : les plus récents d'abord, ce qui
  // correspond à l'ordre déjà renvoyé par l'API.
  const [userSort, setUserSort] = useState<{ field: "createdAt" | "role"; dir: "asc" | "desc" }>(
    { field: "createdAt", dir: "desc" }
  )

  // Import CSV utilisateurs
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ total: number; created: number; skipped: number } | null>(null)

  // Sélection multiple + changement de rôle en lot
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())
  const [bulkRole, setBulkRole] = useState<Role>("VIEWER")
  const [bulkUpdating, setBulkUpdating] = useState(false)

  // Création salle
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [chatEnabled, setChatEnabled] = useState(true)
  const [participationEnabled, setParticipationEnabled] = useState(true)
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

  const fetchSettings = useCallback(async () => {
    const res = await fetch("/api/admin/settings")
    if (res.ok) {
      const d = await res.json()
      setBlockStudents(Boolean(d.blockStudents))
    }
    setSettingsLoaded(true)
  }, [])

  useEffect(() => {
    if (nav === "users")      fetchUsers()
    if (nav === "rooms")      fetchRooms()
    if (nav === "recordings") fetchRecordings()
    if (nav === "settings")   fetchSettings()
  }, [nav, fetchUsers, fetchRooms, fetchRecordings, fetchSettings])

  // Sauvegarde immédiate à chaque bascule, avec retour arrière optimiste si
  // l'API échoue (le réglage a un effet réel sur les connexions étudiantes).
  const toggleBlockStudents = async (value: boolean) => {
    setBlockStudents(value)
    setSavingSetting(true)
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockStudents: value }),
      })
      if (!res.ok) { setBlockStudents(!value); alert("Échec de l'enregistrement du réglage") }
      else { const d = await res.json(); setBlockStudents(Boolean(d.blockStudents)) }
    } catch {
      setBlockStudents(!value); alert("Échec de l'enregistrement du réglage")
    } finally {
      setSavingSetting(false)
    }
  }

  const importCsv = async (file: File) => {
    setImporting(true)
    setImportResult(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/admin/users/import-csv", { method: "POST", body: fd })
      if (!res.ok) {
        alert("Échec de l'import : " + (await res.text().catch(() => "")))
        return
      }
      const d = await res.json()
      setImportResult(d.summary)
      setUserPage(1)
      await fetchUsers()
    } finally {
      setImporting(false)
    }
  }

  const toggleUser = (id: string) =>
    setSelectedUsers((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const applyBulkRole = async () => {
    const ids = [...selectedUsers]
    if (ids.length === 0) return
    setBulkUpdating(true)
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: ids, role: bulkRole }),
      })
      if (!res.ok) {
        alert("Échec du changement de rôle : " + (await res.text().catch(() => "")))
        return
      }
      const idSet = new Set(ids)
      setUsers((prev) => prev.map((u) => idSet.has(u.id) ? { ...u, role: bulkRole } : u))
      setSelectedUsers(new Set())
    } finally {
      setBulkUpdating(false)
    }
  }

  const changeRole = async (userId: string, role: string) => {
    setUpdatingRole(userId)
    try {
      const res = await fetch(`/api/admin/users`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      })
      if (!res.ok) {
        alert("Échec du changement de rôle : " + (await res.text()))
        return
      }
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: role as Role } : u))
    } finally {
      setUpdatingRole(null)
    }
  }

  const [deletingUser, setDeletingUser] = useState<string | null>(null)

  const deleteUser = async (u: UserRecord) => {
    if (!confirm(`Supprimer « ${u.name} » (${u.email}) ?\n\nSes inscriptions seront retirées ; ses présences passées sont conservées (anonymisées). Action irréversible.`)) return
    setDeletingUser(u.id)
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: u.id }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        alert(d.error || "Échec de la suppression")
        return
      }
      setUsers((prev) => prev.filter((x) => x.id !== u.id))
      setSelectedUsers((prev) => { const n = new Set(prev); n.delete(u.id); return n })
    } finally {
      setDeletingUser(null)
    }
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
    setParticipationEnabled(true)
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
        user_id: user.id,
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

  // Rang de privilège : trier les rôles par niveau (et non par ordre
  // alphabétique, qui n'aurait aucun sens métier). Croissant = du moins au plus
  // privilégié.
  const ROLE_RANK: Record<Role, number> = { VIEWER: 1, MODERATOR: 2, ADMIN: 3 }

  const searchedUsers = userSearch.trim().length > 0
    ? users.filter((u) =>
        u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.email.toLowerCase().includes(userSearch.toLowerCase())
      )
    : users

  // Copie avant tri : `sort` mute le tableau, et muter l'état `users` en place
  // empêcherait React de détecter le changement.
  const filteredUsers = [...searchedUsers].sort((a, b) => {
    const cmp = userSort.field === "role"
      ? ROLE_RANK[a.role] - ROLE_RANK[b.role]
      : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    return userSort.dir === "asc" ? cmp : -cmp
  })

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
        groups={NAV_GROUPS}
      />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div className="dash-content" style={{ flex: 1, padding: "24px 28px" }}>

          {/* ── SALLES ── */}
          {nav === "rooms" && (
            <div className="dash-cols" style={{ display: "flex", gap: 20 }}>
              <div className="dash-col-list" style={{ flex: selectedRoom ? "0 0 380px" : 1, minWidth: 0 }}>

                {/* Header + bouton créer */}
                <div className="dash-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
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
                    <div style={{ display: "flex", gap: 20, marginTop: 12, flexWrap: "wrap" }}>
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
                      className="dash-row"
                      key={room.id}
                      onClick={() => { setSelectedRoom(room); setRoomSubTab("enroll") }}
                      style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderBottom: "1px solid #f0f7ff", cursor: "pointer", background: selectedRoom?.id === room.id ? "#f0f7ff" : "white", transition: "background 0.1s" }}
                    >
                      <RoomIcon />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{room.title}</div>
                        <div style={{ fontSize: 12, color: "#9ca3af", display: "flex", gap: 12, marginTop: 3, flexWrap: "wrap" }}>
                          <span style={metaSpan}><User size={13} /> {room.creator?.name}</span>
                          <span style={metaSpan}><Users size={13} /> {room.enrollments ?? 0} enrôlés</span>
                          <span style={metaSpan}><Clapperboard size={13} /> {room.recordings.length} enreg.</span>
                        </div>
                      </div>
                      <div className="dash-actions" style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); startMeeting(room) }}
                          style={{ ...iconBtn, padding: "5px 12px", background: "#0065b1", color: "white", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
                        >
                          <Play size={15} /> Démarrer
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); copyLink(room.roomName) }}
                          style={{ ...iconBtn, padding: "5px 12px", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
                        >
                          <Link size={15} /> Lien
                        </button>
                        <button
                          aria-label="Supprimer"
                          title="Supprimer"
                          onClick={(e) => { e.stopPropagation(); deleteRoom(room.id) }}
                          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "6px", background: "white", color: "#dc2626", border: "1px solid #dc2626", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}
                        >
                          <Trash2 size={15} />
                        </button>
                        <SessionBadge status={room.status} />
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
                    <button aria-label="Fermer" onClick={() => setSelectedRoom(null)} style={{ display: "inline-flex", alignItems: "center", background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}><X size={18} /></button>
                  </div>
                  <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
                    {(["enroll", "attendance", "settings"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setRoomSubTab(t)}
                        style={{ padding: "6px 14px", border: "1px solid", borderColor: roomSubTab === t ? "#0065b1" : "#e2e8f0", background: roomSubTab === t ? "#0065b1" : "white", color: roomSubTab === t ? "white" : "#374151", borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
                      >
                        {t === "enroll" ? "Participants" : t === "attendance" ? "Présence" : "Paramètres"}
                      </button>
                    ))}
                  </div>
                  {roomSubTab === "attendance" ? (
                    <AttendancePanel sessionId={selectedRoom.id} roomTitle={selectedRoom.title} />
                  ) : (
                    <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                      {roomSubTab === "enroll" && <EnrollPanel sessionId={selectedRoom.id} />}
                      {roomSubTab === "settings" && (
                        <RoomSettings
                          room={selectedRoom}
                          onUpdate={(r) => { setSelectedRoom(r); setRooms((prev) => prev.map((x) => x.id === r.id ? r : x)) }}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── UTILISATEURS ── */}
          {nav === "users" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1a1a2e" }}>Utilisateurs</h2>
                  <span style={{ background: "#e8f4ff", color: "#0065b1", fontSize: 13, fontWeight: 700, padding: "2px 8px", borderRadius: 10 }}>{filteredUsers.length}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <a
                    href="/api/admin/enroll-csv-template"
                    style={{ ...iconBtn, padding: "7px 14px", background: "#f3f4f6", color: "#374151", border: "1px solid #e2e8f0", borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", textDecoration: "none" }}
                  >
                    <Download size={15} /> Modèle CSV
                  </a>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importing}
                    style={{ ...iconBtn, padding: "7px 14px", background: "#0065b1", color: "white", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: importing ? "default" : "pointer", fontFamily: "inherit", opacity: importing ? 0.6 : 1 }}
                  >
                    {importing ? "Import…" : <><Upload size={15} /> Importer CSV</>}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    style={{ display: "none" }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = "" }}
                  />
                  <input
                    className="dash-search"
                    value={userSearch}
                    onChange={(e) => { setUserSearch(e.target.value); setUserPage(1) }}
                    placeholder="Rechercher…"
                    style={{ padding: "7px 12px", border: "1px solid #e2e8f0", borderRadius: 7, fontSize: 14, fontFamily: "inherit", outline: "none", width: 200 }}
                  />
                </div>
              </div>

              {/* Tri : un clic sur le critère actif inverse le sens. */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 500 }}>Trier par :</span>
                {([
                  ["createdAt", "Date de création"],
                  ["role", "Rôle"],
                ] as const).map(([field, label]) => {
                  const active = userSort.field === field
                  return (
                    <button
                      key={field}
                      onClick={() => {
                        setUserSort((prev) => prev.field === field
                          ? { field, dir: prev.dir === "asc" ? "desc" : "asc" }
                          // Nouveau critère : on repart en décroissant (plus récent /
                          // plus privilégié d'abord), l'attente la plus courante.
                          : { field, dir: "desc" })
                        setUserPage(1)
                      }}
                      title={active
                        ? `Trié par ${label.toLowerCase()} — ${userSort.dir === "asc" ? "croissant" : "décroissant"} (cliquer pour inverser)`
                        : `Trier par ${label.toLowerCase()}`}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "5px 12px", borderRadius: 7, fontSize: 13, fontWeight: 500,
                        cursor: "pointer", fontFamily: "inherit",
                        border: active ? "1px solid #0065b1" : "1px solid #e2e8f0",
                        background: active ? "#e8f4ff" : "white",
                        color: active ? "#0065b1" : "#374151",
                      }}
                    >
                      {label}
                      {active && <span aria-hidden style={{ fontSize: 11 }}>{userSort.dir === "asc" ? "▲" : "▼"}</span>}
                    </button>
                  )
                })}
              </div>

              {importResult && (
                <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Check size={16} /> <span>Import terminé — <strong>{importResult.created}</strong> créé(s), {importResult.skipped} déjà existant(s) sur {importResult.total} ligne(s) valide(s).</span></span>
                  <button aria-label="Fermer" onClick={() => setImportResult(null)} style={{ display: "inline-flex", alignItems: "center", background: "none", border: "none", cursor: "pointer", color: "#065f46" }}><X size={15} /></button>
                </div>
              )}
              <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                {loading ? <Spinner /> : filteredUsers.length === 0 ? <Empty text="Aucun utilisateur" /> : (
                  <>
                    {/* Barre de sélection / action groupée */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: "1px solid #f0f7ff", background: "#f8fbff", flexWrap: "wrap" }}>
                      <input
                        type="checkbox"
                        checked={filteredUsers.length > 0 && filteredUsers.every((u) => selectedUsers.has(u.id))}
                        onChange={(e) => setSelectedUsers(e.target.checked ? new Set(filteredUsers.map((u) => u.id)) : new Set())}
                        style={{ width: 16, height: 16, cursor: "pointer", flexShrink: 0 }}
                      />
                      {selectedUsers.size === 0 ? (
                        <span style={{ fontSize: 13, color: "#6b7280" }}>Tout sélectionner</span>
                      ) : (
                        <>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#0065b1" }}>{selectedUsers.size} sélectionné(s)</span>
                          <span style={{ fontSize: 13, color: "#6b7280" }}>— attribuer le rôle :</span>
                          <select
                            value={bulkRole}
                            onChange={(e) => setBulkRole(e.target.value as Role)}
                            style={{ padding: "5px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}
                          >
                            <option value="VIEWER">Spectateur</option>
                            <option value="MODERATOR">Modérateur</option>
                            <option value="ADMIN">Administrateur</option>
                          </select>
                          <button
                            onClick={applyBulkRole}
                            disabled={bulkUpdating}
                            style={{ padding: "5px 14px", background: "#0065b1", color: "white", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: bulkUpdating ? "default" : "pointer", fontFamily: "inherit", opacity: bulkUpdating ? 0.6 : 1 }}
                          >
                            {bulkUpdating ? "Application…" : "Appliquer"}
                          </button>
                          <button
                            onClick={() => setSelectedUsers(new Set())}
                            style={{ padding: "5px 10px", background: "none", color: "#6b7280", border: "none", borderRadius: 6, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
                          >
                            Annuler
                          </button>
                        </>
                      )}
                    </div>
                    {pagedUsers.map((u) => (
                      <div
                        className="dash-row"
                        key={u.id}
                        style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderBottom: "1px solid #f0f7ff", background: selectedUsers.has(u.id) ? "#f0f7ff" : "white" }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedUsers.has(u.id)}
                          onChange={() => toggleUser(u.id)}
                          style={{ width: 16, height: 16, cursor: "pointer", flexShrink: 0 }}
                        />
                        <Avatar name={u.name} size={44} color={u.role === "ADMIN" ? "#b91c1c" : u.role === "MODERATOR" ? "#0065b1" : "#6b7280"} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</div>
                          <div style={{ fontSize: 12, color: "#9ca3af", display: "flex", gap: 12, marginTop: 3, flexWrap: "wrap" }}>
                            <span style={metaSpan}><Mail size={13} /> {u.email}</span>
                            <span style={metaSpan}><Clapperboard size={13} /> {u.sessionCount} sessions</span>
                            <span style={metaSpan}><Calendar size={13} /> {new Date(u.createdAt).toLocaleDateString("fr-FR")}</span>
                          </div>
                        </div>
                        <div className="dash-actions" style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                          <RoleBadge role={u.role} />
                          <select
                            value={u.role}
                            disabled={updatingRole === u.id}
                            onChange={(e) => changeRole(u.id, e.target.value)}
                            style={{ padding: "6px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}
                          >
                            <option value="VIEWER">Spectateur</option>
                            <option value="MODERATOR">Modérateur</option>
                            <option value="ADMIN">Administrateur</option>
                          </select>
                          {(() => {
                            const isSelf = u.id === user.id
                            const isCreator = u.sessionCount > 0
                            const disabled = deletingUser === u.id || isSelf || isCreator
                            const title = isSelf
                              ? "Vous ne pouvez pas supprimer votre propre compte"
                              : isCreator
                                ? `Cet utilisateur a créé ${u.sessionCount} salle(s) — suppression impossible`
                                : "Supprimer l'utilisateur"
                            return (
                              <button
                                onClick={() => deleteUser(u)}
                                disabled={disabled}
                                aria-label={title}
                                title={title}
                                style={{
                                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                                  padding: 7, background: "white", color: "#dc2626",
                                  border: "1px solid #fecaca", borderRadius: 6,
                                  cursor: disabled ? "not-allowed" : "pointer",
                                  opacity: disabled ? 0.4 : 1, flexShrink: 0, fontFamily: "inherit",
                                }}
                              >
                                <Trash2 size={15} />
                              </button>
                            )
                          })()}
                        </div>
                      </div>
                    ))}
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

          {/* ── PARAMÈTRES ── */}
          {nav === "settings" && (
            <div style={{ maxWidth: 720 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1a1a2e" }}>Paramètres</h2>
              </div>

              <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 20px 16px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: .3, margin: "14px 0 4px" }}>
                  Accès
                </div>

                {!settingsLoaded ? <Spinner /> : (
                  <ToggleRow
                    label={savingSetting ? "Interdire l'accès aux étudiants (enregistrement…)" : "Interdire l'accès aux étudiants"}
                    desc="Quand activé, un étudiant (affiliation « Etudiant ») ne peut plus se connecter directement à la plateforme : il est redirigé vers une page l'invitant à passer par l'ENT ou Moodle. L'accès via un lien Moodle reste possible. Les comptes sans ce champ ne sont pas concernés."
                    checked={blockStudents}
                    onChange={toggleBlockStudents}
                  />
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
