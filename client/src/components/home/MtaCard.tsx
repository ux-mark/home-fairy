import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Train, ArrowUp, ArrowDown } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/Skeleton'
import { Accordion } from '@/components/ui/Accordion'

const MTA_LINE_COLORS: Record<string, string> = {
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

const STATUS_DOT_COLORS: Record<string, string> = {
  green: '#22c55e',
  orange: '#f97316',
  red: '#ef4444',
  none: '#6b7280',
}

const STATUS_BG_COLORS: Record<string, string> = {
  green: 'bg-green-500/10',
  orange: 'bg-orange-500/10',
  red: 'bg-red-500/10',
  none: '',
}

function MtaLineBadge({ line }: { line: string }) {
  const bg = MTA_LINE_COLORS[line] || '#808183'
  const textColor = ['N', 'Q', 'R', 'W'].includes(line) ? '#000' : '#fff'
  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold flex-shrink-0"
      style={{ backgroundColor: bg, color: textColor }}
    >
      {line}
    </span>
  )
}

export function MtaCard() {
  const [open, setOpen] = useState(false)

  const { data: combinedStatus, isError, isLoading } = useQuery({
    queryKey: ['mta', 'combined-status'],
    queryFn: api.system.getCombinedMtaStatus,
    retry: false,
    staleTime: 30_000,
    refetchInterval: 30_000,
  })

  if (isLoading) {
    return (
      <div className="card mb-6 rounded-xl border px-4 py-3">
        <Skeleton className="h-5 w-48" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="card mb-6 rounded-xl border px-4 py-3">
        <p className="text-caption text-sm">Train times unavailable</p>
      </div>
    )
  }

  if (!combinedStatus || combinedStatus.overallStatus === 'none') return null

  const overallColor = STATUS_DOT_COLORS[combinedStatus.overallStatus]
  const bgClass = STATUS_BG_COLORS[combinedStatus.overallStatus]

  // Build accordion summary — only show the catchable train, not just the next arrival
  const soonestStop = combinedStatus.overallStatus === 'green' || combinedStatus.overallStatus === 'orange'
    ? combinedStatus.stops.reduce<typeof combinedStatus.stops[0] | null>((best, stop) => {
        if (!stop.catchableTrain) return best
        if (!best || !best.catchableTrain) return stop
        return stop.catchableTrain.minutesAway < best.catchableTrain.minutesAway ? stop : best
      }, null)
    : null

  const accordionTitle: React.ReactNode = soonestStop?.catchableTrain ? (
    <span className="inline-flex items-center gap-1.5 min-w-0 flex-wrap">
      <span
        className="h-3 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: overallColor }}
        aria-hidden="true"
      />
      <MtaLineBadge line={soonestStop.catchableTrain.routeId} />
      {soonestStop.config.direction === 'N'
        ? <ArrowUp className="h-3.5 w-3.5 shrink-0 text-caption" aria-label="Uptown" />
        : <ArrowDown className="h-3.5 w-3.5 shrink-0 text-caption" aria-label="Downtown" />
      }
      <span>at {soonestStop.config.name} in {soonestStop.catchableTrain.minutesAway} min</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span
        className="h-3 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: overallColor }}
        aria-hidden="true"
      />
      {combinedStatus.overallStatus === 'red'
        ? 'Nothing catchable right now'
        : combinedStatus.overallMessage
      }
    </span>
  )

  return (
    <div className={cn('card mb-6 rounded-xl border', bgClass)}>
      <Accordion
        id="mta"
        title={accordionTitle}
        open={open}
        onToggle={() => setOpen(o => !o)}
        card={false}
        trailing={<Train className="h-4 w-4 text-caption" aria-hidden="true" />}
      >
        {/* Per-stop rows */}
        <div className="space-y-1 px-4">
          {combinedStatus.stops.map((stop, i) => {
            const dotColor = STATUS_DOT_COLORS[stop.status]
            const next = stop.nextArrival
            const displayTrain = stop.catchableTrain ?? next
            const buffer = displayTrain ? displayTrain.minutesAway - stop.config.walkTime : 0

            // Build the helpful message
            let message = ''
            if (!displayTrain) {
              message = 'No trains'
            } else if (stop.status === 'red') {
              message = `in ${next?.minutesAway ?? displayTrain.minutesAway} min — won't make it in time`
            } else if (stop.status === 'green') {
              const leaveMsg = stop.leaveInMinutes != null && stop.leaveInMinutes > 0
                ? `Leave within ${stop.leaveInMinutes} min`
                : 'Leave now'
              message = `in ${displayTrain.minutesAway} min — ${leaveMsg}, ${buffer - (stop.leaveInMinutes ?? 0)} min wait at station`
            } else if (stop.status === 'orange') {
              message = `in ${displayTrain.minutesAway} min — Leave now, tight!`
            }

            const dirLabel = stop.config.direction === 'N' ? 'Uptown' : 'Downtown'
            const DirArrow = stop.config.direction === 'N' ? ArrowUp : ArrowDown

            return (
              <div
                key={`${stop.config.stopId}-${stop.config.direction}-${i}`}
                className="flex items-center gap-2 py-1.5 text-sm"
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: dotColor }}
                  aria-label={`Status: ${stop.status}`}
                />
                {displayTrain
                  ? <MtaLineBadge line={displayTrain.routeId} />
                  : <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#808183]/40 text-[10px] text-caption" aria-hidden="true">—</span>
                }
                <DirArrow className="h-3.5 w-3.5 shrink-0 text-caption" aria-label={dirLabel} />
                {/* Station name + message inline, wrapping */}
                <p className="min-w-0 flex-1 text-heading font-medium leading-snug">
                  {stop.config.name} {message && <span className="font-normal text-body text-xs">{message}</span>}
                </p>
              </div>
            )
          })}
        </div>
      </Accordion>
    </div>
  )
}
