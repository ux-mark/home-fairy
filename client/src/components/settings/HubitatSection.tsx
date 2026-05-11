import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { HubitatSettingsDto, SettingsTestResult } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { Section } from './Section'
import { SecretInput } from './SecretInput'
import { TestResultBadge } from './TestResultBadge'

const SET = '<set>'

function isUrl(value: string): boolean {
  try { new URL(value); return true } catch { return false }
}

export function HubitatSection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'hubitat'],
    queryFn: () => api.settings.getGroup<HubitatSettingsDto>('hubitat'),
  })

  const [baseUrl, setBaseUrl] = useState('')
  const [token, setToken] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [testResult, setTestResult] = useState<SettingsTestResult | null>(null)

  useEffect(() => {
    if (!data) return
    setBaseUrl(data.baseUrl ?? '')
    setToken('')
    setWebhookSecret('')
  }, [data])

  const tokenStored = data?.token === SET
  const webhookStored = data?.webhookSecret === SET

  const urlError = baseUrl !== '' && !isUrl(baseUrl) ? 'Must be a valid URL' : null

  const isDirty = useMemo(() => {
    if (!data) return false
    return (
      baseUrl !== (data.baseUrl ?? '') ||
      token !== '' ||
      webhookSecret !== ''
    )
  }, [data, baseUrl, token, webhookSecret])

  const canSubmit = !urlError && isDirty

  function buildBody(): Record<string, string | null | undefined> {
    const body: Record<string, string | null | undefined> = {}
    body.baseUrl = baseUrl === '' ? null : baseUrl
    // Only send secrets that the user typed; omit otherwise to preserve stored.
    if (token !== '') body.token = token
    if (webhookSecret !== '') body.webhookSecret = webhookSecret
    return body
  }

  function buildTestBody(): Record<string, string | null | undefined> {
    return {
      baseUrl: baseUrl || null,
      token: token === '' ? (tokenStored ? SET : null) : token,
      webhookSecret: webhookSecret === '' ? (webhookStored ? SET : null) : webhookSecret,
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

  const handleField = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setTestResult(null) }

  const canTest = !urlError && baseUrl !== '' && (token !== '' || tokenStored)

  return (
    <Section title="Hubitat">
      <p className="text-caption text-xs mb-4">
        Maker API for Hubitat motion sensors and devices.
      </p>

      <form
        onSubmit={(e) => { e.preventDefault(); if (canSubmit && !saveMutation.isPending) saveMutation.mutate() }}
        className="space-y-4"
      >
        <div>
          <label htmlFor="hub-baseurl" className="text-heading text-sm mb-1.5 block">Base URL</label>
          <input
            id="hub-baseurl"
            type="url"
            inputMode="url"
            value={baseUrl}
            onChange={(e) => handleField(setBaseUrl)(e.target.value)}
            disabled={isLoading}
            autoComplete="off"
            spellCheck={false}
            placeholder="http://hubitat.local/apps/api/6/devices"
            aria-invalid={!!urlError}
            aria-describedby={urlError ? 'hub-baseurl-err' : undefined}
            className="input-field h-11 w-full rounded-lg border px-3 text-sm focus:border-fairy-500 focus:outline-none"
          />
          {urlError && (
            <p id="hub-baseurl-err" className="text-red-400 text-xs mt-1">{urlError}</p>
          )}
        </div>

        <SecretInput
          id="hub-token"
          label="API token"
          value={token}
          onChange={handleField(setToken)}
          isStoredSecret={tokenStored}
          disabled={isLoading}
        />

        <SecretInput
          id="hub-webhook"
          label="Webhook secret"
          value={webhookSecret}
          onChange={handleField(setWebhookSecret)}
          isStoredSecret={webhookStored}
          disabled={isLoading}
        />

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
            {testMutation.isPending ? 'Testing…' : 'Test connection'}
          </button>
          <TestResultBadge
            result={testResult}
            loading={testMutation.isPending}
            renderOk={(r) => `${r.devicesCount ?? 0} device${(r.devicesCount ?? 0) === 1 ? '' : 's'}`}
          />
        </div>
      </form>
    </Section>
  )
}
