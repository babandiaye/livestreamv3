import crypto from "crypto"

// Secret de signature des liens de téléchargement. On réutilise AUTH_SECRET
// (déjà requis par NextAuth) pour ne pas multiplier les secrets.
function secret(): string {
  const s = process.env.AUTH_SECRET
  if (!s) throw new Error("AUTH_SECRET requis pour signer les liens de téléchargement")
  return s
}

function sign(key: string, exp: number): string {
  return crypto.createHmac("sha256", secret()).update(`${key}:${exp}`).digest("base64url")
}

// Construit une URL de proxy SIGNÉE et EXPIRANTE pour un objet S3.
// L'enregistrement transite par /api/download-recording (MinIO n'est pas exposé
// publiquement), mais l'accès n'est possible qu'avec une signature valide et non
// expirée — plus de clé S3 brute accessible sans contrôle.
export function signDownloadPath(s3Key: string, ttlSec = 21600): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec
  const sig = sign(s3Key, exp)
  const q = new URLSearchParams({ key: s3Key, exp: String(exp), sig })
  return `/api/download-recording?${q.toString()}`
}

// Vérifie signature + expiration (comparaison à temps constant).
export function verifyDownload(
  key: string | null,
  exp: string | null,
  sig: string | null
): boolean {
  if (!key || !exp || !sig) return false
  const expNum = Number(exp)
  if (!Number.isFinite(expNum) || expNum < Math.floor(Date.now() / 1000)) return false
  const expected = sign(key, expNum)
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  } catch {
    return false
  }
}
