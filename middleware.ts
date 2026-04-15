import { auth } from "@/auth"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  const keycloakEnabled = process.env.KEYCLOAK_ENABLED === "true"
  if (!keycloakEnabled) return NextResponse.next()

  const { pathname } = request.nextUrl

  // Routes toujours publiques
  if (pathname.startsWith("/api/auth")) return NextResponse.next()
  if (pathname.startsWith("/api/webhook")) return NextResponse.next()
  if (pathname.startsWith("/api/moodle")) return NextResponse.next()
  if (pathname.startsWith("/egress-layout")) return NextResponse.next()

  // /watch public si WATCH_PUBLIC=true
  const watchPublic = process.env.WATCH_PUBLIC === "true"
  if (watchPublic && pathname.startsWith("/watch")) return NextResponse.next()

  // Homepage publique — la page gère elle-même la redirection
  if (pathname === "/") return NextResponse.next()

  const session = await auth()

  if (!session) {
    const autoRedirect = process.env.KEYCLOAK_AUTO_REDIRECT === "true"
    const callbackUrl = encodeURIComponent(request.url)
    if (autoRedirect) {
      return NextResponse.redirect(
        new URL(`/api/auth/signin/keycloak?callbackUrl=${callbackUrl}`, request.url)
      )
    }
    return NextResponse.redirect(new URL(`/?callbackUrl=${callbackUrl}`, request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo-unchk.png).*)"],
}
