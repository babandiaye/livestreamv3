"use client";

import { useState } from "react";

interface Props {
  onClose: () => void;
}

type Step = "config" | "params";
type IngressType = "rtmp" | "whip";

interface IngressResult {
  ingress: {
    url: string;
    streamKey: string;
  };
  whip_token?: string;
  auth_token: string;
  connection_details: { token: string; ws_url: string };
}

export default function ObsDialog({ onClose }: Props) {
  const [step, setStep] = useState<Step>("config");
  const [form, setForm] = useState({
    title: "",
    hostName: "",
    ingressType: "rtmp" as IngressType,
    chatEnabled: true,
    participationEnabled: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<IngressResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.hostName.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/create_ingress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_name: form.title.trim().toLowerCase().replace(/\s+/g, "-"),
          ingress_type: form.ingressType,
          metadata: {
            creator_identity: form.hostName.trim(),
            enable_chat: form.chatEnabled,
            allow_participation: form.participationEnabled,
          },
        }),
      });
      if (!res.ok) { setError(await res.text()); return; }
      const data = await res.json();
      setResult(data);
      setStep("params");
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  };

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const goToHost = () => {
    if (!result) return;
    window.location.href = `/host?at=${result.auth_token}&rt=${result.connection_details.token}`;
  };

  const serverUrl = result?.ingress?.url || "";
  const streamKey = result?.ingress?.streamKey || "";
  const whipToken = result?.whip_token || "";

  return (
    <div className="obs-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="obs-modal">
        {/* Header */}
        <div className="obs-header">
          <div className="obs-header-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="3" width="20" height="14" rx="2" stroke="#1a73e8" strokeWidth="2"/>
              <path d="M8 21h8M12 17v4" stroke="#1a73e8" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <h2 className="obs-title">
              {step === "config" ? "Configurer la diffusion via OBS" : "Paramètres de diffusion"}
            </h2>
            <p className="obs-desc">
              {step === "config"
                ? "Renseignez les informations de votre webinaire"
                : "Copiez ces informations dans OBS Studio"}
            </p>
          </div>
          <button className="obs-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="#5f6368" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Étape 1 : Configuration */}
        {step === "config" && (
          <>
            <div className="obs-body">
              <div className="obs-field">
                <label className="obs-label">Nom du webinaire <span className="obs-req">*</span></label>
                <input className="obs-input" type="text" placeholder="ex: Introduction au Machine Learning"
                  value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus />
              </div>

              <div className="obs-field">
                <label className="obs-label">Nom de l&apos;animateur <span className="obs-req">*</span></label>
                <input className="obs-input" type="text" placeholder="ex: Prénom Nom"
                  value={form.hostName} onChange={(e) => setForm({ ...form, hostName: e.target.value })} />
              </div>

              <div className="obs-field">
                <label className="obs-label">Type de diffusion</label>
                <div className="obs-type-grid">
                  <div
                    className={`obs-type-card ${form.ingressType === "rtmp" ? "active" : ""}`}
                    onClick={() => setForm({ ...form, ingressType: "rtmp" })}
                  >
                    <div className="obs-type-icon">📡</div>
                    <div className="obs-type-name">RTMP</div>
                    <div className="obs-type-sub">OBS, Streamlabs, vMix</div>
                  </div>
                  <div
                    className={`obs-type-card ${form.ingressType === "whip" ? "active" : ""}`}
                    onClick={() => setForm({ ...form, ingressType: "whip" })}
                  >
                    <div className="obs-type-icon">⚡</div>
                    <div className="obs-type-name">WHIP</div>
                    <div className="obs-type-sub">OBS 30+, WebRTC natif</div>
                  </div>
                </div>
              </div>

              <div className="obs-divider" />
              <p className="obs-section-title">Options de session</p>

              <div className="obs-toggle-row" onClick={() => setForm({ ...form, chatEnabled: !form.chatEnabled })}>
                <div className="obs-toggle-info">
                  <span className="obs-toggle-icon">💬</span>
                  <div>
                    <div className="obs-toggle-label">Activer le chat</div>
                    <div className="obs-toggle-sub">Les spectateurs peuvent envoyer des messages</div>
                  </div>
                </div>
                <div className={`obs-switch ${form.chatEnabled ? "on" : ""}`}><div className="obs-switch-thumb" /></div>
              </div>

              <div className="obs-toggle-row" onClick={() => setForm({ ...form, participationEnabled: !form.participationEnabled })}>
                <div className="obs-toggle-info">
                  <span className="obs-toggle-icon">🙋</span>
                  <div>
                    <div className="obs-toggle-label">Autoriser la participation</div>
                    <div className="obs-toggle-sub">Les invités peuvent lever la main et prendre la parole</div>
                  </div>
                </div>
                <div className={`obs-switch ${form.participationEnabled ? "on" : ""}`}><div className="obs-switch-thumb" /></div>
              </div>

              {error && <p className="obs-error">{error}</p>}
            </div>

            <div className="obs-footer">
              <button className="obs-btn-cancel" onClick={onClose}>Annuler</button>
              <button className="obs-btn-primary" onClick={handleSubmit}
                disabled={loading || !form.title.trim() || !form.hostName.trim()}>
                {loading ? <span className="obs-spinner" /> : "Générer les paramètres →"}
              </button>
            </div>
          </>
        )}

        {/* Étape 2 : Paramètres RTMP/WHIP */}
        {step === "params" && result && (
          <>
            <div className="obs-body">
              <div className="obs-info-banner">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="#1a73e8" strokeWidth="2"/>
                  <path d="M12 8v4M12 16h.01" stroke="#1a73e8" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <p>Dans OBS : <strong>Paramètres → Diffusion → Personnalisé</strong>. Collez les informations ci-dessous puis cliquez sur <strong>Démarrer la diffusion</strong> dans OBS.</p>
              </div>

              {form.ingressType === "rtmp" ? (
                <>
                  <div className="obs-field">
                    <label className="obs-label">URL du serveur</label>
                    <div className="obs-copy-row">
                      <input className="obs-input obs-input--mono" readOnly value={serverUrl} />
                      <button className={`obs-copy-btn ${copied === "url" ? "copied" : ""}`}
                        onClick={() => copy(serverUrl, "url")}>
                        {copied === "url" ? "✓ Copié" : "Copier"}
                      </button>
                    </div>
                  </div>
                  <div className="obs-field">
                    <label className="obs-label">Clé de diffusion</label>
                    <div className="obs-copy-row">
                      <input className="obs-input obs-input--mono" readOnly value={streamKey} />
                      <button className={`obs-copy-btn ${copied === "key" ? "copied" : ""}`}
                        onClick={() => copy(streamKey, "key")}>
                        {copied === "key" ? "✓ Copié" : "Copier"}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="obs-field">
                    <label className="obs-label">URL WHIP</label>
                    <div className="obs-copy-row">
                      <input className="obs-input obs-input--mono" readOnly value={serverUrl} />
                      <button className={`obs-copy-btn ${copied === "whip" ? "copied" : ""}`}
                        onClick={() => copy(serverUrl, "whip")}>
                        {copied === "whip" ? "✓ Copié" : "Copier"}
                      </button>
                    </div>
                  </div>
                  {whipToken && (
                    <div className="obs-field">
                      <label className="obs-label">
                        Token Bearer{" "}
                        <span style={{ fontSize: "0.75rem", color: "#5f6368", fontWeight: 400 }}>
                          (champ &quot;Authentification&quot; dans OBS)
                        </span>
                      </label>
                      <div className="obs-copy-row">
                        <input className="obs-input obs-input--mono" readOnly value={whipToken} />
                        <button className={`obs-copy-btn ${copied === "whiptoken" ? "copied" : ""}`}
                          onClick={() => copy(whipToken, "whiptoken")}>
                          {copied === "whiptoken" ? "✓ Copié" : "Copier"}
                        </button>
                      </div>
                      <p className="obs-hint">
                        Dans OBS 30+ : <strong>Paramètres → Diffusion → Service : WHIP</strong>.
                        Collez l&apos;URL ci-dessus et le token dans le champ &quot;Authentification&quot;.
                      </p>
                    </div>
                  )}
                </>
              )}

              <div className="obs-steps">
                <p className="obs-section-title">Étapes suivantes</p>
                <ol className="obs-step-list">
                  <li>Collez les paramètres dans OBS</li>
                  <li>Cliquez sur <strong>Démarrer la diffusion</strong> dans OBS</li>
                  <li>Rejoignez votre salle en tant qu&apos;animateur pour modérer</li>
                </ol>
              </div>
            </div>

            <div className="obs-footer obs-footer--split">
              <button className="obs-btn-cancel" onClick={() => setStep("config")}>← Modifier</button>
              <button className="obs-btn-primary" onClick={goToHost}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M13.8 12H3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Rejoindre comme animateur
              </button>
            </div>
          </>
        )}
      </div>

      <style>{`
        .obs-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:100;animation:fadeIn .15s ease;}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        .obs-modal{background:white;border-radius:16px;width:100%;max-width:540px;max-height:90vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.22);animation:slideUp .2s ease;}
        @keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
        .obs-header{display:flex;align-items:flex-start;gap:14px;padding:24px 24px 0;position:relative;}
        .obs-header-icon{width:44px;height:44px;border-radius:10px;background:#e8f0fe;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .obs-title{font-size:1.05rem;font-weight:600;color:#202124;line-height:1.3;}
        .obs-desc{font-size:0.82rem;color:#5f6368;margin-top:2px;}
        .obs-close{position:absolute;right:20px;top:20px;width:32px;height:32px;border-radius:50%;border:none;background:transparent;display:flex;align-items:center;justify-content:center;cursor:pointer;}
        .obs-close:hover{background:#f1f3f4;}
        .obs-body{padding:24px;display:flex;flex-direction:column;gap:18px;}
        .obs-field{display:flex;flex-direction:column;gap:6px;}
        .obs-label{font-size:0.85rem;font-weight:500;color:#3c4043;}
        .obs-req{color:#ea4335;}
        .obs-input{padding:11px 14px;border:1.5px solid #dadce0;border-radius:8px;font-size:0.95rem;color:#202124;outline:none;transition:border-color .2s,box-shadow .2s;font-family:inherit;width:100%;}
        .obs-input:focus{border-color:#1a73e8;box-shadow:0 0 0 3px rgba(26,115,232,.12);}
        .obs-input::placeholder{color:#9aa0a6;}
        .obs-input--mono{font-family:monospace;font-size:0.82rem;background:#f8fafd;color:#3c4043;}
        .obs-copy-row{display:flex;gap:8px;align-items:stretch;}
        .obs-copy-row .obs-input{flex:1;}
        .obs-copy-btn{padding:0 16px;background:#f1f3f4;border:1.5px solid #dadce0;border-radius:8px;font-size:0.82rem;font-weight:500;color:#3c4043;cursor:pointer;white-space:nowrap;transition:all .2s;font-family:inherit;}
        .obs-copy-btn:hover{background:#e8eaed;}
        .obs-copy-btn.copied{background:#e6f4ea;border-color:#34a853;color:#34a853;}
        .obs-type-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
        .obs-type-card{border:1.5px solid #dadce0;border-radius:10px;padding:16px;cursor:pointer;transition:all .2s;text-align:center;}
        .obs-type-card:hover{border-color:#1a73e8;background:#f8fafd;}
        .obs-type-card.active{border-color:#1a73e8;background:#e8f0fe;}
        .obs-type-icon{font-size:1.5rem;margin-bottom:6px;}
        .obs-type-name{font-size:0.9rem;font-weight:600;color:#202124;}
        .obs-type-sub{font-size:0.75rem;color:#5f6368;margin-top:2px;}
        .obs-divider{height:1px;background:#e8eaed;}
        .obs-section-title{font-size:0.78rem;font-weight:600;color:#5f6368;text-transform:uppercase;letter-spacing:.06em;}
        .obs-toggle-row{display:flex;align-items:center;justify-content:space-between;padding:14px;border-radius:10px;border:1.5px solid #e8eaed;cursor:pointer;transition:background .15s,border-color .15s;gap:12px;}
        .obs-toggle-row:hover{background:#f8fafd;border-color:#dadce0;}
        .obs-toggle-info{display:flex;align-items:center;gap:12px;}
        .obs-toggle-icon{font-size:1.2rem;width:28px;text-align:center;}
        .obs-toggle-label{font-size:0.9rem;font-weight:500;color:#202124;}
        .obs-toggle-sub{font-size:0.78rem;color:#5f6368;margin-top:2px;}
        .obs-switch{width:44px;height:24px;border-radius:12px;background:#dadce0;position:relative;flex-shrink:0;transition:background .2s;}
        .obs-switch.on{background:#1a73e8;}
        .obs-switch-thumb{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:white;transition:transform .2s;box-shadow:0 1px 3px rgba(0,0,0,.2);}
        .obs-switch.on .obs-switch-thumb{transform:translateX(20px);}
        .obs-info-banner{display:flex;gap:10px;align-items:flex-start;background:#e8f0fe;border-radius:8px;padding:14px;font-size:0.85rem;color:#1a56a8;line-height:1.5;}
        .obs-hint{font-size:0.78rem;color:#5f6368;margin-top:4px;line-height:1.5;}
        .obs-steps{display:flex;flex-direction:column;gap:8px;}
        .obs-step-list{list-style:decimal;padding-left:20px;display:flex;flex-direction:column;gap:6px;font-size:0.88rem;color:#3c4043;line-height:1.5;}
        .obs-step-list strong{color:#202124;}
        .obs-error{color:#ea4335;font-size:0.82rem;background:#fce8e6;padding:10px 14px;border-radius:6px;}
        .obs-footer{padding:16px 24px;display:flex;justify-content:flex-end;gap:12px;border-top:1px solid #e8eaed;}
        .obs-footer--split{justify-content:space-between;}
        .obs-btn-cancel{padding:10px 20px;border:1.5px solid #dadce0;border-radius:8px;background:white;color:#5f6368;font-size:0.9rem;font-weight:500;cursor:pointer;font-family:inherit;}
        .obs-btn-cancel:hover{background:#f1f3f4;}
        .obs-btn-primary{display:flex;align-items:center;gap:8px;padding:10px 22px;background:#1a73e8;color:white;border:none;border-radius:8px;font-size:0.9rem;font-weight:500;cursor:pointer;font-family:inherit;}
        .obs-btn-primary:hover:not(:disabled){background:#1557b0;}
        .obs-btn-primary:disabled{opacity:.5;cursor:not-allowed;}
        .obs-spinner{width:16px;height:16px;border:2px solid rgba(255,255,255,.3);border-top-color:white;border-radius:50%;animation:spin .7s linear infinite;}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>
    </div>
  );
}
