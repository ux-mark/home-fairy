import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import { cn, formatDateTime } from '@/lib/utils'

const CATEGORIES = ['hubitat', 'scene', 'motion', 'lifx', 'system', 'battery', 'weather', 'timer', 'device_error'] as const

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
    created_at: string
  }
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border-b border-[var(--border-primary)] py-3 last:border-0">
      <div className="flex items-start gap-3">
        <button
          onClick={() => log.debug && setExpanded(!expanded)}
          className={cn(
            'mt-0.5 shrink-0',
            log.debug ? 'text-caption hover:text-[var(--text-primary)]' : 'text-transparent',
          )}
          disabled={!log.debug}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {log.category && (
              <span className="inline-flex rounded surface px-1.5 py-0.5 text-[10px] font-medium uppercase text-body">
                {log.category}
              </span>
            )}
            <span className="text-xs text-caption">
              {formatTimestamp(log.created_at)}
            </span>
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
  const [category, setCategory] = useState<string | undefined>(undefined)

  const { data: logs, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['system', 'logs', category],
    queryFn: () => api.system.getLogs(50, category),
    refetchInterval: 30000,
  })

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Link
          to="/settings"
          className="rounded-lg p-1.5 text-body transition-colors hover:surface hover:text-heading"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 text-lg font-semibold text-heading">
          System Logs
        </h1>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="rounded-lg p-2 text-body transition-colors hover:surface hover:text-heading"
        >
          <RefreshCw
            className={cn('h-4 w-4', isFetching && 'animate-spin')}
          />
        </button>
      </div>

      {/* Category filter chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setCategory(undefined)}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium transition-colors',
            !category
              ? 'bg-fairy-500 text-white'
              : 'surface text-body hover:text-heading',
          )}
        >
          All
        </button>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(category === cat ? undefined : cat)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              category === cat
                ? 'bg-fairy-500 text-white'
                : 'surface text-body hover:text-heading',
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Log entries */}
      <div className="rounded-xl border border-[var(--border-primary)] card">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="animate-pulse space-y-2">
                <div className="h-3 w-24 rounded surface" />
                <div className="h-4 w-3/4 rounded surface" />
              </div>
            ))}
          </div>
        ) : logs && logs.length > 0 ? (
          <div className="divide-y divide-[var(--border-primary)] px-4">
            {logs.map(log => (
              <LogEntry key={log.id} log={log} />
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-caption">
            No logs found.
          </div>
        )}
      </div>
    </div>
  )
}
