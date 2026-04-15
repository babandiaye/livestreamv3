"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Avatar from "./Avatar"
import Pagination from "./Pagination"
import type { Enrollment, SearchUser, ImportResult } from "@/types"
import { PAGE_SIZE } from "@/types"

interface EnrollPanelProps {
  sessionId: string
}

export default function EnrollPanel({ sessionId }: EnrollPanelProps) {
  const [subTab, setSubTab] = useState<"list" | "search" | "csv">("list")
  const [enrolled, setEnrolled] = useState<Enrollment[]>([])
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchUser[]>([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [page, setPage] = useState(1)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvDrag, setCsvDrag] = useState(false)
  const [csvLoading, setCsvLoading] = useState(false)
  const [csvResult, setCsvResult] = useState<ImportResult | null>(null)
  const [csvError, setCsvError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchEnrolled = useCallback(async () => {
    setLoadingList(true)
    const d = await (await fetch(`/api/admin/rooms/${sessionId}/enroll`)).json()
    setEnrolled(d.enrollments ?? [])
    setPage(1)
    setLoadingList(false)
  }, [sessionId])

  useEffect(() => { fetchEnrolled() }, [fetchEnrolled])

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      const d = await (await fetch(`/api/admin/users/search?q=${encodeURIComponent(query)}`)).json()
      const ids = new Set(enrolled.map((e) => e.userId))
      setResults((d.users ?? []).filter((u: SearchUser) => !ids.has(u.id)))
      setSearching(false)
    }, 300)
    return () => clearTimeout(t)
  }, [query, enrolled])

  const addUser = async (userId: string) => {
    setAdding(userId)
    await fetch(`/api/admin/rooms/${sessionId}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    })
    await fetchEnrolled()
    setResults((r) => r.filter((u) => u.id !== userId))
    setAdding(null)
  }

  const removeUser = async (userId: string) => {
    setRemoving(userId)
    await fetch(`/api/admin/rooms/${sessionId}/enroll`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    })
    await fetchEnrolled()
    setRemoving(null)
  }

  const importCSV = async () => {
    if (!csvFile) return
    setCsvLoading(true)
    setCsvResult(null)
    setCsvError(null)
    const form = new FormData()
    form.append("file", csvFile)
    try {
      const res = await fetch(`/api/admin/rooms/${sessionId}/enroll-csv`, {
        method: "POST",
        body: form,
      })
      const data = await res.json()
      if (!res.ok) { setCsvError(data.error ?? "Erreur"); return }
      setCsvResult(data)
      setCsvFile(null)
      await fetchEnrolled()
    } catch {
      setCsvError("Erreur réseau")
    } finally {
      setCsvLoading(false)
    }
  }

  const pagedEnrolled = enrolled.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const tabLabels = {
    list: `Liste (${enrolled.length})`,
    search: "Ajouter",
    csv: "Import CSV",
  }

  return (
    <div>
      {/* Sous-tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", background: "#f8fbff" }}>
        {(["list", "search", "csv"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            style={{
              padding: "9px 16px",
              border: "none",
              background: "none",
              borderBottom: subTab === t ? "2px solid #0065b1" : "2px solid transparent",
              color: subTab === t ? "#0065b1" : "#6b7280",
              fontWeight: subTab === t ? 600 : 400,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {tabLabels[t]}
          </button>
        ))}
      </div>

      {/* ── Liste ── */}
      {subTab === "list" && (
        <div>
          {loadingList ? (
            <div style={{ padding: "20px 16px", color: "#9ca3af", fontSize: 14, display: "flex", gap: 8, alignItems: "center" }}>
              <Spin /> Chargement…
            </div>
          ) : pagedEnrolled.length === 0 ? (
            <div style={{ padding: "24px 16px", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
              Aucun participant enrôlé
            </div>
          ) : pagedEnrolled.map((u) => (
            <div key={u.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 16px", borderBottom: "1px solid #f0f7ff" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Avatar name={u.name} size={28} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "#1a1a2e" }}>{u.name}</div>
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>{u.email}</div>
                </div>
              </div>
              <button
                disabled={removing === u.userId}
                onClick={() => removeUser(u.userId)}
                style={{ padding: "3px 10px", background: "white", color: "#dc2626", border: "1px solid #dc2626", borderRadius: 6, fontSize: 13, cursor: "pointer", fontFamily: "inherit", opacity: removing === u.userId ? 0.5 : 1 }}
              >
                {removing === u.userId ? "…" : "Retirer"}
              </button>
            </div>
          ))}
          <Pagination total={enrolled.length} page={page} onPage={setPage} />
        </div>
      )}

      {/* ── Recherche ── */}
      {subTab === "search" && (
        <div style={{ padding: 16 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher par nom ou email…"
            style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 7, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
          />
          {searching && <div style={{ marginTop: 8, color: "#9ca3af", fontSize: 13 }}>Recherche…</div>}
          {results.map((u) => (
            <div key={u.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid #f0f7ff" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Avatar name={u.name} size={28} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{u.name}</div>
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>{u.email}</div>
                </div>
              </div>
              <button
                disabled={adding === u.id}
                onClick={() => addUser(u.id)}
                style={{ padding: "3px 12px", background: "#0065b1", color: "white", border: "none", borderRadius: 6, fontSize: 13, cursor: "pointer", fontFamily: "inherit", opacity: adding === u.id ? 0.5 : 1 }}
              >
                {adding === u.id ? "…" : "Ajouter"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── CSV ── */}
      {subTab === "csv" && (
        <div style={{ padding: 16 }}>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 12px" }}>
            Format : <code>email,prenom,nom</code> — séparateur virgule ou point-virgule
          </p>
          <div
            onDragOver={(e) => { e.preventDefault(); setCsvDrag(true) }}
            onDragLeave={() => setCsvDrag(false)}
            onDrop={(e) => { e.preventDefault(); setCsvDrag(false); const f = e.dataTransfer.files[0]; if (f) setCsvFile(f) }}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${csvDrag ? "#0065b1" : "#e2e8f0"}`,
              borderRadius: 10,
              padding: "24px 16px",
              textAlign: "center",
              cursor: "pointer",
              background: csvDrag ? "#f0f7ff" : "#f8fafc",
              marginBottom: 12,
              transition: "all 0.15s",
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
            <div style={{ fontSize: 14, color: "#6b7280" }}>
              {csvFile ? csvFile.name : "Glisser un fichier CSV ou cliquer pour parcourir"}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              style={{ display: "none" }}
              onChange={(e) => { if (e.target.files?.[0]) setCsvFile(e.target.files[0]) }}
            />
          </div>
          {csvFile && (
            <button
              onClick={importCSV}
              disabled={csvLoading}
              style={{ padding: "8px 20px", background: "#0065b1", color: "white", border: "none", borderRadius: 7, fontSize: 14, cursor: "pointer", fontFamily: "inherit", opacity: csvLoading ? 0.6 : 1 }}
            >
              {csvLoading ? "Import en cours…" : "Importer"}
            </button>
          )}
          {csvResult && (
            <div style={{ marginTop: 12, padding: 12, background: "#dcfce7", borderRadius: 8, fontSize: 14, color: "#15803d" }}>
              ✓ Import terminé — {csvResult.summary.enrolled} enrôlés, {csvResult.summary.created} créés, {csvResult.summary.skipped} ignorés
            </div>
          )}
          {csvError && (
            <div style={{ marginTop: 12, padding: 12, background: "#fee2e2", borderRadius: 8, fontSize: 14, color: "#dc2626" }}>
              Erreur : {csvError}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Spin() {
  return (
    <span style={{
      display: "inline-block",
      width: 13,
      height: 13,
      border: "2px solid #e2e8f0",
      borderTopColor: "#0065b1",
      borderRadius: "50%",
      animation: "spin .7s linear infinite",
    }} />
  )
}
