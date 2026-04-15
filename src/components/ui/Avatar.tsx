"use client"

import { initials } from "@/types"

interface AvatarProps {
  name: string
  size?: number
  color?: string
}

export default function Avatar({
  name,
  size = 28,
  color = "#0065b1",
}: AvatarProps) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.floor(size * 0.45),
        fontWeight: 600,
        color: "white",
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {initials(name || "?")}
    </div>
  )
}
