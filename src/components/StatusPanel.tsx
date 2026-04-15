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

const STATUS_CONFIG: Record<string, { icon: string; color: string }> = {
  ok: { icon: "✓", color: "#22c55e" },
  error: { icon: "✗", color: "#ef4444" },
  warning: { icon: "⚠", color: "#f59e0b" },
}

const SERVICE_ICONS: Record<string, string> = {
  "PostgreSQL": "🗄",
  "LiveKit SFU": "📡",
  "Egress (Enregistrement)": "⏺",
  "Ingress (OBS/RTMP)": "📹",
  "MinIO (S3)": "💾",
  "Webhook LiveKit": "🔔",
  "Keycloak SSO": "🔐",
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
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
            }}>🏥</div>
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
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
          }}>🏥</div>
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
        const icon = SERVICE_ICONS[service.name] ?? "⚙"
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
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 17, flexShrink: 0,
              }}>
                {icon}
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
                <span style={{
                  fontSize: 13, fontWeight: 700, color: conf.color,
                }}>
                  {conf.icon}
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
