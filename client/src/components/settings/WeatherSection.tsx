import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { WeatherSettingsDto, SettingsTestResult } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { Section } from './Section'
import { SecretInput } from './SecretInput'
import { TestResultBadge } from './TestResultBadge'

const SET = '<set>'

export function WeatherSection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'weather'],
    queryFn: () => api.settings.getGroup<WeatherSettingsDto>('weather'),
  })

  const [apiKey, setApiKey] = useState('')
  const [testResult, setTestResult] = useState<SettingsTestResult | null>(null)

  useEffect(() => { if (data) setApiKey('') }, [data])

  const apiKeyStored = data?.apiKey === SET
  const isDirty = apiKey !== ''

  const saveMutation = useMutation({
    mutationFn: () => api.settings.putGroup<WeatherSettingsDto>('weather', { apiKey }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'weather'] })
      setTestResult(null)
      toast({ message: 'Settings saved' })
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast({ message: `Couldn't save: ${msg}`, type: 'error' })
    },
  })

  const testMutation = useMutation({
    mutationFn: () =>
      api.settings.test<SettingsTestResult>('weather', {
        apiKey: apiKey === '' ? (apiKeyStored ? SET : null) : apiKey,
      }),
    onSuccess: (result) => setTestResult(result),
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setTestResult({ ok: false, error: msg })
    },
  })

  const canTest = apiKey !== '' || apiKeyStored

  return (
    <Section title="OpenWeather API">
      <p className="text-caption text-xs mb-4">
        API key for OpenWeather. Used together with the location set above to
        fetch current conditions for the weather light and dashboards.
      </p>

      <form
        onSubmit={(e) => { e.preventDefault(); if (isDirty && !saveMutation.isPending) saveMutation.mutate() }}
        className="space-y-4"
      >
        <SecretInput
          id="weather-apikey"
          label="API key"
          value={apiKey}
          onChange={(v) => { setApiKey(v); setTestResult(null) }}
          isStoredSecret={apiKeyStored}
          disabled={isLoading}
        />

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={!isDirty || saveMutation.isPending}
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
            renderOk={(r) => r.sample ?? 'OK'}
          />
        </div>
      </form>
    </Section>
  )
}
