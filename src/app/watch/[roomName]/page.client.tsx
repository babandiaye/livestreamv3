"use client";

import React, { useState, useEffect } from "react";
import { LiveKitRoom, useLocalParticipant, useParticipants, useRoomContext, VideoTrack, AudioTrack, useTracks, StartAudio, useChat } from "@livekit/components-react";
import { Track, Participant, ConnectionState } from "livekit-client";
import { TokenContext } from "@/components/token-context";
import { Chat } from "@/components/chat";
import { JoinStreamResponse, ParticipantMetadata, RoomMetadata } from "@/lib/controller";
import { useAuthToken } from "@/components/token-context";
import dynamic from "next/dynamic";
const Whiteboard = dynamic(() => import("@/components/whiteboard"), { ssr: false });

function JoinForm({ roomName, onJoin }: {
  roomName: string;
  onJoin: (authToken: string, roomToken: string) => void;
}) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleJoin = async () => {
    if (!name.trim()) return;
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/join_stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_name: roomName, identity: name.trim() }),
      });
      if (!res.ok) { setError(await res.text()); return; }
      const { auth_token, connection_details: { token } } = await res.json() as JoinStreamResponse;
      onJoin(auth_token, token);
    } catch { setError("Erreur réseau"); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100dvh", background: "#f8fafd", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Google Sans','Segoe UI',system-ui,sans-serif" }}>
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 16, padding: "40px 36px", width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", alignItems: "center", gap: 20, boxShadow: "0 4px 32px rgba(0,0,0,.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <img src="/logo-unchk.png" alt="UN-CHK" style={{ height: "40px", objectFit: "contain" }} onError={(e) => (e.currentTarget.style.display="none")} />
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e", marginBottom: 6 }}>Rejoindre la session</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#e8f4ff", color: "#0065b1", fontSize: 13, fontWeight: 500, padding: "4px 14px", borderRadius: 20, border: "1px solid #b8d9f5" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#0065b1" }} />
            {decodeURIComponent(roomName)}
          </div>
        </div>
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Votre nom</label>
          <input
            type="text" placeholder="ex: Amadou Diallo" value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleJoin()}
            autoFocus
            style={{ padding: "10px 14px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 14, outline: "none", fontFamily: "inherit", color: "#1a1a2e", transition: "border-color .2s" }}
            onFocus={e => e.target.style.borderColor = "#0065b1"}
            onBlur={e => e.target.style.borderColor = "#e2e8f0"}
          />
        </div>
        {error && (
          <div style={{ width: "100%", background: "#fff0f0", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#b91c1c" }}>
            ⚠️ {error}
          </div>
        )}
        <button onClick={handleJoin} disabled={loading || !name.trim()}
          style={{ width: "100%", padding: "12px", background: "#0065b1", color: "white", border: "none", borderRadius: 9, fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: loading || !name.trim() ? .5 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {loading ? (
            <><span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,.3)", borderTopColor: "white", borderRadius: "50%", animation: "jf-spin .7s linear infinite", display: "inline-block" }} />Connexion…</>
          ) : "Rejoindre en tant que spectateur →"}
        </button>
        <a href="/" style={{ fontSize: 13, color: "#9ca3af", textDecoration: "none" }}>← Retour à l&apos;accueil</a>
      </div>
      <style>{`@keyframes jf-spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

export default function WatchPage({ roomName, serverUrl }: { roomName: string; serverUrl: string }) {
  const [session, setSession] = useState<{ authToken: string; roomToken: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get("token")
    if (token && !session) setSession({ authToken: token, roomToken: token })
  }, [])

  const returnUrl = typeof window !== "undefined"
    ? (new URLSearchParams(window.location.search).get("returnUrl") || "/")
    : "/"

  if (!session) {
    return <JoinForm roomName={roomName} onJoin={(authToken, roomToken) => setSession({ authToken, roomToken })} />;
  }

  return (
    <TokenContext.Provider value={session.authToken}>
      <LiveKitRoom serverUrl={serverUrl} token={session.roomToken} connect={true} style={{ height: "100dvh" }}>
        <ViewerRoom returnUrl={returnUrl} />
      </LiveKitRoom>
    </TokenContext.Provider>
  );
}

function ViewerRoom({ returnUrl = "/" }: { returnUrl?: string }) {
  const authToken = useAuthToken();
  const room = useRoomContext();
  const { send: sendChat, chatMessages } = useChat();
  const { localParticipant } = useLocalParticipant();
  const participants = useParticipants();
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare, Track.Source.Microphone]);

  const [panel, setPanel] = useState<"chat" | null>("chat");
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [raisingHand, setRaisingHand] = useState(false);
  const [shareOn, setShareOn] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [floatingEmojis, setFloatingEmojis] = useState<{id:number;emoji:string;x:number}[]>([]);
  const [sessionEnded, setSessionEnded] = useState(false);

  const getMeta = (p: Participant): ParticipantMetadata => {
    try { return JSON.parse(p.metadata || "{}"); } catch { return { hand_raised: false, invited_to_stage: false, avatar_image: "" }; }
  };

  const me = participants.find(p => p.identity === localParticipant.identity);
  const myMeta = me ? getMeta(me) : { hand_raised: false, invited_to_stage: false, avatar_image: "" };
  const onStage = myMeta.invited_to_stage;
  const handRaised = myMeta.hand_raised;
  const micOn = localParticipant.isMicrophoneEnabled;
  const camOn = localParticipant.isCameraEnabled;

  useEffect(() => {
    const handleDisconnect = () => {
      setSessionEnded(true)
      setTimeout(() => { window.location.href = returnUrl }, 3000)
    }
    const handleConnectionStateChange = (state: ConnectionState) => {
      if (state === ConnectionState.Disconnected || state === ConnectionState.Reconnecting) {
        setTimeout(() => { if (room.state === ConnectionState.Disconnected) handleDisconnect() }, 2000)
      }
    }
    room.on("disconnected", handleDisconnect)
    room.on("connectionStateChanged", handleConnectionStateChange)
    return () => { room.off("disconnected", handleDisconnect); room.off("connectionStateChanged", handleConnectionStateChange) }
  }, [room, returnUrl])

  useEffect(() => {
    if (!onStage) {
      localParticipant.setCameraEnabled(false);
      localParticipant.setMicrophoneEnabled(false);
      localParticipant.setScreenShareEnabled(false);
      setShareOn(false);
    }
  }, [onStage]);

  const launchEmoji = (emoji: string) => { sendChat?.(`__emoji__${emoji}`); setShowEmojiPicker(false); };

  const lastMsgTs = chatMessages[chatMessages.length - 1]?.timestamp;
  React.useEffect(() => {
    const last = chatMessages[chatMessages.length - 1];
    if (last?.message?.startsWith("__emoji__")) {
      const emoji = last.message.replace("__emoji__", "");
      const id = Date.now() + Math.random();
      const x = 20 + Math.random() * 60;
      setFloatingEmojis(prev => [...prev, { id, emoji, x }]);
      setTimeout(() => setFloatingEmojis(prev => prev.filter(e => e.id !== id)), 3000);
    }
  }, [lastMsgTs]);

  // ── Auto-activation du tableau blanc quand l'hôte l'active/désactive ──
  useEffect(() => {
    const last = chatMessages[chatMessages.length - 1]
    if (!last?.message) return
    if (last.message === "__whiteboard_open__") setShowWhiteboard(true)
    if (last.message === "__whiteboard_close__") setShowWhiteboard(false)
  }, [chatMessages])

  const raiseHand = async () => {
    if (raisingHand || handRaised) return;
    setRaisingHand(true);
    try { await fetch("/api/raise_hand", { method: "POST", headers: { Authorization: `Bearer ${authToken}` } }); }
    finally { setRaisingHand(false); }
  };

  const leaveStage = async () => {
    await fetch("/api/remove_from_stage", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({}),
    });
  };

  const audioOptions = { noiseSuppression: true, echoCancellation: true, autoGainControl: true };

  const screenTrack = tracks.find(t => t.source === Track.Source.ScreenShare && t.participant.identity !== localParticipant.identity);
  const camTracks = tracks.filter(t => t.source === Track.Source.Camera);
  const audioTracks = tracks.filter(t => t.source === Track.Source.Microphone && t.participant.identity !== localParticipant.identity);
  const roomMeta = (() => { try { return JSON.parse(room.metadata || "{}") as RoomMetadata; } catch { return null; } })();
  const hostId = roomMeta?.creator_identity;
  const mainCamTrack = camTracks.find(t => t.participant.identity === hostId) || camTracks.find(t => t.participant.identity !== localParticipant.identity);
  const stageParts = participants.filter(p => p.identity !== localParticipant.identity && getMeta(p).invited_to_stage);
  const stageCamTracks = camTracks.filter(t => stageParts.some(p => p.identity === t.participant.identity) && t.participant.identity !== hostId);

  // Détermine le contenu principal
  const mainContent = showWhiteboard ? "whiteboard" : screenTrack ? "screen" : mainCamTrack ? "cam" : "avatar";

  if (sessionEnded) {
    return (
      <div style={{ height: "100dvh", background: "#f8fafd", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, fontFamily: "'Google Sans','Segoe UI',system-ui,sans-serif" }}>
        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 16, padding: "48px 40px", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, boxShadow: "0 4px 32px rgba(0,0,0,.08)" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>✅</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a2e" }}>Session terminée</div>
          <p style={{ fontSize: 13, color: "#9ca3af", textAlign: "center" }}>L&apos;animateur a mis fin à la session.<br/>Vous allez être redirigé…</p>
          <div style={{ width: 28, height: 28, border: "3px solid #e2e8f0", borderTopColor: "#0065b1", borderRadius: "50%", animation: "w-spin .7s linear infinite" }} />
        </div>
        <style>{`@keyframes w-spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: "#0d1117", color: "#e6edf3", fontFamily: "'Google Sans','Segoe UI',system-ui,sans-serif" }}>

      {/* ── TOPBAR ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", height: 54, background: "#161b22", borderBottom: "1px solid #21262d", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img src="/logo-unchk.png" alt="UN-CHK" style={{ height: "28px", objectFit: "contain" }} onError={(e) => (e.currentTarget.style.display="none")} />
          </div>
          <div style={{ width: 1, height: 20, background: "#30363d" }} />
          <span style={{ fontSize: 13, fontWeight: 500, color: "#8b949e", background: "#21262d", border: "1px solid #30363d", padding: "3px 10px", borderRadius: 6 }}>{room.name}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(248,81,73,.12)", border: "1px solid rgba(248,81,73,.3)", borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700, color: "#f85149", letterSpacing: ".05em" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f85149", display: "inline-block", animation: "w-pulse 1.5s ease-in-out infinite" }} />
            EN DIRECT
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "#3fb950" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#3fb950", display: "inline-block" }} />
            Connecté
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "#8b949e", background: "#21262d", padding: "4px 10px", borderRadius: 8, border: "1px solid #30363d" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            {participants.length}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#21262d", border: "1px solid #30363d", borderRadius: 8, padding: "4px 12px" }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#0065b1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "white" }}>
              {(localParticipant.name ?? localParticipant.identity).charAt(0).toUpperCase()}
            </div>
            <span style={{ fontSize: 13, fontWeight: 500, color: "#e6edf3" }}>{localParticipant.name ?? localParticipant.identity}</span>
            <span style={{ fontSize: 11, color: "#8b949e", background: "#161b22", padding: "1px 6px", borderRadius: 4 }}>Spectateur</span>
          </div>
        </div>
      </div>

      {/* ── BODY ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative" }}>

        {/* Stage */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative", background: "#010409" }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }}>

            {/* ── TABLEAU BLANC dans la zone principale ── */}
            {mainContent === "whiteboard" && (
              <div style={{ position: "absolute", inset: 0, background: "white" }}>
                <Whiteboard readOnly={true} />
              </div>
            )}

            {/* ── PARTAGE D'ÉCRAN ── */}
            {mainContent === "screen" && (
              <VideoTrack trackRef={screenTrack!} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            )}

            {/* ── CAMÉRA PRINCIPALE ── */}
            {mainContent === "cam" && (
              <VideoTrack trackRef={mainCamTrack!} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            )}

            {/* ── AVATAR (rien d'actif) ── */}
            {mainContent === "avatar" && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, color: "#484f58", textAlign: "center" }}>
                <div style={{ width: 80, height: 80, borderRadius: "50%", background: "#161b22", border: "1px solid #21262d", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#30363d" strokeWidth="1.5"><path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.259a1 1 0 01-1.447.894L15 14"/><rect x="3" y="6" width="12" height="12" rx="2"/></svg>
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#8b949e" }}>En attente du stream…</div>
                <div style={{ fontSize: 13, color: "#484f58" }}>L&apos;animateur n&apos;a pas encore démarré</div>
              </div>
            )}

            {/* Badge "Tableau blanc" quand actif */}
            {mainContent === "whiteboard" && (
              <div style={{ position: "absolute", top: 12, left: 12, background: "rgba(0,101,177,.85)", color: "white", fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 5, zIndex: 10 }}>
                🖊 Tableau blanc
              </div>
            )}

            {/* Name tag caméra */}
            {mainContent === "cam" && (
              <div style={{ position: "absolute", bottom: 12, left: 12, background: "rgba(1,4,9,.75)", backdropFilter: "blur(4px)", color: "#e6edf3", fontSize: 13, padding: "4px 12px", borderRadius: 5, border: "1px solid #21262d" }}>
                {mainCamTrack!.participant.name ?? mainCamTrack!.participant.identity}
              </div>
            )}

            {/* PiP caméra principale quand partage d'écran ou tableau actif */}
            {(mainContent === "screen" || mainContent === "whiteboard") && (
              <div style={{ position: "absolute", bottom: 16, right: 16, display: "flex", flexDirection: "column", gap: 8, zIndex: 10 }}>
                {mainCamTrack && (
                  <div style={{ width: 180, height: 112, borderRadius: 9, overflow: "hidden", background: "#161b22", position: "relative", border: "2px solid #0065b1", boxShadow: "0 4px 20px rgba(0,0,0,.6)" }}>
                    <VideoTrack trackRef={mainCamTrack} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <div style={{ position: "absolute", bottom: 4, left: 6, fontSize: 11, color: "white", background: "rgba(1,4,9,.75)", padding: "2px 6px", borderRadius: 3 }}>{mainCamTrack.participant.name ?? mainCamTrack.participant.identity}</div>
                  </div>
                )}
                {stageCamTracks.map(t => (
                  <div key={t.participant.identity} style={{ width: 180, height: 112, borderRadius: 9, overflow: "hidden", background: "#161b22", position: "relative", border: "2px solid #30363d" }}>
                    <VideoTrack trackRef={t} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <div style={{ position: "absolute", bottom: 4, left: 6, fontSize: 11, color: "white", background: "rgba(1,4,9,.75)", padding: "2px 6px", borderRadius: 3 }}>{t.participant.name ?? t.participant.identity}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Strip participants sur scène (seulement quand cam principale) */}
            {mainContent === "cam" && stageCamTracks.length > 0 && (
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", gap: 8, padding: 8, background: "rgba(13,17,23,.85)", overflowX: "auto" }}>
                {stageCamTracks.map(t => (
                  <div key={t.participant.identity} style={{ width: 160, height: 100, borderRadius: 8, background: "#161b22", position: "relative", flexShrink: 0, overflow: "hidden" }}>
                    <VideoTrack trackRef={t} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <div style={{ position: "absolute", bottom: 4, left: 6, fontSize: 11, color: "white", background: "rgba(0,0,0,.5)", padding: "2px 6px", borderRadius: 3 }}>{t.participant.name ?? t.participant.identity}</div>
                  </div>
                ))}
              </div>
            )}

            {/* On Stage badge */}
            {onStage && (
              <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", background: "rgba(63,185,80,.15)", border: "1px solid #3fb950", color: "#3fb950", padding: "8px 18px", borderRadius: 24, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 10, backdropFilter: "blur(4px)", zIndex: 20 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
                Vous êtes sur scène
                <button onClick={leaveStage} style={{ background: "rgba(248,81,73,.15)", border: "1px solid rgba(248,81,73,.4)", color: "#f85149", padding: "3px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Quitter</button>
              </div>
            )}

            <StartAudio label="Cliquez pour activer le son" className="v-start-audio" />

            {/* Floating emojis */}
            {floatingEmojis.map(fe => (
              <div key={fe.id} style={{ position: "absolute", bottom: "10%", left: `${fe.x}%`, fontSize: "3rem", zIndex: 50, pointerEvents: "none", animation: "w-floatUp 3s ease-out forwards" }}>{fe.emoji}</div>
            ))}

            {/* Emoji picker */}
            {showEmojiPicker && (
              <div style={{ position: "absolute", bottom: 100, left: "50%", transform: "translateX(-50%)", background: "#161b22", border: "1px solid #21262d", borderRadius: 12, padding: "12px 16px", display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", maxWidth: 300, boxShadow: "0 8px 32px rgba(0,0,0,.6)", zIndex: 200 }}>
                {["👍","👏","❤️","😂","😮","🎉","🙌","🔥","💯","👋"].map(e => (
                  <button key={e} onClick={() => launchEmoji(e)} style={{ width: 42, height: 42, background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", borderRadius: 8, transition: "background .15s", display: "flex", alignItems: "center", justifyContent: "center" }}>{e}</button>
                ))}
              </div>
            )}
          </div>

          {audioTracks.map(t => <AudioTrack key={t.participant.identity} trackRef={t} />)}
        </div>

        {/* ── PANEL CHAT ── */}
        {panel === "chat" && (
          <div style={{ width: 300, flexShrink: 0, background: "#161b22", borderLeft: "1px solid #21262d", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #21262d", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 14, fontWeight: 600, color: "#e6edf3" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8b949e" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                Chat en direct
              </div>
              <button onClick={() => setPanel(null)} style={{ width: 28, height: 28, background: "none", border: "none", color: "#8b949e", cursor: "pointer", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <Chat />
          </div>
        )}
      </div>

      {/* ── CONTROLS ── */}
      <div style={{ background: "#161b22", borderTop: "1px solid #21262d", flexShrink: 0, padding: "10px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#8b949e" }}>
            <img src="/logo-unchk.png" alt="UN-CHK" style={{ height: "22px", objectFit: "contain" }} onError={(e) => (e.currentTarget.style.display="none")} />
            <span style={{ color: "#e6edf3", fontWeight: 500 }}>{room.name}</span>
            <span style={{ color: "#484f58" }}>·</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            {participants.length}
          </div>

          <div style={{ display: "flex", alignItems: "flex-start", gap: 4, justifyContent: "center" }}>
            {onStage && (
              <CtrlBtn label="Micro" active={micOn} off={!micOn}
                onClick={() => localParticipant.setMicrophoneEnabled(!micOn, audioOptions)}
                icon={micOn
                  ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                  : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                }
              />
            )}
            {onStage && (
              <CtrlBtn label="Caméra" active={camOn} off={!camOn}
                onClick={() => localParticipant.setCameraEnabled(!camOn)}
                icon={camOn
                  ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                  : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h2a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56"/></svg>
                }
              />
            )}
            {onStage && (
              <CtrlBtn label="Écran" active={shareOn}
                onClick={async () => { await localParticipant.setScreenShareEnabled(!shareOn); setShareOn(!shareOn); }}
                icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><polyline points="8 21 12 17 16 21"/></svg>}
              />
            )}

            <CtrlBtn label="Réagir" active={showEmojiPicker}
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>}
            />

            {!onStage && (
              <CtrlBtn label={handRaised ? "Main levée" : "Main"} raised={handRaised} disabled={handRaised || raisingHand}
                onClick={raiseHand}
                icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>}
              />
            )}
            {onStage && (
              <CtrlBtn label="Sur scène" stageActive onClick={leaveStage}
                icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>}
              />
            )}

            <CtrlBtn label="Tableau" active={showWhiteboard}
              onClick={() => setShowWhiteboard(!showWhiteboard)}
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9l6 6M15 9l-6 6"/></svg>}
            />

            <CtrlBtn label="Chat" active={panel === "chat"}
              onClick={() => setPanel(panel === "chat" ? null : "chat")}
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>}
            />

            <a href={returnUrl} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "6px 10px", background: "none", borderRadius: 8, textDecoration: "none", minWidth: 52, color: "#f85149" }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#3d1a1a", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </div>
              <span style={{ fontSize: 11, fontWeight: 500, whiteSpace: "nowrap" }}>Quitter</span>
            </a>
          </div>

          <div />
        </div>
      </div>

      <style>{`
        @keyframes w-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes w-floatUp { 0%{opacity:1;transform:translateY(0) scale(1)} 50%{opacity:1;transform:translateY(-40vh) scale(1.3)} 100%{opacity:0;transform:translateY(-80vh) scale(.8)} }
        @keyframes w-spin { to{transform:rotate(360deg)} }
        .v-start-audio { position:absolute;inset:0;background:rgba(1,4,9,.8);color:#e6edf3;border:none;font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px); }
      `}</style>
    </div>
  );
}

function CtrlBtn({ label, icon, onClick, active, off, raised, stageActive, disabled }: {
  label: string; icon: React.ReactNode; onClick?: () => void;
  active?: boolean; off?: boolean; raised?: boolean; stageActive?: boolean; disabled?: boolean;
}) {
  const iconBg = off ? "#3d1a1a" : raised ? "#3a2f00" : stageActive ? "#0d3321" : active ? "#1f6feb" : "#21262d";
  const iconColor = off ? "#f85149" : raised ? "#e3b341" : stageActive ? "#3fb950" : active ? "white" : "#8b949e";
  const labelColor = off ? "#f85149" : raised ? "#e3b341" : stageActive ? "#3fb950" : active ? "#58a6ff" : "#8b949e";

  return (
    <button onClick={onClick} disabled={disabled}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "6px 10px", background: "none", border: "none", cursor: disabled ? "not-allowed" : "pointer", borderRadius: 8, minWidth: 52, opacity: disabled ? .5 : 1, fontFamily: "inherit" }}>
      <div style={{ width: 44, height: 44, borderRadius: "50%", background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", color: iconColor, transition: "background .15s" }}>
        {icon}
      </div>
      <span style={{ fontSize: 11, fontWeight: 500, whiteSpace: "nowrap", color: labelColor }}>{label}</span>
    </button>
  );
}
