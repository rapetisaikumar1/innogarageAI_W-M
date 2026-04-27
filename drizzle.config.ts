import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

config()

export default defineConfig({
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!
  },
  tablesFilter: ['users', 'profiles', 'plans']
})
