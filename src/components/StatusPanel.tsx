"use client"

import { useState, useCallback } from "react"

type ServiceStatus = {
  name: string
  status: "ok" | "error" | "warning"
  latency: number | null
  message: string
  details?: string
}

type StatusResponse = {
  overall: "operational" | "degraded" | "partial"
  timestamp: string
  services: ServiceStatus[]
}

const STATUS_CONFIG: Record<string, { color: string }> = {
  ok: { color: "#22c55e" },
  error: { color: "#ef4444" },
  warning: { color: "#f59e0b" },
}

const SVG_BASE = {
  fill: "none", stroke: "currentColor", strokeWidth: 2,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
}

// Icône SVG par service (style Feather, hérite la couleur via currentColor)
function ServiceIcon({ name }: { name: string }) {
  const p = { width: 18, height: 18, viewBox: "0 0 24 24", ...SVG_BASE }
  switch (name) {
    case "PostgreSQL":
      return (<svg {...p}><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" /></svg>)
    case "LiveKit SFU":
      return (<svg {...p}><path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" /></svg>)
    case "Egress (Enregistrement)":
      return (<svg {...p}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" /></svg>)
    case "Ingress (OBS/RTMP)":
      return (<svg {...p}><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>)
    case "MinIO (S3)":
      return (<svg {...p}><line x1="22" y1="12" x2="2" y2="12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /><line x1="6" y1="16" x2="6.01" y2="16" /><line x1="10" y1="16" x2="10.01" y2="16" /></svg>)
    case "MinIO — écriture (NFS)":
      // Disque dur (hard-drive) — teste l'inscriptibilité du stockage NFS
      return (<svg {...p}><line x1="22" y1="12" x2="2" y2="12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /><line x1="6" y1="16" x2="6.01" y2="16" /><line x1="10" y1="16" x2="10.01" y2="16" /><polyline points="9 9 12 6 15 9" /></svg>)
    case "Webhook LiveKit":
      return (<svg {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>)
    case "Keycloak SSO":
      return (<svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>)
    default:
      return (<svg {...p}><rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" /></svg>)
  }
}

// Icône d'état (check-circle / x-circle / alert-triangle)
function StatusIcon({ status }: { status: "ok" | "error" | "warning" }) {
  const p = { width: 14, height: 14, viewBox: "0 0 24 24", ...SVG_BASE }
  if (status === "ok")
    return (<svg {...p}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>)
  if (status === "error")
    return (<svg {...p}><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>)
  return (<svg {...p}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>)
}

// Icône d'en-tête du panneau (monitoring / activité)
function HeaderIcon() {
  return (<svg width="17" height="17" viewBox="0 0 24 24" stroke="#0065b1" {...SVG_BASE}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>)
}

const OVERALL_LABELS: Record<string, { label: string; bg: string; color: string; border: string }> = {
  operational: { label: "Tous les services opérationnels", bg: "#f0fdf4", color: "#166534", border: "#bbf7d0" },
  partial: { label: "Certains services dégradés", bg: "#fffbeb", color: "#92400e", border: "#fde68a" },
  degraded: { label: "Services en erreur détectés", bg: "#fef2f2", color: "#991b1b", border: "#fecaca" },
}

export default function StatusPanel() {
  const [data, setData] = useState<StatusResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/status")
      if (res.ok) {
        setData(await res.json())
      }
    } catch {
      // ignore
    }
    setLoading(false)
  }, [])

  if (!data && !loading) {
    return (
      <div style={{
        background: "white", border: "1px solid #e2e8f0", borderRadius: 12,
        overflow: "hidden",
      }}>
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid #f0f7ff",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, background: "#f0f7ff",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}><HeaderIcon /></div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a2e" }}>
                Statut des services
              </div>
              <div style={{ fontSize: 12, color: "#9ca3af" }}>
                Vérifiez la connectivité de l&apos;infrastructure
              </div>
            </div>
          </div>
          <button onClick={refresh} style={{
            padding: "8px 18px", background: "#0065b1", color: "white",
            border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 4v6h6M23 20v-6h-6" />
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
            </svg>
            Vérifier maintenant
          </button>
        </div>
        <div style={{
          padding: "40px 20px", textAlign: "center", color: "#9ca3af", fontSize: 14,
        }}>
          Cliquez sur &quot;Vérifier maintenant&quot; pour tester tous les services
        </div>
      </div>
    )
  }

  const overall = data ? OVERALL_LABELS[data.overall] : null

  return (
    <div style={{
      background: "white", border: "1px solid #e2e8f0", borderRadius: 12,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 20px", borderBottom: "1px solid #f0f7ff",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: "#f0f7ff",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}><HeaderIcon /></div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a2e" }}>
              Statut des services
            </div>
            <div style={{ fontSize: 12, color: "#9ca3af" }}>
              {data ? `Dernière vérification : ${new Date(data.timestamp).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" })}` : "Vérification en cours…"}
            </div>
          </div>
        </div>
        <button onClick={refresh} disabled={loading} style={{
          padding: "8px 18px", background: loading ? "#94a3b8" : "#0065b1",
          color: "white", border: "none", borderRadius: 8, fontSize: 13,
          fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
          fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6,
          opacity: loading ? 0.7 : 1,
        }}>
          {loading ? (
            <>
              <span style={{
                width: 14, height: 14, border: "2px solid rgba(255,255,255,.3)",
                borderTopColor: "white", borderRadius: "50%",
                animation: "status-spin .7s linear infinite", display: "inline-block",
              }} />
              Vérification…
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 4v6h6M23 20v-6h-6" />
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
              </svg>
              Actualiser
            </>
          )}
        </button>
      </div>

      {/* Overall banner */}
      {overall && (
        <div style={{
          padding: "12px 20px", background: overall.bg,
          borderBottom: `1px solid ${overall.border}`,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: data!.overall === "operational" ? "#22c55e" :
                        data!.overall === "degraded" ? "#ef4444" : "#f59e0b",
          }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: overall.color }}>
            {overall.label}
          </span>
          <span style={{ fontSize: 12, color: overall.color, opacity: 0.7, marginLeft: "auto" }}>
            {data!.services.filter(s => s.status === "ok").length}/{data!.services.length} OK
          </span>
        </div>
      )}

      {/* Services list */}
      {data?.services.map((service) => {
        const conf = STATUS_CONFIG[service.status]
        const isExpanded = expanded === service.name

        return (
          <div key={service.name} style={{ borderBottom: "1px solid #f0f7ff" }}>
            <div
              onClick={() => setExpanded(isExpanded ? null : service.name)}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "14px 20px", cursor: "pointer",
                transition: "background .15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fbff")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {/* Service icon */}
              <div style={{
                width: 36, height: 36, borderRadius: 9,
                background: service.status === "ok" ? "#f0fdf4" :
                            service.status === "error" ? "#fef2f2" : "#fffbeb",
                color: conf.color,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <ServiceIcon name={service.name} />
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e" }}>
                    {service.name}
                  </span>
                  {service.latency !== null && (
                    <span style={{
                      fontSize: 11, color: service.latency < 100 ? "#22c55e" :
                                           service.latency < 500 ? "#f59e0b" : "#ef4444",
                      background: service.latency < 100 ? "#f0fdf4" :
                                  service.latency < 500 ? "#fffbeb" : "#fef2f2",
                      padding: "1px 6px", borderRadius: 10, fontWeight: 600,
                      fontFamily: "monospace",
                    }}>
                      {service.latency}ms
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
                  {service.message}
                </div>
              </div>

              {/* Status badge */}
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "4px 12px", borderRadius: 20,
                background: service.status === "ok" ? "#f0fdf4" :
                            service.status === "error" ? "#fef2f2" : "#fffbeb",
                border: `1px solid ${service.status === "ok" ? "#bbf7d0" :
                                     service.status === "error" ? "#fecaca" : "#fde68a"}`,
                flexShrink: 0,
              }}>
                <span style={{ display: "flex", color: conf.color }}>
                  <StatusIcon status={service.status} />
                </span>
                <span style={{
                  fontSize: 12, fontWeight: 600, color: conf.color,
                  textTransform: "uppercase", letterSpacing: ".03em",
                }}>
                  {service.status === "ok" ? "OK" :
                   service.status === "error" ? "Erreur" : "Attention"}
                </span>
              </div>

              {/* Chevron */}
              {service.details && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="#9ca3af" strokeWidth="2"
                  style={{
                    transition: "transform .2s", flexShrink: 0,
                    transform: isExpanded ? "rotate(180deg)" : "rotate(0)",
                  }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              )}
            </div>

            {/* Details panel */}
            {isExpanded && service.details && (
              <div style={{
                padding: "0 20px 14px 68px", fontSize: 12,
                color: "#6b7280", fontFamily: "monospace",
                background: "#f8fbff", borderTop: "1px solid #f0f7ff",
                paddingTop: 10,
                wordBreak: "break-all",
              }}>
                {service.details}
              </div>
            )}
          </div>
        )
      })}

      {loading && !data && (
        <div style={{
          padding: "40px 20px", display: "flex", flexDirection: "column",
          alignItems: "center", gap: 12, color: "#6b7280",
        }}>
          <span style={{
            width: 24, height: 24, border: "3px solid #e2e8f0",
            borderTopColor: "#0065b1", borderRadius: "50%",
            animation: "status-spin .7s linear infinite", display: "inline-block",
          }} />
          <span style={{ fontSize: 14 }}>Vérification de tous les services…</span>
        </div>
      )}

      <style>{`
        @keyframes status-spin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}
