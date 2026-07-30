import crypto from "crypto"

// Mandat d'enregistrement signé.
//
// /api/egress-token fabrique un jeton LiveKit `hidden: true` + `recorder: true` :
// celui qui le détient voit et entend TOUTE la salle sans figurer dans la liste
// des participants, sans être compté dans la feuille de présence (filtré par
// isSystemParticipant), sans pouvoir être exclu, et SANS passer par le contrôle
// NO_MODERATOR. La route était ouverte parce que son unique appelant est un
// robot — le Chrome headless de l'egress — qui n'a ni compte, ni cookie, ni
// session Keycloak à présenter. Conséquence : n'importe qui connaissant un
// roomName (il est dans le lien /watch diffusé aux étudiants) pouvait obtenir ce
// jeton et assister invisiblement à toutes les sessions de la salle.
//
// On authentifie donc le MANDAT plutôt que l'appelant : au lancement de
// l'enregistrement, le serveur signe le couple (roomName, expiration) et le
// place dans l'URL du layout. Seul le serveur détient la clé, donc seul lui peut
// mandater un enregistreur. Même schéma que download-token.ts (HMAC-SHA256,
// expiration, comparaison à temps constant).
//
// Aucun impact sur les trois chemins d'accès utilisateurs : /watch (invités par
// lien), la plateforme et Moodle n'appellent jamais cette route.

function secret(): string {
  const s = process.env.AUTH_SECRET
  if (!s) throw new Error("AUTH_SECRET requis pour signer le mandat d'enregistrement")
  return s
}

// Le préfixe « egress: » cloisonne ce domaine de signature. Sans lui, une
// signature émise pour un lien de téléchargement (même secret, même algorithme)
// pourrait être rejouée ici, et inversement.
function sign(roomName: string, exp: number): string {
  return crypto
    .createHmac("sha256", secret())
    .update(`egress:${roomName}:${exp}`)
    .digest("base64url")
}

// TTL large (12 h) : le mandat doit rester valable si le Chrome de l'egress
// recharge sa page en cours de captation — un cours peut durer plusieurs heures.
// Le risque reste borné : la signature ne vaut que pour UNE salle nommée.
export function signEgressAccess(
  roomName: string,
  ttlSec = 43_200
): { exp: number; sig: string } {
  const exp = Math.floor(Date.now() / 1000) + ttlSec
  return { exp, sig: sign(roomName, exp) }
}

// Ajoute le mandat aux paramètres d'une URL de layout déjà construite.
export function appendEgressAccess(layoutUrl: string, roomName: string): string {
  const { exp, sig } = signEgressAccess(roomName)
  const sep = layoutUrl.includes("?") ? "&" : "?"
  return `${layoutUrl}${sep}exp=${exp}&sig=${encodeURIComponent(sig)}`
}

// Vérifie que le porteur a bien été mandaté par le serveur POUR CETTE SALLE.
export function verifyEgressAccess(
  roomName: string | null,
  exp: string | null,
  sig: string | null
): boolean {
  if (!roomName || !exp || !sig) return false

  const expNum = Number(exp)
  if (!Number.isFinite(expNum) || expNum < Math.floor(Date.now() / 1000)) return false

  const expected = sign(roomName, expNum)
  try {
    // timingSafeEqual exige des longueurs identiques et lève sinon : le catch
    // couvre aussi bien la signature de mauvaise taille que la non-concordance.
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  } catch {
    return false
  }
}
