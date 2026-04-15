import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3"
import { RoomServiceClient, EgressClient, IngressClient } from "livekit-server-sdk"

export const dynamic = "force-dynamic"

type ServiceStatus = {
  name: string
  status: "ok" | "error" | "warning"
  latency: number | null
  message: string
  details?: string
}

async function checkWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs = 8000
): Promise<{ result: T; latency: number }> {
  const start = Date.now()
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout après ${timeoutMs}ms`)), timeoutMs)
  )
  const result = await Promise.race([fn(), timeout])
  return { result, latency: Date.now() - start }
}

async function checkPostgresql(): Promise<ServiceStatus> {
  try {
    const { latency } = await checkWithTimeout(async () => {
      await prisma.$queryRaw`SELECT 1`
    })
    const userCount = await prisma.user.count()
    const sessionCount = await prisma.session.count()
    return {
      name: "PostgreSQL",
      status: "ok",
      latency,
      message: `Connecté — ${userCount} utilisateurs, ${sessionCount} sessions`,
    }
  } catch (e) {
    return {
      name: "PostgreSQL",
      status: "error",
      latency: null,
      message: "Connexion échouée",
      details: e instanceof Error ? e.message : String(e),
    }
  }
}

async function checkMinio(): Promise<ServiceStatus> {
  try {
    const s3 = new S3Client({
      region: process.env.S3_REGION || "us-east-1",
      endpoint: process.env.S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY!,
        secretAccessKey: process.env.S3_SECRET!,
      },
      forcePathStyle: true,
    })
    const bucket = process.env.S3_BUCKET!
    const { latency } = await checkWithTimeout(async () => {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }))
    })
    return {
      name: "MinIO (S3)",
      status: "ok",
      latency,
      message: `Bucket "${bucket}" accessible`,
      details: process.env.S3_ENDPOINT,
    }
  } catch (e) {
    return {
      name: "MinIO (S3)",
      status: "error",
      latency: null,
      message: "Connexion échouée",
      details: e instanceof Error ? e.message : String(e),
    }
  }
}

async function checkLiveKit(): Promise<ServiceStatus> {
  try {
    const httpUrl = process.env.LIVEKIT_WS_URL!
      .replace("wss://", "https://")
      .replace("ws://", "http://")
    const roomService = new RoomServiceClient(
      httpUrl,
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!
    )
    const { result: rooms, latency } = await checkWithTimeout(async () => {
      return await roomService.listRooms()
    })
    const liveRooms = rooms.filter((r: any) => r.numParticipants > 0)
    return {
      name: "LiveKit SFU",
      status: "ok",
      latency,
      message: `Connecté — ${rooms.length} salle(s), ${liveRooms.length} active(s)`,
      details: httpUrl,
    }
  } catch (e) {
    return {
      name: "LiveKit SFU",
      status: "error",
      latency: null,
      message: "Connexion échouée",
      details: e instanceof Error ? e.message : String(e),
    }
  }
}

async function checkEgress(): Promise<ServiceStatus> {
  try {
    const httpUrl = process.env.LIVEKIT_WS_URL!
      .replace("wss://", "https://")
      .replace("ws://", "http://")
    const egressClient = new EgressClient(
      httpUrl,
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!
    )
    const { result: egresses, latency } = await checkWithTimeout(async () => {
      return await egressClient.listEgress()
    })
    const active = egresses.filter((e: any) => e.status === 1 || e.status === 2)
    return {
      name: "Egress (Enregistrement)",
      status: "ok",
      latency,
      message: `Service disponible — ${active.length} egress actif(s)`,
    }
  } catch (e) {
    return {
      name: "Egress (Enregistrement)",
      status: "error",
      latency: null,
      message: "Service indisponible",
      details: e instanceof Error ? e.message : String(e),
    }
  }
}

async function checkIngress(): Promise<ServiceStatus> {
  try {
    const httpUrl = process.env.LIVEKIT_WS_URL!
      .replace("wss://", "https://")
      .replace("ws://", "http://")
    const ingressClient = new IngressClient(
      httpUrl,
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!
    )
    const { result: ingresses, latency } = await checkWithTimeout(async () => {
      return await ingressClient.listIngress()
    })
    return {
      name: "Ingress (OBS/RTMP)",
      status: "ok",
      latency,
      message: `Service disponible — ${ingresses.length} ingress configuré(s)`,
    }
  } catch (e) {
    return {
      name: "Ingress (OBS/RTMP)",
      status: "error",
      latency: null,
      message: "Service indisponible",
      details: e instanceof Error ? e.message : String(e),
    }
  }
}

async function checkWebhook(): Promise<ServiceStatus> {
  try {
    // Vérifier les enregistrements récents pour détecter si le webhook fonctionne
    const recentReady = await prisma.recording.count({
      where: {
        status: "READY",
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    })
    const stuckProcessing = await prisma.recording.count({
      where: {
        status: "PROCESSING",
        createdAt: { lt: new Date(Date.now() - 10 * 60 * 1000) },
      },
    })

    if (stuckProcessing > 0) {
      return {
        name: "Webhook LiveKit",
        status: "warning",
        latency: null,
        message: `${stuckProcessing} enregistrement(s) bloqué(s) en PROCESSING depuis >10min`,
        details: "Le webhook ne semble pas recevoir les événements egress_ended",
      }
    }

    return {
      name: "Webhook LiveKit",
      status: "ok",
      latency: null,
      message: `Opérationnel — ${recentReady} enregistrement(s) READY (24h)`,
      details: `${process.env.NEXT_PUBLIC_SITE_URL}/api/webhook/livekit`,
    }
  } catch (e) {
    return {
      name: "Webhook LiveKit",
      status: "error",
      latency: null,
      message: "Vérification échouée",
      details: e instanceof Error ? e.message : String(e),
    }
  }
}

async function checkKeycloak(): Promise<ServiceStatus> {
  if (process.env.KEYCLOAK_ENABLED !== "true") {
    return {
      name: "Keycloak SSO",
      status: "warning",
      latency: null,
      message: "Désactivé (KEYCLOAK_ENABLED != true)",
    }
  }
  try {
    const issuer = process.env.KEYCLOAK_ISSUER!
    const wellKnown = `${issuer}/.well-known/openid-configuration`
    const { latency } = await checkWithTimeout(async () => {
      const res = await fetch(wellKnown, { signal: AbortSignal.timeout(6000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    })
    return {
      name: "Keycloak SSO",
      status: "ok",
      latency,
      message: "OpenID Connect disponible",
      details: issuer,
    }
  } catch (e) {
    return {
      name: "Keycloak SSO",
      status: "error",
      latency: null,
      message: "Connexion échouée",
      details: e instanceof Error ? e.message : String(e),
    }
  }
}

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 })

  const checks = await Promise.allSettled([
    checkPostgresql(),
    checkLiveKit(),
    checkEgress(),
    checkIngress(),
    checkMinio(),
    checkWebhook(),
    checkKeycloak(),
  ])

  const services: ServiceStatus[] = checks.map((c) =>
    c.status === "fulfilled"
      ? c.value
      : {
          name: "Inconnu",
          status: "error" as const,
          latency: null,
          message: "Erreur inattendue",
          details: c.reason?.message,
        }
  )

  const allOk = services.every((s) => s.status === "ok")
  const hasError = services.some((s) => s.status === "error")

  return NextResponse.json({
    overall: hasError ? "degraded" : allOk ? "operational" : "partial",
    timestamp: new Date().toISOString(),
    services,
  })
}
