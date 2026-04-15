"use client"

export default function Footer() {
  return (
    <footer style={{
      borderTop: "1px solid #e2e8f0",
      background: "white",
      padding: "20px 32px",
      textAlign: "center",
    }}>
      <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
        Ministère de l&apos;Enseignement Supérieur, de la Recherche et de l&apos;Innovation
      </p>
      <p style={{ margin: "4px 0 0", fontSize: 13, fontWeight: 600, color: "#0065b1" }}>
        Université Numérique Cheikh Hamidou Kane (UN-CHK)
      </p>
      <p style={{ margin: "4px 0 0", fontSize: 12, color: "#9ca3af" }}>
        © DITSI – UN-CHK – 2026 – Tous droits réservés
      </p>
    </footer>
  )
}
