import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'
import type { SpotifySettingsDto, SettingsTestResult, SpotifyRedirectUriDto } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { Section } from './Section'
import { SecretInput } from './SecretInput'
import { TestResultBadge } from './TestResultBadge'

const SET = '<set>'

// Mirrors the server-side regex in `settings-spotify.ts` so we can show an
// inline error before the user submits. Must stay in sync.
const PUBLIC_BASE_URL_RE = /^https?:\/\/[^/]+$/u

// NOTE (Phase 7, WI #4): the Spotify Redirect URI is intentionally NOT
// user-editable. It's derived from `publicBaseUrl` server-side and shown
// read-only with a Copy button so the user pastes the exact same string
// the OAuth flow uses into Spotify's developer console. The legacy
// `redirectUri` field is still accepted by the generic PUT endpoint for
// backwards compatibility, but the form below doesn't surface it.

export function SpotifySection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'spotify'],
    queryFn: () => api.settings.getGroup<SpotifySettingsDto>('spotify'),
  })

  const { data: redirect, isLoading: redirectLoading } = useQuery({
    queryKey: ['settings', 'spotify', 'redirect-uri'],
    queryFn: () => api.settings.spotifyRedirectUri(),
  })

  const [publicBaseUrl, setPublicBaseUrl] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [testResult, setTestResult] = useState<SettingsTestResult | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!redirect) return
    setPublicBaseUrl(redirect.publicBaseUrl ?? '')
  }, [redirect])

  useEffect(() => {
    if (!data) return
    setClientId(data.clientId ?? '')
    setClientSecret('')
  }, [data])

  const secretStored = data?.clientSecret === SET

  const publicBaseUrlError =
    publicBaseUrl !== '' && !PUBLIC_BASE_URL_RE.test(publicBaseUrl)
      ? 'Must look like https://host (no trailing slash, no path)'
      : null

  const isPublicBaseUrlDirty = useMemo(() => {
    if (!redirect) return false
    return publicBaseUrl !== (redirect.publicBaseUrl ?? '')
  }, [redirect, publicBaseUrl])

  const canSubmitPublicBaseUrl =
    !publicBaseUrlError && isPublicBaseUrlDirty

  const isCredsDirty = useMemo(() => {
    if (!data) return false
    return clientId !== (data.clientId ?? '') || clientSecret !== ''
  }, [data, clientId, clientSecret])

  const canSubmitCreds = isCredsDirty

  function buildCredsBody(): Record<string, string | null | undefined> {
    const body: Record<string, string | null | undefined> = {}
    body.clientId = clientId === '' ? null : clientId
    if (clientSecret !== '') body.clientSecret = clientSecret
    return body
  }

  function buildTestBody(): Record<string, string | null | undefined> {
    return {
      clientId: clientId || null,
      clientSecret: clientSecret === '' ? (secretStored ? SET : null) : clientSecret,
    }
  }

  const publicBaseUrlMutation = useMutation({
    mutationFn: () =>
      api.settings.setSpotifyPublicBaseUrl(publicBaseUrl === '' ? null : publicBaseUrl),
    onSuccess: (next: SpotifyRedirectUriDto) => {
      queryClient.setQueryData(['settings', 'spotify', 'redirect-uri'], next)
      queryClient.invalidateQueries({ queryKey: ['settings', 'spotify'] })
      toast({ message: 'Public base URL saved' })
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast({ message: `Couldn't save: ${msg}`, type: 'error' })
    },
  })

  const credsMutation = useMutation({
    mutationFn: () => api.settings.putGroup<SpotifySettingsDto>('spotify', buildCredsBody()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'spotify'] })
      queryClient.invalidateQueries({ queryKey: ['settings', 'spotify', 'redirect-uri'] })
      setTestResult(null)
      toast({ message: 'Credentials saved' })
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast({ message: `Couldn't save: ${msg}`, type: 'error' })
    },
  })

  const testMutation = useMutation({
    mutationFn: () => api.settings.test<SettingsTestResult>('spotify', buildTestBody()),
    onSuccess: (result) => setTestResult(result),
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setTestResult({ ok: false, error: msg })
    },
  })

  const handleField = (setter: (v: string) => void) => (v: string) => {
    setter(v)
    setTestResult(null)
  }

  const canTest = clientId !== '' && (clientSecret !== '' || secretStored)

  async function handleCopy(): Promise<void> {
    if (!redirect?.redirectUri) return
    try {
      await navigator.clipboard.writeText(redirect.redirectUri)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({ message: "Couldn't copy — select the URL and copy manually", type: 'error' })
    }
  }

  const redirectUri = redirect?.redirectUri ?? null
  const publicBaseUrlSet = redirect?.publicBaseUrl != null && redirect.publicBaseUrl !== ''

  return (
    <Section title="Spotify">
      <p className="text-caption text-xs mb-4">
        Spotify Developer credentials and the public-facing address Spotify's
        OAuth callback will hit.
      </p>

      {/* Block 1 — read-only Redirect URI with Copy */}
      <div className="space-y-2">
        <h4 className="text-heading text-sm font-semibold">
          Step 1 — Paste this URL into your Spotify Dev Console
        </h4>

        {!publicBaseUrlSet ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200"
          >
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>Set your public base URL below to generate the redirect URI.</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-start gap-2">
            <label htmlFor="spotify-redirect-uri" className="sr-only">Spotify redirect URI</label>
            <input
              id="spotify-redirect-uri"
              type="text"
              readOnly
              value={redirectUri ?? ''}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              aria-label="Spotify redirect URI — paste into Spotify Developer Console"
              className="input-field h-11 min-w-0 flex-1 rounded-lg border px-3 font-mono text-xs focus:border-fairy-500 focus:outline-none overflow-x-auto"
            />
            <button
              type="button"
              onClick={handleCopy}
              disabled={!redirectUri || redirectLoading}
              aria-label="Copy redirect URI to clipboard"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 min-h-[44px] surface border border-[var(--border-secondary)] text-heading text-sm hover:brightness-95 dark:hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-green-400" aria-hidden="true" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  Copy
                </>
              )}
            </button>
          </div>
        )}

        <p className="text-caption text-xs">
          In the Spotify Developer Dashboard, open your app → Edit Settings → Redirect URIs → add this exact URL. Must match character-for-character.
        </p>
      </div>

      {/* Block 2 — public base URL */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (canSubmitPublicBaseUrl && !publicBaseUrlMutation.isPending) {
            publicBaseUrlMutation.mutate()
          }
        }}
        className="space-y-4 mt-6 pt-6 border-t border-[var(--border-secondary)]"
      >
        <h4 className="text-heading text-sm font-semibold">Step 2 — Your public address</h4>

        <div>
          <label htmlFor="spotify-publicbaseurl" className="text-heading text-sm mb-1.5 block">
            Public base URL
          </label>
          <input
            id="spotify-publicbaseurl"
            type="url"
            inputMode="url"
            value={publicBaseUrl}
            onChange={(e) => handleField(setPublicBaseUrl)(e.target.value)}
            disabled={redirectLoading}
            autoComplete="off"
            spellCheck={false}
            placeholder="https://home.thefairies.ie"
            aria-invalid={!!publicBaseUrlError}
            aria-describedby={publicBaseUrlError ? 'spotify-publicbaseurl-err' : 'spotify-publicbaseurl-help'}
            className="input-field h-11 w-full rounded-lg border px-3 text-sm focus:border-fairy-500 focus:outline-none"
          />
          {publicBaseUrlError ? (
            <p id="spotify-publicbaseurl-err" className="text-red-400 text-xs mt-1">
              {publicBaseUrlError}
            </p>
          ) : (
            <p id="spotify-publicbaseurl-help" className="text-caption text-xs mt-1">
              The publicly reachable address for this server. Include the scheme
              (https://) and no trailing slash. If you use Cloudflare Tunnel or
              similar, this is the public hostname you configured.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <button
            type="submit"
            disabled={!canSubmitPublicBaseUrl || publicBaseUrlMutation.isPending}
            className="rounded-lg px-4 py-2 min-h-[44px] bg-fairy-500 text-white text-sm font-medium hover:bg-fairy-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            {publicBaseUrlMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>

      {/* Block 3 — Spotify app credentials */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (canSubmitCreds && !credsMutation.isPending) credsMutation.mutate()
        }}
        className="space-y-4 mt-6 pt-6 border-t border-[var(--border-secondary)]"
      >
        <h4 className="text-heading text-sm font-semibold">Step 3 — Your Spotify app credentials</h4>

        <div>
          <label htmlFor="spotify-clientid" className="text-heading text-sm mb-1.5 block">
            Client ID
          </label>
          <input
            id="spotify-clientid"
            type="text"
            value={clientId}
            onChange={(e) => handleField(setClientId)(e.target.value)}
            disabled={isLoading}
            autoComplete="off"
            spellCheck={false}
            placeholder="e.g. 1a2b3c4d5e6f7g8h…"
            className="input-field h-11 w-full rounded-lg border px-3 text-sm focus:border-fairy-500 focus:outline-none"
          />
        </div>

        <SecretInput
          id="spotify-clientsecret"
          label="Client secret"
          value={clientSecret}
          onChange={handleField(setClientSecret)}
          isStoredSecret={secretStored}
          disabled={isLoading}
        />

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <button
            type="submit"
            disabled={!canSubmitCreds || credsMutation.isPending}
            className="rounded-lg px-4 py-2 min-h-[44px] bg-fairy-500 text-white text-sm font-medium hover:bg-fairy-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            {credsMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>

      {/* Block 4 — Test the connection */}
      <div className="space-y-2 mt-6 pt-6 border-t border-[var(--border-secondary)]">
        <h4 className="text-heading text-sm font-semibold">Step 4 — Test the connection</h4>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => testMutation.mutate()}
            disabled={!canTest || testMutation.isPending}
            className="rounded-lg px-4 py-2 min-h-[44px] surface border border-[var(--border-secondary)] text-heading text-sm hover:brightness-95 dark:hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            {testMutation.isPending ? 'Testing…' : 'Test credentials'}
          </button>
          <TestResultBadge
            result={testResult}
            loading={testMutation.isPending}
            renderOk={() => 'Credentials valid'}
          />
        </div>
      </div>
    </Section>
  )
}
