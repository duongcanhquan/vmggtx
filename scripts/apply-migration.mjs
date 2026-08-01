// ============================================================
// Áp 1 file migration SQL lên database (dùng DATABASE_URL trong .env)
//   node scripts/apply-migration.mjs supabase/migrations/042_overview_report.sql
// ============================================================
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pg from 'pg'

// Nạp .env thủ công (không phụ thuộc dotenv)
const envText = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
for (const line of envText.split(/\r?\n/)) {
  const match = line.match(/^(\w+)=(.*)$/)
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, '')
  }
}

const file = process.argv[2]
if (!file) {
  console.error('Cách dùng: node scripts/apply-migration.mjs <đường-dẫn-file-sql>')
  process.exit(1)
}

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!connectionString) {
  console.error('Thiếu DATABASE_URL / DIRECT_URL trong .env')
  process.exit(1)
}

const sql = readFileSync(resolve(process.cwd(), file), 'utf8')
const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
})

try {
  await client.connect()
  await client.query(sql)
  console.log(`[OK] Đã áp migration: ${file}`)
} catch (error) {
  console.error(`[LỖI] ${error.message}`)
  process.exitCode = 1
} finally {
  await client.end()
}
