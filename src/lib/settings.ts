import { prisma } from "@/lib/prisma"

// Réglages globaux, stockés en clé/valeur (table AppSetting). On centralise ici
// les clés connues et leur valeur par défaut pour éviter les chaînes magiques
// dispersées dans le code.

export const SETTING_BLOCK_STUDENTS = "block_students"
export const SETTING_MOODLE_AUTO_MODERATOR = "moodle_auto_moderator"

// Valeur par défaut de chaque réglage quand la ligne n'existe pas encore.
// moodle_auto_moderator est à "on" : sans lui, un enseignant qui n'a jamais
// ouvert la plateforme ne peut ni créer ni démarrer sa session (404/403), ce qui
// est précisément le blocage à corriger. L'interrupteur sert de coupe-circuit.
const DEFAULTS: Record<string, string> = {
  [SETTING_BLOCK_STUDENTS]: "off",
  [SETTING_MOODLE_AUTO_MODERATOR]: "on",
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

/** true si un enseignant venu de Moodle est provisionné/promu automatiquement. */
export async function isMoodleAutoModeratorEnabled(): Promise<boolean> {
  return (await getSetting(SETTING_MOODLE_AUTO_MODERATOR)) === "on"
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
