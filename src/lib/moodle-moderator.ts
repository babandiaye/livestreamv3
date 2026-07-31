import { prisma } from "@/lib/prisma"
import { isMoodleAutoModeratorEnabled } from "@/lib/settings"
import type { User } from "@prisma/client"

// Provisionnement de l'animateur venu de Moodle.
//
// POURQUOI — /api/moodle/rooms et /api/moodle/start exigeaient un compte
// EXISTANT et déjà ADMIN/MODERATOR : un enseignant ou un tuteur qui n'avait
// jamais ouvert webinaire.unchk.sn se voyait refuser la création (404) ou le
// démarrage (403) de sa propre session. Or le rôle MODERATOR ne s'obtenait que
// par un rôle Keycloak attribué à la main — rien ne le dérivait du statut
// enseignant dans Moodle. Le parcours enseignant était donc structurellement
// bloqué, là où l'étudiant, lui, est auto-provisionné depuis toujours
// (/api/moodle/join).
//
// POURQUOI C'EST LÉGITIME — l'appel est authentifié par MOODLE_API_KEY, et le
// plugin a déjà vérifié la capacité `mod/livestream:moderate` de l'utilisateur
// AVANT d'appeler. L'email ne vient donc pas du client mais de la session Moodle
// authentifiée. C'est le même niveau de confiance que celui déjà accordé à
// /api/moodle/join pour les étudiants, et que celui sur lequel /api/moodle/rooms
// s'appuie pour l'idempotence de la création de salle.
//
// PORTÉE — le rôle MODERATOR est GLOBAL sur la plateforme (le schéma n'a pas de
// rôle par session) : l'enseignant promu pourra aussi se connecter en SSO et y
// créer ses propres salles. Conséquence assumée, faute d'un modèle par session.
//
// GARDE-FOU — si un étudiant était promu par erreur, sa prochaine connexion SSO
// le ramène à VIEWER : auth.ts force `affiliation=Etudiant` en VIEWER, y compris
// contre un rôle élevé déjà en base.
export async function ensureMoodleModerator(
  email: string,
  name?: string
): Promise<User | null> {
  const existing = await prisma.user.findUnique({ where: { email } })

  // Interrupteur coupé : comportement historique, on ne crée ni ne promeut.
  // L'appelant retombe sur son 404 / 403 habituel.
  if (!(await isMoodleAutoModeratorEnabled())) return existing

  if (!existing) {
    return prisma.user.create({
      data: {
        // Préfixe "moodle:" — même convention que /api/moodle/join : le compte
        // n'est pas encore adossé à une identité Keycloak réelle. La première
        // connexion SSO le réconcilie (auth.ts retrouve le compte par email et
        // remplace ce keycloakId par le vrai `sub`).
        keycloakId: `moodle:${email}`,
        email,
        // Le nom vient de Moodle (fullname). Repli sur la partie locale de
        // l'email si le plugin ne l'a pas transmis — User.name est non-nullable.
        name: name?.trim() || email.split("@")[0],
        role: "MODERATOR",
      },
    })
  }

  // Promotion uniquement depuis VIEWER : un ADMIN ne doit JAMAIS être
  // rétrogradé en MODERATOR au passage par Moodle.
  if (existing.role === "VIEWER") {
    return prisma.user.update({
      where: { id: existing.id },
      data: { role: "MODERATOR" },
    })
  }

  return existing
}
