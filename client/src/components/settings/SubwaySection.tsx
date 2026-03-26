import { useState, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Train, Search, ArrowDown, ArrowUp, Minus, Plus, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import type { ConfiguredStop, MtaStop } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { Section } from './Section'

export const MTA_LINE_COLORS: Record<string, string> = {
  '1': '#EE352E', '2': '#EE352E', '3': '#EE352E',
  '4': '#00933C', '5': '#00933C', '6': '#00933C',
  '7': '#B933AD',
  'A': '#0039A6', 'C': '#0039A6', 'E': '#0039A6',
  'B': '#FF6319', 'D': '#FF6319', 'F': '#FF6319', 'M': '#FF6319',
  'G': '#6CBE45',
  'J': '#996633', 'Z': '#996633',
  'L': '#A7A9AC',
  'N': '#FCCC0A', 'Q': '#FCCC0A', 'R': '#FCCC0A', 'W': '#FCCC0A',
  'S': '#808183',
}

export function LineBadge({ line, size = 'md' }: { line: string; size?: 'sm' | 'md' }) {
  const bg = MTA_LINE_COLORS[line] || '#808183'
  const textColor = ['N', 'Q', 'R', 'W'].includes(line) ? '#000' : '#fff'
  const dims = size === 'sm' ? 'h-5 w-5 text-[10px]' : 'h-6 w-6 text-xs'
  return (
    <span
      className={cn('inline-flex items-center justify-center rounded-full font-bold flex-shrink-0', dims)}
      style={{ backgroundColor: bg, color: textColor }}
      aria-label={`${line} train`}
    >
      {line}
    </span>
  )
}

export function SubwaySection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [showAddFlow, setShowAddFlow] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStop, setSelectedStop] = useState<MtaStop | null>(null)
  const [addDirection, setAddDirection] = useState<'N' | 'S'>('S')
  const [addWalkTime, setAddWalkTime] = useState(5)

  const { data: prefs } = useQuery({
    queryKey: ['system', 'preferences'],
    queryFn: api.system.getPreferences,
  })

  const prefMutation = useMutation({
    mutationFn: (data: { key: string; value: string }) => api.system.setPreference(data.key, data.value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['system', 'preferences'] }),
  })

  const { data: configuredStops = [] } = useQuery({
    queryKey: ['mta', 'configured'],
    queryFn: api.system.getMtaConfigured,
  })

  const { data: availableStops = [] } = useQuery({
    queryKey: ['mta', 'stops', searchQuery],
    queryFn: () => api.system.getMtaStops(searchQuery || undefined),
    enabled: showAddFlow,
  })

  const saveMutation = useMutation({
    mutationFn: (stops: ConfiguredStop[]) => api.system.saveMtaConfigured(stops),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mta'] })
      toast({ message: 'Subway stops saved' })
    },
    onError: () => toast({ message: 'Failed to save subway stops', type: 'error' }),
  })

  const updateStops = useCallback((newStops: ConfiguredStop[]) => {
    saveMutation.mutate(newStops)
  }, [saveMutation])

  const handleToggle = (index: number) => {
    const next = [...configuredStops]
    next[index] = { ...next[index], enabled: !next[index].enabled }
    updateStops(next)
  }

  const handleDelete = (index: number) => {
    const stop = configuredStops[index]
    if (!confirm(`Remove ${stop.name}?`)) return
    const next = configuredStops.filter((_, i) => i !== index)
    updateStops(next)
  }

  const handleWalkTimeChange = (index: number, delta: number) => {
    const next = [...configuredStops]
    const newTime = Math.max(1, Math.min(30, next[index].walkTime + delta))
    next[index] = { ...next[index], walkTime: newTime }
    updateStops(next)
  }

  const handleAddStop = () => {
    if (!selectedStop) return
    const newStop: ConfiguredStop = {
      stopId: selectedStop.stopId,
      name: selectedStop.name,
      direction: addDirection,
      routes: selectedStop.lines,
      feedGroup: selectedStop.feedGroup,
      walkTime: addWalkTime,
      enabled: true,
    }
    updateStops([...configuredStops, newStop])
    setShowAddFlow(false)
    setSelectedStop(null)
    setSearchQuery('')
    setAddWalkTime(5)
  }

  // Group search results by borough
  const groupedStops = useMemo(() => {
    const groups: Record<string, MtaStop[]> = {}
    for (const stop of availableStops) {
      if (!groups[stop.borough]) groups[stop.borough] = []
      groups[stop.borough].push(stop)
    }
    return groups
  }, [availableStops])

  return (
    <Section title="My Stations">
      {/* Configured stops list */}
      {configuredStops.length > 0 ? (
        <div className="space-y-3 mb-4">
          {configuredStops.map((stop, index) => (
            <div
              key={`${stop.stopId}-${stop.direction}-${index}`}
              className={cn(
                'surface rounded-lg border px-3 py-3 transition-opacity',
                !stop.enabled && 'opacity-40',
              )}
              style={{ borderColor: 'var(--border-secondary)' }}
            >
              <div className="flex items-start justify-between gap-3">
                {/* Station info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-heading text-sm font-semibold break-words">
                      {stop.name}
                    </span>
                    <span className="flex items-center gap-0.5 text-caption text-xs flex-shrink-0">
                      {stop.direction === 'S' ? (
                        <><ArrowDown className="h-3 w-3" /> Downtown</>
                      ) : (
                        <><ArrowUp className="h-3 w-3" /> Uptown</>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {stop.routes.map(line => (
                      <LineBadge key={line} line={line} size="sm" />
                    ))}
                  </div>
                </div>

                {/* Walk time stepper */}
                <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleWalkTimeChange(index, -1)}
                    disabled={stop.walkTime <= 1}
                    className="surface flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border text-heading transition-colors hover:brightness-95 dark:hover:brightness-110 disabled:opacity-30"
                    style={{ borderColor: 'var(--border-secondary)' }}
                    aria-label="Decrease walk time"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-12 text-center text-sm font-medium text-heading">
                    {stop.walkTime} min
                  </span>
                  <button
                    onClick={() => handleWalkTimeChange(index, 1)}
                    disabled={stop.walkTime >= 30}
                    className="surface flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border text-heading transition-colors hover:brightness-95 dark:hover:brightness-110 disabled:opacity-30"
                    style={{ borderColor: 'var(--border-secondary)' }}
                    aria-label="Increase walk time"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <span className="text-caption text-[10px]">walk</span>
                </div>

                {/* Toggle + Delete */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleToggle(index)}
                    className={cn(
                      'relative h-6 w-11 rounded-full transition-colors',
                      stop.enabled ? 'bg-fairy-500' : 'bg-[var(--bg-tertiary)]',
                    )}
                    role="switch"
                    aria-checked={stop.enabled}
                    aria-label={`${stop.enabled ? 'Disable' : 'Enable'} ${stop.name}`}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                        stop.enabled && 'translate-x-5',
                      )}
                    />
                  </button>
                  <button
                    onClick={() => handleDelete(index)}
                    className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-red-400"
                    aria-label={`Remove ${stop.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-4 flex items-center gap-2 text-sm text-caption">
          <Train className="h-4 w-4" />
          No stations configured. Add one below.
        </div>
      )}

      {/* Add station flow */}
      {showAddFlow ? (
        <div className="surface rounded-lg border p-4" style={{ borderColor: 'var(--border-secondary)' }}>
          {!selectedStop ? (
            <>
              {/* Search */}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search stations..."
                  autoFocus
                  className="input-field w-full rounded-lg border py-2.5 pl-9 pr-3 text-sm placeholder:text-[var(--text-muted)] focus:border-fairy-500 focus:outline-none"
                />
              </div>

              {/* Results grouped by borough */}
              <div className="max-h-64 overflow-y-auto space-y-3">
                {Object.entries(groupedStops).map(([borough, stops]) => (
                  <div key={borough}>
                    <p className="text-caption text-xs font-semibold tracking-wider mb-1.5">
                      {borough}
                    </p>
                    <div className="space-y-1">
                      {stops.map(stop => (
                        <button
                          key={stop.stopId}
                          onClick={() => setSelectedStop(stop)}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--bg-tertiary)] min-h-[44px]"
                        >
                          <div className="flex items-center gap-1">
                            {stop.lines.map(line => (
                              <LineBadge key={line} line={line} size="sm" />
                            ))}
                          </div>
                          <span className="text-heading text-sm">{stop.name}</span>
                          <span className="ml-auto text-caption text-xs">{stop.stopId}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {availableStops.length === 0 && searchQuery && (
                  <p className="text-caption text-sm py-4 text-center">No stations found</p>
                )}
              </div>

              <button
                onClick={() => { setShowAddFlow(false); setSearchQuery('') }}
                className="mt-3 w-full rounded-lg px-3 py-2 text-sm text-caption transition-colors hover:text-heading"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              {/* Configure selected stop */}
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-1">
                  {selectedStop.lines.map(line => (
                    <LineBadge key={line} line={line} />
                  ))}
                  <span className="text-heading text-base font-semibold">{selectedStop.name}</span>
                </div>
                <p className="text-caption text-xs">Stop ID: {selectedStop.stopId}</p>
              </div>

              {/* Direction */}
              <div className="mb-4">
                <p className="text-heading text-sm mb-2">Direction</p>
                <div className="surface flex rounded-lg border" style={{ borderColor: 'var(--border-secondary)' }}>
                  {([
                    { value: 'S' as const, label: 'Downtown', icon: ArrowDown },
                    { value: 'N' as const, label: 'Uptown', icon: ArrowUp },
                  ]).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setAddDirection(opt.value)}
                      className={cn(
                        'flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors min-h-[44px]',
                        addDirection === opt.value
                          ? 'bg-fairy-500 text-white'
                          : 'text-caption hover:text-[var(--text-primary)]',
                      )}
                    >
                      <opt.icon className="h-4 w-4" />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Walk time */}
              <div className="mb-4">
                <p className="text-heading text-sm mb-1">How long does it take you to walk there?</p>
                <p className="text-caption text-xs mb-2">We'll use this to tell you when to leave</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAddWalkTime(w => Math.max(1, w - 1))}
                    disabled={addWalkTime <= 1}
                    className="surface flex h-10 w-10 items-center justify-center rounded-lg border text-heading transition-colors hover:brightness-95 dark:hover:brightness-110 disabled:opacity-30"
                    style={{ borderColor: 'var(--border-secondary)' }}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-16 text-center text-lg font-semibold text-heading">
                    {addWalkTime} min
                  </span>
                  <button
                    onClick={() => setAddWalkTime(w => Math.min(30, w + 1))}
                    disabled={addWalkTime >= 30}
                    className="surface flex h-10 w-10 items-center justify-center rounded-lg border text-heading transition-colors hover:brightness-95 dark:hover:brightness-110 disabled:opacity-30"
                    style={{ borderColor: 'var(--border-secondary)' }}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedStop(null)}
                  className="flex-1 rounded-lg px-3 py-2.5 text-sm font-medium text-caption transition-colors hover:text-heading min-h-[44px]"
                >
                  Back
                </button>
                <button
                  onClick={handleAddStop}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-fairy-500 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-fairy-600 min-h-[44px]"
                >
                  <Plus className="h-4 w-4" />
                  Add Station
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <button
          onClick={() => setShowAddFlow(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-3 text-sm font-medium text-caption transition-colors hover:border-fairy-500 hover:text-fairy-400 min-h-[44px]"
          style={{ borderColor: 'var(--border-secondary)' }}
        >
          <Plus className="h-4 w-4" />
          Add Station
        </button>
      )}

      {/* Max wait threshold */}
      <div className="mt-4 surface rounded-lg border px-3 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-heading text-sm">How long will you wait?</p>
            <p className="text-caption text-xs">If the next train is further away than this, we'll let you know it's a long wait</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const cur = Number(prefs?.mta_max_wait || 6)
                if (cur > 1) prefMutation.mutate({ key: 'mta_max_wait', value: String(cur - 1) })
              }}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg surface border text-heading"
            >
              -
            </button>
            <span className="text-heading text-sm font-medium w-12 text-center">
              {prefs?.mta_max_wait || '6'} min
            </span>
            <button
              onClick={() => {
                const cur = Number(prefs?.mta_max_wait || 6)
                prefMutation.mutate({ key: 'mta_max_wait', value: String(cur + 1) })
              }}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg surface border text-heading"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-caption">
        <Train className="h-3.5 w-3.5" />
        We'll tell you when to leave based on your walk time
      </div>
    </Section>
  )
}
