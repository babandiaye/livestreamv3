"use client"

import Image from "next/image"
import { signOut } from "next-auth/react"
import type { Role } from "@/types"

export type NavItem = {
  key: string
  label: string
  icon: React.ReactNode
  badge?: { text: string; color: string; bg: string }
}

export type NavGroup = {
  title: string
  items: NavItem[]
}

interface SidebarProps {
  user: { name?: string | null; email?: string | null; role: Role }
  nav: string
  onNav: (key: string) => void
  groups: NavGroup[]
}

const ROLE_COLOR: Record<Role, string> = {
  ADMIN: "#b91c1c",
  MODERATOR: "#0065b1",
  VIEWER: "#6b7280",
}

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrateur",
  MODERATOR: "Modérateur",
  VIEWER: "Spectateur",
}

function initials(name: string) {
  return (name || "?").split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
}

export default function Sidebar({ user, nav, onNav, groups }: SidebarProps) {
  const userName = user.name ?? user.email ?? "Utilisateur"

  return (
    <aside style={{
      width: 240,
      background: "white",
      borderRight: "1px solid #e8f0fe",
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      position: "sticky",
      top: 0,
      flexShrink: 0,
      zIndex: 30,
    }}>
      {/* Logo */}
      <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid #f0f7ff", display: "flex", alignItems: "center", gap: 10 }}>
        <Image src="/logo-unchk.png" alt="UN-CHK" width={36} height={36} style={{ objectFit: "contain" }} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#0065b1", lineHeight: 1.2 }}>UN-CHK</div>
          <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.2 }}>Plateforme Webinaire</div>
        </div>
      </div>

      {/* Navigation avec groupes */}
      <nav style={{ flex: 1, padding: "12px 10px", overflowY: "auto" }}>
        {groups.map((group, gi) => (
          <div key={gi} style={{ marginBottom: 4 }}>
            <div style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#9ca3af",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "8px 8px 4px",
              marginTop: gi > 0 ? 6 : 0,
            }}>
              {group.title}
            </div>
            {group.items.map((item) => {
              const active = nav === item.key
              return (
                <button
                  key={item.key}
                  onClick={() => onNav(item.key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "9px 10px",
                    borderRadius: 8,
                    border: active ? "1.5px solid #0065b1" : "1.5px solid transparent",
                    background: active ? "#f0f7ff" : "transparent",
                    color: active ? "#0065b1" : "#374151",
                    fontWeight: active ? 600 : 400,
                    fontSize: 14,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "left",
                    marginBottom: 2,
                    transition: "all 0.15s",
                  }}
                >
                  <span style={{
                    width: 20,
                    height: 20,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    color: active ? "#0065b1" : "#6b7280",
                  }}>
                    {item.icon}
                  </span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.badge ? (
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: 10,
                      background: item.badge.bg,
                      color: item.badge.color,
                      flexShrink: 0,
                    }}>
                      {item.badge.text}
                    </span>
                  ) : active ? (
                    <span style={{ color: "#0065b1", fontSize: 16, flexShrink: 0, lineHeight: 1 }}>›</span>
                  ) : null}
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Profil + déconnexion */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid #f0f7ff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: ROLE_COLOR[user.role],
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 600, color: "white", flexShrink: 0,
          }}>
            {initials(userName)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {userName}
            </div>
            <div style={{ fontSize: 11, color: ROLE_COLOR[user.role], fontWeight: 500 }}>
              {ROLE_LABEL[user.role]}
            </div>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          style={{
            width: "100%", padding: "8px 12px",
            background: "#fff1f1", border: "1px solid #fecaca", borderRadius: 7,
            color: "#dc2626", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            fontWeight: 500,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18.36 6.64A9 9 0 1 1 5.64 5.64"/>
            <line x1="12" y1="2" x2="12" y2="12"/>
          </svg>
          Se déconnecter
        </button>
      </div>
    </aside>
  )
}
