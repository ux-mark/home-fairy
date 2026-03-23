import { useState } from 'react'
import { Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import TimeSeriesChart from '@/components/dashboard/TimeSeriesChart'
import OverUnderBadge from '@/components/dashboard/OverUnderBadge'
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

// ── Power device row ──────────────────────────────────────────────────────────

interface DeviceRowProps {
  device: PowerDevice
  maxWatts: number
  anomaly?: EnergyInsights['deviceAnomalies'][number] | null
}

function DeviceRow({ device, maxWatts, anomaly }: DeviceRowProps) {
  const isOn = device.switch === 'on'
  const intensityClass = powerIntensityClass(device.power, maxWatts)

  return (
    <li
      className={cn(
        'flex items-start gap-3 py-2.5',
        anomaly && 'border-l-2 border-l-amber-500 pl-2',
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
            to={'/devices/' + device.id}
            className="text-fairy-400 hover:underline"
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

      {/* Power value — colour reinforces scale but watt number is always visible */}
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
        </div>
        <span className="sr-only"> watts, device is {isOn ? 'on' : 'off'}</span>
      </div>
    </li>
  )
}

// ── Energy narrative ──────────────────────────────────────────────────────────

interface EnergyNarrativeProps {
  insights: EnergyInsights
}

function EnergyNarrative({ insights }: EnergyNarrativeProps) {
  const { overUnderPercent, totalWatts, averageWattsThisHour } = insights

  if (overUnderPercent == null) {
    return (
      <p className="text-body text-sm">
        Collecting data to establish your energy baseline. Trends will appear within a week.
      </p>
    )
  }

  if (overUnderPercent > 30) {
    return (
      <p className="text-body text-sm">
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
        Energy usage is slightly above your weekly average.
      </p>
    )
  }

  if (overUnderPercent >= -5) {
    return (
      <p className="text-body text-sm">
        Energy usage is typical for this time of day.
      </p>
    )
  }

  return (
    <p className="text-body text-sm">
      Energy usage is{' '}
      <span className="font-semibold text-heading">{Math.abs(overUnderPercent)}% below</span>{' '}
      your weekly average.
    </p>
  )
}

// ── EnergyCard ────────────────────────────────────────────────────────────────

interface EnergyCardProps {
  power: PowerDevice[]
  insights?: EnergyInsights | null
  currencySymbol?: string
}

export default function EnergyCard({ power, insights, currencySymbol = '$' }: EnergyCardProps) {
  const [chartExpanded, setChartExpanded] = useState(false)

  // Sort highest power first
  const sorted = [...power].sort((a, b) => b.power - a.power)
  const maxWatts = sorted[0]?.power ?? 0
  const totalWatts = power.reduce((sum, d) => sum + d.power, 0)

  // Build a fast lookup: device id → anomaly entry
  const anomalyMap = new Map(
    (insights?.deviceAnomalies ?? []).map(a => [a.deviceId, a]),
  )

  // Track trend for the highest-drawing device
  const topDevice = sorted[0]
  const {
    data: historyData,
    isLoading: historyLoading,
  } = useQuery({
    queryKey: ['dashboard', 'history', 'power', topDevice?.label, '24h'],
    queryFn: () => api.dashboard.getHistory('power', topDevice!.label, '24h'),
    enabled: !!topDevice && chartExpanded,
    staleTime: 5 * 60 * 1000,
  })

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
    <section id="energy-card" aria-label="Energy usage" className="card rounded-xl border p-5">
      {/* Header */}
      <header className="mb-1 flex items-center gap-2">
        <Zap className="h-4 w-4 text-amber-400" aria-hidden="true" />
        <h2 className="text-heading text-base font-semibold">Energy</h2>
      </header>

      {/* Total */}
      <div className="mb-3">
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
        {insights?.dailyCostEstimate != null && (
          <p className="text-caption mt-0.5 text-xs">
            Estimated daily cost: {currencySymbol}{insights.dailyCostEstimate.toFixed(2)}
          </p>
        )}
      </div>

      {/* Narrative */}
      {insights && (
        <div className="mb-4">
          <EnergyNarrative insights={insights} />
        </div>
      )}

      {/* Device list */}
      <ul
        role="list"
        aria-label="Power-consuming devices"
        className="divide-y"
        style={{ borderColor: 'var(--border-primary)' }}
      >
        {sorted.map(device => (
          <DeviceRow
            key={device.id}
            device={device}
            maxWatts={maxWatts}
            anomaly={anomalyMap.get(device.id) ?? null}
          />
        ))}
      </ul>

      {/* Peak hours callout */}
      {insights?.peakHours && insights.peakHours.length > 0 && (
        <p className="text-caption mt-3 text-xs">
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

      {/* Chart section */}
      <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--border-primary)' }}>
        <button
          type="button"
          aria-expanded={chartExpanded}
          aria-controls="energy-trend-chart"
          onClick={() => setChartExpanded(prev => !prev)}
          className={cn(
            'flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
            'text-body hover:bg-[var(--bg-tertiary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            'min-h-[44px]',
          )}
        >
          <span>
            {topDevice
              ? `24-hour trend — ${topDevice.label}`
              : '24-hour trend'}
          </span>
          <span className={cn('text-caption text-xs transition-transform', chartExpanded ? 'rotate-180' : '')}>
            {chartExpanded ? 'Hide' : 'Show'}
          </span>
        </button>

        {chartExpanded && (
          <div id="energy-trend-chart" className="mt-3">
            <TimeSeriesChart
              data={historyData?.data ?? []}
              label={topDevice?.label ?? 'Power'}
              color="#f59e0b"
              unit="W"
              height={160}
              loading={historyLoading}
              emptyMessage="Power trends will appear as data is collected."
            />
          </div>
        )}
      </div>
    </section>
  )
}
