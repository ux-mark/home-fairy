import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { LifxSettingsDto, SettingsTestResult } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { Section } from './Section'
import { SecretInput } from './SecretInput'
import { TestResultBadge } from './TestResultBadge'

const SET = '<set>'

export function LifxSection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'lifx'],
    queryFn: () => api.settings.getGroup<LifxSettingsDto>('lifx'),
  })

  const [token, setToken] = useState('')
  const [testResult, setTestResult] = useState<SettingsTestResult | null>(null)

  useEffect(() => { if (data) setToken('') }, [data])

  const tokenStored = data?.token === SET
  const isDirty = token !== ''

  const saveMutation = useMutation({
    mutationFn: () => api.settings.putGroup<LifxSettingsDto>('lifx', { token }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'lifx'] })
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
      api.settings.test<SettingsTestResult>('lifx', {
        token: token === '' ? (tokenStored ? SET : null) : token,
      }),
    onSuccess: (result) => setTestResult(result),
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setTestResult({ ok: false, error: msg })
    },
  })

  const canTest = token !== '' || tokenStored

  return (
    <Section title="LIFX">
      <p className="text-caption text-xs mb-4">
        Personal access token for the LIFX cloud API.
      </p>

      <form
        onSubmit={(e) => { e.preventDefault(); if (isDirty && !saveMutation.isPending) saveMutation.mutate() }}
        className="space-y-4"
      >
        <SecretInput
          id="lifx-token"
          label="API token"
          value={token}
          onChange={(v) => { setToken(v); setTestResult(null) }}
          isStoredSecret={tokenStored}
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
            renderOk={(r) => `${r.lightsCount ?? 0} light${(r.lightsCount ?? 0) === 1 ? '' : 's'}`}
          />
        </div>
      </form>
    </Section>
  )
}
