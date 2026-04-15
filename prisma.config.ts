import path from 'node:path'
import { defineConfig } from 'prisma/config'

const DATABASE_URL = process.env.DATABASE_URL ?? 
  'postgresql://livekit:LivekitUnchk2026!@127.0.0.1:5432/livestreamv2'

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    url: DATABASE_URL,
  },
})
