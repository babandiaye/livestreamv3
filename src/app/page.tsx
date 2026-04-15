import { auth } from "@/auth"
import { redirect } from "next/navigation"
import HomeClient from "./home.client"

export default async function HomePage() {
  const session = await auth()

  if (session) {
    if (session.user.role === "VIEWER") redirect("/student")
    if (session.user.role === "MODERATOR") redirect("/moderator")
    redirect("/admin")
  }

  return <HomeClient />
}
