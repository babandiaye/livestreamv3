// Page publique affichée à un étudiant dont l'accès direct à la plateforme est
// interdit (réglage « Interdire l'accès aux étudiants »). Aucune authentification
// requise : Auth.js y redirige avant d'ouvrir la session.
export const dynamic = "force-static"

export default function AccesRefusePage() {
  return (
    <div style={{ minHeight: "100dvh", background: "#f8fafd", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'Google Sans','Segoe UI',system-ui,sans-serif" }}>
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 16, padding: "44px 36px", width: "100%", maxWidth: 480, display: "flex", flexDirection: "column", alignItems: "center", gap: 18, boxShadow: "0 4px 32px rgba(0,0,0,.08)", textAlign: "center" }}>
        <img src="/logo-unchk.png" alt="UN-CHK" style={{ height: 40, objectFit: "contain" }} />

        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#fff1f2", border: "1px solid #fecdd3", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>
          🎓
        </div>

        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e", marginBottom: 8 }}>
            Accès réservé aux cours magistraux
          </div>
          <div style={{ fontSize: 14.5, color: "#6b7280", lineHeight: 1.6 }}>
            En tant qu&apos;étudiant, l&apos;accès direct à cette plateforme n&apos;est pas
            ouvert. Pour rejoindre vos cours magistraux, passez par votre espace
            <strong> ENT</strong> ou par <strong>Moodle</strong> : le lien de la
            session s&apos;y trouve dans l&apos;activité de votre cours.
          </div>
        </div>

        <a
          href="https://ent.unchk.sn"
          style={{ width: "100%", padding: "12px 20px", background: "#0065b1", color: "white", borderRadius: 9, fontSize: 15, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          Accéder à l&apos;ENT →
        </a>

        <a href="/" style={{ fontSize: 13.5, color: "#0065b1", textDecoration: "none", fontWeight: 600 }}>
          ← Retour à l&apos;accueil
        </a>
      </div>
    </div>
  )
}
