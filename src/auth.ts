import NextAuth, { type DefaultSession } from "next-auth"
import Keycloak from "next-auth/providers/keycloak"
import { prisma } from "@/lib/prisma"
import { isStudentAffiliation, isStudentBlockEnabled } from "@/lib/settings"
import type { Role } from "@/types"

declare module "next-auth" {
  interface Session extends DefaultSession {
    id_token?: string
    user: {
      id: string
      role: Role
    } & DefaultSession["user"]
  }
}

function mapKeycloakRoleToAppRole(roles: string[]): Role {
  if (roles.includes("livestream-admin")) return "ADMIN"
  if (roles.includes("livestream-moderator")) return "MODERATOR"
  return "VIEWER"
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Keycloak({
      clientId: process.env.KEYCLOAK_CLIENT_ID!,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET!,
      issuer: process.env.KEYCLOAK_ISSUER!,
    }),
  ],
  callbacks: {
    // Refus d'ouverture de session SSO pour un étudiant quand le blocage est
    // activé. Placé dans signIn (avant jwt) : l'étudiant bloqué n'est même pas
    // créé/mis à jour en base. Le chemin Moodle (/api/moodle/join) n'utilise pas
    // le SSO et n'est donc PAS concerné — un étudiant y accède toujours.
    async signIn({ profile }) {
      const affiliation = (profile as any)?.affiliation
      if (isStudentAffiliation(affiliation) && (await isStudentBlockEnabled())) {
        // Chaîne de redirection : Auth.js envoie l'utilisateur vers cette page
        // d'information au lieu d'ouvrir la session.
        return "/acces-refuse"
      }
      return true
    },

    async jwt({ token, account, profile }) {
      if (account) {
        token.access_token = account.access_token
        token.id_token = account.id_token
        const p = profile as any
        const clientRoles: string[] =
          p?.resource_access?.[process.env.KEYCLOAK_CLIENT_ID!]?.roles ?? []
        const realmRoles: string[] =
          p?.realm_access?.roles ?? []
        // Un étudiant est TOUJOURS VIEWER, quels que soient ses rôles Keycloak :
        // règle métier indépendante de l'interrupteur de blocage. Empêche qu'un
        // affiliation=Etudiant se retrouve modérateur ou admin.
        const keycloakRole = isStudentAffiliation(p?.affiliation)
          ? "VIEWER"
          : mapKeycloakRoleToAppRole([...clientRoles, ...realmRoles])

        try {
          const existingUser = await prisma.user.findFirst({
            where: {
              OR: [
                { keycloakId: token.sub! },
                { email: token.email ?? "" },
              ],
            },
          })

          if (existingUser) {
            // Préservation d'un rôle élevé attribué manuellement (Keycloak ne
            // renvoie parfois pas les rôles applicatifs) — SAUF pour un étudiant,
            // qui doit rester VIEWER même s'il avait été promu par erreur en base.
            const isStudent = isStudentAffiliation(p?.affiliation)
            const keepRole =
              !isStudent && keycloakRole === "VIEWER" && existingUser.role !== "VIEWER"
                ? existingUser.role
                : keycloakRole

            await prisma.user.update({
              where: { id: existingUser.id },
              data: {
                keycloakId: token.sub!,
                email: token.email ?? "",
                name: token.name ?? "",
                role: keepRole,
              },
            })
            token.dbId   = existingUser.id
            token.dbRole = keepRole
          } else {
            const newUser = await prisma.user.create({
              data: {
                keycloakId: token.sub!,
                email: token.email ?? "",
                name: token.name ?? "",
                role: keycloakRole,
              },
            })
            token.dbId   = newUser.id
            token.dbRole = keycloakRole
          }
        } catch (e) {
          console.error("Erreur sync user:", e)
          token.dbRole = keycloakRole
        }
      } else {
        try {
          if (token.dbId) {
            const user = await prisma.user.findUnique({
              where: { id: token.dbId as string },
              select: { id: true, role: true },
            })
            if (user) {
              token.dbId   = user.id
              token.dbRole = user.role
            }
          }
        } catch (e) {
          console.error("Erreur refresh user:", e)
        }
      }
      return token
    },

    async session({ session, token }) {
      session.id_token  = token.id_token as string | undefined
      session.user.id   = token.dbId as string ?? ""
      session.user.role = token.dbRole as Role ?? "VIEWER"
      return session
    },
  },

  events: {
    async signOut(message) {
      if ("token" in message && message.token?.id_token) {
        const logoutUrl = new URL(
          `${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/logout`
        )
        logoutUrl.searchParams.set("id_token_hint", message.token.id_token as string)
        logoutUrl.searchParams.set(
          "post_logout_redirect_uri",
          process.env.NEXT_PUBLIC_SITE_URL!
        )
        await fetch(logoutUrl.toString())
      }
    },
  },

  pages: { signIn: "/" },
})
