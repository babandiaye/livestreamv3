"use client";

import { useState, useEffect, useRef } from "react";

interface Props {
  authToken: string;
  onStreamingStart: (egressId: string) => void;
  onStreamingStop: () => void;
  onStreamingFailed?: (error: string) => void;
  onRecordingStart?: () => Promise<string | null>;
  isStreaming: boolean;
  streamingEgressId: string | null;
  onClose: () => void;
}

interface Destination {
  id: string;
  label: string;
  icon: string;
  enabled: boolean;
  urlFixed?: string;
  urlLabel?: string;
  url: string;
  key: string;
  keyHint: string;
  urlEditable: boolean;
}

const DEFAULT_DESTINATIONS: Destination[] = [
  {
    id: "youtube",
    label: "YouTube",
    icon: "▶",
    enabled: false,
    urlFixed: "rtmp://a.rtmp.youtube.com/live2",
    url: "rtmp://a.rtmp.youtube.com/live2",
    key: "",
    keyHint: "YouTube Studio → Diffusion en direct → Copier la clé de stream",
    urlEditable: false,
  },
  {
    id: "sunutube",
    label: "Sunu-Tube UN-CHK",
    icon: "📺",
    enabled: false,
    urlFixed: "rtmp://sunu-tube.unchk.sn:1935/live",
    url: "rtmp://sunu-tube.unchk.sn:1935/live",
    key: "",
    keyHint: "Clé disponible dans votre compte Sunu-Tube UN-CHK",
    urlEditable: false,
  },
  {
    id: "custom",
    label: "RTMP Personnalisé",
    icon: "⚙",
    enabled: false,
    url: "",
    key: "",
    keyHint: "Clé de stream de votre serveur RTMP",
    urlEditable: true,
  },
];

function validateRtmpUrl(url: string): string | null {
  if (!url.trim()) return "L'URL du serveur est requise";
  if (!url.startsWith("rtmp://") && !url.startsWith("rtmps://")) {
    return "L'URL doit commencer par rtmp:// ou rtmps://";
  }
  if (url.trim().length < 12) return "URL trop courte";
  return null;
}

function validateStreamKey(key: string): string | null {
  if (!key.trim()) return "La clé de stream est requise";
  if (key.trim().length < 4) return "Clé de stream trop courte";
  return null;
}

export default function StreamingDialog({
  authToken,
  onStreamingStart,
  onStreamingStop,
  onStreamingFailed,
  onRecordingStart,
  isStreaming,
  streamingEgressId,
  onClose,
}: Props) {
  const [destinations, setDestinations] = useState<Destination[]>(DEFAULT_DESTINATIONS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [streamStatus, setStreamStatus] = useState<"live" | "checking" | "failed" | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [keyVisible, setKeyVisible] = useState<Record<string, boolean>>({});

  // Polling du statut de l'egress streaming pour détecter les échecs
  useEffect(() => {
    if (!isStreaming || !streamingEgressId) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      setStreamStatus(null);
      return;
    }

    setStreamStatus("checking");
    let failCount = 0;

    const checkStatus = async () => {
      try {
        const res = await fetch(
          `/api/streaming-status?egressId=${encodeURIComponent(streamingEgressId)}`,
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        if (!res.ok) return;
        const data = await res.json();

        if (data.active) {
          setStreamStatus("live");
          failCount = 0;
        } else if (data.failed) {
          setStreamStatus("failed");
          setError(data.error || "Le streaming a échoué — vérifiez votre URL et clé RTMP");
          onStreamingFailed?.(data.error || "Streaming échoué");
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        } else if (data.status === "NOT_FOUND") {
          failCount++;
          if (failCount >= 3) {
            setStreamStatus("failed");
            setError("Le streaming semble avoir échoué — l'egress n'est plus actif");
            onStreamingFailed?.("Egress introuvable");
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
          }
        }
      } catch {
        // Erreur réseau — on continue de poller
      }
    };

    // Vérifier immédiatement puis toutes les 8 secondes
    checkStatus();
    pollRef.current = setInterval(checkStatus, 8000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isStreaming, streamingEgressId, authToken, onStreamingFailed]);

  const update = (id: string, field: keyof Destination, value: string | boolean) => {
    setDestinations(prev =>
      prev.map(d => d.id === id ? { ...d, [field]: value } : d)
    );
    if (field === "url" || field === "key") {
      setValidationErrors(prev => {
        const next = { ...prev };
        delete next[`${id}-${field}`];
        return next;
      });
    }
  };

  const activeDestinations = destinations.filter(d => d.enabled);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    for (const dest of activeDestinations) {
      const url = dest.urlFixed || dest.url;
      const urlErr = validateRtmpUrl(url);
      if (urlErr) errors[`${dest.id}-url`] = urlErr;

      const keyErr = validateStreamKey(dest.key);
      if (keyErr) errors[`${dest.id}-key`] = keyErr;
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const canStart = activeDestinations.length > 0 &&
    activeDestinations.every(d => d.key.trim() && (d.urlFixed || d.url.trim()));

  const handleStart = async () => {
    if (!validate()) return;

    setLoading(true);
    setError("");
    setStreamStatus(null);
    try {
      const payload = activeDestinations.map(d => ({
        url: d.urlFixed || d.url.trim(),
        key: d.key.trim(),
      }));

      const res = await fetch("/api/start-streaming", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ destinations: payload }),
      });

      if (!res.ok) {
        const errText = await res.text();
        setError(errText || "Erreur lors du démarrage du streaming");
        return;
      }
      const { egress_id } = await res.json();
      onStreamingStart(egress_id);
      if (onRecordingStart) {
        console.log("[streaming-dialog] Démarrage enregistrement...");
        const recId = await onRecordingStart();
        console.log("[streaming-dialog] Enregistrement démarré:", recId);
      }
      onClose();
    } catch {
      setError("Erreur réseau — vérifiez votre connexion");
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    if (!streamingEgressId) return;
    setLoading(true);
    try {
      await fetch("/api/stop-streaming", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ egress_id: streamingEgressId }),
      });
      onStreamingStop();
      onClose();
    } catch {
      setError("Erreur lors de l'arrêt");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sd-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sd-modal">
        {/* Header */}
        <div className="sd-header">
          <div className="sd-header-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.95 11 19.79 19.79 0 01.88 2.38 2 2 0 012.86.18h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" stroke="#1a73e8" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <h2 className="sd-title">
              {isStreaming ? "Streaming en cours" : "Configurer le streaming multi-plateformes"}
            </h2>
            <p className="sd-desc">
              {isStreaming
                ? "Votre stream est diffusé en direct sur les plateformes configurées"
                : "Configurez vos destinations de streaming"}
            </p>
          </div>
          <button className="sd-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="#5f6368" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="sd-body">
          {isStreaming ? (
            <div className={`sd-live-info ${streamStatus === "failed" ? "sd-live-info--failed" : ""}`}>
              {streamStatus === "failed" ? (
                <>
                  <div className="sd-live-badge sd-live-badge--failed">
                    <span className="sd-live-dot sd-live-dot--failed" />
                    STREAMING ÉCHOUÉ
                  </div>
                  <p className="sd-live-desc" style={{ color: "#fca5a5" }}>
                    La connexion RTMP a échoué. Vérifiez que votre URL et clé de stream sont correctes,
                    et que le serveur de destination (YouTube, Sunu-Tube) est accessible.
                  </p>
                </>
              ) : streamStatus === "checking" ? (
                <>
                  <div className="sd-live-badge sd-live-badge--checking">
                    <span className="sd-checking-spinner" />
                    VÉRIFICATION DU STREAM…
                  </div>
                  <p className="sd-live-desc">
                    Connexion en cours vers les plateformes de diffusion. Cette vérification peut prendre quelques secondes.
                  </p>
                </>
              ) : (
                <>
                  <div className="sd-live-badge">
                    <span className="sd-live-dot" />
                    STREAMING EN DIRECT
                  </div>
                  <p className="sd-live-desc">
                    Votre session est actuellement diffusée sur {activeDestinations.length > 0
                      ? activeDestinations.map(d => d.label).join(", ")
                      : "les plateformes configurées"}.
                  </p>
                </>
              )}
              <p className="sd-live-warn">
                {streamStatus === "failed"
                  ? "Vous pouvez arrêter le streaming et réessayer avec les bons paramètres."
                  : "Arrêter le streaming mettra fin à la diffusion sur toutes les plateformes."}
              </p>
            </div>
          ) : (
            destinations.map(dest => (
              <div key={dest.id} className={`sd-dest ${dest.enabled ? "active" : ""}`}>
                {/* Toggle header */}
                <div className="sd-dest-header" onClick={() => update(dest.id, "enabled", !dest.enabled)}>
                  <div className="sd-dest-left">
                    <span className="sd-dest-icon">{dest.icon}</span>
                    <span className="sd-dest-label">{dest.label}</span>
                  </div>
                  <div className={`sd-toggle ${dest.enabled ? "on" : ""}`}>
                    <div className="sd-toggle-thumb" />
                  </div>
                </div>

                {/* Fields */}
                {dest.enabled && (
                  <div className="sd-dest-fields">
                    {dest.urlEditable && (
                      <div className="sd-field">
                        <label className="sd-label">URL du serveur RTMP</label>
                        <input
                          className={`sd-input ${validationErrors[`${dest.id}-url`] ? "sd-input--error" : ""}`}
                          type="text"
                          placeholder="rtmp://votre-serveur/live"
                          value={dest.url}
                          onChange={e => update(dest.id, "url", e.target.value)}
                        />
                        {validationErrors[`${dest.id}-url`] && (
                          <p className="sd-field-error">{validationErrors[`${dest.id}-url`]}</p>
                        )}
                      </div>
                    )}
                    {!dest.urlEditable && (
                      <div className="sd-field">
                        <label className="sd-label">URL du serveur RTMP</label>
                        <input className="sd-input sd-input--ro" readOnly value={dest.urlFixed} />
                      </div>
                    )}
                    <div className="sd-field">
                      <label className="sd-label">Clé de stream</label>
                      <div className="sd-input-wrap">
                        <input
                          className={`sd-input sd-input--key ${validationErrors[`${dest.id}-key`] ? "sd-input--error" : ""}`}
                          type={keyVisible[dest.id] ? "text" : "password"}
                          placeholder="xxxx-xxxx-xxxx-xxxx"
                          value={dest.key}
                          onChange={e => update(dest.id, "key", e.target.value)}
                        />
                        <button
                          type="button"
                          className="sd-eye-btn"
                          onClick={() => setKeyVisible(prev => ({ ...prev, [dest.id]: !prev[dest.id] }))}
                          title={keyVisible[dest.id] ? "Masquer la clé" : "Afficher la clé"}
                        >
                          {keyVisible[dest.id] ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                          )}
                        </button>
                      </div>
                      {validationErrors[`${dest.id}-key`] && (
                        <p className="sd-field-error">{validationErrors[`${dest.id}-key`]}</p>
                      )}
                      <p className="sd-hint">{dest.keyHint}</p>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}

          {!isStreaming && activeDestinations.length === 0 && (
            <p className="sd-warn">Activez et configurez au moins une destination pour démarrer le streaming</p>
          )}

          {error && <p className="sd-error">⚠️ {error}</p>}
        </div>

        {/* Footer */}
        <div className="sd-footer">
          <button className="sd-btn-cancel" onClick={onClose} disabled={loading}>
            {isStreaming ? "Fermer" : "Annuler"}
          </button>
          {isStreaming ? (
            <button className="sd-btn-stop" onClick={handleStop} disabled={loading}>
              {loading ? <span className="sd-spinner" /> : "⏹ Arrêter le streaming"}
            </button>
          ) : (
            <button className="sd-btn-start" onClick={handleStart} disabled={loading || !canStart}>
              {loading ? <span className="sd-spinner" /> : "▶ Démarrer le streaming"}
            </button>
          )}
        </div>
      </div>

      <style>{`
        .sd-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:200;animation:fadeIn .15s ease;}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        .sd-modal{background:#202124;border-radius:16px;width:100%;max-width:540px;max-height:90vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.5);animation:slideUp .2s ease;color:#e8eaed;}
        @keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
        .sd-header{display:flex;align-items:flex-start;gap:14px;padding:24px 24px 0;position:relative;}
        .sd-header-icon{width:44px;height:44px;border-radius:10px;background:#1a3a6a;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .sd-title{font-size:1.05rem;font-weight:600;color:#e8eaed;line-height:1.3;}
        .sd-desc{font-size:0.82rem;color:#9aa0a6;margin-top:2px;}
        .sd-close{position:absolute;right:20px;top:20px;width:32px;height:32px;border-radius:50%;border:none;background:transparent;display:flex;align-items:center;justify-content:center;cursor:pointer;}
        .sd-close:hover{background:#3c4043;}
        .sd-body{padding:20px 24px;display:flex;flex-direction:column;gap:12px;}
        .sd-dest{border:1.5px solid #3c4043;border-radius:12px;overflow:hidden;transition:border-color .2s;}
        .sd-dest.active{border-color:#1a73e8;}
        .sd-dest-header{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;cursor:pointer;transition:background .15s;}
        .sd-dest-header:hover{background:#2a2b2e;}
        .sd-dest-left{display:flex;align-items:center;gap:10px;}
        .sd-dest-icon{font-size:1.2rem;width:28px;text-align:center;}
        .sd-dest-label{font-size:0.92rem;font-weight:500;color:#e8eaed;}
        .sd-toggle{width:44px;height:24px;border-radius:12px;background:#5f6368;position:relative;flex-shrink:0;transition:background .2s;}
        .sd-toggle.on{background:#1a73e8;}
        .sd-toggle-thumb{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:white;transition:transform .2s;box-shadow:0 1px 3px rgba(0,0,0,.3);}
        .sd-toggle.on .sd-toggle-thumb{transform:translateX(20px);}
        .sd-dest-fields{padding:0 16px 16px;display:flex;flex-direction:column;gap:12px;border-top:1px solid #3c4043;}
        .sd-field{display:flex;flex-direction:column;gap:5px;padding-top:12px;}
        .sd-label{font-size:0.82rem;font-weight:500;color:#9aa0a6;}
        .sd-input{padding:10px 13px;border:1.5px solid #3c4043;border-radius:8px;background:#2a2b2e;color:#e8eaed;font-size:0.88rem;outline:none;transition:border-color .2s;font-family:inherit;width:100%;}
        .sd-input:focus{border-color:#1a73e8;}
        .sd-input--ro{color:#9aa0a6;font-family:monospace;font-size:0.8rem;background:#1a1b1e;}
        .sd-input--error{border-color:#ef4444 !important;}
        .sd-input--key{padding-right:42px;}
        .sd-input-wrap{position:relative;display:flex;align-items:center;}
        .sd-eye-btn{position:absolute;right:10px;background:none;border:none;cursor:pointer;color:#5f6368;display:flex;align-items:center;justify-content:center;padding:4px;border-radius:4px;transition:color .15s;}
        .sd-eye-btn:hover{color:#e8eaed;}
        .sd-field-error{font-size:0.75rem;color:#ef4444;margin-top:2px;}
        .sd-hint{font-size:0.75rem;color:#5f6368;}
        .sd-warn{font-size:0.82rem;color:#9aa0a6;text-align:center;padding:8px;background:#2a2b2e;border-radius:8px;}
        .sd-error{color:#ef4444;font-size:0.82rem;background:#3c1212;padding:10px 14px;border-radius:6px;}
        .sd-live-info{display:flex;flex-direction:column;gap:12px;padding:16px;background:#1a2a1a;border:1.5px solid #34a853;border-radius:10px;}
        .sd-live-info--failed{background:#2a1a1a;border-color:#ef4444;}
        .sd-live-badge{display:flex;align-items:center;gap:8px;font-size:0.78rem;font-weight:700;color:#34a853;}
        .sd-live-badge--failed{color:#ef4444;}
        .sd-live-badge--checking{color:#f59e0b;}
        .sd-live-dot{width:8px;height:8px;border-radius:50%;background:#34a853;animation:pulse 1.2s ease-in-out infinite;flex-shrink:0;}
        .sd-live-dot--failed{background:#ef4444;animation:none;}
        .sd-checking-spinner{width:14px;height:14px;border:2px solid rgba(245,158,11,.3);border-top-color:#f59e0b;border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0;}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        .sd-live-desc{font-size:0.88rem;color:#e8eaed;line-height:1.5;}
        .sd-live-warn{font-size:0.78rem;color:#9aa0a6;}
        .sd-footer{padding:16px 24px;display:flex;justify-content:flex-end;gap:12px;border-top:1px solid #3c4043;}
        .sd-btn-cancel{padding:10px 20px;border:1.5px solid #3c4043;border-radius:8px;background:transparent;color:#9aa0a6;font-size:0.9rem;font-weight:500;cursor:pointer;font-family:inherit;}
        .sd-btn-cancel:hover:not(:disabled){background:#3c4043;}
        .sd-btn-start{display:flex;align-items:center;gap:8px;padding:10px 22px;background:#1a73e8;color:white;border:none;border-radius:8px;font-size:0.9rem;font-weight:500;cursor:pointer;font-family:inherit;}
        .sd-btn-start:hover:not(:disabled){background:#1557b0;}
        .sd-btn-start:disabled{opacity:.4;cursor:not-allowed;}
        .sd-btn-stop{display:flex;align-items:center;gap:8px;padding:10px 22px;background:#ea4335;color:white;border:none;border-radius:8px;font-size:0.9rem;font-weight:500;cursor:pointer;font-family:inherit;}
        .sd-btn-stop:hover:not(:disabled){background:#c5221f;}
        .sd-spinner{width:16px;height:16px;border:2px solid rgba(255,255,255,.3);border-top-color:white;border-radius:50%;animation:spin .7s linear infinite;}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>
    </div>
  );
}
