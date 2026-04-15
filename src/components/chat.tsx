"use client";

import { useChat, useLocalParticipant, useRoomInfo } from "@livekit/components-react";
import { RoomMetadata } from "@/lib/controller";
import { useMemo, useState, useRef, useCallback } from "react";

export function Chat() {
  const [draft, setDraft] = useState("");
  const [cooldown, setCooldown] = useState(false);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { chatMessages, send } = useChat();
  const { localParticipant } = useLocalParticipant();
  const { metadata } = useRoomInfo();

  const { enable_chat: chatEnabled } = (
    metadata ? JSON.parse(metadata) : { enable_chat: true }
  ) as RoomMetadata;

  // Dédupliquer les messages et filtrer les commandes internes
  const messages = useMemo(() => {
    const timestamps = chatMessages.map((m) => m.timestamp);
    return chatMessages.filter((m, i) =>
      !timestamps.includes(m.timestamp, i + 1) &&
      !m.message.startsWith("__emoji__") &&
      !m.message.startsWith("__whiteboard_")
    );
  }, [chatMessages]);

  const onSend = useCallback(async () => {
    if (!draft.trim() || !send || cooldown) return;
    await send(draft.trim());
    setDraft("");
    // Cooldown 500ms anti-spam
    setCooldown(true);
    if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
    cooldownTimer.current = setTimeout(() => setCooldown(false), 500);
  }, [draft, send, cooldown]);

  const canSend = chatEnabled && draft.trim().length > 0 && !cooldown;

  return (
    <div className="chat-root">
      <div className="chat-header">💬 Chat en direct</div>
      <div className="chat-messages">
        {messages.length === 0 && <div className="chat-empty">Aucun message pour l'instant</div>}
        {messages.map((msg) => {
          const isMe = msg.from?.identity === localParticipant.identity;
          return (
            <div key={msg.timestamp} className={`chat-msg ${isMe ? "mine" : ""}`}>
              <span className={`chat-who ${isMe ? "me" : ""}`}>
                {isMe ? "Vous" : (msg.from?.name || msg.from?.identity || "Inconnu")}
              </span>
              <span className="chat-text">{msg.message}</span>
            </div>
          );
        })}
      </div>
      <div className="chat-input-row">
        <input
          className="chat-input"
          placeholder={chatEnabled ? (cooldown ? "Patientez…" : "Envoyer un message...") : "Chat désactivé"}
          disabled={!chatEnabled}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && canSend && onSend()}
        />
        <button className="chat-send" onClick={onSend} disabled={!canSend}>
          ➤
        </button>
      </div>

      <style>{`
        .chat-root { display:flex; flex-direction:column; height:100%; }
        .chat-header { padding:14px 16px; border-bottom:1px solid #3c4043; font-size:0.85rem; font-weight:600; color:#e8eaed; flex-shrink:0; }
        .chat-messages { flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:12px; }
        .chat-empty { color:#5f6368; font-size:0.85rem; text-align:center; margin-top:32px; }
        .chat-msg { display:flex; flex-direction:column; gap:2px; }
        .chat-msg.mine { align-items:flex-end; }
        .chat-who { font-size:0.72rem; font-weight:500; color:#8ab4f8; }
        .chat-who.me { color:#34a853; }
        .chat-text { background:#303134; padding:8px 12px; border-radius:12px; font-size:0.85rem; max-width:90%; line-height:1.4; color:#e8eaed; }
        .chat-msg.mine .chat-text { background:#1a4a8a; }
        .chat-input-row { display:flex; gap:8px; padding:12px; border-top:1px solid #3c4043; flex-shrink:0; }
        .chat-input { flex:1; background:#303134; border:1px solid #3c4043; border-radius:24px; padding:9px 14px; color:#e8eaed; font-size:0.85rem; outline:none; font-family:inherit; }
        .chat-input:focus { border-color:#8ab4f8; }
        .chat-input:disabled { opacity:.5; }
        .chat-send { width:36px; height:36px; background:#1a73e8; border:none; border-radius:50%; color:white; cursor:pointer; font-size:0.9rem; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .chat-send:disabled { opacity:.4; cursor:not-allowed; }
      `}</style>
    </div>
  );
}
