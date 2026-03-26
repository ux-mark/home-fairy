import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { DashboardStats } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { Section } from './Section'

type DeleteConfirmState =
  | { type: 'all' }
  | { type: 'older-than'; label: string; isoDate: string }
  | { type: 'by-source'; source: string }
  | null

const AGE_OPTIONS: { label: string; months: number }[] = [
  { label: '1 month', months: 1 },
  { label: '3 months', months: 3 },
  { label: '6 months', months: 6 },
  { label: '1 year', months: 12 },
]

function getIsoDateMonthsAgo(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return d.toISOString()
}

function formatOldestRecord(value: string | null): string {
  if (!value) return 'No data collected yet'
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function DataManagementSection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [confirmState, setConfirmState] = useState<DeleteConfirmState>(null)
  const [selectedAge, setSelectedAge] = useState(AGE_OPTIONS[0])
  const [selectedSource, setSelectedSource] = useState<string>('')

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ['dashboard', 'stats'],
    queryFn: api.dashboard.getStats,
    refetchOnWindowFocus: false,
  })

  // Keep selectedSource in sync when sources load
  const sources = stats?.sources ?? []
  const resolvedSource = selectedSource || sources[0]?.source || ''

  const deleteMutation = useMutation({
    mutationFn: api.dashboard.deleteHistory,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] })
      setConfirmState(null)
      const count = result.deleted
      toast({
        message: count > 0 ? `Deleted ${count.toLocaleString()} record${count === 1 ? '' : 's'}` : 'No records matched',
      })
    },
    onError: () => toast({ message: 'Failed to delete records', type: 'error' }),
  })

  const handleConfirm = () => {
    if (!confirmState) return
    if (confirmState.type === 'all') {
      deleteMutation.mutate({ all: true })
    } else if (confirmState.type === 'older-than') {
      deleteMutation.mutate({ olderThan: confirmState.isoDate })
    } else if (confirmState.type === 'by-source') {
      deleteMutation.mutate({ source: confirmState.source })
    }
  }

  const totalRows = stats?.totalRows ?? 0

  return (
    <Section title="Data management">
      {/* Database info */}
      <div className="mb-5 space-y-2">
        {statsLoading ? (
          <div className="space-y-2">
            <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--bg-secondary)]" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-[var(--bg-secondary)]" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--bg-secondary)]" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Database size</span>
              <span className="text-heading">{stats ? `${stats.dbSizeMB.toFixed(1)} MB` : '—'}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Historical readings</span>
              <span className="text-heading">{stats ? `${totalRows.toLocaleString()} records` : '—'}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Data since</span>
              <span className="text-heading">{formatOldestRecord(stats?.oldestRecord ?? null)}</span>
            </div>
          </>
        )}
      </div>

      {/* Divider */}
      <div className="mb-4 border-t" style={{ borderColor: 'var(--border-secondary)' }} />

      <div className="space-y-4">
        {/* Clear all */}
        <div className="space-y-2">
          <button
            onClick={() => setConfirmState({ type: 'all' })}
            disabled={deleteMutation.isPending || totalRows === 0}
            className="rounded-lg bg-red-500/15 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px]"
          >
            Clear all historical data
          </button>
          {confirmState?.type === 'all' && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm">
              <p className="mb-3 text-red-400">
                This will permanently delete all {totalRows.toLocaleString()} records. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleConfirm}
                  disabled={deleteMutation.isPending}
                  className="rounded-lg bg-red-500/20 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/30 disabled:opacity-50 min-h-[44px]"
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Confirm delete'}
                </button>
                <button
                  onClick={() => setConfirmState(null)}
                  disabled={deleteMutation.isPending}
                  className="rounded-lg border px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50 min-h-[44px]"
                  style={{ borderColor: 'var(--border-secondary)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Clear older than */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label htmlFor="data-age-select" className="text-sm text-[var(--text-secondary)]">
              Clear data older than
            </label>
            <select
              id="data-age-select"
              value={selectedAge.months}
              onChange={e => {
                const months = Number(e.target.value)
                setSelectedAge(AGE_OPTIONS.find(o => o.months === months) ?? AGE_OPTIONS[0])
              }}
              className="rounded-lg border bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] min-h-[44px]"
              style={{ borderColor: 'var(--border-secondary)' }}
            >
              {AGE_OPTIONS.map(o => (
                <option key={o.months} value={o.months}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={() => {
                const isoDate = getIsoDateMonthsAgo(selectedAge.months)
                setConfirmState({ type: 'older-than', label: selectedAge.label, isoDate })
              }}
              disabled={deleteMutation.isPending || totalRows === 0}
              className="rounded-lg bg-red-500/15 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px]"
            >
              Delete
            </button>
          </div>
          {confirmState?.type === 'older-than' && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm">
              <p className="mb-3 text-red-400">
                This will permanently delete all records older than {confirmState.label}. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleConfirm}
                  disabled={deleteMutation.isPending}
                  className="rounded-lg bg-red-500/20 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/30 disabled:opacity-50 min-h-[44px]"
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Confirm delete'}
                </button>
                <button
                  onClick={() => setConfirmState(null)}
                  disabled={deleteMutation.isPending}
                  className="rounded-lg border px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50 min-h-[44px]"
                  style={{ borderColor: 'var(--border-secondary)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Clear by source */}
        {sources.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label htmlFor="data-source-select" className="text-sm text-[var(--text-secondary)]">
                Clear data by type
              </label>
              <select
                id="data-source-select"
                value={resolvedSource}
                onChange={e => setSelectedSource(e.target.value)}
                className="rounded-lg border bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] min-h-[44px]"
                style={{ borderColor: 'var(--border-secondary)' }}
              >
                {sources.map(s => (
                  <option key={s.source} value={s.source}>
                    {s.source} ({s.count.toLocaleString()} records)
                  </option>
                ))}
              </select>
              <button
                onClick={() => setConfirmState({ type: 'by-source', source: resolvedSource })}
                disabled={deleteMutation.isPending || !resolvedSource}
                className="rounded-lg bg-red-500/15 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px]"
              >
                Delete
              </button>
            </div>
            {confirmState?.type === 'by-source' && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm">
                <p className="mb-3 text-red-400">
                  This will permanently delete all records with source "{confirmState.source}". This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleConfirm}
                    disabled={deleteMutation.isPending}
                    className="rounded-lg bg-red-500/20 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/30 disabled:opacity-50 min-h-[44px]"
                  >
                    {deleteMutation.isPending ? 'Deleting...' : 'Confirm delete'}
                  </button>
                  <button
                    onClick={() => setConfirmState(null)}
                    disabled={deleteMutation.isPending}
                    className="rounded-lg border px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50 min-h-[44px]"
                    style={{ borderColor: 'var(--border-secondary)' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Section>
  )
}
