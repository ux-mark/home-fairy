import { useState, useEffect, useMemo, type FormEvent } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { Sparkles, Home } from 'lucide-react'
import { api } from '@/lib/api'

// ── Welcome messages ────────────────────────────────────────────────────────

const GUEST_WELCOMES = [
  (name: string) => `Hey ${name}, come on in!`,
  (name: string) => `${name}, welcome to the magic!`,
  (name: string) => `The fairies have been expecting you, ${name}`,
  (name: string) => `${name}, your enchanted home awaits`,
  (name: string) => `Step right in, ${name}!`,
  (name: string) => `${name}, make yourself at home`,
  (name: string) => `A warm welcome, ${name}!`,
  (name: string) => `${name}, the door is open for you`,
]

const RESIDENT_WELCOMES = [
  (name: string) => `Welcome home, ${name}!`,
  (name: string) => `${name}, ready to join the household?`,
  (name: string) => `The fairies saved a spot for you, ${name}`,
  (name: string) => `${name}, time to make it official`,
  (name: string) => `Welcome to the family, ${name}!`,
  (name: string) => `${name}, your new home is just a step away`,
]

const GUEST_SUBTITLES = [
  'Your access is all set up and ready to go.',
  'Everything is ready for your visit.',
  'Tap below to get started.',
  'Just one tap and you are in.',
]

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ── Page title for link previews ────────────────────────────────────────────

const SHARE_TITLES = [
  'The Fairies welcome you',
  'You are invited to Home Fairy',
  'A little magic awaits you',
  'Your enchanted home access',
  'Come on in — the fairies are ready',
]

function useShareTitle() {
  useEffect(() => {
    const title = pickRandom(SHARE_TITLES)
    document.title = title
    // Set Open Graph meta for link previews (WhatsApp, iMessage, etc.)
    let ogTitle = document.querySelector('meta[property="og:title"]') as HTMLMetaElement | null
    if (!ogTitle) {
      ogTitle = document.createElement('meta')
      ogTitle.setAttribute('property', 'og:title')
      document.head.appendChild(ogTitle)
    }
    ogTitle.content = title

    let ogDesc = document.querySelector('meta[property="og:description"]') as HTMLMetaElement | null
    if (!ogDesc) {
      ogDesc = document.createElement('meta')
      ogDesc.setAttribute('property', 'og:description')
      document.head.appendChild(ogDesc)
    }
    ogDesc.content = 'Tap to enter your smart home'

    return () => {
      document.title = 'Home Fairy'
    }
  }, [])
}

// ── Skeleton loader ──────────────────────────────────────────────────────────

function InviteSkeleton() {
  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-8 shadow-xl"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
        role="status"
        aria-label="Loading invitation"
      >
        <div className="mb-8 flex flex-col items-center gap-4">
          <div
            className="h-14 w-14 animate-pulse rounded-full"
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          />
          <div
            className="h-5 w-48 animate-pulse rounded-lg"
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          />
          <div
            className="h-4 w-56 animate-pulse rounded-lg"
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          />
        </div>
        <div
          className="h-12 w-full animate-pulse rounded-lg"
          style={{ backgroundColor: 'var(--bg-tertiary)' }}
        />
      </div>
    </div>
  )
}

// ── Invalid state ────────────────────────────────────────────────────────────

function InvalidInvite({ reason }: { reason?: string }) {
  useShareTitle()
  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-8 shadow-xl text-center"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-fairy-500/15"
        >
          <Sparkles className="h-7 w-7 text-fairy-400" aria-hidden="true" />
        </div>
        <h1 className="text-heading text-xl font-semibold mb-2">Link unavailable</h1>
        <p className="text-caption text-sm mb-6">
          {reason ?? 'This link has expired or is no longer valid.'}
        </p>
        <Link
          to="/login"
          className="inline-flex items-center gap-2 rounded-lg bg-fairy-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-fairy-600"
        >
          <Home className="h-4 w-4" aria-hidden="true" />
          Go to login
        </Link>
      </div>
    </div>
  )
}

// ── Guest entry screen ───────────────────────────────────────────────────────

function GuestEntry({ token, name }: { token: string; name: string }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useShareTitle()

  const welcome = useMemo(() => pickRandom(GUEST_WELCOMES)(name), [name])
  const subtitle = useMemo(() => pickRandom(GUEST_SUBTITLES), [])

  async function handleEnter() {
    setError('')
    setLoading(true)
    try {
      const result = await api.accessLinks.redeem(token)
      if (result.success) {
        navigate(result.redirect || '/', { replace: true })
      } else {
        setError(result.error ?? 'This link could not be used. Please try again.')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-8 shadow-xl text-center"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-fairy-400 to-fairy-600">
          <Sparkles className="h-8 w-8 text-white" aria-hidden="true" />
        </div>
        <h1 className="text-heading text-xl font-semibold mb-2">{welcome}</h1>
        <p className="text-caption text-sm mb-6">{subtitle}</p>

        {error && (
          <p
            className="mb-4 rounded-lg px-3 py-2 text-sm text-red-400"
            style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
            role="alert"
          >
            {error}
          </p>
        )}

        <button
          onClick={handleEnter}
          disabled={loading}
          className="w-full rounded-xl bg-gradient-to-r from-fairy-500 to-fairy-600 px-4 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:shadow-fairy-500/25 hover:brightness-110 disabled:opacity-50"
        >
          {loading ? 'Opening the door...' : "Let's go"}
        </button>
      </div>
    </div>
  )
}

// ── Resident signup form ─────────────────────────────────────────────────────

function ResidentSignup({ token, name: inviteName }: { token: string; name: string }) {
  const navigate = useNavigate()
  const [name, setName] = useState(inviteName)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useShareTitle()

  const welcome = useMemo(() => pickRandom(RESIDENT_WELCOMES)(inviteName), [inviteName])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    try {
      const result = await api.accessLinks.redeem(token, { name, email, password })
      if (result.success) {
        navigate(result.redirect || '/', { replace: true })
      } else {
        setError(result.error ?? 'Could not create your account. Please try again.')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-8 shadow-xl"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-fairy-400 to-fairy-600">
            <Sparkles className="h-8 w-8 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-heading text-xl font-semibold mb-1">{welcome}</h1>
          <p className="text-caption text-sm">Set up your account to get started</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="invite-name" className="text-body mb-1 block text-sm font-medium">
              Name
            </label>
            <input
              id="invite-name"
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-body w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:ring-2 focus:ring-fairy-500/40"
              style={{
                backgroundColor: 'var(--bg-input)',
                borderColor: 'var(--border-primary)',
              }}
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="invite-email" className="text-body mb-1 block text-sm font-medium">
              Email
            </label>
            <input
              id="invite-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="text-body w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:ring-2 focus:ring-fairy-500/40"
              style={{
                backgroundColor: 'var(--bg-input)',
                borderColor: 'var(--border-primary)',
              }}
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="invite-password" className="text-body mb-1 block text-sm font-medium">
              Password
            </label>
            <input
              id="invite-password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="text-body w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:ring-2 focus:ring-fairy-500/40"
              style={{
                backgroundColor: 'var(--bg-input)',
                borderColor: 'var(--border-primary)',
              }}
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="invite-confirm-password" className="text-body mb-1 block text-sm font-medium">
              Confirm password
            </label>
            <input
              id="invite-confirm-password"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="text-body w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:ring-2 focus:ring-fairy-500/40"
              style={{
                backgroundColor: 'var(--bg-input)',
                borderColor: 'var(--border-primary)',
              }}
              disabled={loading}
            />
          </div>

          {error && (
            <p
              className="rounded-lg px-3 py-2 text-sm text-red-400"
              style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
              role="alert"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !name || !email || !password || !confirmPassword}
            className="w-full rounded-xl bg-gradient-to-r from-fairy-500 to-fairy-600 px-4 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:shadow-fairy-500/25 hover:brightness-110 disabled:opacity-50"
          >
            {loading ? 'Setting up your home...' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<'loading' | 'invalid' | 'guest' | 'resident'>('loading')
  const [name, setName] = useState('')
  const [invalidReason, setInvalidReason] = useState<string | undefined>()

  useEffect(() => {
    if (!token) {
      setState('invalid')
      return
    }

    api.accessLinks.verify(token).then((result) => {
      if (!result.valid) {
        setInvalidReason(result.reason)
        setState('invalid')
      } else if (result.mode === 'guest') {
        setName(result.label ?? 'Friend')
        setState('guest')
      } else {
        setName(result.label ?? 'Friend')
        setState('resident')
      }
    }).catch(() => {
      setState('invalid')
    })
  }, [token])

  if (state === 'loading') return <InviteSkeleton />
  if (state === 'invalid') return <InvalidInvite reason={invalidReason} />
  if (state === 'guest') return <GuestEntry token={token!} name={name} />
  return <ResidentSignup token={token!} name={name} />
}
