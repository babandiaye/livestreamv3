"use client";
import React from "react";

import { LiveKitRoom, useLocalParticipant, useParticipants, useRoomContext, VideoTrack, AudioTrack, useTracks, StartAudio, useChat } from "@livekit/components-react";
import { Track, Participant } from "livekit-client";
import { useState, useEffect } from "react";
import { TokenContext } from "@/components/token-context";
import { Chat } from "@/components/chat";
import StreamingDialog from "@/components/streaming-dialog";
import { ParticipantMetadata } from "@/lib/controller";
import { useAuthToken } from "@/components/token-context";
import dynamic from "next/dynamic";
const Whiteboard = dynamic(() => import("@/components/whiteboard"), { ssr: false });

export default function HostPage({
  authToken,
  roomToken,
  serverUrl,
  returnUrl = "/",
}: {
  authToken: string;
  roomToken: string;
  serverUrl: string;
  returnUrl?: string;
}) {
  return (
    <TokenContext.Provider value={authToken}>
      <LiveKitRoom serverUrl={serverUrl} token={roomToken} connect={true} style={{ height: "100dvh" }}>
        <HostRoom returnUrl={returnUrl} />
      </LiveKitRoom>
    </TokenContext.Provider>
  );
}

function HostRoom({ returnUrl = "/" }: { returnUrl?: string }) {
  const authToken = useAuthToken();
  const room = useRoomContext();
  const { send: sendChat, chatMessages } = useChat();
  const { localParticipant } = useLocalParticipant();
  const participants = useParticipants();
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare, Track.Source.Microphone]);

  const [panel, setPanel] = useState<"chat" | "participants" | null>("participants");
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [shareOn, setShareOn] = useState(false);
  const [raisedHands, setRaisedHands] = useState<string[]>([]);
  const [inviting, setInviting] = useState<string | null>(null);

  const [egressId, setEgressId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingLoading, setRecordingLoading] = useState(false);
  const [recordingWaiting, setRecordingWaiting] = useState(false);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  const [recordingElapsed, setRecordingElapsed] = useState("00:00");

  const [streamingEgressId, setStreamingEgressId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [streamingFailed, setStreamingFailed] = useState(false);
  const [showStreamingDialog, setShowStreamingDialog] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [floatingEmojis, setFloatingEmojis] = useState<{id:number;emoji:string;x:number}[]>([]);

  // Timer d'enregistrement — synchronisé avec le début réel de la capture egress
  useEffect(() => {
    if (!recording || !recordingStartTime) {
      setRecordingElapsed("00:00");
      return;
    }
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - recordingStartTime) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setRecordingElapsed(
        h > 0
          ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
          : `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [recording, recordingStartTime]);

  const micOn = localParticipant.isMicrophoneEnabled;
  const camOn = localParticipant.isCameraEnabled;

  const getMeta = (p: Participant): ParticipantMetadata => {
    try { return JSON.parse(p.metadata || "{}"); } catch { return { hand_raised: false, invited_to_stage: false, avatar_image: "" }; }
  };

  useEffect(() => {
    const raised = participants
      .filter(p => p.identity !== localParticipant.identity)
      .filter(p => { const m = getMeta(p); return m.hand_raised && !m.invited_to_stage; })
      .map(p => p.identity);
    setRaisedHands(raised);
  }, [participants]);

  const toggleMic = () => localParticipant.setMicrophoneEnabled(!micOn, { noiseSuppression: true, echoCancellation: true, autoGainControl: true });
  const toggleCam = () => localParticipant.setCameraEnabled(!camOn);
  const toggleShare = async () => {
    await localParticipant.setScreenShareEnabled(!shareOn);
    setShareOn(!shareOn);
  };

  const toggleWhiteboard = () => {
    const next = !showWhiteboard;
    setShowWhiteboard(next);
    sendChat?.(`__whiteboard_${next ? "open" : "close"}__`);
  };

  const inviteToStage = async (identity: string) => {
    setInviting(identity);
    try {
      await fetch("/api/invite_to_stage", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ identity }),
      });
    } finally { setInviting(null); }
  };

  const removeFromStage = async (identity: string) => {
    await fetch("/api/remove_from_stage", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ identity }),
    });
  };

  const kickParticipant = async (identity: string, displayName = identity) => {
    if (!confirm(`Exclure ${displayName} de la session ?`)) return;
    await fetch("/api/kick_participant", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ identity }),
    });
  };

  const startRecording = async (): Promise<string | null> => {
    const hasCamera = localParticipant.isCameraEnabled;
    const hasScreen = tracks.some(
      t => t.source === Track.Source.ScreenShare &&
           t.participant.identity === localParticipant.identity
    );
    const hasWhiteboard = showWhiteboard;

    if (!hasCamera && !hasScreen && !hasWhiteboard) {
      alert("Activez votre caméra, partagez votre écran ou ouvrez le tableau blanc avant de démarrer l'enregistrement.");
      return null;
    }

    // Étape 1 : Vérifier que le flux vidéo est réellement actif
    setRecordingWaiting(true);

    const checkSignalReady = (): Promise<boolean> => {
      return new Promise((resolve) => {
        let attempts = 0;
        const maxAttempts = 30;
        const check = () => {
          attempts++;
          const hasActiveTrack = tracks.some(t => {
            const isLocal = t.participant.identity === localParticipant.identity;
            const isVideo =
              t.source === Track.Source.Camera ||
              t.source === Track.Source.ScreenShare;
            return isLocal && isVideo && t.publication?.track && !t.publication.isMuted;
          });
          if (hasActiveTrack || hasWhiteboard) {
            resolve(true);
          } else if (attempts >= maxAttempts) {
            resolve(false);
          } else {
            setTimeout(check, 500);
          }
        };
        check();
      });
    };

    const signalReady = await checkSignalReady();
    if (!signalReady) {
      setRecordingWaiting(false);
      alert("Aucun flux vidéo détecté. Vérifiez que votre caméra ou partage d'écran fonctionne.");
      return null;
    }

    // Étape 2 : Lancer l'egress
    setRecordingLoading(true);
    try {
      const res = await fetch("/api/start_recording", {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) {
        const err = await res.text();
        alert(`Erreur démarrage enregistrement : ${err}`);
        setRecordingWaiting(false);
        return null;
      }
      const { egress_id } = await res.json();
      setEgressId(egress_id);

      // Étape 3 : Attendre que le webhook egress_started confirme PROCESSING
      const waitForEgressReady = (): Promise<boolean> => {
        return new Promise((resolve) => {
          let attempts = 0;
          const maxAttempts = 20;
          const poll = async () => {
            attempts++;
            try {
              const statusRes = await fetch(
                `/api/recording-status?egressId=${encodeURIComponent(egress_id)}`,
                { headers: { Authorization: `Bearer ${authToken}` } }
              );
              if (statusRes.ok) {
                const data = await statusRes.json();
                if (data.status === "PROCESSING") {
                  resolve(true);
                  return;
                }
              }
            } catch {}
            if (attempts >= maxAttempts) {
              resolve(true);
            } else {
              setTimeout(poll, 500);
            }
          };
          poll();
        });
      };

      await waitForEgressReady();

      // Étape 4 : Timer démarre — synchronisé avec le début réel
      setRecordingWaiting(false);
      setRecording(true);
      setRecordingStartTime(Date.now());
      return egress_id;
    } finally {
      setRecordingLoading(false);
    }
  };

  const stopRecording = async () => {
    if (!egressId) return;
    setRecordingLoading(true);
    try {
      await fetch("/api/stop_recording", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ egress_id: egressId }),
      });
      setEgressId(null);
      setRecording(false);
      setRecordingStartTime(null);
    } finally { setRecordingLoading(false); }
  };

  // Arrêter le streaming RTMP
  const stopStreaming = async () => {
    if (!streamingEgressId) return;
    try {
      await fetch("/api/stop-streaming", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ egress_id: streamingEgressId }),
      });
    } catch (e) {
      console.warn("[stopStreaming] error:", e);
    }
    setStreamingEgressId(null);
    setStreaming(false);
    setStreamingFailed(false);
  };

  const stopStream = async () => {
    if (!confirm("Arrêter le stream pour tout le monde ?")) return;
    // Arrêter l'enregistrement si actif
    if (recording) await stopRecording();
    // Arrêter le streaming RTMP si actif
    if (streaming) await stopStreaming();
    // Fermer la room
    await fetch("/api/stop_stream", {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
    });
    window.location.href = returnUrl;
  };

  // Callback quand le streaming échoue (détecté par le polling dans StreamingDialog)
  const handleStreamingFailed = (error: string) => {
    console.error("[streaming] failed:", error);
    setStreamingFailed(true);
    // On garde streaming=true pour que l'utilisateur puisse voir le dialog d'erreur
    // et arrêter proprement
  };

  const launchEmoji = (emoji: string) => {
    sendChat?.(`__emoji__${emoji}`);
    setShowEmojiPicker(false);
  };

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

  const copyLink = () => {
    navigator.clipboard.writeText(`${process.env.NEXT_PUBLIC_SITE_URL}/watch/${room.name}`);
  };

  const screenTrack = tracks.find(t => t.source === Track.Source.ScreenShare);
  const camTracks = tracks.filter(t => t.source === Track.Source.Camera);
  const localCamTrack = camTracks.find(t => t.participant.identity === localParticipant.identity);
  const ingressCamTrack = camTracks.find(t => t.participant.identity !== localParticipant.identity && t.participant.identity.includes("via OBS"));
  const stageParts = participants.filter(p => p.identity !== localParticipant.identity && getMeta(p).invited_to_stage);
  const stageCamTracks = camTracks.filter(t => stageParts.some(p => p.identity === t.participant.identity));
  const stageAudioTracks = tracks.filter(t => t.source === Track.Source.Microphone && t.participant.identity !== localParticipant.identity);

  const mainContent = showWhiteboard ? "whiteboard" : screenTrack ? "screen" : ingressCamTrack ? "ingress" : localCamTrack ? "cam" : "avatar";

  return (
    <div className="h-root">

      <div className="h-topbar">
        <div className="h-topbar-left">
          <div className="h-logo-wrap">
            <img src="/logo-unchk.png" alt="UN-CHK" className="h-logo-img" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
          </div>
          <button className="h-room-pill" onClick={copyLink} title="Copier le lien spectateur">
            <span>{room.name}</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
        </div>
        <div className="h-topbar-center">
          <div className="h-secure-badge">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Sécurisé
          </div>
        </div>
        <div className="h-topbar-right">
          <div className="h-connected">
            <span className="h-green-dot" />
            Connecté
          </div>
          <div className="h-count-pill">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            {participants.length}
          </div>
          <button
            className={`h-btn-rec${recording ? " active" : ""}`}
            onClick={recording ? stopRecording : startRecording}
            disabled={recordingLoading || recordingWaiting}
            title={!camOn && !shareOn && !showWhiteboard ? "Activez la caméra, partagez l'écran ou ouvrez le tableau avant d'enregistrer" : ""}
          >
            {recordingWaiting
              ? <><span className="h-rec-spinner" /> Préparation…</>
              : recordingLoading
                ? <span className="h-rec-spinner" />
                : recording
                  ? <><span className="h-rec-dot" />{recordingElapsed} ■</>
                  : <>⏺ Enreg.</>
            }
          </button>
          <button
            className={`h-btn-stream${streaming ? (streamingFailed ? " failed" : " active") : ""}`}
            onClick={() => setShowStreamingDialog(true)}
          >
            {streaming
              ? streamingFailed
                ? <><span className="h-rec-dot" style={{ background: "#ef4444", animation: "none" }} />Échoué</>
                : <><span className="h-rec-dot" style={{ background: "#22c55e" }} />En direct</>
              : <>📡 Diffuser</>
            }
          </button>
          <div className="h-host-badge">Hôte</div>
        </div>
      </div>

      {recording && (
        <div className="h-rec-banner">
          <span className="h-rec-indicator" />
          Enregistrement en cours
          <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "0.82rem", marginLeft: 4, color: "#f87171" }}>
            {recordingElapsed}
          </span>
        </div>
      )}

      {recordingWaiting && (
        <div className="h-rec-banner" style={{background:"rgba(59,130,246,.08)",borderBottomColor:"rgba(59,130,246,.2)",color:"#60a5fa"}}>
          <span className="h-rec-spinner" style={{marginRight:4}} />
          Vérification du signal vidéo et synchronisation de l&apos;enregistrement…
        </div>
      )}

      {streaming && streamingFailed && (
        <div className="h-rec-banner" style={{background:"rgba(239,68,68,.12)",borderBottomColor:"rgba(239,68,68,.3)",color:"#ef4444"}}>
          ⚠️ Le streaming RTMP a échoué — vérifiez vos paramètres de diffusion
          <button
            onClick={() => setShowStreamingDialog(true)}
            style={{ marginLeft: "auto", padding: "3px 10px", background: "rgba(239,68,68,.15)", border: "1px solid rgba(239,68,68,.4)", borderRadius: 6, color: "#ef4444", fontSize: "0.72rem", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}
          >
            Voir détails
          </button>
        </div>
      )}

      <div className="h-body" style={{ position: "relative" }}>
        <div className="h-stage">
          <div className="h-main-video">

            {mainContent === "whiteboard" && (
              <div style={{ position: "absolute", inset: 0, background: "white" }}>
                <Whiteboard readOnly={false} />
              </div>
            )}

            {mainContent === "screen" && (
              <VideoTrack trackRef={screenTrack!} className="h-video-el" />
            )}

            {mainContent === "ingress" && (
              <VideoTrack trackRef={ingressCamTrack!} className="h-video-el" />
            )}

            {mainContent === "cam" && (
              <VideoTrack trackRef={localCamTrack!} className="h-video-el" />
            )}

            {mainContent === "avatar" && (
              <div className="h-avatar-big">{(localParticipant.name || localParticipant.identity).charAt(0).toUpperCase()}</div>
            )}

            {mainContent !== "whiteboard" && (
              <div className="h-you-badge">Vous</div>
            )}

            {mainContent === "whiteboard" && (
              <div className="h-you-badge" style={{ background: "rgba(0,101,177,.85)" }}>
                🖊 Tableau blanc
              </div>
            )}

            {(mainContent === "screen" || mainContent === "whiteboard") && (
              <div className="h-pip-container">
                {localCamTrack && (
                  <div className="h-pip-tile">
                    <VideoTrack trackRef={localCamTrack} className="h-video-el" />
                    <div className="h-pip-name">Vous</div>
                  </div>
                )}
                {stageParts.map(p => {
                  const t = stageCamTracks.find(t => t.participant.identity === p.identity);
                  const displayName = p.name || p.identity;
                  return (
                    <div key={p.identity} className="h-pip-tile">
                      {t ? <VideoTrack trackRef={t} className="h-video-el" /> : <div className="h-avatar-pip">{displayName.charAt(0).toUpperCase()}</div>}
                      <div className="h-pip-name">{displayName}</div>
                      <button className="h-pip-rm" onClick={() => removeFromStage(p.identity)}>✕</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {mainContent !== "screen" && mainContent !== "whiteboard" && stageParts.length > 0 && (
            <div className="h-strip">
              {stageParts.map(p => {
                const t = stageCamTracks.find(t => t.participant.identity === p.identity);
                const displayName = p.name || p.identity;
                return (
                  <div key={p.identity} className="h-tile">
                    {t ? <VideoTrack trackRef={t} className="h-video-el" /> : <div className="h-avatar-sm">{displayName.charAt(0).toUpperCase()}</div>}
                    <div className="h-tile-name">{displayName}</div>
                    <button className="h-tile-rm" onClick={() => removeFromStage(p.identity)}>✕</button>
                  </div>
                );
              })}
            </div>
          )}

          {stageAudioTracks.map(t => <AudioTrack key={t.participant.identity} trackRef={t} />)}

          {raisedHands.length > 0 && (
            <div className="h-hands">
              {raisedHands.map(id => {
                const p = participants.find(p => p.identity === id);
                const displayName = p?.name ?? id;
                return (
                  <div key={id} className="h-hand-chip">
                    <span>🙋 {displayName}</span>
                    <button className="h-hand-ok" onClick={() => inviteToStage(id)} disabled={inviting === id}>
                      {inviting === id ? "..." : "Accepter"}
                    </button>
                    <button className="h-hand-no" onClick={() => removeFromStage(id)}>✕</button>
                  </div>
                );
              })}
            </div>
          )}

          <StartAudio label="Cliquez pour activer le son" className="h-start-audio" />

          {floatingEmojis.map(fe => (
            <div key={fe.id} className="h-floating-emoji" style={{left:`${fe.x}%`}}>{fe.emoji}</div>
          ))}
        </div>

        {panel && (
          <div className="h-panel">
            <div className="h-panel-hdr">
              <div className="h-panel-tabs">
                <button className={`h-tab${panel === "chat" ? " active" : ""}`} onClick={() => setPanel("chat")}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  Chat
                </button>
                <button className={`h-tab${panel === "participants" ? " active" : ""}`} onClick={() => setPanel("participants")}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  Membres
                  {raisedHands.length > 0 && <span className="h-badge">{raisedHands.length}</span>}
                </button>
              </div>
              <button className="h-panel-close" onClick={() => setPanel(null)}>✕</button>
            </div>

            <div style={{ display: panel === "chat" ? "contents" : "none" }}>
              <Chat />
            </div>

            {panel === "participants" && (
              <div className="h-plist">
                <div className="h-plist-count">{participants.length} PARTICIPANT{participants.length > 1 ? "S" : ""}</div>
                {participants.map(p => {
                  const meta = getMeta(p);
                  const isHost = p.identity === localParticipant.identity;
                  return (
                    <div key={p.identity} className="h-prow">
                      <div className="h-pavatar">{(p.name || p.identity).charAt(0).toUpperCase()}</div>
                      <div className="h-pinfo">
                        <div className="h-pname">
                          {p.name || p.identity}
                          {isHost && <span className="h-ptag">Vous</span>}
                        </div>
                        <div className="h-pstatus">
                          {meta.hand_raised && !meta.invited_to_stage && <span className="h-phand">🙋 Main levée</span>}
                          {meta.invited_to_stage && <span className="h-pstage">🎤 Sur scène</span>}
                        </div>
                      </div>
                      {!isHost && !meta.invited_to_stage && (
                        <button className="h-pinvite" onClick={() => inviteToStage(p.identity)} disabled={inviting === p.identity}>
                          {inviting === p.identity ? "..." : "Inviter"}
                        </button>
                      )}
                      {!isHost && meta.invited_to_stage && (
                        <button className="h-premove" onClick={() => removeFromStage(p.identity)}>Retirer</button>
                      )}
                      {!isHost && (
                        <button className="h-pkick" onClick={() => kickParticipant(p.identity, p.name || p.identity)}>Exclure</button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="h-controls">
        <div className="h-ctrl-left">
          <div className="h-room-info">
            <img src="/logo-unchk.png" alt="" className="h-ctrl-logo" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
            <span className="h-ctrl-room">{room.name}</span>
            <span className="h-ctrl-sep">·</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <span className="h-ctrl-count">{participants.length}</span>
          </div>
        </div>

        <div className="h-ctrl-center">
          <div className="h-ctrl-btn-wrap">
            <button className={`h-ctrl-btn${!micOn ? " off" : ""}`} onClick={toggleMic}>
              {micOn ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              )}
            </button>
            <span className="h-ctrl-label">Micro</span>
          </div>

          <div className="h-ctrl-btn-wrap">
            <button className={`h-ctrl-btn${!camOn ? " off" : ""}`} onClick={toggleCam}>
              {camOn ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h2a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56"/></svg>
              )}
            </button>
            <span className="h-ctrl-label">Caméra</span>
          </div>

          <div className="h-ctrl-btn-wrap">
            <button className={`h-ctrl-btn${shareOn ? " active" : ""}`} onClick={toggleShare}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><polyline points="8 21 12 17 16 21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            </button>
            <span className="h-ctrl-label">Écran</span>
          </div>

          <div className="h-ctrl-btn-wrap">
            <button className={`h-ctrl-btn${showWhiteboard ? " active" : ""}`} onClick={toggleWhiteboard}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9l6 6M15 9l-6 6"/></svg>
            </button>
            <span className="h-ctrl-label">Tableau</span>
          </div>

          <div className="h-ctrl-btn-wrap">
            <button className={`h-ctrl-btn${showEmojiPicker ? " active" : ""}`} onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
            </button>
            <span className="h-ctrl-label">Réagir</span>
          </div>

          <div className="h-ctrl-btn-wrap">
            <button className="h-ctrl-btn quit" onClick={stopStream}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.25 1.01l-2.2 2.2z" transform="rotate(135 12 12)"/></svg>
            </button>
            <span className="h-ctrl-label">Quitter</span>
          </div>

          <div className="h-ctrl-btn-wrap">
            <button className={`h-ctrl-btn${panel === "chat" ? " active" : ""}`} onClick={() => setPanel(panel === "chat" ? null : "chat")}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </button>
            <span className="h-ctrl-label">Chat</span>
          </div>

          <div className="h-ctrl-btn-wrap" style={{position:"relative"}}>
            <button className={`h-ctrl-btn${panel === "participants" ? " active" : ""}`} onClick={() => setPanel(panel === "participants" ? null : "participants")}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              {raisedHands.length > 0 && <span className="h-badge-ctrl">{raisedHands.length}</span>}
            </button>
            <span className="h-ctrl-label">Membres</span>
          </div>
        </div>

        <div className="h-ctrl-right" />
      </div>

      {showEmojiPicker && (
        <div className="h-emoji-picker">
          {["👍","👏","❤️","😂","😮","🎉","🙌","🔥","💯","👋"].map(e => (
            <button key={e} className="h-emoji-btn" onClick={() => launchEmoji(e)}>{e}</button>
          ))}
        </div>
      )}

      {showStreamingDialog && (
        <StreamingDialog
          authToken={authToken}
          onStreamingStart={(id) => { setStreamingEgressId(id); setStreaming(true); setStreamingFailed(false); }}
          onStreamingStop={() => { setStreamingEgressId(null); setStreaming(false); setStreamingFailed(false); }}
          onStreamingFailed={handleStreamingFailed}
          onRecordingStart={startRecording}
          isStreaming={streaming}
          streamingEgressId={streamingEgressId}
          onClose={() => setShowStreamingDialog(false)}
        />
      )}

      <style>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        .h-root{display:flex;flex-direction:column;height:100dvh;background:#0d1117;color:#e2e8f0;font-family:'Nunito','Segoe UI',system-ui,sans-serif;}
        .h-topbar{display:flex;align-items:center;justify-content:space-between;padding:0 20px;background:#0d1117;border-bottom:1px solid #1e2d3d;flex-shrink:0;height:52px;}
        .h-topbar-left{display:flex;align-items:center;gap:10px;}
        .h-topbar-center{display:flex;align-items:center;}
        .h-topbar-right{display:flex;align-items:center;gap:10px;}
        .h-logo-wrap{display:flex;align-items:center;gap:8px;}
        .h-logo-img{height:28px;width:auto;object-fit:contain;}
        .h-room-pill{display:flex;align-items:center;gap:6px;background:#1e2d3d;border:1px solid #2d3f52;border-radius:8px;padding:5px 12px;font-size:0.82rem;color:#94a3b8;cursor:pointer;font-family:inherit;transition:background .2s;}
        .h-room-pill:hover{background:#243447;color:#e2e8f0;}
        .h-secure-badge{display:flex;align-items:center;gap:5px;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);border-radius:20px;padding:4px 12px;font-size:0.75rem;font-weight:600;color:#22c55e;}
        .h-connected{display:flex;align-items:center;gap:6px;font-size:0.78rem;color:#94a3b8;}
        .h-green-dot{width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 6px #22c55e;}
        .h-count-pill{display:flex;align-items:center;gap:5px;background:#1e2d3d;border-radius:8px;padding:4px 10px;font-size:0.8rem;color:#94a3b8;}
        .h-btn-rec{display:flex;align-items:center;gap:5px;padding:5px 12px;background:#1e2d3d;color:#e2e8f0;border:1px solid #2d3f52;border-radius:7px;font-size:0.78rem;font-weight:500;cursor:pointer;font-family:inherit;transition:background .2s;}
        .h-btn-rec:hover:not(:disabled){background:#243447;}
        .h-btn-rec.active{background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.4);color:#ef4444;}
        .h-btn-rec:disabled{opacity:.5;cursor:not-allowed;}
        .h-btn-stream{display:flex;align-items:center;gap:5px;padding:5px 12px;background:#1e2d3d;color:#e2e8f0;border:1px solid #2d3f52;border-radius:7px;font-size:0.78rem;font-weight:500;cursor:pointer;font-family:inherit;transition:background .2s;}
        .h-btn-stream:hover{background:#243447;}
        .h-btn-stream.active{background:rgba(34,197,94,.12);border-color:rgba(34,197,94,.3);color:#22c55e;}
        .h-btn-stream.failed{background:rgba(239,68,68,.12);border-color:rgba(239,68,68,.3);color:#ef4444;}
        .h-host-badge{background:#3b82f6;color:white;padding:4px 12px;border-radius:7px;font-size:0.78rem;font-weight:600;}
        .h-rec-dot{width:7px;height:7px;border-radius:50%;background:#ef4444;animation:pulse 1s ease-in-out infinite;flex-shrink:0;}
        .h-rec-spinner{width:13px;height:13px;border:2px solid rgba(255,255,255,.3);border-top-color:white;border-radius:50%;animation:spin .7s linear infinite;}
        .h-rec-banner{background:rgba(239,68,68,.08);border-bottom:1px solid rgba(239,68,68,.2);padding:5px 20px;font-size:0.75rem;color:#ef4444;display:flex;align-items:center;gap:8px;flex-shrink:0;}
        .h-rec-indicator{width:7px;height:7px;border-radius:50%;background:#ef4444;animation:pulse 1s ease-in-out infinite;flex-shrink:0;}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .h-body{display:flex;flex:1;overflow:hidden;position:relative;}
        .h-stage{flex:1;display:flex;flex-direction:column;overflow:hidden;position:relative;}
        .h-main-video{flex:1;background:#070d14;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;}
        .h-video-el{width:100%;height:100%;object-fit:contain;}
        .h-avatar-big{width:96px;height:96px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#1d4ed8);display:flex;align-items:center;justify-content:center;font-size:2.5rem;font-weight:700;color:white;box-shadow:0 0 40px rgba(59,130,246,.3);}
        .h-you-badge{position:absolute;top:12px;left:12px;background:rgba(59,130,246,.9);color:white;padding:3px 10px;border-radius:5px;font-size:0.72rem;font-weight:600;z-index:10;}
        .h-pip-container{position:absolute;bottom:16px;right:16px;display:flex;flex-direction:column;gap:8px;z-index:10;}
        .h-pip-tile{width:160px;height:100px;border-radius:8px;overflow:hidden;background:#1e2d3d;position:relative;border:2px solid #3b82f6;box-shadow:0 4px 16px rgba(0,0,0,.5);}
        .h-pip-name{position:absolute;bottom:4px;left:6px;font-size:0.65rem;color:white;background:rgba(0,0,0,.7);padding:2px 6px;border-radius:3px;}
        .h-pip-rm{position:absolute;top:4px;right:4px;width:18px;height:18px;border-radius:50%;background:rgba(239,68,68,.9);border:none;color:white;font-size:0.6rem;cursor:pointer;}
        .h-avatar-pip{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:1.6rem;font-weight:700;color:white;background:linear-gradient(135deg,#3b82f6,#1d4ed8);}
        .h-strip{display:flex;gap:8px;padding:8px;background:#0d1117;border-top:1px solid #1e2d3d;overflow-x:auto;flex-shrink:0;}
        .h-tile{width:150px;height:94px;border-radius:8px;background:#1e2d3d;position:relative;flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;border:1px solid #2d3f52;}
        .h-avatar-sm{width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#1d4ed8);display:flex;align-items:center;justify-content:center;font-size:1.2rem;font-weight:700;color:white;}
        .h-tile-name{position:absolute;bottom:4px;left:6px;font-size:0.68rem;color:#94a3b8;background:rgba(13,17,23,.8);padding:2px 6px;border-radius:3px;}
        .h-tile-rm{position:absolute;top:4px;right:4px;width:20px;height:20px;border-radius:50%;background:rgba(239,68,68,.8);border:none;color:white;font-size:0.65rem;cursor:pointer;}
        .h-hands{position:absolute;top:12px;left:12px;display:flex;flex-direction:column;gap:8px;z-index:10;max-width:280px;}
        .h-hand-chip{display:flex;align-items:center;gap:8px;background:rgba(13,17,23,.92);border:1px solid rgba(251,191,36,.4);border-radius:8px;padding:8px 12px;font-size:0.8rem;backdrop-filter:blur(8px);}
        .h-hand-chip span{flex:1;color:#fbbf24;font-weight:500;}
        .h-hand-ok{padding:4px 10px;background:#22c55e;color:white;border:none;border-radius:5px;font-size:0.75rem;cursor:pointer;font-family:inherit;}
        .h-hand-no{width:20px;height:20px;background:#ef4444;color:white;border:none;border-radius:50%;font-size:0.65rem;cursor:pointer;}
        .h-start-audio{position:absolute;inset:0;background:rgba(7,13,20,.85);color:white;border:none;font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);}
        .h-floating-emoji{position:absolute;bottom:10%;font-size:3rem;z-index:50;pointer-events:none;animation:floatUp 3s ease-out forwards;}
        @keyframes floatUp{0%{opacity:1;transform:translateY(0) scale(1)}50%{opacity:1;transform:translateY(-40vh) scale(1.3)}100%{opacity:0;transform:translateY(-80vh) scale(0.8)}}
        .h-panel{width:320px;flex-shrink:0;background:#111827;border-left:1px solid #1e2d3d;display:flex;flex-direction:column;}
        .h-panel-hdr{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #1e2d3d;flex-shrink:0;}
        .h-panel-tabs{display:flex;gap:4px;}
        .h-tab{display:flex;align-items:center;gap:6px;padding:6px 12px;background:none;border:none;color:#64748b;font-size:0.82rem;font-weight:500;cursor:pointer;font-family:inherit;border-radius:7px;transition:background .15s,color .15s;position:relative;}
        .h-tab.active{background:#1e2d3d;color:#e2e8f0;}
        .h-tab:hover:not(.active){background:#1a2535;color:#94a3b8;}
        .h-badge{background:#ef4444;color:white;border-radius:10px;padding:1px 5px;font-size:0.6rem;font-weight:700;margin-left:2px;}
        .h-panel-close{width:28px;height:28px;background:none;border:none;color:#64748b;cursor:pointer;border-radius:6px;font-size:1rem;}
        .h-panel-close:hover{background:#1e2d3d;color:#e2e8f0;}
        .h-plist{flex:1;overflow-y:auto;padding:12px;}
        .h-plist-count{font-size:0.72rem;font-weight:700;color:#475569;letter-spacing:.05em;padding:0 8px 10px;text-transform:uppercase;}
        .h-prow{display:flex;align-items:center;gap:8px;padding:8px;border-radius:8px;transition:background .15s;}
        .h-prow:hover{background:#1e2d3d;}
        .h-pavatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#1d4ed8);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.88rem;flex-shrink:0;color:white;}
        .h-pinfo{flex:1;min-width:0;}
        .h-pname{font-size:0.85rem;font-weight:500;display:flex;align-items:center;gap:6px;color:#e2e8f0;}
        .h-ptag{font-size:0.65rem;background:rgba(59,130,246,.2);color:#60a5fa;padding:1px 6px;border-radius:4px;font-weight:600;}
        .h-pstatus{font-size:0.72rem;color:#64748b;margin-top:2px;}
        .h-phand{color:#fbbf24;} .h-pstage{color:#22c55e;}
        .h-pinvite{padding:4px 10px;background:rgba(59,130,246,.12);color:#60a5fa;border:1px solid rgba(59,130,246,.3);border-radius:5px;font-size:0.72rem;cursor:pointer;font-family:inherit;transition:background .15s;}
        .h-pinvite:hover:not(:disabled){background:#3b82f6;color:white;border-color:#3b82f6;}
        .h-pinvite:disabled{opacity:.4;cursor:not-allowed;}
        .h-premove{padding:4px 10px;background:rgba(239,68,68,.1);color:#f87171;border:1px solid rgba(239,68,68,.25);border-radius:5px;font-size:0.72rem;cursor:pointer;font-family:inherit;transition:background .15s;}
        .h-premove:hover{background:#ef4444;color:white;border-color:#ef4444;}
        .h-pkick{padding:4px 10px;background:rgba(239,68,68,.18);color:#f87171;border:1px solid rgba(239,68,68,.4);border-radius:5px;font-size:0.72rem;cursor:pointer;font-family:inherit;transition:background .15s;margin-left:2px;}
        .h-pkick:hover{background:#ef4444;color:white;border-color:#ef4444;}
        .h-controls{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 24px;background:#0d1117;border-top:1px solid #1e2d3d;flex-shrink:0;height:88px;}
        .h-ctrl-left{display:flex;align-items:center;}
        .h-room-info{display:flex;align-items:center;gap:6px;font-size:0.78rem;color:#64748b;}
        .h-ctrl-logo{height:22px;width:auto;object-fit:contain;}
        .h-ctrl-room{color:#94a3b8;font-weight:500;}
        .h-ctrl-sep{color:#334155;}
        .h-ctrl-count{color:#94a3b8;}
        .h-ctrl-center{display:flex;align-items:center;gap:6px;}
        .h-ctrl-right{}
        .h-ctrl-btn-wrap{display:flex;flex-direction:column;align-items:center;gap:4px;}
        .h-ctrl-label{font-size:0.65rem;color:#64748b;font-weight:500;white-space:nowrap;}
        .h-ctrl-btn{width:48px;height:48px;border-radius:12px;background:#1e2d3d;border:1px solid #2d3f52;color:#e2e8f0;cursor:pointer;transition:background .2s,border-color .2s;display:flex;align-items:center;justify-content:center;position:relative;}
        .h-ctrl-btn:hover{background:#243447;border-color:#3d5068;}
        .h-ctrl-btn.off{background:rgba(239,68,68,.12);border-color:rgba(239,68,68,.3);color:#ef4444;}
        .h-ctrl-btn.off:hover{background:rgba(239,68,68,.2);}
        .h-ctrl-btn.active{background:rgba(59,130,246,.15);border-color:rgba(59,130,246,.4);color:#60a5fa;}
        .h-ctrl-btn.quit{background:#ef4444;border-color:#ef4444;color:white;width:56px;border-radius:14px;}
        .h-ctrl-btn.quit:hover{background:#dc2626;border-color:#dc2626;}
        .h-badge-ctrl{position:absolute;top:-4px;right:-4px;background:#ef4444;color:white;border-radius:10px;padding:1px 4px;font-size:0.6rem;font-weight:700;}
        .h-emoji-picker{position:absolute;bottom:96px;left:50%;transform:translateX(-50%);background:#111827;border:1px solid #1e2d3d;border-radius:14px;padding:12px 16px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center;max-width:300px;box-shadow:0 8px 32px rgba(0,0,0,.6);z-index:200;}
        .h-emoji-btn{width:44px;height:44px;background:none;border:none;font-size:1.6rem;cursor:pointer;border-radius:10px;transition:background .15s;}
        .h-emoji-btn:hover{background:#1e2d3d;}
      `}</style>
    </div>
  );
}
