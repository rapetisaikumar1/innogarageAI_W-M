import { neon } from '@neondatabase/serverless'
import 'dotenv/config'

async function main() {
  const sql = neon(process.env.DATABASE_URL!)
  const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`
  console.log('Tables in DB:', tables.map((r: any) => r.table_name).join(', '))
  for (const row of tables) {
    try {
      const cnt = await sql(`SELECT COUNT(*) as c FROM "${(row as any).table_name}"`)
      console.log(`  ${(row as any).table_name}: ${(cnt[0] as any).c} rows`)
    } catch (e: any) {
      console.log(`  ${(row as any).table_name}: ERROR - ${e.message}`)
    }
  }
}

main().catch(console.error)
