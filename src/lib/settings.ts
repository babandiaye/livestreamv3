import { prisma } from "@/lib/prisma"

// Réglages globaux, stockés en clé/valeur (table AppSetting). On centralise ici
// les clés connues et leur valeur par défaut pour éviter les chaînes magiques
// dispersées dans le code.

export const SETTING_BLOCK_STUDENTS = "block_students"

// Valeur par défaut de chaque réglage quand la ligne n'existe pas encore.
const DEFAULTS: Record<string, string> = {
  [SETTING_BLOCK_STUDENTS]: "off",
}

/** Lit un réglage brut (repli sur la valeur par défaut si absent). */
export async function getSetting(key: string): Promise<string> {
  const row = await prisma.appSetting.findUnique({ where: { key } })
  return row?.value ?? DEFAULTS[key] ?? ""
}

/** true si l'accès étudiant est actuellement interdit. */
export async function isStudentBlockEnabled(): Promise<boolean> {
  return (await getSetting(SETTING_BLOCK_STUDENTS)) === "on"
}

/** Écrit un réglage (upsert). */
export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  })
}

// Valeur du claim Keycloak qui identifie un étudiant. Un token sans ce champ
// n'est PAS concerné par les règles étudiantes (ni forçage VIEWER, ni blocage).
export const AFFILIATION_STUDENT = "Etudiant"

/** Vrai si le claim `affiliation` du token désigne un étudiant. */
export function isStudentAffiliation(affiliation: unknown): boolean {
  return typeof affiliation === "string" && affiliation.trim() === AFFILIATION_STUDENT
}
