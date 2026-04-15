import { auth } from "@/auth"
import { redirect } from "next/navigation"
import StudentClient from "./student.client"
import type { Role } from "@/types"

export default async function StudentPage() {
  const session = await auth()
  if (!session) redirect("/")
  if (session.user.role !== "VIEWER") redirect("/")
  return (
    <StudentClient
      user={{
        id: session.user.id,
        name: session.user.name ?? null,
        email: session.user.email ?? null,
        role: session.user.role as Role,
      }}
    />
  )
}
