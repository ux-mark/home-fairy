import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, RefreshCw, ScrollText, Activity as ActivityIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { cn, formatDateTime } from '@/lib/utils'
import { BackLink } from '@/components/ui/BackLink'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterChip } from '@/components/ui/FilterChip'
import { SkeletonList } from '@/components/ui/Skeleton'
import { UserName } from '@/components/ui/UserName'
import { ActivityCard } from '@/components/ui/ActivityCard'

const CATEGORIES = ['hubitat', 'scene', 'motion', 'lifx', 'system', 'battery', 'weather', 'timer', 'device_error', 'sonos', 'kasa', 'mta-indicator'] as const

type ViewTab = 'activity' | 'raw'

function formatTimestamp(dateStr: string) {
  return formatDateTime(dateStr, { second: '2-digit' })
}

function LogEntry({
  log,
}: {
  log: {
    id: number
    message: string
    debug: string | null
    category: string | null
    user_id?: string | null
    user_name?: string | null
    created_at: string
  }
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border-b border-[var(--border-primary)] py-3 last:border-0">
      <div className="flex items-start gap-3">
        {log.debug ? (
          <button
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? 'Hide details' : 'Show details'}
            className="mt-0.5 shrink-0 text-caption hover:text-[var(--text-primary)]"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        ) : (
          <span aria-hidden="true" className="mt-0.5 shrink-0 text-transparent">
            <ChevronRight className="h-4 w-4" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {log.category && (
              <span className="inline-flex rounded surface px-1.5 py-0.5 text-[10px] font-medium text-body">
                {log.category}
              </span>
            )}
            <span className="text-xs text-caption">
              {formatTimestamp(log.created_at)}
            </span>
            {log.user_id && log.user_name && (
              <span className="text-[10px] text-caption">
                <UserName userId={log.user_id} name={log.user_name} />
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-heading">{log.message}</p>

          {expanded && log.debug && (
            <pre className="mt-2 max-h-48 overflow-auto rounded-lg surface p-3 text-xs text-body">
              {(() => {
                try {
                  return JSON.stringify(JSON.parse(log.debug), null, 2)
                } catch {
                  return log.debug
                }
              })()}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}

export default function LogsPage() {
  const [view, setView] = useState<ViewTab>('activity')
  const [category, setCategory] = useState<string | undefined>(undefined)

  const { data: activities, isLoading: activitiesLoading, refetch: refetchActivities, isFetching: activitiesFetching } = useQuery({
    queryKey: ['system', 'activity', category],
    queryFn: () => api.system.getActivity(50, undefined, category),
    refetchInterval: 30000,
    enabled: view === 'activity',
  })

  const { data: logs, isLoading: logsLoading, refetch: refetchLogs, isFetching: logsFetching } = useQuery({
    queryKey: ['system', 'logs', category],
    queryFn: () => api.system.getLogs(50, category),
    refetchInterval: 30000,
    enabled: view === 'raw',
  })

  const isLoading = view === 'activity' ? activitiesLoading : logsLoading
  const isFetching = view === 'activity' ? activitiesFetching : logsFetching
  const refetch = view === 'activity' ? refetchActivities : refetchLogs

  return (
    <div>
      <BackLink to="/settings" label="Settings" />

      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {view === 'activity' ? (
            <ActivityIcon className="h-5 w-5 text-fairy-400" aria-hidden="true" />
          ) : (
            <ScrollText className="h-5 w-5 text-fairy-400" aria-hidden="true" />
          )}
          <h1 className="text-lg font-semibold text-heading">
            {view === 'activity' ? 'Home Activity' : 'System Logs'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg surface p-0.5">
            <button
              onClick={() => setView('activity')}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                view === 'activity'
                  ? 'bg-fairy-500/20 text-fairy-400'
                  : 'text-caption hover:text-body',
              )}
            >
              Activity
            </button>
            <button
              onClick={() => setView('raw')}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                view === 'raw'
                  ? 'bg-fairy-500/20 text-fairy-400'
                  : 'text-caption hover:text-body',
              )}
            >
              Raw Logs
            </button>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="rounded-lg p-2 text-body transition-colors hover:surface hover:text-heading"
            aria-label="Refresh"
          >
            <RefreshCw
              className={cn('h-4 w-4', isFetching && 'animate-spin')}
            />
          </button>
        </div>
      </div>

      {/* Category filter chips — only show for raw logs */}
      {view === 'raw' && (
        <div className="mb-4 flex flex-wrap gap-2">
          <FilterChip
            label="All"
            active={!category}
            onClick={() => setCategory(undefined)}
          />
          {CATEGORIES.map(cat => (
            <FilterChip
              key={cat}
              label={cat}
              active={category === cat}
              onClick={() => setCategory(category === cat ? undefined : cat)}
            />
          ))}
        </div>
      )}

      {/* Content */}
      <div className="rounded-xl border border-[var(--border-primary)] card">
        {isLoading ? (
          <div className="p-4">
            <SkeletonList count={8} height="h-12" />
          </div>
        ) : view === 'activity' ? (
          activities && activities.length > 0 ? (
            <div className="divide-y divide-[var(--border-primary)] px-4">
              {activities.map(activity => (
                <ActivityCard key={activity.id} activity={activity} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={ActivityIcon}
              message="No activity yet."
              sub="Activity will appear as the system responds to events."
            />
          )
        ) : (
          logs && logs.length > 0 ? (
            <div className="divide-y divide-[var(--border-primary)] px-4">
              {logs.map(log => (
                <LogEntry key={log.id} log={log} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={ScrollText}
              message="No log entries found."
              sub="Logs will appear as the system processes events."
            />
          )
        )}
      </div>
    </div>
  )
}
