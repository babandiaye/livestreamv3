import { auth } from "@/auth"
import { redirect } from "next/navigation"
import AdminClient from "./admin.client"
import type { Role } from "@/types"

export default async function AdminPage() {
  const session = await auth()
  if (!session) redirect("/")
  if (!["ADMIN", "MODERATOR"].includes(session.user.role)) redirect("/")
  return (
    <AdminClient
      user={{
        id: session.user.id,
        name: session.user.name ?? null,
        email: session.user.email ?? null,
        role: session.user.role as Role,
      }}
    />
  )
}
