"use client"

import { PAGE_SIZE } from "@/types"

interface PaginationProps {
  total: number
  page: number
  onPage: (p: number) => void
  pageSize?: number
}

export default function Pagination({
  total,
  page,
  onPage,
  pageSize = PAGE_SIZE,
}: PaginationProps) {
  const pages = Math.ceil(total / pageSize)
  if (pages <= 1) return null

  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  const range: (number | "…")[] = []
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) {
      range.push(i)
    } else if (range[range.length - 1] !== "…") {
      range.push("…")
    }
  }

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "10px 16px",
      borderTop: "1px solid #f0f7ff",
      background: "#f8fbff",
    }}>
      <span style={{ fontSize: 13, color: "#6b7280" }}>
        {from}–{to} sur {total}
      </span>
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <PageBtn
          label="←"
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
        />
        {range.map((r, i) =>
          r === "…" ? (
            <span
              key={`e-${i}`}
              style={{ padding: "4px 6px", fontSize: 13, color: "#9ca3af" }}
            >
              …
            </span>
          ) : (
            <PageBtn
              key={r}
              label={String(r)}
              onClick={() => onPage(r as number)}
              active={r === page}
            />
          )
        )}
        <PageBtn
          label="→"
          onClick={() => onPage(page + 1)}
          disabled={page === pages}
        />
      </div>
    </div>
  )
}

function PageBtn({
  label,
  onClick,
  disabled = false,
  active = false,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "4px 10px",
        border: "1px solid",
        borderColor: active ? "#0065b1" : "#e2e8f0",
        borderRadius: 6,
        background: active ? "#0065b1" : "white",
        color: active ? "white" : "#374151",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        fontFamily: "inherit",
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  )
}
