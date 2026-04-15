import { Suspense } from "react"
import EgressLayoutClient from "./page.client"

export default function EgressLayoutPage() {
  return (
    <Suspense fallback={<div style={{ background: "#0d1117", height: "100vh", width: "100vw" }} />}>
      <EgressLayoutClient />
    </Suspense>
  )
}
