import { useState, useId } from 'react'
import { Link } from 'react-router-dom'
import { Battery, AlertTriangle, ChevronDown } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import TimeSeriesChart from '@/components/dashboard/TimeSeriesChart'
import type { BatteryDevice, BatteryInsights } from '@/lib/api'

// ── Helpers ───────────────────────────────────────────────────────────────────

function batteryBarClass(level: number): string {
  if (level < 15) return 'bg-red-500'
  if (level <= 50) return 'bg-yellow-400'
  return 'bg-green-500'
}

function batteryTextClass(level: number): string {
  if (level < 15) return 'text-red-400'
  if (level <= 50) return 'text-yellow-400'
  return 'text-green-400'
}

function batteryStatusLabel(status: BatteryDevice['status']): string {
  switch (status) {
    case 'critical': return 'Critical'
    case 'low': return 'Low'
    default: return 'Ok'
  }
}

function batteryStatusClass(status: BatteryDevice['status']): string {
  switch (status) {
    case 'critical': return 'bg-red-500/15 text-red-400'
    case 'low': return 'bg-yellow-500/15 text-yellow-400'
    default: return 'bg-fairy-500/15 text-fairy-400'
  }
}

// ── Fleet health summary ──────────────────────────────────────────────────────

interface FleetHealthSummaryProps {
  fleetHealth: BatteryInsights['fleetHealth']
}

function FleetHealthSummary({ fleetHealth }: FleetHealthSummaryProps) {
  const counts: Array<{ label: string; value: number; className: string }> = [
    { label: 'healthy', value: fleetHealth.healthy, className: 'text-green-400' },
    { label: 'low', value: fleetHealth.low, className: 'text-yellow-400' },
    { label: 'critical', value: fleetHealth.critical, className: 'text-red-400' },
  ].filter(entry => entry.value > 0)

  if (counts.length === 0) {
    return (
      <p className="text-sm font-medium text-green-400">
        All {fleetHealth.total} {fleetHealth.total === 1 ? 'battery' : 'batteries'} are healthy
      </p>
    )
  }

  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium">
      {counts.map((entry, i) => (
        <span key={entry.label} className={entry.className}>
          {entry.value} {entry.label}
          {i < counts.length - 1 && <span className="sr-only">,</span>}
        </span>
      ))}
    </p>
  )
}

// ── Battery device row ────────────────────────────────────────────────────────

type DrainRateEntry = BatteryInsights['deviceDrainRates'][number]

interface DeviceRowProps {
  device: BatteryDevice
  drainRate?: DrainRateEntry
}

function BatteryDeviceRow({ device, drainRate }: DeviceRowProps) {
  const isCritical = device.status === 'critical'
  const level = device.battery ?? 0
  const isAnomalous = drainRate?.isAnomalous === true

  // Build a descriptive aria-label that includes drain info when available
  const drainAriaDetail = drainRate?.drainPerDay != null
    ? `, draining ${drainRate.drainPerDay.toFixed(1)}% per day${drainRate.predictedDaysRemaining != null ? `, approximately ${drainRate.predictedDaysRemaining} days remaining` : ''}`
    : ''

  return (
    <li
      className={cn(
        'rounded-lg px-3 py-2.5',
        isCritical ? 'bg-red-500/8 ring-1 ring-red-500/20' : '',
        isAnomalous ? 'border-l-2 border-l-amber-500' : '',
      )}
      aria-label={`${device.label}: ${level}% battery, status ${batteryStatusLabel(device.status)}${drainAriaDetail}`}
    >
      <div className="flex items-center gap-3">
        {/* Critical warning icon — paired with text badge so icon is not the sole indicator */}
        {isCritical && (
          <AlertTriangle
            className="h-4 w-4 shrink-0 text-red-400"
            aria-hidden="true"
          />
        )}

        {/* Label column — device name as link + drain sub-text */}
        <div className="flex-1 min-w-0">
          <Link
            to={`/devices/${device.id}`}
            className={cn(
              'text-sm font-medium text-fairy-400 hover:underline',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              isCritical ? 'text-red-300 hover:text-red-200' : '',
            )}
          >
            {device.label}
          </Link>

          {/* Drain rate sub-text */}
          {drainRate != null && (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {drainRate.drainPerDay != null && (
                <span className="text-caption text-xs">
                  {drainRate.drainPerDay.toFixed(1)}%/day
                </span>
              )}
              {drainRate.predictedDaysRemaining != null && (
                <span className="text-caption text-xs">
                  ~{drainRate.predictedDaysRemaining} days remaining
                </span>
              )}
              {isCritical && (
                <span className="text-xs font-medium text-red-400">
                  Replace soon
                </span>
              )}
              {isAnomalous && (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                  Draining faster than normal
                </span>
              )}
            </div>
          )}
        </div>

        {/* Percentage — always visible text, not just colour */}
        <span className={cn('shrink-0 text-sm font-semibold tabular-nums', batteryTextClass(level))}>
          {level}%
        </span>

        {/* Status badge */}
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
            batteryStatusClass(device.status),
          )}
        >
          {batteryStatusLabel(device.status)}
        </span>
      </div>

      {/* Visual progress bar — decorative; percentage text above is the real indicator */}
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-700"
        role="presentation"
        aria-hidden="true"
      >
        <div
          className={cn('h-full rounded-full transition-all', batteryBarClass(level))}
          style={{ width: `${Math.min(100, Math.max(0, level))}%` }}
        />
      </div>
    </li>
  )
}

// ── Urgency band ──────────────────────────────────────────────────────────────

type UrgencyBand = 'attention' | 'monitor' | 'healthy'

interface UrgencyBandItem {
  device: BatteryDevice
  drainRate?: DrainRateEntry
}

const BAND_CONFIG: Record<
  UrgencyBand,
  { label: string; bgClass: string; headerColorClass: string }
> = {
  attention: {
    label: 'Needs attention',
    bgClass: 'bg-red-500/5',
    headerColorClass: 'text-red-400',
  },
  monitor: {
    label: 'Monitor',
    bgClass: 'bg-amber-500/5',
    headerColorClass: 'text-amber-400',
  },
  healthy: {
    label: 'Healthy',
    bgClass: 'bg-green-500/5',
    headerColorClass: 'text-green-400',
  },
}

function classifyDevice(
  device: BatteryDevice,
  drainRate: DrainRateEntry | undefined,
): UrgencyBand {
  const daysRemaining = drainRate?.predictedDaysRemaining ?? null
  const level = device.battery ?? 0
  const isUrgentStatus = device.status === 'critical' || device.status === 'low'

  if (daysRemaining != null && daysRemaining < 30) return 'attention'
  if (isUrgentStatus) return 'attention'
  if (daysRemaining != null && daysRemaining <= 90) return 'monitor'
  if (daysRemaining == null && level > 50) return 'healthy'
  if (daysRemaining != null && daysRemaining > 90) return 'healthy'
  return 'monitor'
}

interface UrgencyBandSectionProps {
  band: UrgencyBand
  items: UrgencyBandItem[]
  defaultOpen: boolean
}

function UrgencyBandSection({ band, items, defaultOpen }: UrgencyBandSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const config = BAND_CONFIG[band]
  const headingId = `band-heading-${band}`
  const regionId = `band-region-${band}`

  return (
    <div className={cn('rounded-lg p-3', config.bgClass)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        id={headingId}
        onClick={() => setOpen(prev => !prev)}
        className={cn(
          'flex w-full items-center justify-between gap-2 text-sm font-medium',
          config.headerColorClass,
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          'min-h-[44px]',
        )}
      >
        <span>
          {items.length} {items.length === 1 ? 'device' : 'devices'} — {config.label}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 transition-transform', open ? 'rotate-180' : '')}
          aria-hidden="true"
        />
      </button>

      {open && (
        <ul
          id={regionId}
          role="list"
          aria-labelledby={headingId}
          className="mt-2 space-y-1.5"
        >
          {items.map(({ device, drainRate }) => (
            <BatteryDeviceRow key={device.id} device={device} drainRate={drainRate} />
          ))}
        </ul>
      )}
    </div>
  )
}

// ── BatteryCard ───────────────────────────────────────────────────────────────

interface BatteryCardProps {
  battery: BatteryDevice[]
  insights?: BatteryInsights | null
}

export default function BatteryCard({ battery, insights }: BatteryCardProps) {
  const selectId = useId()

  // Sort lowest battery first (worst cases at the top)
  const sorted = [...battery].sort((a, b) => (a.battery ?? 0) - (b.battery ?? 0))

  // Default selection: lowest-battery device
  const [selectedDeviceLabel, setSelectedDeviceLabel] = useState<string>(
    sorted[0]?.label ?? '',
  )
  const [listExpanded, setListExpanded] = useState(false)
  const [chartExpanded, setChartExpanded] = useState(false)

  const allHealthy = battery.length > 0 && battery.every(d => (d.battery ?? 0) > 50)

  const {
    data: historyData,
    isLoading: historyLoading,
  } = useQuery({
    queryKey: ['dashboard', 'history', 'battery', selectedDeviceLabel, '30d'],
    queryFn: () => api.dashboard.getHistory('battery', selectedDeviceLabel, '30d'),
    enabled: !!selectedDeviceLabel && chartExpanded,
    staleTime: 5 * 60 * 1000,
  })

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (battery.length === 0) {
    return (
      <section id="battery-card" aria-label="Battery health" className="card rounded-xl border p-5">
        <header className="mb-4 flex items-center gap-2">
          <Battery className="h-4 w-4 text-green-400" aria-hidden="true" />
          <h2 className="text-heading text-base font-semibold">Battery health</h2>
        </header>
        <div className="rounded-lg border border-dashed py-8 text-center" style={{ borderColor: 'var(--border-secondary)' }}>
          <Battery className="text-caption mx-auto mb-3 h-7 w-7" aria-hidden="true" />
          <p className="text-body text-sm">No battery-powered devices detected.</p>
        </div>
      </section>
    )
  }

  // ── All-healthy compact state ─────────────────────────────────────────────

  if (allHealthy && !listExpanded) {
    return (
      <section id="battery-card" aria-label="Battery health" className="card rounded-xl border p-5">
        <header className="mb-4 flex items-center gap-2">
          <Battery className="h-4 w-4 text-green-400" aria-hidden="true" />
          <h2 className="text-heading text-base font-semibold">Battery health</h2>
        </header>

        <div className="flex items-center justify-between gap-3 rounded-lg bg-green-500/8 px-4 py-3 ring-1 ring-green-500/20">
          {insights ? (
            <FleetHealthSummary fleetHealth={insights.fleetHealth} />
          ) : (
            <p className="text-sm font-medium text-green-400">
              All {battery.length} {battery.length === 1 ? 'battery' : 'batteries'} are healthy
            </p>
          )}
          <button
            type="button"
            onClick={() => setListExpanded(true)}
            className={cn(
              'shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-green-400',
              'hover:bg-green-500/15 transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              'min-h-[44px] min-w-[44px]',
            )}
          >
            View details
          </button>
        </div>
      </section>
    )
  }

  return (
    <section id="battery-card" aria-label="Battery health" className="card rounded-xl border p-5">
      {/* Header */}
      <header className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Battery className="h-4 w-4 text-green-400" aria-hidden="true" />
          <h2 className="text-heading text-base font-semibold">Battery health</h2>
        </div>
        {/* If we expanded from the all-healthy compact state, offer to collapse back */}
        {allHealthy && listExpanded && (
          <button
            type="button"
            onClick={() => setListExpanded(false)}
            className={cn(
              'text-caption text-xs hover:text-body transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              'min-h-[44px] min-w-[44px] flex items-center justify-end',
            )}
          >
            Collapse
          </button>
        )}
      </header>

      {/* Fleet health summary (insights-aware) */}
      {insights && (
        <div className="mb-3">
          <FleetHealthSummary fleetHealth={insights.fleetHealth} />
        </div>
      )}

      {/* Device list — urgency bands when insights available, flat list otherwise */}
      {insights?.deviceDrainRates != null ? (
        (() => {
          const bands: Record<UrgencyBand, UrgencyBandItem[]> = {
            attention: [],
            monitor: [],
            healthy: [],
          }
          sorted.forEach(device => {
            const drainRate = insights.deviceDrainRates.find(r => r.label === device.label)
            const band = classifyDevice(device, drainRate)
            bands[band].push({ device, drainRate })
          })
          return (
            <div className="space-y-2">
              {bands.attention.length > 0 && (
                <UrgencyBandSection band="attention" items={bands.attention} defaultOpen={true} />
              )}
              {bands.monitor.length > 0 && (
                <UrgencyBandSection band="monitor" items={bands.monitor} defaultOpen={true} />
              )}
              {bands.healthy.length > 0 && (
                <UrgencyBandSection band="healthy" items={bands.healthy} defaultOpen={false} />
              )}
            </div>
          )
        })()
      ) : (
        <ul
          role="list"
          aria-label="Battery-powered devices"
          className="space-y-1.5"
        >
          {sorted.map(device => (
            <BatteryDeviceRow key={device.id} device={device} />
          ))}
        </ul>
      )}

      {/* Chart section */}
      <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--border-primary)' }}>
        <button
          type="button"
          aria-expanded={chartExpanded}
          aria-controls="battery-trend-chart"
          onClick={() => setChartExpanded(prev => !prev)}
          className={cn(
            'flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
            'text-body hover:bg-[var(--bg-tertiary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            'min-h-[44px]',
          )}
        >
          <span>30-day battery trend</span>
          <span className="text-caption text-xs">
            {chartExpanded ? 'Hide' : 'Show'}
          </span>
        </button>

        {chartExpanded && (
          <div id="battery-trend-chart" className="mt-3 space-y-3">
            {/* Device selector */}
            <div className="flex items-center gap-2">
              <label
                htmlFor={selectId}
                className="text-caption shrink-0 text-xs"
              >
                Device:
              </label>
              <select
                id={selectId}
                value={selectedDeviceLabel}
                onChange={e => setSelectedDeviceLabel(e.target.value)}
                className={cn(
                  'input-field min-h-[44px] flex-1 rounded-lg border px-3 py-2 text-sm',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                )}
              >
                {sorted.map(device => (
                  <option key={device.id} value={device.label}>
                    {device.label}
                    {device.battery !== null ? ` — ${device.battery}%` : ''}
                  </option>
                ))}
              </select>
            </div>

            <TimeSeriesChart
              data={historyData?.data ?? []}
              label={selectedDeviceLabel}
              color="#22c55e"
              unit="%"
              height={160}
              loading={historyLoading}
              emptyMessage="Battery trend data will appear once history is collected."
            />
          </div>
        )}
      </div>
    </section>
  )
}
