import path from 'node:path'
import { defineConfig } from 'prisma/config'
import { config as dotenvConfig } from 'dotenv'

// Charge les variables d'environnement pour le CLI Prisma (migrate/generate).
// .env.local a priorité sur .env (dotenv n'écrase pas une variable déjà définie).
dotenvConfig({ path: '.env.local' })
dotenvConfig()

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    url: process.env.DATABASE_URL!,
  },
})
