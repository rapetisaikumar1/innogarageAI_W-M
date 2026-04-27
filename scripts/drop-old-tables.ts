import { neon } from '@neondatabase/serverless'
import 'dotenv/config'

async function main() {
  const sql = neon(process.env.DATABASE_URL!)
  
  // Drop old CRM tables and old users table to start fresh
  const drops = [
    sql`DROP TABLE IF EXISTS "candidate_assignments" CASCADE`,
    sql`DROP TABLE IF EXISTS "audit_logs" CASCADE`,
    sql`DROP TABLE IF EXISTS "calls" CASCADE`,
    sql`DROP TABLE IF EXISTS "follow_ups" CASCADE`,
    sql`DROP TABLE IF EXISTS "notes" CASCADE`,
    sql`DROP TABLE IF EXISTS "status_history" CASCADE`,
    sql`DROP TABLE IF EXISTS "messages" CASCADE`,
    sql`DROP TABLE IF EXISTS "candidates" CASCADE`,
    sql`DROP TABLE IF EXISTS "users" CASCADE`,
    sql`DROP TABLE IF EXISTS "profiles" CASCADE`,
    sql`DROP TABLE IF EXISTS "plans" CASCADE`,
  ]

  for (const [i, drop] of drops.entries()) {
    try {
      await drop
      console.log(`Drop ${i + 1} done`)
    } catch (e: any) {
      console.log(`Error on drop ${i + 1}: ${e.message}`)
    }
  }

  console.log('Done. Run npx drizzle-kit push to create fresh schema.')
}

main().catch(console.error)
