import { auth } from "@/auth"
import { redirect } from "next/navigation"
import ModeratorClient from "./moderator.client"
import type { Role } from "@/types"

export default async function ModeratorPage() {
  const session = await auth()
  if (!session) redirect("/")
  if (session.user.role !== "MODERATOR") redirect("/")
  return (
    <ModeratorClient
      user={{
        id: session.user.id,
        name: session.user.name ?? null,
        email: session.user.email ?? null,
        role: session.user.role as Role,
      }}
    />
  )
}
