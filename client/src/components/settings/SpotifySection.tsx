import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { SpotifySettingsDto, SettingsTestResult } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { Section } from './Section'
import { SecretInput } from './SecretInput'
import { TestResultBadge } from './TestResultBadge'

const SET = '<set>'

function isUrl(value: string): boolean {
  try { new URL(value); return true } catch { return false }
}

export function SpotifySection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'spotify'],
    queryFn: () => api.settings.getGroup<SpotifySettingsDto>('spotify'),
  })

  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [redirectUri, setRedirectUri] = useState('')
  const [testResult, setTestResult] = useState<SettingsTestResult | null>(null)

  useEffect(() => {
    if (!data) return
    setClientId(data.clientId ?? '')
    setRedirectUri(data.redirectUri ?? '')
    setClientSecret('')
  }, [data])

  const secretStored = data?.clientSecret === SET
  const redirectError = redirectUri !== '' && !isUrl(redirectUri) ? 'Must be a valid URL' : null

  const isDirty = useMemo(() => {
    if (!data) return false
    return (
      clientId !== (data.clientId ?? '') ||
      redirectUri !== (data.redirectUri ?? '') ||
      clientSecret !== ''
    )
  }, [data, clientId, redirectUri, clientSecret])

  const canSubmit = !redirectError && isDirty

  function buildBody(): Record<string, string | null | undefined> {
    const body: Record<string, string | null | undefined> = {}
    body.clientId = clientId === '' ? null : clientId
    body.redirectUri = redirectUri === '' ? null : redirectUri
    if (clientSecret !== '') body.clientSecret = clientSecret
    return body
  }

  function buildTestBody(): Record<string, string | null | undefined> {
    return {
      clientId: clientId || null,
      clientSecret: clientSecret === '' ? (secretStored ? SET : null) : clientSecret,
      redirectUri: redirectUri || null,
    }
  }

  const saveMutation = useMutation({
    mutationFn: () => api.settings.putGroup<SpotifySettingsDto>('spotify', buildBody()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'spotify'] })
      setTestResult(null)
      toast({ message: 'Settings saved' })
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

  const handleField = (setter: (v: string) => void) => (v: string) => { setter(v); setTestResult(null) }

  const canTest = !redirectError && clientId !== '' && (clientSecret !== '' || secretStored)

  return (
    <Section title="Spotify">
      <p className="text-caption text-xs mb-4">
        Spotify Developer credentials. Redirect URI must also be registered in
        your Spotify developer console — changes here don't update Spotify's side.
      </p>

      <form
        onSubmit={(e) => { e.preventDefault(); if (canSubmit && !saveMutation.isPending) saveMutation.mutate() }}
        className="space-y-4"
      >
        <div>
          <label htmlFor="spotify-clientid" className="text-heading text-sm mb-1.5 block">Client ID</label>
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

        <div>
          <label htmlFor="spotify-redirect" className="text-heading text-sm mb-1.5 block">Redirect URI</label>
          <input
            id="spotify-redirect"
            type="url"
            inputMode="url"
            value={redirectUri}
            onChange={(e) => handleField(setRedirectUri)(e.target.value)}
            disabled={isLoading}
            autoComplete="off"
            spellCheck={false}
            placeholder="https://home.example.com/api/spotify/callback"
            aria-invalid={!!redirectError}
            aria-describedby={redirectError ? 'spotify-redirect-err' : undefined}
            className="input-field h-11 w-full rounded-lg border px-3 text-sm focus:border-fairy-500 focus:outline-none"
          />
          {redirectError && (
            <p id="spotify-redirect-err" className="text-red-400 text-xs mt-1">{redirectError}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={!canSubmit || saveMutation.isPending}
            className="rounded-lg px-4 py-2 min-h-[44px] bg-fairy-500 text-white text-sm font-medium hover:bg-fairy-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </button>
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
      </form>
    </Section>
  )
}
