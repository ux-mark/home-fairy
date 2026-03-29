import { useState } from 'react'
import { Zap, ChevronDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { cn, formatCost, deviceDetailPath } from '@/lib/utils'
import { Accordion } from '@/components/ui/Accordion'
import TimeSeriesChart from '@/components/dashboard/TimeSeriesChart'
import OverUnderBadge from '@/components/dashboard/OverUnderBadge'
import { PeriodSelector } from '@/components/ui/PeriodSelector'
import type { Period } from '@/components/ui/PeriodSelector'
import type { PowerDevice, EnergyInsights } from '@/lib/api'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns a Tailwind text colour class reflecting relative power intensity.
 * Thresholds are intentionally gentle — the colour supplements the watt value,
 * never replaces it as the sole indicator.
 */
function powerIntensityClass(watts: number, maxWatts: number): string {
  if (maxWatts === 0) return 'text-heading'
  const ratio = watts / maxWatts
  if (ratio >= 0.75) return 'text-amber-400'
  if (ratio >= 0.4) return 'text-yellow-400'
  return 'text-green-400'
}

// ── Inline device trend chart ─────────────────────────────────────────────────

function DeviceTrendChart({ deviceId, deviceLabel }: { deviceId: string | number; deviceLabel: string }) {
  const [period, setPeriod] = useState<Period>('24h')

  // Use stable device ID in query key so renames don't orphan cache entries.
  // The API still uses label as source_id (matching how history-collector stores data).
  const { data: historyData, isLoading } = useQuery({
    queryKey: ['dashboard', 'history', 'power', String(deviceId), deviceLabel, period],
    queryFn: () => api.dashboard.getHistory('power', deviceLabel, period),
    staleTime: 5 * 60 * 1000,
  })

  return (
    <div className="mt-2 pb-2">
      <div className="mb-2">
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>
      <TimeSeriesChart
        data={historyData?.data ?? []}
        label={deviceLabel}
        color="#f59e0b"
        unit="W"
        height={100}
        loading={isLoading}
        emptyMessage="Power trends will appear as data is collected."
        aria-label={`Power trend for ${deviceLabel} over ${period}`}
      />
    </div>
  )
}

// ── Power device row ──────────────────────────────────────────────────────────

interface DeviceRowProps {
  device: PowerDevice
  maxWatts: number
  anomaly?: EnergyInsights['deviceAnomalies'][number] | null
}

function DeviceRow({ device, maxWatts, anomaly }: DeviceRowProps) {
  const [expanded, setExpanded] = useState(false)
  const isOn = device.switch === 'on'
  const intensityClass = powerIntensityClass(device.power, maxWatts)
  const rowId = `device-trend-${device.id}`

  return (
    <li
      className={cn(
        'py-1',
        anomaly && 'border-l-2 border-l-amber-500 pl-2',
      )}
    >
      {/* Main device row — clickable to expand trend */}
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={rowId}
        onClick={() => setExpanded(prev => !prev)}
        className={cn(
          'flex w-full items-start gap-3 py-1.5 text-left',
          'rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          'min-h-[44px]',
        )}
      >
        {/* On/off indicator — paired with text label so colour is not the sole signal */}
        <span
          aria-label={isOn ? 'On' : 'Off'}
          title={isOn ? 'On' : 'Off'}
          className={cn(
            'mt-1 h-2 w-2 shrink-0 rounded-full',
            isOn ? 'bg-fairy-500' : 'bg-slate-600',
          )}
        />

        {/* Device info */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug">
            <Link
              to={deviceDetailPath(device.id, device.source)}
              className="text-fairy-400 hover:underline"
              onClick={e => e.stopPropagation()}
            >
              {device.label}
            </Link>
          </p>
          {device.room_name && (
            <p className="text-caption text-xs leading-snug">
              {device.room_name}
            </p>
          )}
          {device.energy !== null && device.energy !== undefined && (
            <p className="text-caption text-xs leading-snug">
              {device.energy.toFixed(2)} kWh total
            </p>
          )}
        </div>

        {/* Power value + expand chevron */}
        <div className="shrink-0 text-right">
          <div className="flex items-center gap-1.5">
            <span className={cn('text-sm font-semibold tabular-nums', intensityClass)}>
              {device.power.toFixed(1)} W
            </span>
            {anomaly && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                {Math.round(anomaly.percentAbove)}% above normal
              </span>
            )}
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 shrink-0 text-caption transition-transform',
                expanded ? 'rotate-180' : '',
              )}
              aria-hidden="true"
            />
          </div>
          <span className="sr-only"> watts, device is {isOn ? 'on' : 'off'}</span>
        </div>
      </button>

      {/* Inline trend chart — rendered only when expanded */}
      <div
        id={rowId}
        role="region"
        aria-label={`Power trend for ${device.label}`}
        style={{
          display: 'grid',
          gridTemplateRows: expanded ? '1fr' : '0fr',
          overflow: 'hidden',
          transition: 'grid-template-rows 200ms ease',
        }}
      >
        <div style={{ minHeight: 0 }}>
          {expanded && <DeviceTrendChart deviceId={device.id} deviceLabel={device.label} />}
        </div>
      </div>
    </li>
  )
}

// ── Cost summary block ────────────────────────────────────────────────────────

interface CostSummaryProps {
  insights: EnergyInsights
  currencySymbol: string
}

function CostSummary({ insights, currencySymbol }: CostSummaryProps) {
  const {
    actualDailyCost,
    projectedDailyCost,
    monthToDateCost,
    lastMonthCost,
    monthOverMonthPercent,
  } = insights

  // Only render if we have at least one cost figure
  if (
    actualDailyCost === null &&
    projectedDailyCost === null &&
    monthToDateCost === null &&
    lastMonthCost === null
  ) {
    return null
  }

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-[var(--bg-secondary)] p-3 mb-3">
      {/* Today */}
      <div>
        <dt className="text-[11px] text-[var(--text-muted)]">Today</dt>
        <dd className="text-sm font-semibold text-heading tabular-nums">
          {actualDailyCost !== null
            ? formatCost(actualDailyCost, currencySymbol)
            : projectedDailyCost !== null
              ? `~${formatCost(projectedDailyCost, currencySymbol)}`
              : '—'}
        </dd>
      </div>

      {/* This month */}
      <div>
        <dt className="text-[11px] text-[var(--text-muted)]">This month</dt>
        <dd className="text-sm font-semibold text-heading tabular-nums">
          {monthToDateCost !== null ? formatCost(monthToDateCost, currencySymbol) : '—'}
        </dd>
      </div>

      {/* Projected this month */}
      {projectedDailyCost !== null && (
        <div>
          <dt className="text-[11px] text-[var(--text-muted)]">Projected</dt>
          <dd className="text-sm font-semibold text-heading tabular-nums">
            ~{formatCost(projectedDailyCost * 30, currencySymbol)}
          </dd>
        </div>
      )}

      {/* Last month */}
      {lastMonthCost !== null && (
        <div>
          <dt className="text-[11px] text-[var(--text-muted)]">Last month</dt>
          <dd className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-heading tabular-nums">
              {formatCost(lastMonthCost, currencySymbol)}
            </span>
            {monthOverMonthPercent !== null && Math.abs(monthOverMonthPercent) > 3 && (
              <OverUnderBadge percent={monthOverMonthPercent} size="sm" />
            )}
          </dd>
        </div>
      )}
    </dl>
  )
}

// ── Ranking table wrapper ─────────────────────────────────────────────────────

interface RankingTableProps {
  title: string
  id: string
  children: React.ReactNode
}

function RankingTable({ title, id, children }: RankingTableProps) {
  const [isOpen, setIsOpen] = useState(false)
  const headingId = `${id}-heading`

  return (
    <div className="rounded-lg bg-[var(--bg-secondary)]">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={id}
        id={headingId}
        onClick={() => setIsOpen(prev => !prev)}
        className={cn(
          'flex w-full items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium text-body',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          'min-h-[44px]',
        )}
      >
        <span>{title}</span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-caption transition-transform', isOpen ? 'rotate-180' : '')}
          aria-hidden="true"
        />
      </button>

      <div
        id={id}
        role="region"
        aria-labelledby={headingId}
        style={{
          display: 'grid',
          gridTemplateRows: isOpen ? '1fr' : '0fr',
          overflow: 'hidden',
          transition: 'grid-template-rows 200ms ease',
        }}
      >
        <div style={{ minHeight: 0 }}>
          <div className="px-3 pb-3">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Device cost ranking ───────────────────────────────────────────────────────

interface DeviceCostRankingProps {
  items: EnergyInsights['deviceCostRanking']
  currencySymbol: string
}

function DeviceCostRanking({ items, currencySymbol }: DeviceCostRankingProps) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-[var(--text-muted)] py-2">
        No device cost data yet — data will appear as energy history is collected.
      </p>
    )
  }

  return (
    <table className="w-full text-xs" aria-label="Device cost ranking">
      <thead>
        <tr className="text-[var(--text-muted)] border-b" style={{ borderColor: 'var(--border-primary)' }}>
          <th scope="col" className="py-1.5 text-left font-medium">Device</th>
          <th scope="col" className="py-1.5 text-right font-medium">Monthly kWh</th>
          <th scope="col" className="py-1.5 text-right font-medium">Monthly cost</th>
          <th scope="col" className="py-1.5 text-right font-medium">Daily avg</th>
        </tr>
      </thead>
      <tbody className="divide-y" style={{ borderColor: 'var(--border-primary)' }}>
        {items.map(item => (
          <tr key={item.deviceId}>
            <td className="py-1.5 pr-2">
              <Link
                to={deviceDetailPath(item.deviceId, 'kasa')}
                className="text-fairy-400 hover:text-fairy-300 hover:underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
              >
                {item.label}
              </Link>
            </td>
            <td className="py-1.5 text-right tabular-nums text-[var(--text-secondary)]">
              {item.monthlyKwh.toFixed(1)}
            </td>
            <td className="py-1.5 text-right tabular-nums text-heading font-medium">
              {formatCost(item.monthlyCost, currencySymbol)}
            </td>
            <td className="py-1.5 text-right tabular-nums text-[var(--text-muted)]">
              {formatCost(item.dailyAvgCost, currencySymbol)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Room cost ranking ─────────────────────────────────────────────────────────

interface RoomCostRankingProps {
  items: EnergyInsights['roomCostRanking']
  currencySymbol: string
}

function RoomCostRanking({ items, currencySymbol }: RoomCostRankingProps) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-[var(--text-muted)] py-2">
        No room cost data yet — assign devices to rooms to see per-room costs.
      </p>
    )
  }

  return (
    <table className="w-full text-xs" aria-label="Room cost ranking">
      <thead>
        <tr className="text-[var(--text-muted)] border-b" style={{ borderColor: 'var(--border-primary)' }}>
          <th scope="col" className="py-1.5 text-left font-medium">Room</th>
          <th scope="col" className="py-1.5 text-right font-medium">Today</th>
          <th scope="col" className="py-1.5 text-right font-medium">This month</th>
          <th scope="col" className="py-1.5 text-right font-medium">Devices</th>
        </tr>
      </thead>
      <tbody className="divide-y" style={{ borderColor: 'var(--border-primary)' }}>
        {items.map(item => (
          <tr key={item.roomName}>
            <td className="py-1.5 pr-2">
              <Link
                to={`/rooms/${encodeURIComponent(item.roomName)}`}
                className="text-fairy-400 hover:text-fairy-300 hover:underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
              >
                {item.roomName}
              </Link>
            </td>
            <td className="py-1.5 text-right tabular-nums text-heading font-medium">
              {formatCost(item.dailyCost, currencySymbol)}
            </td>
            <td className="py-1.5 text-right tabular-nums text-[var(--text-secondary)]">
              {formatCost(item.monthToDateCost, currencySymbol)}
            </td>
            <td className="py-1.5 text-right tabular-nums text-[var(--text-muted)]">
              {item.deviceCount}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Energy narrative ──────────────────────────────────────────────────────────

interface EnergyNarrativeProps {
  insights: EnergyInsights
  currencySymbol: string
}

function EnergyNarrative({ insights, currencySymbol }: EnergyNarrativeProps) {
  const { overUnderPercent, totalWatts, averageWattsThisHour, actualDailyCost, projectedDailyCost } = insights

  // Lead with cost context when available
  const costDisplay = actualDailyCost !== null
    ? formatCost(actualDailyCost, currencySymbol)
    : projectedDailyCost !== null
      ? `~${formatCost(projectedDailyCost, currencySymbol)}`
      : null

  if (overUnderPercent == null) {
    if (costDisplay) {
      return (
        <p className="text-body text-sm">
          Your home has used{' '}
          <span className="font-semibold text-heading">{costDisplay}</span>{' '}
          of electricity today. Collecting data to establish your energy baseline — trends will appear within a week.
        </p>
      )
    }
    return (
      <p className="text-body text-sm">
        Collecting data to establish your energy baseline. Trends will appear within a week.
      </p>
    )
  }

  if (overUnderPercent > 30) {
    return (
      <p className="text-body text-sm">
        {costDisplay && (
          <>
            <span className="font-semibold text-heading">{costDisplay}</span> spent today.{' '}
          </>
        )}
        Your home is using{' '}
        <span className="font-semibold text-heading">{overUnderPercent}% more</span>{' '}
        energy than usual for this time of day. Currently{' '}
        <span className="font-semibold text-heading">{totalWatts.toFixed(0)} W</span>
        {averageWattsThisHour != null && (
          <>
            {' '}— typically{' '}
            <span className="font-semibold text-heading">{averageWattsThisHour.toFixed(0)} W</span>{' '}
            at this hour
          </>
        )}
        .
      </p>
    )
  }

  if (overUnderPercent >= 5) {
    return (
      <p className="text-body text-sm">
        {costDisplay && (
          <>
            <span className="font-semibold text-heading">{costDisplay}</span> spent today.{' '}
          </>
        )}
        Energy usage is slightly above your weekly average.
      </p>
    )
  }

  if (overUnderPercent >= -5) {
    return (
      <p className="text-body text-sm">
        {costDisplay && (
          <>
            <span className="font-semibold text-heading">{costDisplay}</span> spent today.{' '}
          </>
        )}
        Energy usage is typical for this time of day.
      </p>
    )
  }

  return (
    <p className="text-body text-sm">
      {costDisplay && (
        <>
          <span className="font-semibold text-heading">{costDisplay}</span> spent today.{' '}
        </>
      )}
      Energy usage is{' '}
      <span className="font-semibold text-heading">{Math.abs(overUnderPercent)}% below</span>{' '}
      your weekly average.
    </p>
  )
}

// ── Device band ───────────────────────────────────────────────────────────────

interface DeviceBandProps {
  label: string
  items: PowerDevice[]
  maxWatts: number
  anomalyMap: Map<number | string, EnergyInsights['deviceAnomalies'][number]>
  defaultOpen: boolean
  accentClass?: string
}

function DeviceBand({
  label,
  items,
  maxWatts,
  anomalyMap,
  defaultOpen,
  accentClass,
}: DeviceBandProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const bandId = `device-band-${label.toLowerCase().replace(/\s+/g, '-')}`
  const headingId = `${bandId}-heading`

  return (
    <div className={cn('rounded-lg p-3', accentClass ?? 'bg-slate-500/5')}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={bandId}
        id={headingId}
        onClick={() => setIsOpen(prev => !prev)}
        className={cn(
          'flex w-full items-center justify-between gap-2 text-sm font-medium',
          accentClass ? 'text-amber-400' : 'text-body',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          'min-h-[44px]',
        )}
      >
        <span>{label}</span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 transition-transform', isOpen ? 'rotate-180' : '')}
          aria-hidden="true"
        />
      </button>

      <div
        id={bandId}
        role="region"
        aria-labelledby={headingId}
        style={{ display: 'grid', gridTemplateRows: isOpen ? '1fr' : '0fr', overflow: 'hidden', transition: 'grid-template-rows 200ms ease' }}
      >
        <div style={{ minHeight: 0 }}>
          <ul
            role="list"
            aria-label={label}
            className="mt-1 divide-y"
            style={{ borderColor: 'var(--border-primary)' }}
          >
            {items.map(device => (
              <DeviceRow
                key={device.id}
                device={device}
                maxWatts={maxWatts}
                anomaly={anomalyMap.get(device.id) ?? null}
              />
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

// ── EnergyCard ────────────────────────────────────────────────────────────────

interface EnergyCardProps {
  power: PowerDevice[]
  insights?: EnergyInsights | null
  currencySymbol?: string
  open: boolean
  onToggle: () => void
}

export default function EnergyCard({ power, insights, currencySymbol = '$', open, onToggle }: EnergyCardProps) {
  // Sort highest power first
  const sorted = [...power].sort((a, b) => b.power - a.power)
  const maxWatts = sorted[0]?.power ?? 0
  const totalWatts = power.reduce((sum, d) => sum + d.power, 0)

  // Build a fast lookup: device id → anomaly entry
  const anomalyMap = new Map(
    (insights?.deviceAnomalies ?? []).map(a => [a.deviceId, a]),
  )

  // Separate devices: anomalies vs rest
  const anomalyDeviceIds = new Set((insights?.deviceAnomalies ?? []).map(a => a.deviceId))
  const anomalyDevices = sorted.filter(d => anomalyDeviceIds.has(d.id))
  const normalDevices = sorted.filter(d => !anomalyDeviceIds.has(d.id))

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (power.length === 0) {
    return (
      <section id="energy-card" aria-label="Energy usage" className="card rounded-xl border p-5">
        <header className="mb-4 flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-400" aria-hidden="true" />
          <h2 className="text-heading text-base font-semibold">Energy</h2>
        </header>
        <div className="rounded-lg border border-dashed py-8 text-center" style={{ borderColor: 'var(--border-secondary)' }}>
          <Zap className="text-caption mx-auto mb-3 h-7 w-7" aria-hidden="true" />
          <p className="text-body text-sm">No power-monitoring devices detected.</p>
          <p className="text-caption mt-1 text-xs">
            Smart plugs that report energy usage will appear here.
          </p>
        </div>
      </section>
    )
  }

  return (
    <Accordion
      id="energy-card"
      title={<><Zap className="h-4 w-4 text-amber-400" aria-hidden="true" /> Energy</>}
      open={open}
      onToggle={onToggle}
      trailing={!open ? (
        <span className="flex items-center gap-2 text-xs">
          <span className="text-heading font-semibold tabular-nums">{totalWatts.toFixed(1)} W</span>
          {insights?.overUnderPercent != null && <OverUnderBadge percent={insights.overUnderPercent} />}
        </span>
      ) : undefined}
    >
      {/* Total */}
      <div className="mb-3 mt-1">
        <p className="text-caption text-sm">
          <span className="text-heading text-2xl font-semibold tabular-nums">
            {totalWatts.toFixed(1)}
          </span>
          {' '}W total across {power.length} device{power.length !== 1 ? 's' : ''}
          {insights?.overUnderPercent != null && (
            <span className="ml-2 inline-flex align-middle">
              <OverUnderBadge percent={insights.overUnderPercent} />
            </span>
          )}
        </p>
      </div>

      {/* Cost summary block */}
      {insights && (
        <CostSummary insights={insights} currencySymbol={currencySymbol} />
      )}

      {/* Narrative */}
      {insights && (
        <div className="mb-3">
          <EnergyNarrative insights={insights} currencySymbol={currencySymbol} />
        </div>
      )}

      {/* Peak hours callout — in summary area, above device bands */}
      {insights?.peakHours && insights.peakHours.length > 0 && (
        <p className="text-caption mb-4 text-xs">
          Peak usage hours:{' '}
          {insights.peakHours
            .map(({ hour }) => {
              const period = hour < 12 ? 'am' : 'pm'
              const displayHour = hour % 12 === 0 ? 12 : hour % 12
              return `${displayHour} ${period}`
            })
            .join(', ')}
        </p>
      )}

      {/* Device bands */}
      <div className="space-y-2">
        {/* Anomalies band — only shown when anomalies exist, defaults open */}
        {anomalyDevices.length > 0 && (
          <DeviceBand
            label={`${anomalyDevices.length} ${anomalyDevices.length === 1 ? 'device' : 'devices'} above normal`}
            items={anomalyDevices}
            maxWatts={maxWatts}
            anomalyMap={anomalyMap}
            defaultOpen={true}
            accentClass="bg-amber-500/5"
          />
        )}

        {/* All devices band — defaults closed */}
        {normalDevices.length > 0 && (
          <DeviceBand
            label={`All devices (${normalDevices.length})`}
            items={normalDevices}
            maxWatts={maxWatts}
            anomalyMap={anomalyMap}
            defaultOpen={false}
          />
        )}
      </div>

      {/* Cost ranking tables */}
      {insights && (
        <div className="mt-4 space-y-2">
          {insights.deviceCostRanking.length > 0 && (
            <RankingTable title="Device cost breakdown" id="device-cost-ranking">
              <DeviceCostRanking items={insights.deviceCostRanking} currencySymbol={currencySymbol} />
            </RankingTable>
          )}
          {insights.roomCostRanking.length > 0 && (
            <RankingTable title="Cost by room" id="room-cost-ranking">
              <RoomCostRanking items={insights.roomCostRanking} currencySymbol={currencySymbol} />
            </RankingTable>
          )}
        </div>
      )}
    </Accordion>
  )
}
