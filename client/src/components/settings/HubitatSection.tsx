import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, RefreshCw, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'
import type { HubitatSettingsDto, SettingsTestResult, HubitatWebhookUrlDto } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { Section } from './Section'
import { SecretInput } from './SecretInput'
import { TestResultBadge } from './TestResultBadge'

const SET = '<set>'

function isUrl(value: string): boolean {
  try { new URL(value); return true } catch { return false }
}

// NOTE: the Hubitat webhook secret is intentionally NOT user-editable from
// the UI (Phase 6, WI #4). It is auto-generated on first boot and exposed
// only as part of the assembled webhook URL the user copies into Hubitat.
// The PUT /api/settings/hubitat endpoint still accepts `webhookSecret` for
// tests + manual recovery — we just don't render a field for it.

export function HubitatSection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'hubitat'],
    queryFn: () => api.settings.getGroup<HubitatSettingsDto>('hubitat'),
  })

  const { data: webhook, isLoading: webhookLoading } = useQuery({
    queryKey: ['settings', 'hubitat', 'webhook-url'],
    queryFn: () => api.settings.hubitatWebhookUrl(),
  })

  const [baseUrl, setBaseUrl] = useState('')
  const [token, setToken] = useState('')
  const [testResult, setTestResult] = useState<SettingsTestResult | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!data) return
    setBaseUrl(data.baseUrl ?? '')
    setToken('')
  }, [data])

  const tokenStored = data?.token === SET

  const urlError = baseUrl !== '' && !isUrl(baseUrl) ? 'Must be a valid URL' : null

  const isDirty = useMemo(() => {
    if (!data) return false
    return baseUrl !== (data.baseUrl ?? '') || token !== ''
  }, [data, baseUrl, token])

  const canSubmit = !urlError && isDirty

  function buildBody(): Record<string, string | null | undefined> {
    const body: Record<string, string | null | undefined> = {}
    body.baseUrl = baseUrl === '' ? null : baseUrl
    // Only send the token if the user typed one; omit otherwise to preserve
    // the stored secret. webhookSecret is never sent from this form.
    if (token !== '') body.token = token
    return body
  }

  function buildTestBody(): Record<string, string | null | undefined> {
    return {
      baseUrl: baseUrl || null,
      token: token === '' ? (tokenStored ? SET : null) : token,
    }
  }

  const saveMutation = useMutation({
    mutationFn: () => api.settings.putGroup<HubitatSettingsDto>('hubitat', buildBody()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'hubitat'] })
      setTestResult(null)
      toast({ message: 'Settings saved' })
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast({ message: `Couldn't save: ${msg}`, type: 'error' })
    },
  })

  const testMutation = useMutation({
    mutationFn: () => api.settings.test<SettingsTestResult>('hubitat', buildTestBody()),
    onSuccess: (result) => setTestResult(result),
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setTestResult({ ok: false, error: msg })
    },
  })

  const regenerateMutation = useMutation({
    mutationFn: () => api.settings.regenerateHubitatSecret(),
    onSuccess: (next: HubitatWebhookUrlDto) => {
      queryClient.setQueryData(['settings', 'hubitat', 'webhook-url'], next)
      queryClient.invalidateQueries({ queryKey: ['settings', 'hubitat'] })
      toast({ message: 'Webhook URL regenerated — update Hubitat to match' })
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast({ message: `Couldn't regenerate: ${msg}`, type: 'error' })
    },
  })

  const handleField = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setTestResult(null) }

  const canTest = !urlError && baseUrl !== '' && (token !== '' || tokenStored)

  async function handleCopy(): Promise<void> {
    if (!webhook?.url) return
    try {
      await navigator.clipboard.writeText(webhook.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({ message: "Couldn't copy — select the URL and copy manually", type: 'error' })
    }
  }

  function handleRegenerate(): void {
    const ok = window.confirm(
      "Generate a new URL? You'll need to update Hubitat's Maker API postback URL to match. The old URL will stop working.",
    )
    if (!ok) return
    regenerateMutation.mutate()
  }

  const webhookUrl = webhook?.url ?? null
  const webhookMissing = !webhookLoading && webhookUrl === null

  return (
    <Section title="Hubitat">
      <p className="text-caption text-xs mb-4">
        Maker API for Hubitat motion sensors and devices.
      </p>

      {/* Block 1 — read-only webhook URL with Copy + Regenerate */}
      <div className="space-y-2">
        <h4 className="text-heading text-sm font-semibold">
          Step 1 — Paste this URL into Hubitat
        </h4>

        {webhookMissing ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200"
          >
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Couldn't auto-detect a LAN address. Set <code className="font-mono">FAIRY_PUBLIC_HOST</code> in <code className="font-mono">server/.env</code> (e.g. your Pi's IP) and restart the server.
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-start gap-2">
            <label htmlFor="hub-webhook-url" className="sr-only">Hubitat webhook URL</label>
            <input
              id="hub-webhook-url"
              type="text"
              readOnly
              value={webhookUrl ?? ''}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              aria-label="Hubitat webhook URL — paste into Hubitat Maker API"
              className="input-field h-11 min-w-0 flex-1 rounded-lg border px-3 font-mono text-xs focus:border-fairy-500 focus:outline-none overflow-x-auto"
            />
            <button
              type="button"
              onClick={handleCopy}
              disabled={!webhookUrl || webhookLoading}
              aria-label="Copy webhook URL to clipboard"
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
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={!webhookUrl || regenerateMutation.isPending}
              aria-label="Regenerate webhook URL"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 min-h-[44px] surface border border-[var(--border-secondary)] text-heading text-sm hover:brightness-95 dark:hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
            >
              <RefreshCw className={`h-4 w-4 ${regenerateMutation.isPending ? 'animate-spin' : ''}`} aria-hidden="true" />
              {regenerateMutation.isPending ? 'Regenerating…' : 'Regenerate'}
            </button>
          </div>
        )}

        <p className="text-caption text-xs">
          In your Hubitat Maker API app, set "URL to send device events to" to this URL. That's it — no secret to remember, the URL contains everything.
        </p>
      </div>

      {/* Block 2 — user-typed fields */}
      <form
        onSubmit={(e) => { e.preventDefault(); if (canSubmit && !saveMutation.isPending) saveMutation.mutate() }}
        className="space-y-4 mt-6 pt-6 border-t border-[var(--border-secondary)]"
      >
        <h4 className="text-heading text-sm font-semibold">
          Step 2 — Paste your Hubitat details below
        </h4>

        <div>
          <label htmlFor="hub-baseurl" className="text-heading text-sm mb-1.5 block">Hubitat Base URL</label>
          <input
            id="hub-baseurl"
            type="url"
            inputMode="url"
            value={baseUrl}
            onChange={(e) => handleField(setBaseUrl)(e.target.value)}
            disabled={isLoading}
            autoComplete="off"
            spellCheck={false}
            placeholder="http://192.168.x.x/apps/api/6/devices"
            aria-invalid={!!urlError}
            aria-describedby={urlError ? 'hub-baseurl-err' : 'hub-baseurl-help'}
            className="input-field h-11 w-full rounded-lg border px-3 text-sm focus:border-fairy-500 focus:outline-none"
          />
          {urlError ? (
            <p id="hub-baseurl-err" className="text-red-400 text-xs mt-1">{urlError}</p>
          ) : (
            <p id="hub-baseurl-help" className="text-caption text-xs mt-1">
              From Hubitat's Maker API app — the full URL with /apps/api/N/devices.
            </p>
          )}
        </div>

        <div>
          <SecretInput
            id="hub-token"
            label="Hubitat API Token"
            value={token}
            onChange={handleField(setToken)}
            isStoredSecret={tokenStored}
            disabled={isLoading}
            describedBy="hub-token-help"
          />
          <p id="hub-token-help" className="text-caption text-xs mt-1">
            From the same Maker API app — the access_token value.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <button
            type="submit"
            disabled={!canSubmit || saveMutation.isPending}
            className="rounded-lg px-4 py-2 min-h-[44px] bg-fairy-500 text-white text-sm font-medium hover:bg-fairy-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>

      {/* Block 3 — Test the connection */}
      <div className="space-y-2 mt-6 pt-6 border-t border-[var(--border-secondary)]">
        <h4 className="text-heading text-sm font-semibold">Step 3 — Test the connection</h4>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => testMutation.mutate()}
            disabled={!canTest || testMutation.isPending}
            className="rounded-lg px-4 py-2 min-h-[44px] surface border border-[var(--border-secondary)] text-heading text-sm hover:brightness-95 dark:hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            {testMutation.isPending ? 'Testing…' : 'Test connection'}
          </button>
          <TestResultBadge
            result={testResult}
            loading={testMutation.isPending}
            renderOk={(r) => `${r.devicesCount ?? 0} device${(r.devicesCount ?? 0) === 1 ? '' : 's'}`}
          />
        </div>
      </div>
    </Section>
  )
}
