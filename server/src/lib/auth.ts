import { betterAuth } from 'better-auth'
import { admin } from 'better-auth/plugins/admin'
import Database from 'better-sqlite3'

const dbPath = process.env.FAIRY_DB_PATH || './data/thefairies.sqlite'

export const auth = betterAuth({
  database: new Database(dbPath),
  basePath: '/api/auth',
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: [
    'http://192.168.10.201:3001',
    'http://home.thefairies.ie',
    'https://home.thefairies.ie',
    `http://127.0.0.1:${Number(process.env.PORT) || 3001}`,
    `http://localhost:${Number(process.env.PORT) || 3001}`,
  ],
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24,       // refresh session token daily
    cookieCache: {
      enabled: true,
      maxAge: 300, // 5 minutes
    },
  },
  advanced: {
    crossSubDomainCookies: {
      enabled: false,
    },
    defaultCookieAttributes: {
      sameSite: 'lax',
      secure: false,   // served behind nginx on HTTP internally
      httpOnly: true,
    },
  },
  plugins: [
    admin(),
  ],
})
