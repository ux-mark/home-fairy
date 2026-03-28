import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { RoomIntelligenceData } from '@/lib/api'
import { cn, formatCost, formatMonthlyCost, deviceDetailPath } from '@/lib/utils'
import TimeSeriesChart from '@/components/dashboard/TimeSeriesChart'
import { Accordion } from '@/components/ui/Accordion'
import { Skeleton } from '@/components/ui/Skeleton'
import OverUnderBadge from '@/components/dashboard/OverUnderBadge'

// ── Props ─────────────────────────────────────────────────────────────────────

interface RoomIntelligenceProps {
  roomName: string
}

// ── Battery colour helper ─────────────────────────────────────────────────────

function batteryColorClass(battery: number): string {
  if (battery > 50) return 'text-emerald-400'
  if (battery >= 15) return 'text-amber-400'
  return 'text-red-400'
}

function batteryBgClass(battery: number): string {
  if (battery > 50) return 'bg-emerald-400'
  if (battery >= 15) return 'bg-amber-400'
  return 'bg-red-400'
}

// ── Hourly activity bar chart ─────────────────────────────────────────────────

function HourlyActivityChart({
  hourlyPattern,
}: {
  hourlyPattern: RoomIntelligenceData['hourlyPattern']
}) {
  const maxCount = Math.max(...hourlyPattern.map(h => h.count), 1)

  return (
    <div>
      <div
        className="flex items-end gap-px h-12"
        role="img"
        aria-label="Hourly motion activity chart for the last 24 hours"
      >
        {hourlyPattern.map(h => (
          <div
            key={h.hour}
            style={{ height: `${Math.max((h.count / maxCount) * 100, h.count > 0 ? 4 : 0)}%` }}
            className="flex-1 rounded-t-sm bg-fairy-500/50 min-h-px"
            title={`${h.hour}:00 — ${h.count} event${h.count !== 1 ? 's' : ''}`}
          />
        ))}
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-[var(--text-muted)]" aria-hidden="true">
        <span>0h</span>
        <span>6h</span>
        <span>12h</span>
        <span>18h</span>
        <span>23h</span>
      </div>
    </div>
  )
}

// ── Content sections ──────────────────────────────────────────────────────────

function EnvironmentRow({ data }: { data: RoomIntelligenceData }) {
  const hasHistory = data.temperatureHistory.length >= 2

  return (
    <div>
      <p className="text-xs font-medium text-[var(--text-muted)] mb-2">Environment</p>
      <div className="flex items-start gap-4">
        <div className="shrink-0">
          {data.temperature !== null ? (
            <p className="text-2xl font-semibold text-heading leading-none">
              {data.temperature.toFixed(1)}°
            </p>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">No temperature data</p>
          )}
          {data.lux !== null && (
            <p className="text-xs text-[var(--text-muted)] mt-1">{data.lux} lux</p>
          )}
        </div>
        {hasHistory && (
          <div className="flex-1 min-w-0">
            <TimeSeriesChart
              data={data.temperatureHistory}
              label="Temperature"
              unit="°"
              height={80}
              showRange={false}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Energy row ────────────────────────────────────────────────────────────────

interface EnergyRowProps {
  data: RoomIntelligenceData
  currencySymbol: string
}

function EnergyRow({ data, currencySymbol }: EnergyRowProps) {
  const powerDevices = data.devices.filter(d => d.power > 0)
  const hasCostData = data.dailyCost !== null

  // Sort by proportional daily cost (most expensive first).
  // When actual daily cost is available, split proportionally by wattage.
  const devicesWithCost = powerDevices
    .map(device => {
      let dailyCost: number | null = null
      if (hasCostData && data.totalWatts > 0) {
        dailyCost =
          Math.round((device.power / data.totalWatts) * (data.dailyCost as number) * 100) / 100
      }
      return { ...device, dailyCost }
    })
    .sort((a, b) => (b.dailyCost ?? b.power) - (a.dailyCost ?? a.power))

  return (
    <div>
      <p className="text-xs font-medium text-[var(--text-muted)] mb-2">Energy</p>

      {powerDevices.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          No power-monitoring devices in this room. Assign Kasa devices with energy monitoring to
          track cost.
        </p>
      ) : (
        <>
          {/* Cost headline */}
          {hasCostData ? (
            <div className="mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-lg font-semibold text-heading">
                  {formatCost(data.dailyCost, currencySymbol)} today
                  <span className="text-sm font-normal text-[var(--text-muted)] ml-1">
                    — about {formatMonthlyCost(data.dailyCost, currencySymbol)} per month
                  </span>
                </p>
                {data.dailyOverUnderPercent !== null &&
                  Math.abs(data.dailyOverUnderPercent) > 5 && (
                    <OverUnderBadge
                      percent={data.dailyOverUnderPercent}
                      label={`${data.dailyOverUnderPercent > 0 ? '+' : ''}${data.dailyOverUnderPercent}% vs last week`}
                      size="sm"
                    />
                  )}
              </div>
              {data.monthToDateCost !== null && (
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {formatCost(data.monthToDateCost, currencySymbol)} this month so far
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)] mb-3">
              No energy cost data yet — costs will appear once energy history is collected.
            </p>
          )}

          {/* Per-device breakdown sorted by cost */}
          <ul className="space-y-1.5 mb-3" aria-label="Device energy breakdown">
            {devicesWithCost.map(device => (
              <li key={device.id} className="flex items-center justify-between gap-2 text-sm">
                <Link
                  to={deviceDetailPath(device.id, device.source)}
                  className="text-fairy-400 hover:text-fairy-300 hover:underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 break-words"
                >
                  {device.label}
                </Link>
                <span className="shrink-0 text-[var(--text-muted)] tabular-nums text-right">
                  {device.power} W
                  {device.dailyCost !== null && (
                    <span className="text-xs ml-1.5 text-[var(--text-secondary)]">
                      · {formatCost(device.dailyCost, currencySymbol)}/day
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {/* Total watts — secondary context */}
          <p className="text-xs text-[var(--text-muted)]">
            Currently drawing {data.totalWatts} W across {powerDevices.length} device
            {powerDevices.length !== 1 ? 's' : ''}
          </p>
        </>
      )}
    </div>
  )
}

function ActivityRow({ data }: { data: RoomIntelligenceData }) {
  return (
    <div>
      <p className="text-xs font-medium text-[var(--text-muted)] mb-2">Activity</p>
      <p className="text-sm text-body mb-3">
        {data.events24h} motion event{data.events24h !== 1 ? 's' : ''} in the last 24 hours
      </p>
      {data.hourlyPattern.length > 0 && (
        <HourlyActivityChart hourlyPattern={data.hourlyPattern} />
      )}
    </div>
  )
}

function BatteryRow({ data }: { data: RoomIntelligenceData }) {
  if (data.batteryDevices.length === 0) {
    return (
      <div>
        <p className="text-xs font-medium text-[var(--text-muted)] mb-2">Battery health</p>
        <p className="text-sm text-[var(--text-muted)]">No battery-powered devices in this room</p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs font-medium text-[var(--text-muted)] mb-2">Battery health</p>
      <ul className="space-y-3">
        {data.batteryDevices.map(device => (
          <li key={device.id}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <Link
                to={`/devices/${device.id}`}
                className="text-sm text-fairy-400 hover:text-fairy-300 hover:underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 break-words"
              >
                {device.label}
              </Link>
              <span
                className={cn(
                  'shrink-0 text-sm font-medium tabular-nums',
                  batteryColorClass(device.battery),
                )}
                aria-label={`Battery level: ${device.battery}%`}
              >
                {device.battery}%
              </span>
            </div>
            {/* Battery bar — colour is not the sole indicator; percentage is shown in text */}
            <div
              className="h-1.5 w-full rounded-full bg-[var(--bg-tertiary)] overflow-hidden"
              aria-hidden="true"
            >
              <div
                className={cn('h-full rounded-full transition-all', batteryBgClass(device.battery))}
                style={{ width: `${device.battery}%` }}
              />
            </div>
            <div className="flex items-center gap-3 mt-1 text-[11px] text-[var(--text-muted)]">
              {device.drainPerDay !== null && (
                <span>{device.drainPerDay.toFixed(1)}% per day</span>
              )}
              {device.predictedDaysRemaining !== null && (
                <span>~{Math.round(device.predictedDaysRemaining)} days remaining</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RoomIntelligence({ roomName }: RoomIntelligenceProps) {
  const [isOpen, setIsOpen] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard', 'room', roomName],
    queryFn: () => api.dashboard.getRoomInsights(roomName),
    enabled: !!roomName,
  })

  // Fetch currency symbol from the dashboard summary.
  // TanStack Query returns cached data immediately if the insights page was visited first.
  // Long staleTime prevents unnecessary refetches on room detail pages.
  const { data: summaryData } = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: api.dashboard.getSummary,
    staleTime: 5 * 60 * 1000,
  })
  const currencySymbol = summaryData?.currencySymbol ?? '€'

  if (isLoading) {
    return (
      <div className="card rounded-xl border mb-4 p-4" role="status" aria-label="Loading room overview">
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="card rounded-xl border mb-4 p-4" role="alert">
        <p className="text-sm font-medium text-heading">Could not load room data</p>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Room insights are unavailable. Check your connection and try again.
        </p>
      </div>
    )
  }

  return (
    <section>
      <Accordion
        id="room-intelligence"
        title="Room overview"
        open={isOpen}
        onToggle={() => setIsOpen(prev => !prev)}
      >
        <div className="space-y-5 pt-1">
          <EnvironmentRow data={data} />
          <div className="border-t border-[var(--border-secondary)]" aria-hidden="true" />
          <EnergyRow data={data} currencySymbol={currencySymbol} />
          <div className="border-t border-[var(--border-secondary)]" aria-hidden="true" />
          <ActivityRow data={data} />
          <div className="border-t border-[var(--border-secondary)]" aria-hidden="true" />
          <BatteryRow data={data} />
        </div>
      </Accordion>
    </section>
  )
}
