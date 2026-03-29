import 'dotenv/config'
import { auth } from '../lib/auth.js'

const [,, email, password, name] = process.argv

if (!email || !password || !name) {
  console.error('Usage: npx tsx src/scripts/create-admin.ts <email> <password> <name>')
  process.exit(1)
}

async function main() {
  try {
    const user = await auth.api.createUser({
      body: {
        email,
        password,
        name,
        role: 'admin',
      },
    })
    console.log(`Admin user created: ${user.user.email} (${user.user.name})`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`Failed to create admin: ${msg}`)
    process.exit(1)
  }
}

main()
