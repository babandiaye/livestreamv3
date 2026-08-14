import nodemailer, { type Transporter } from "nodemailer"

// Envoi d'e-mails via SMTP. Configuration par variables d'environnement :
//   SMTP_HOST   — serveur SMTP (ex. smtp.unchk.edu.sn)
//   SMTP_PORT   — 587 (STARTTLS, défaut) / 465 (SSL) / 25
//   SMTP_SECURE — "true" pour le port 465 (SSL implicite), sinon "false"
//   SMTP_USER   — identifiant SMTP (optionnel si relais ouvert)
//   SMTP_PASS   — mot de passe SMTP
//   MAIL_FROM   — expéditeur, ex. "UN-CHK Webinaire <no-reply@unchk.edu.sn>"
//
// Si SMTP_HOST n'est pas défini, l'envoi est IGNORÉ (log) : la fonctionnalité
// reste inerte tant que le SMTP n'est pas configuré, sans jamais planter
// l'appelant (fermeture de session, notification, etc.).

let transporter: Transporter | null | undefined // undefined = non initialisé, null = non configuré

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter
  const host = process.env.SMTP_HOST
  if (!host) {
    transporter = null
    return null
  }
  const secure = process.env.SMTP_SECURE === "true" // true = 465 (SSL), false = 587/25 (STARTTLS)
  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure,
    // Sur port non-SSL (587/25), FORCER STARTTLS : refuse un envoi en clair si le
    // serveur ne propose pas le chiffrement (évite toute fuite d'identifiants).
    requireTLS: !secure,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
      : undefined,
  })
  return transporter
}

export type MailInput = { to: string; subject: string; text?: string; html?: string }

// Envoie un e-mail. Ne LÈVE JAMAIS : retourne true si envoyé, false sinon (SMTP
// non configuré, destinataire vide, ou erreur d'envoi). Volontairement non
// bloquant — un échec d'e-mail ne doit pas casser un flux métier.
export async function sendMail({ to, subject, text, html }: MailInput): Promise<boolean> {
  if (!to) return false
  const t = getTransporter()
  if (!t) {
    console.warn("[mailer] SMTP non configuré (SMTP_HOST absent) — e-mail ignoré:", subject)
    return false
  }
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || "no-reply@unchk.edu.sn"
  try {
    await t.sendMail({ from, to, subject, text, html })
    console.log("[mailer] e-mail envoyé:", to, "—", subject)
    return true
  } catch (e) {
    console.error("[mailer] échec envoi:", to, subject, e instanceof Error ? e.message : e)
    return false
  }
}
