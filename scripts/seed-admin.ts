import 'dotenv/config'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { users, punchCards } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import * as readline from 'readline'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle(pool)

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = (q: string) => new Promise<string>(resolve => rl.question(q, resolve))

async function main() {
  console.log('\n=== GAFL First Admin Setup ===\n')

  const username = await ask('Admin username: ')
  const email = await ask('Admin email: ')
  const password = await ask('Admin password: ')

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (existing.length > 0) {
    await db.update(users).set({ isAdmin: true }).where(eq(users.email, email))
    console.log(`\n✓ Existing user "${email}" promoted to admin.`)
  } else {
    const passwordHash = await bcrypt.hash(password, 12)
    const [user] = await db.insert(users).values({ username, email, passwordHash, isAdmin: true }).returning()
    await db.insert(punchCards).values({ userId: user.id })
    console.log(`\n✓ Admin user "${username}" created.`)
  }

  console.log('You can now log in and access the admin panel.\n')
  rl.close()
  await pool.end()
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
