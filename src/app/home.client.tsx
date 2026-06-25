"use client"

import { signIn } from "next-auth/react"
import Footer from "@/components/layout/Footer"

type IconName = "camera" | "calendar" | "house" | "people"

type Feature = {
  icon: IconName
  title: string
  desc: string
  accent: string
  from: string
  to: string
  dot: string
}

const FEATURES: Feature[] = [
  {
    icon: "camera",
    title: "Démarrer une session",
    desc: "Lancez une classe virtuelle en direct avec vidéo, audio, partage d'écran et outils pédagogiques intégrés.",
    accent: "#0065b1", from: "#eaf4ff", to: "#d3e8fb", dot: "#3b9eec",
  },
  {
    icon: "calendar",
    title: "Enregistrer vos sessions",
    desc: "Enregistrez automatiquement vos webinaires et rendez-les disponibles pour les étudiants après la session.",
    accent: "#16a34a", from: "#e9f9ef", to: "#d2f0db", dot: "#34c759",
  },
  {
    icon: "house",
    title: "Gérer vos salles",
    desc: "Créez et configurez vos salles de cours, définissez les accès et paramétrez chaque session selon vos besoins.",
    accent: "#ea7a17", from: "#fff3e3", to: "#ffe3c2", dot: "#ff9f40",
  },
  {
    icon: "people",
    title: "Gérer les participants",
    desc: "Enrôlez vos étudiants individuellement ou en masse via CSV, attribuez des rôles et suivez les participations.",
    accent: "#7c3aed", from: "#f4ecfd", to: "#e7d6fb", dot: "#a06cf0",
  },
]

function FeatureIcon({ name, color }: { name: IconName; color: string }) {
  const c = {
    width: 30, height: 30, viewBox: "0 0 24 24", fill: "none",
    stroke: color, strokeWidth: 2,
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  }
  switch (name) {
    case "camera":
      return (<svg {...c}><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>)
    case "calendar":
      return (<svg {...c}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><path d="M9 16l2 2 4-4" /></svg>)
    case "house":
      return (<svg {...c}><path d="M3 9.5 12 3l9 6.5" /><path d="M5 10v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10" /><path d="M9 21v-6h6v6" /></svg>)
    case "people":
      return (<svg {...c}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>)
  }
}

export default function HomeClient() {
  const handleLogin = () => {
    const keycloakEnabled = process.env.NEXT_PUBLIC_KEYCLOAK_ENABLED === "true"
    if (keycloakEnabled) signIn("keycloak", { callbackUrl: "/" })
    else signIn(undefined, { callbackUrl: "/" })
  }

  return (
    <div className="lp-root">
      <style>{`
        .lp-root{position:relative;min-height:100vh;display:flex;flex-direction:column;background:#f8fafd;font-family:'Segoe UI',system-ui,sans-serif;overflow-x:hidden;}
        .lp-blob{position:absolute;top:-180px;left:-180px;width:560px;height:560px;border-radius:50%;background:radial-gradient(circle,rgba(0,101,177,.12),rgba(0,101,177,0) 70%);pointer-events:none;z-index:0;}
        .lp-dots{position:absolute;top:88px;right:0;width:300px;height:240px;background-image:radial-gradient(#cdd9e8 1.4px,transparent 1.4px);background-size:18px 18px;-webkit-mask-image:radial-gradient(circle at 75% 25%,#000,transparent 72%);mask-image:radial-gradient(circle at 75% 25%,#000,transparent 72%);opacity:.6;pointer-events:none;z-index:0;}
        .lp-header,.lp-main{position:relative;z-index:1;}
        .lp-header{background:rgba(255,255,255,.85);backdrop-filter:blur(8px);border-bottom:1px solid #e2e8f0;padding:0 32px;height:64px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;}
        .lp-brand{display:flex;align-items:center;gap:12px;}
        .lp-brand-sep{width:1px;height:32px;background:#e2e8f0;}
        .lp-brand-txt{font-size:15px;font-weight:700;color:#1a1a2e;letter-spacing:-.01em;}
        .signin-btn{display:inline-flex;align-items:center;gap:8px;background:#0065b1;color:#fff;border:none;border-radius:8px;padding:10px 22px;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;transition:background .15s;box-shadow:0 2px 10px rgba(0,101,177,.25);}
        .signin-btn:hover{background:#0051a2;}
        .lp-main{flex:1;padding:64px 32px 48px;}
        .lp-hero{max-width:780px;margin:0 auto 52px;text-align:center;}
        .lp-title{font-size:clamp(30px,5vw,44px);font-weight:800;color:#16223b;line-height:1.18;margin:0 0 18px;letter-spacing:-.02em;}
        .lp-sub{font-size:16px;color:#6b7280;line-height:1.7;margin:0 auto;max-width:620px;}
        .lp-label{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:28px;}
        .lp-label span{font-size:12px;font-weight:700;color:#5b6b86;letter-spacing:.1em;text-transform:uppercase;}
        .lp-label i{width:6px;height:6px;border-radius:50%;background:#0065b1;display:inline-block;}
        .lp-grid{max-width:1140px;margin:0 auto;display:grid;grid-template-columns:repeat(4,1fr);gap:22px;}
        @media (max-width:960px){.lp-grid{grid-template-columns:repeat(2,1fr);}}
        @media (max-width:560px){.lp-grid{grid-template-columns:1fr;}}
        .fc{position:relative;background:#fff;border:1px solid #eef1f6;border-radius:18px;padding:26px 22px 22px;transition:box-shadow .2s,transform .15s,border-color .2s;overflow:hidden;}
        .fc:hover{box-shadow:0 10px 30px rgba(20,40,80,.10);transform:translateY(-3px);border-color:var(--from);}
        .fc-iconwrap{position:relative;width:92px;height:78px;margin-bottom:18px;}
        .fc-icon{position:absolute;left:6px;top:3px;width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,var(--from),var(--to));display:flex;align-items:center;justify-content:center;}
        .fc-d{position:absolute;border-radius:50%;background:var(--dot);}
        .fc-d1{width:7px;height:7px;top:2px;left:2px;opacity:.55;}
        .fc-d2{width:5px;height:5px;bottom:6px;left:-2px;opacity:.4;}
        .fc-d3{width:9px;height:9px;top:10px;right:8px;opacity:.5;}
        .fc-spark{position:absolute;top:-2px;right:18px;color:var(--dot);opacity:.7;}
        .fc-title{font-size:15.5px;font-weight:700;color:var(--accent);margin:0 0 10px;}
        .fc-desc{font-size:13.5px;color:#6b7280;line-height:1.6;margin:0 0 18px;}
        .fc-arrow{width:36px;height:36px;border-radius:50%;background:var(--from);color:var(--accent);border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform .15s,background .15s;}
        .fc:hover .fc-arrow{background:var(--accent);color:#fff;transform:translateX(2px);}
      `}</style>

      <div className="lp-blob" />
      <div className="lp-dots" />

      {/* ── Header ── */}
      <header className="lp-header">
        <div className="lp-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-unchk.png" alt="UN-CHK" width={48} height={48} style={{ objectFit: "contain", display: "block" }} />
          <div className="lp-brand-sep" />
          <span className="lp-brand-txt">Plateforme Webinaire UN-CHK</span>
        </div>
        <button className="signin-btn" onClick={handleLogin}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
          S&apos;identifier
        </button>
      </header>

      {/* ── Hero ── */}
      <main className="lp-main">
        <div className="lp-hero">
          <h1 className="lp-title">Bienvenue sur la Plateforme<br />Webinaire UN-CHK</h1>
          <p className="lp-sub">
            La plateforme de webconférence de l&apos;Université Numérique Cheikh Hamidou Kane,
            conçue pour faciliter l&apos;enseignement à distance, la collaboration et le suivi
            pédagogique en temps réel.
          </p>
        </div>

        <div className="lp-label">
          <i /><span>Découvrez les fonctionnalités</span><i />
        </div>

        <div className="lp-grid">
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className="fc"
              style={{
                ["--accent" as string]: f.accent,
                ["--from" as string]: f.from,
                ["--to" as string]: f.to,
                ["--dot" as string]: f.dot,
              } as React.CSSProperties}
            >
              <div className="fc-iconwrap">
                <span className="fc-d fc-d1" />
                <span className="fc-d fc-d2" />
                <span className="fc-d fc-d3" />
                <svg className="fc-spark" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0l2.2 9.8L24 12l-9.8 2.2L12 24l-2.2-9.8L0 12l9.8-2.2z" /></svg>
                <div className="fc-icon"><FeatureIcon name={f.icon} color={f.accent} /></div>
              </div>
              <h3 className="fc-title">{f.title}</h3>
              <p className="fc-desc">{f.desc}</p>
              <button className="fc-arrow" onClick={handleLogin} aria-label={f.title}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
              </button>
            </div>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  )
}
