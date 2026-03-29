import { useState, type FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import { authClient } from '@/lib/auth-client'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await authClient.signIn.email({
        email,
        password,
      })

      if (result.error) {
        setError(result.error.message || 'Invalid email or password')
        return
      }

      navigate(from, { replace: true })
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="w-full max-w-sm rounded-2xl p-8 shadow-xl" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          >
            <LogIn className="h-7 w-7 text-fairy-500" aria-hidden="true" />
          </div>
          <h1 className="text-body text-xl font-semibold">Home Fairy</h1>
          <p className="text-caption mt-1 text-sm">Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="text-body mb-1 block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
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
            <label htmlFor="password" className="text-body mb-1 block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
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

          {error && (
            <p className="rounded-lg px-3 py-2 text-sm text-red-400" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }} role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-fairy-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-fairy-600 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
