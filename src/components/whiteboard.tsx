"use client"

import React, { useEffect, useRef, useState, useCallback } from "react"
import { useRoomContext, useLocalParticipant } from "@livekit/components-react"

const WB_TOPIC = "wb"
const MIN_DISTANCE = 0.003

type ShapeType = "rect" | "circle" | "line" | "arrow"

type WBEvent = {
  v: 1
  type: "draw" | "clear" | "text" | "shape"
  tool?: "pen" | "eraser"
  shape?: ShapeType
  color?: string
  size?: number
  filled?: boolean
  x0?: number; y0?: number; x1?: number; y1?: number
  text?: string; fontSize?: number; tx?: number; ty?: number
}

type WBInit = { v: 1; type: "init"; events: WBEvent[] }
type WBMsg = WBEvent | WBInit

const COLORS = ["#1a1a2e","#0065b1","#e53e3e","#2fb344","#d97706","#a855f7","#ffffff","#000000"]
const SIZES  = [2, 5, 10, 20]

function drawArrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  const headLen = Math.max(12, Math.sqrt((x1-x0)**2 + (y1-y0)**2) * 0.15)
  const angle = Math.atan2(y1 - y0, x1 - x0)
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x1 - headLen * Math.cos(angle - Math.PI / 6), y1 - headLen * Math.sin(angle - Math.PI / 6))
  ctx.lineTo(x1 - headLen * Math.cos(angle + Math.PI / 6), y1 - headLen * Math.sin(angle + Math.PI / 6))
  ctx.closePath()
  ctx.fillStyle = ctx.strokeStyle as string
  ctx.fill()
}

function replayEvent(ctx: CanvasRenderingContext2D, ev: WBEvent) {
  if (ev.type === "clear") {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    return
  }

  if (ev.type === "text" && ev.text && ev.tx !== undefined && ev.ty !== undefined) {
    ctx.save()
    ctx.font = `${ev.fontSize ?? 20}px 'Google Sans',sans-serif`
    ctx.fillStyle = ev.color ?? "#1a1a2e"
    ctx.fillText(ev.text, ev.tx * ctx.canvas.width, ev.ty * ctx.canvas.height)
    ctx.restore()
    return
  }

  if (ev.type === "draw" && ev.x0 !== undefined) {
    ctx.save()
    if (ev.tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out"
      ctx.strokeStyle = "rgba(0,0,0,1)"
    } else {
      ctx.globalCompositeOperation = "source-over"
      ctx.strokeStyle = ev.color ?? "#1a1a2e"
    }
    ctx.lineWidth = ev.size ?? 3
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.beginPath()
    ctx.moveTo(ev.x0 * ctx.canvas.width, ev.y0! * ctx.canvas.height)
    ctx.lineTo(ev.x1! * ctx.canvas.width, ev.y1! * ctx.canvas.height)
    ctx.stroke()
    ctx.restore()
    return
  }

  if (ev.type === "shape" && ev.x0 !== undefined && ev.x1 !== undefined) {
    ctx.save()
    ctx.globalCompositeOperation = "source-over"
    ctx.strokeStyle = ev.color ?? "#1a1a2e"
    ctx.fillStyle = ev.color ?? "#1a1a2e"
    ctx.lineWidth = ev.size ?? 3
    ctx.lineCap = "round"
    ctx.lineJoin = "round"

    const x  = ev.x0 * ctx.canvas.width
    const y  = ev.y0! * ctx.canvas.height
    const x2 = ev.x1 * ctx.canvas.width
    const y2 = ev.y1! * ctx.canvas.height
    const w  = x2 - x
    const h  = y2 - y

    if (ev.shape === "rect") {
      if (ev.filled) ctx.fillRect(x, y, w, h)
      else ctx.strokeRect(x, y, w, h)
    }

    if (ev.shape === "circle") {
      ctx.beginPath()
      ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2)
      if (ev.filled) ctx.fill()
      else ctx.stroke()
    }

    if (ev.shape === "line") {
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }

    if (ev.shape === "arrow") {
      drawArrow(ctx, x, y, x2, y2)
    }

    ctx.restore()
  }
}

export default function Whiteboard({ readOnly = false }: { readOnly?: boolean }) {
  const canvasRef       = useRef<HTMLCanvasElement>(null)
  const containerRef    = useRef<HTMLDivElement>(null)
  const isDrawing       = useRef(false)
  const hasMoved        = useRef(false)
  const lastPos         = useRef({ x: 0, y: 0 })
  const startPos        = useRef({ x: 0, y: 0 })
  const snapshotRef     = useRef<ImageData | null>(null)
  const eventStore      = useRef<WBEvent[]>([])
  const batchRef        = useRef<WBEvent[]>([])
  const batchTimer      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasReceivedInit = useRef(false)
  const undoStack       = useRef<ImageData[]>([])

  const [tool,        setTool]        = useState<"pen" | "eraser">("pen")
  const [activeShape, setActiveShape] = useState<ShapeType | null>(null)
  const [filled,      setFilled]      = useState(false)
  const [color,       setColor]       = useState("#1a1a2e")
  const [size,        setSize]        = useState(3)
  const [textMode,    setTextMode]    = useState(false)
  const [textPos,     setTextPos]     = useState<{ x: number; y: number } | null>(null)
  const [textVal,     setTextVal]     = useState("")
  const textInputRef = useRef<HTMLInputElement>(null)

  const room = useRoomContext()
  const { localParticipant } = useLocalParticipant()

  // ── Resize canvas ─────────────────────────────────────────────────────────
  useEffect(() => {
    const resize = () => {
      const container = containerRef.current
      const canvas    = canvasRef.current
      if (!container || !canvas) return
      const { width, height } = container.getBoundingClientRect()
      const w = Math.round(width)
      const h = Math.round(height)
      if (canvas.width === w && canvas.height === h) return
      const tmp = document.createElement("canvas")
      tmp.width  = canvas.width
      tmp.height = canvas.height
      tmp.getContext("2d")!.drawImage(canvas, 0, 0)
      canvas.width  = w
      canvas.height = h
      canvas.getContext("2d")!.drawImage(tmp, 0, 0, w, h)
    }
    resize()
    const ro = new ResizeObserver(resize)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // ── Envoyer snapshot complet ──────────────────────────────────────────────
  const sendInit = useCallback(() => {
    if (readOnly) return
    if (eventStore.current.length === 0) return
    const init: WBInit = { v: 1, type: "init", events: eventStore.current }
    localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify(init)),
      { reliable: true, topic: WB_TOPIC }
    )
  }, [readOnly, localParticipant])

  const requestInit = useCallback(() => {
    try {
      localParticipant.publishData(
        new TextEncoder().encode("__wb_request_init__"),
        { reliable: true, topic: WB_TOPIC }
      )
    } catch {}
  }, [localParticipant])

  // ── Spectateur : demander snapshot ───────────────────────────────────────
  useEffect(() => {
    if (!readOnly) return
    const t1 = setTimeout(() => { if (!hasReceivedInit.current) requestInit() }, 1000)
    const t2 = setTimeout(() => { if (!hasReceivedInit.current) requestInit() }, 3000)
    const t3 = setTimeout(() => { if (!hasReceivedInit.current) requestInit() }, 6000)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [readOnly, requestInit])

  // ── Recevoir données LiveKit ──────────────────────────────────────────────
  useEffect(() => {
    const handleData = (payload: Uint8Array, participant: any, _kind: any, topic?: string) => {
      if (topic !== WB_TOPIC && topic !== undefined) return
      if (participant?.identity === localParticipant.identity) return
      try {
        const raw = new TextDecoder().decode(payload)
        if (raw === "__wb_request_init__") { setTimeout(() => sendInit(), 200); return }
        const msg: WBMsg = JSON.parse(raw)
        if (!msg || msg.v !== 1) return
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext("2d")!
        if (msg.type === "init") {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          eventStore.current = [...msg.events]
          for (const ev of msg.events) replayEvent(ctx, ev)
          hasReceivedInit.current = true
          return
        }
        if (msg.type === "clear") {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          eventStore.current = []
          return
        }
        replayEvent(ctx, msg as WBEvent)
        eventStore.current.push(msg as WBEvent)
      } catch {}
    }

    const handleParticipantConnected = () => { setTimeout(() => sendInit(), 500) }
    room.on("dataReceived", handleData)
    room.on("participantConnected", handleParticipantConnected)
    return () => {
      room.off("dataReceived", handleData)
      room.off("participantConnected", handleParticipantConnected)
    }
  }, [room, readOnly, localParticipant, sendInit])

  // ── Broadcast ─────────────────────────────────────────────────────────────
  const broadcast = useCallback((ev: WBEvent) => {
    eventStore.current.push(ev)
    batchRef.current.push(ev)
    if (!batchTimer.current) {
      batchTimer.current = setTimeout(() => {
        const batch = batchRef.current
        batchRef.current  = []
        batchTimer.current = null
        for (const e of batch) {
          localParticipant.publishData(
            new TextEncoder().encode(JSON.stringify(e)),
            { reliable: true, topic: WB_TOPIC }
          )
        }
      }, 16)
    }
  }, [localParticipant])

  // ── Undo ──────────────────────────────────────────────────────────────────
  const saveUndoState = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx  = canvas.getContext("2d")!
    const snap = ctx.getImageData(0, 0, canvas.width, canvas.height)
    undoStack.current.push(snap)
    if (undoStack.current.length > 30) undoStack.current.shift()
  }, [])

  const undo = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || undoStack.current.length === 0) return
    const ctx  = canvas.getContext("2d")!
    const prev = undoStack.current.pop()!
    ctx.putImageData(prev, 0, 0)
    eventStore.current.pop()
    sendInit()
  }, [sendInit])

  // ── getPos ────────────────────────────────────────────────────────────────
  const getPos = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!
    const rect   = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top)  / rect.height,
    }
  }

  // ── Pointer events ────────────────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    if (readOnly) return

    if (textMode) {
      const canvas = canvasRef.current!
      const rect   = canvas.getBoundingClientRect()
      setTextPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
      setTextVal("")
      setTimeout(() => textInputRef.current?.focus(), 30)
      return
    }

    saveUndoState()
    isDrawing.current = true
    hasMoved.current  = false
    const pos         = getPos(e)
    lastPos.current   = pos
    startPos.current  = pos

    if (activeShape) {
      const canvas = canvasRef.current!
      const ctx    = canvas.getContext("2d")!
      snapshotRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height)
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDrawing.current || readOnly || textMode) return
    const pos = getPos(e)

    if (activeShape) {
      const canvas = canvasRef.current!
      const ctx    = canvas.getContext("2d")!
      if (snapshotRef.current) ctx.putImageData(snapshotRef.current, 0, 0)

      const x  = startPos.current.x * canvas.width
      const y  = startPos.current.y * canvas.height
      const x2 = pos.x * canvas.width
      const y2 = pos.y * canvas.height
      const w  = x2 - x
      const h  = y2 - y

      ctx.save()
      ctx.strokeStyle = color
      ctx.fillStyle   = color
      ctx.lineWidth   = size
      ctx.lineCap     = "round"
      ctx.lineJoin    = "round"
      ctx.setLineDash([6, 3])

      if (activeShape === "rect") {
        if (filled) ctx.fillRect(x, y, w, h)
        else ctx.strokeRect(x, y, w, h)
      }
      if (activeShape === "circle") {
        ctx.beginPath()
        ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2)
        if (filled) ctx.fill(); else ctx.stroke()
      }
      if (activeShape === "line") {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke()
      }
      if (activeShape === "arrow") {
        ctx.setLineDash([])
        drawArrow(ctx, x, y, x2, y2)
      }
      ctx.restore()
      return
    }

    if (!hasMoved.current) {
      const dx = pos.x - startPos.current.x
      const dy = pos.y - startPos.current.y
      if (Math.sqrt(dx * dx + dy * dy) < MIN_DISTANCE) return
      hasMoved.current = true
    }

    const canvas = canvasRef.current!
    const ctx    = canvas.getContext("2d")!
    const ev: WBEvent = {
      v: 1, type: "draw", tool, color, size,
      x0: lastPos.current.x, y0: lastPos.current.y,
      x1: pos.x, y1: pos.y,
    }
    replayEvent(ctx, ev)
    broadcast(ev)
    lastPos.current = pos
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (!isDrawing.current) return
    isDrawing.current = false

    if (activeShape && snapshotRef.current) {
      const pos    = getPos(e)
      const canvas = canvasRef.current!
      const ctx    = canvas.getContext("2d")!

      ctx.putImageData(snapshotRef.current, 0, 0)
      snapshotRef.current = null

      const ev: WBEvent = {
        v: 1,
        type: "shape",
        shape: activeShape,
        color,
        size,
        filled,
        x0: startPos.current.x,
        y0: startPos.current.y,
        x1: pos.x,
        y1: pos.y,
      }
      replayEvent(ctx, ev)
      broadcast(ev)
    }

    hasMoved.current = false
  }

  // ── Texte ─────────────────────────────────────────────────────────────────
  const confirmText = () => {
    if (!textVal.trim() || !textPos) { setTextPos(null); return }
    const canvas   = canvasRef.current!
    const rect     = canvas.getBoundingClientRect()
    const fontSize = size * 6 + 10
    saveUndoState()
    const ev: WBEvent = {
      v: 1, type: "text", color, fontSize, text: textVal,
      tx: textPos.x / rect.width,
      ty: textPos.y / rect.height,
    }
    const ctx = canvas.getContext("2d")!
    replayEvent(ctx, ev)
    broadcast(ev)
    setTextPos(null)
    setTextVal("")
  }

  // ── Effacer tout ──────────────────────────────────────────────────────────
  const clearAll = () => {
    saveUndoState()
    const canvas = canvasRef.current!
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height)
    eventStore.current = []
    undoStack.current  = []
    localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify({ v: 1, type: "clear" })),
      { reliable: true, topic: WB_TOPIC }
    )
  }

  // ── Raccourcis clavier ────────────────────────────────────────────────────
  useEffect(() => {
    if (readOnly) return
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); undo() }
      if (e.key === "Escape") { setActiveShape(null); setTextMode(false) }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [readOnly, undo])

  // ── Curseur ───────────────────────────────────────────────────────────────
  const getCursor = () => {
    if (readOnly)         return "default"
    if (textMode)         return "text"
    if (activeShape)      return "crosshair"
    if (tool === "eraser") return "cell"
    return "crosshair"
  }

  // ── Helpers toolbar ───────────────────────────────────────────────────────
  const selectTool = (t: "pen" | "eraser") => {
    setTool(t); setActiveShape(null); setTextMode(false)
  }
  const selectShape = (s: ShapeType) => {
    setActiveShape(s === activeShape ? null : s)
    setTextMode(false)
  }
  const toggleText = () => {
    setTextMode(!textMode); setActiveShape(null)
  }

  // ── Icônes formes ─────────────────────────────────────────────────────────
  const shapeIcons: Record<ShapeType, React.ReactElement> = {
    rect: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="2" y="3" width="12" height="10" rx="1"/>
      </svg>
    ),
    circle: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
        <ellipse cx="8" cy="8" rx="6" ry="5"/>
      </svg>
    ),
    line: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
        <line x1="2" y1="14" x2="14" y2="2" strokeLinecap="round"/>
      </svg>
    ),
    arrow: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
        <line x1="2" y1="14" x2="13" y2="3" strokeLinecap="round"/>
        <polyline points="7,3 13,3 13,9" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  }

  // ── Render readOnly ───────────────────────────────────────────────────────
  if (readOnly) {
    return (
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: "white" }}>
        <div ref={containerRef} style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <canvas
            ref={canvasRef}
            style={{ display: "block", cursor: "default", touchAction: "none", background: "white" }}
          />
          <div style={{
            position: "absolute", top: 10, left: 10,
            background: "rgba(0,0,0,.6)", color: "white",
            fontSize: 11, fontWeight: 600,
            padding: "3px 10px", borderRadius: 20,
            display: "flex", alignItems: "center", gap: 5,
            pointerEvents: "none",
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            Lecture seule
          </div>
        </div>
      </div>
    )
  }

  // ── Render hôte ───────────────────────────────────────────────────────────
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: "white" }}>

      {/* ── TOOLBAR ── */}
      <div style={{
        display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6,
        padding: "6px 12px", background: "#f8fafd",
        borderBottom: "1px solid #e2e8f0", flexShrink: 0,
        minHeight: 52,
      }}>

        {/* Outils de base */}
        <div style={{ display: "flex", gap: 4 }}>
          <button title="Crayon" onClick={() => selectTool("pen")} style={btnStyle(tool === "pen" && !activeShape && !textMode)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
          </button>
          <button title="Gomme" onClick={() => selectTool("eraser")} style={btnStyle(tool === "eraser" && !activeShape && !textMode)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 20H7L3 16l10-10 7 7-3.5 3.5"/><path d="M6.5 17.5l4-4"/>
            </svg>
          </button>
          <button title="Texte" onClick={toggleText} style={btnStyle(textMode)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>
            </svg>
          </button>
        </div>

        <div style={{ width: 1, height: 28, background: "#e2e8f0" }} />

        {/* Formes */}
        <div style={{ display: "flex", gap: 4 }}>
          {(Object.keys(shapeIcons) as ShapeType[]).map(s => (
            <button
              key={s}
              title={s === "rect" ? "Rectangle" : s === "circle" ? "Ellipse / Cercle" : s === "line" ? "Ligne" : "Flèche"}
              onClick={() => selectShape(s)}
              style={btnStyle(activeShape === s)}
            >
              {shapeIcons[s]}
            </button>
          ))}
          {(activeShape === "rect" || activeShape === "circle") && (
            <button
              title={filled ? "Contour seulement" : "Forme remplie"}
              onClick={() => setFilled(!filled)}
              style={{ ...btnStyle(filled), fontSize: 14, minWidth: 34 }}
            >
              {filled ? "■" : "□"}
            </button>
          )}
        </div>

        <div style={{ width: 1, height: 28, background: "#e2e8f0" }} />

        {/* Couleurs */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {COLORS.map(c => (
            <button
              key={c}
              title={c}
              onClick={() => { setColor(c); if (!activeShape && !textMode) setTool("pen") }}
              style={{
                width: 22, height: 22, borderRadius: "50%",
                background: c,
                border: color === c
                  ? "3px solid #0065b1"
                  : c === "#ffffff" ? "2px solid #d1d5db" : "2px solid transparent",
                cursor: "pointer", flexShrink: 0, padding: 0,
              }}
            />
          ))}
        </div>

        <div style={{ width: 1, height: 28, background: "#e2e8f0" }} />

        {/* Épaisseur */}
        <div style={{ display: "flex", gap: 4 }}>
          {SIZES.map(s => (
            <button
              key={s}
              title={`Épaisseur ${s}`}
              onClick={() => setSize(s)}
              style={{ ...btnStyle(size === s), width: 34, height: 34 }}
            >
              <div style={{
                width:  Math.max(3, s * 1.4),
                height: Math.max(3, s * 1.4),
                borderRadius: "50%",
                background: color === "#ffffff" ? "#374151" : color,
                margin: "auto",
              }} />
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Annuler */}
        <button
          title="Annuler (Ctrl+Z)"
          onClick={undo}
          style={{
            ...btnStyle(false),
            padding: "0 10px", gap: 5,
            display: "flex", alignItems: "center",
            fontSize: 12, color: "#374151",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6"/><path d="M3 13C5.6 7.6 11.6 4 18 5.5a10 10 0 0 1 5 8.5"/>
          </svg>
          Annuler
        </button>

        {/* Effacer tout */}
        <button
          title="Effacer tout"
          onClick={clearAll}
          style={{
            ...btnStyle(false),
            padding: "0 10px", gap: 5,
            display: "flex", alignItems: "center",
            fontSize: 12, color: "#e53e3e", borderColor: "#fecaca",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/>
            <path d="M9 6V4h6v2"/>
          </svg>
          Effacer
        </button>
      </div>

      {/* ── CANVAS ── */}
      <div ref={containerRef} style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <canvas
          ref={canvasRef}
          style={{
            display: "block",
            cursor: getCursor(),
            touchAction: "none",
            background: "white",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />

        {/* Input texte flottant */}
        {textPos && (
          <input
            ref={textInputRef}
            value={textVal}
            onChange={e => setTextVal(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter")  confirmText()
              if (e.key === "Escape") setTextPos(null)
            }}
            onBlur={confirmText}
            style={{
              position: "absolute",
              left: textPos.x, top: textPos.y - 20,
              background: "transparent",
              border: "none", borderBottom: `2px solid ${color}`,
              outline: "none",
              fontSize: size * 6 + 10,
              color,
              fontFamily: "'Google Sans',sans-serif",
              minWidth: 120, zIndex: 10,
            }}
            placeholder="Texte…"
          />
        )}

        {/* Indicateur outil actif */}
        <div style={{
          position: "absolute", bottom: 10, left: 10,
          background: "rgba(0,0,0,.55)", color: "white",
          fontSize: 11, fontWeight: 600,
          padding: "3px 10px", borderRadius: 20,
          pointerEvents: "none",
          display: "flex", alignItems: "center", gap: 5,
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: color,
            border: "1px solid rgba(255,255,255,.5)",
          }} />
          {textMode
            ? "Texte"
            : activeShape
              ? activeShape.charAt(0).toUpperCase() + activeShape.slice(1)
              : tool === "eraser" ? "Gomme" : "Crayon"
          }
        </div>
      </div>
    </div>
  )
}

// ── Style helper ──────────────────────────────────────────────────────────────
function btnStyle(active: boolean): React.CSSProperties {
  return {
    width: 34, height: 34, borderRadius: 8,
    border: `1.5px solid ${active ? "#0065b1" : "#e2e8f0"}`,
    background: active ? "#e8f4ff" : "white",
    color: active ? "#0065b1" : "#374151",
    cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "inherit", padding: 0, flexShrink: 0,
    transition: "border-color .15s, background .15s",
  }
}
