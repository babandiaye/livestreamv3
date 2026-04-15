"use client";

import { useState } from "react";

interface Props {
  onClose: () => void;
}

export default function CreateStreamDialog({ onClose }: Props) {
  const [form, setForm] = useState({
    title: "",
    hostName: "",
    chatEnabled: true,
    participationEnabled: false,
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.hostName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/create_stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_name: form.title.toLowerCase().replace(/\s+/g, "-"),
          metadata: {
            creator_identity: form.hostName,
            enable_chat: form.chatEnabled,
            allow_participation: form.participationEnabled,
          },
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
      const data = await res.json();
      if (data.connection_details?.token) {
        const params = new URLSearchParams({
          token: data.connection_details.token,
          auth_token: data.auth_token,
          ws_url: data.connection_details.ws_url,
        });
        window.location.href = `/host?at=${data.auth_token}&rt=${data.connection_details.token}`;
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="csd-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="csd-modal" role="dialog" aria-modal="true">
        <div className="csd-header">
          <div className="csd-header-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" stroke="#1a73e8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h2 className="csd-title">Démarrer un nouveau webinaire</h2>
            <p className="csd-desc">Configurez votre session avant de la lancer</p>
          </div>
          <button className="csd-close" onClick={onClose} aria-label="Fermer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="#5f6368" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="csd-body">
          <div className="csd-field">
            <label className="csd-label" htmlFor="stream-title">
              Nom du webinaire <span className="csd-required">*</span>
            </label>
            <input
              id="stream-title"
              className="csd-input"
              type="text"
              placeholder="ex: Introduction au Machine Learning"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              autoFocus
            />
          </div>

          <div className="csd-field">
            <label className="csd-label" htmlFor="host-name">
              Nom de l'animateur <span className="csd-required">*</span>
            </label>
            <input
              id="host-name"
              className="csd-input"
              type="text"
              placeholder="ex: Prénom Nom"
              value={form.hostName}
              onChange={(e) => setForm({ ...form, hostName: e.target.value })}
            />
          </div>

          <div className="csd-divider" />

          <p className="csd-section-title">Options de session</p>

          <div className="csd-toggle-row" onClick={() => setForm({ ...form, chatEnabled: !form.chatEnabled })}>
            <div className="csd-toggle-info">
              <span className="csd-toggle-icon">💬</span>
              <div>
                <div className="csd-toggle-label">Activer le chat</div>
                <div className="csd-toggle-sub">Les spectateurs peuvent envoyer des messages pendant le stream</div>
              </div>
            </div>
            <div className={`csd-switch ${form.chatEnabled ? "csd-switch--on" : ""}`}>
              <div className="csd-switch-thumb" />
            </div>
          </div>

          <div className="csd-toggle-row" onClick={() => setForm({ ...form, participationEnabled: !form.participationEnabled })}>
            <div className="csd-toggle-info">
              <span className="csd-toggle-icon">🙋</span>
              <div>
                <div className="csd-toggle-label">Autoriser la participation des participants</div>
                <div className="csd-toggle-sub">Les invités peuvent lever la main et prendre la parole</div>
              </div>
            </div>
            <div className={`csd-switch ${form.participationEnabled ? "csd-switch--on" : ""}`}>
              <div className="csd-switch-thumb" />
            </div>
          </div>
        </div>

        <div className="csd-footer">
          <button className="csd-btn-cancel" onClick={onClose} disabled={loading}>
            Annuler
          </button>
          <button
            className="csd-btn-start"
            onClick={handleSubmit}
            disabled={loading || !form.title.trim() || !form.hostName.trim()}
          >
            {loading ? (
              <span className="csd-spinner" />
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Démarrer le webinaire
              </>
            )}
          </button>
        </div>
      </div>

      <style>{`
        .csd-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,.5); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center; z-index: 100;
          animation: fadeIn .15s ease;
        }
        @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }

        .csd-modal {
          background: white; border-radius: 16px; width: 100%; max-width: 520px;
          box-shadow: 0 24px 64px rgba(0,0,0,.22);
          animation: slideUp .2s ease;
        }
        @keyframes slideUp { from { transform: translateY(20px); opacity:0 } to { transform: translateY(0); opacity:1 } }

        .csd-header {
          display: flex; align-items: flex-start; gap: 14px;
          padding: 24px 24px 0; position: relative;
        }
        .csd-header-icon {
          width: 44px; height: 44px; border-radius: 10px; background: #e8f0fe;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .csd-title { font-size: 1.1rem; font-weight: 600; color: #202124; line-height: 1.3; }
        .csd-desc { font-size: 0.82rem; color: #5f6368; margin-top: 2px; }
        .csd-close {
          position: absolute; right: 20px; top: 20px;
          width: 32px; height: 32px; border-radius: 50%; border: none; background: transparent;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: background .2s;
        }
        .csd-close:hover { background: #f1f3f4; }

        .csd-body { padding: 24px; display: flex; flex-direction: column; gap: 18px; }

        .csd-field { display: flex; flex-direction: column; gap: 6px; }
        .csd-label { font-size: 0.85rem; font-weight: 500; color: #3c4043; }
        .csd-required { color: #ea4335; }
        .csd-input {
          padding: 11px 14px; border: 1.5px solid #dadce0; border-radius: 8px;
          font-size: 0.95rem; color: #202124; outline: none;
          transition: border-color .2s, box-shadow .2s;
          font-family: inherit;
        }
        .csd-input:focus { border-color: #1a73e8; box-shadow: 0 0 0 3px rgba(26,115,232,.12); }
        .csd-input::placeholder { color: #9aa0a6; }

        .csd-divider { height: 1px; background: #e8eaed; }
        .csd-section-title { font-size: 0.82rem; font-weight: 600; color: #5f6368; text-transform: uppercase; letter-spacing: .06em; }

        .csd-toggle-row {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px; border-radius: 10px; border: 1.5px solid #e8eaed;
          cursor: pointer; transition: background .15s, border-color .15s;
          gap: 12px;
        }
        .csd-toggle-row:hover { background: #f8fafd; border-color: #dadce0; }
        .csd-toggle-info { display: flex; align-items: center; gap: 12px; }
        .csd-toggle-icon { font-size: 1.2rem; width: 28px; text-align: center; }
        .csd-toggle-label { font-size: 0.9rem; font-weight: 500; color: #202124; }
        .csd-toggle-sub { font-size: 0.78rem; color: #5f6368; margin-top: 2px; }

        .csd-switch {
          width: 44px; height: 24px; border-radius: 12px; background: #dadce0;
          position: relative; flex-shrink: 0; transition: background .2s;
        }
        .csd-switch--on { background: #1a73e8; }
        .csd-switch-thumb {
          position: absolute; top: 3px; left: 3px;
          width: 18px; height: 18px; border-radius: 50%; background: white;
          transition: transform .2s; box-shadow: 0 1px 3px rgba(0,0,0,.2);
        }
        .csd-switch--on .csd-switch-thumb { transform: translateX(20px); }

        .csd-footer {
          padding: 16px 24px; display: flex; justify-content: flex-end; gap: 12px;
          border-top: 1px solid #e8eaed;
        }
        .csd-btn-cancel {
          padding: 10px 20px; border: 1.5px solid #dadce0; border-radius: 8px;
          background: white; color: #5f6368; font-size: 0.9rem; font-weight: 500;
          cursor: pointer; transition: background .2s; font-family: inherit;
        }
        .csd-btn-cancel:hover:not(:disabled) { background: #f1f3f4; }
        .csd-btn-cancel:disabled { opacity: .5; cursor: not-allowed; }

        .csd-btn-start {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 22px; background: #1a73e8; color: white;
          border: none; border-radius: 8px; font-size: 0.9rem; font-weight: 500;
          cursor: pointer; transition: background .2s; font-family: inherit;
        }
        .csd-btn-start:hover:not(:disabled) { background: #1557b0; }
        .csd-btn-start:disabled { opacity: .5; cursor: not-allowed; }

        .csd-spinner {
          width: 16px; height: 16px; border: 2px solid rgba(255,255,255,.3);
          border-top-color: white; border-radius: 50%;
          animation: spin .7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
