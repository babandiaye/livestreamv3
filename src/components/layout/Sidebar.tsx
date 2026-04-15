"use client"

import Image from "next/image"
import { signOut } from "next-auth/react"
import type { Role } from "@/types"

export type NavItem = {
  key: string
  label: string
  icon: string
}

interface SidebarProps {
  user: { name?: string | null; email?: string | null; role: Role }
  nav: string
  onNav: (key: string) => void
  items: NavItem[]
  open: boolean
  onToggle: () => void
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

export default function Sidebar({
  user,
  nav,
  onNav,
  items,
  open,
  onToggle,
}: SidebarProps) {
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
      <div style={{
        padding: "20px 16px 16px",
        borderBottom: "1px solid #f0f7ff",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}>
        <Image
          src="/logo-unchk.png"
          alt="UN-CHK"
          width={36}
          height={36}
          style={{ objectFit: "contain" }}
        />
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#0065b1", lineHeight: 1.2 }}>
            UN-CHK
          </div>
          <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.2 }}>
            Plateforme Webinaire
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: "12px 8px", overflowY: "auto" }}>
        {items.map((item) => (
          <button
            key={item.key}
            onClick={() => { onNav(item.key); onToggle() }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: "none",
              background: nav === item.key ? "#e8f4ff" : "transparent",
              color: nav === item.key ? "#0065b1" : "#374151",
              fontWeight: nav === item.key ? 600 : 400,
              fontSize: 14,
              cursor: "pointer",
              fontFamily: "inherit",
              textAlign: "left",
              marginBottom: 2,
              transition: "background 0.15s",
            }}
          >
            <span style={{ fontSize: 16, width: 20, textAlign: "center" }}>
              {item.icon}
            </span>
            {item.label}
            {nav === item.key && (
              <div style={{
                marginLeft: "auto",
                width: 3,
                height: 16,
                borderRadius: 2,
                background: "#0065b1",
              }} />
            )}
          </button>
        ))}
      </nav>

      {/* Profil + logout */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid #f0f7ff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: ROLE_COLOR[user.role],
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 600,
            color: "white",
            flexShrink: 0,
          }}>
            {initials(userName)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#1a1a2e",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
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
            width: "100%",
            padding: "8px 12px",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 7,
            color: "#6b7280",
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <span>⎋</span> Se déconnecter
        </button>
      </div>
    </aside>
  )
}
