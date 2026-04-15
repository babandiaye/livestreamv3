import { NextRequest, NextResponse } from "next/server"

export function validateMoodleKey(req: NextRequest): NextResponse | null {
  const key = req.headers.get("x-api-key")
  if (!key || key !== process.env.MOODLE_API_KEY) {
    return NextResponse.json({ error: "Clé API invalide" }, { status: 401 })
  }
  return null
}
