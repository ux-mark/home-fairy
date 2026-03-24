import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { api, type DeviceInsightsData } from '@/lib/api'
import { cn } from '@/lib/utils'
import TimeSeriesChart from '@/components/dashboard/TimeSeriesChart'
import OverUnderBadge from '@/components/dashboard/OverUnderBadge'

// ── Types ─────────────────────────────────────────────────────────────────────

type Period = '24h' | '7d' | '30d'

// ── Source metadata ────────────────────────────────────────────────────────────

interface SourceMeta {
  unit: string
  color: string
  label: string
  chartTitle: string
}

function getSourceMeta(source: string): SourceMeta {
  switch (source) {
    case 'power':
      return { unit: 'W', color: '#f59e0b', label: 'Power', chartTitle: 'Power usage over time' }
    case 'energy':
      return { unit: 'kWh', color: '#8b5cf6', label: 'Energy', chartTitle: 'Energy consumption over time' }
    case 'battery':
      return { unit: '%', color: '#22c55e', label: 'Battery', chartTitle: 'Battery drain over time' }
    case 'temperature':
      return { unit: '°', color: '#10b981', label: 'Temperature', chartTitle: 'Temperature trend' }
    case 'lux':
      return { unit: 'lux', color: '#fbbf24', label: 'Illuminance', chartTitle: 'Illuminance over time' }
    default:
      return { unit: '', color: '#10b981', label: source, chartTitle: `${source} over time` }
  }
}

// ── Attribute value formatting ─────────────────────────────────────────────────

function formatAttributeValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') {
    // Render integers without decimals, floats with up to 2 dp
    return value % 1 === 0 ? String(value) : value.toFixed(2)
  }
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

/** True for attribute keys that deserve visual emphasis */
function isHighlightedAttribute(key: string): boolean {
  const highlights = ['power', 'energy', 'battery', 'temperature', 'switch']
  return highlights.includes(key.toLowerCase())
}

// ── Attribute unit hint ────────────────────────────────────────────────────────

function attributeUnit(key: string): string {
  const lower = key.toLowerCase()
  if (lower === 'battery') return '%'
  if (lower === 'energy') return 'kWh'
  if (lower === 'temperature') return '°'
  return ''
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading device details">
      {/* Header skeleton */}
      <div className="space-y-3">
        <div className="h-8 w-24 animate-pulse rounded-lg bg-[var(--bg-tertiary)]" />
        <div className="h-7 w-48 animate-pulse rounded-lg bg-[var(--bg-tertiary)]" />
        <div className="h-5 w-32 animate-pulse rounded-full bg-[var(--bg-tertiary)]" />
      </div>

      {/* Section skeletons */}
      {[1, 2, 3].map(i => (
        <div key={i} className="card rounded-xl border p-5 space-y-3">
          <div className="h-5 w-32 animate-pulse rounded bg-[var(--bg-tertiary)]" />
          <div className="space-y-2">
            <div className="h-4 w-full animate-pulse rounded bg-[var(--bg-tertiary)]" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--bg-tertiary)]" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-[var(--bg-tertiary)]" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Battery level bar ─────────────────────────────────────────────────────────

function BatteryBar({ level }: { level: number }) {
  const clamped = Math.min(100, Math.max(0, level))
  const colorClass =
    clamped <= 15
      ? 'bg-red-500'
      : clamped <= 30
        ? 'bg-amber-400'
        : 'bg-green-500'

  return (
    <div
      className="h-3 w-full overflow-hidden rounded-full bg-[var(--bg-tertiary)]"
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Battery level ${clamped}%`}
    >
      <div
        className={cn('h-full rounded-full transition-all duration-500', colorClass)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}

// ── Headline insights ─────────────────────────────────────────────────────────

function HeadlineInsights({
  deviceInsights,
}: {
  deviceInsights: DeviceInsightsData | undefined
}) {
  if (!deviceInsights) return null

  const { power, battery, temperature } = deviceInsights.insights

  if (!power && !battery && !temperature) return null

  return (
    <section aria-labelledby="insights-heading">
      <div className="card rounded-xl border p-5">
        <h2
          id="insights-heading"
          className="mb-4 text-sm font-semibold text-heading"
        >
          At a glance
        </h2>

        <div className="space-y-5">
          {/* ── Power insights ─────────────────────────────────────────── */}
          {power && (
            <div>
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="text-2xl font-bold tabular-nums text-heading">
                  {power.currentWatts} W
                </span>
                <OverUnderBadge percent={power.overUnderPercent} size="md" />
              </div>
              <p className="mt-0.5 text-xs text-caption">Current draw</p>

              {power.percentOfTotal > 0 && (
                <p className="mt-3 text-sm text-body">
                  This device accounts for{' '}
                  <strong className="font-semibold text-heading">
                    {power.percentOfTotal}%
                  </strong>{' '}
                  of your total energy draw.
                </p>
              )}

              {power.dailyCostImpact !== null && (
                <p className="mt-1 text-sm text-caption">
                  Estimated daily cost:{' '}
                  <span className="font-medium text-body">
                    {power.currencySymbol}
                    {power.dailyCostImpact.toFixed(2)}
                  </span>
                </p>
              )}
            </div>
          )}

          {/* ── Battery insights ───────────────────────────────────────── */}
          {battery && (
            <div>
              {/* Critical replacement warning */}
              {battery.predictedDaysRemaining !== null &&
                battery.predictedDaysRemaining < 30 && (
                  <div
                    className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3"
                    role="alert"
                  >
                    <p className="text-sm font-semibold text-red-400">
                      Replace soon — estimated{' '}
                      <strong>{battery.predictedDaysRemaining} days</strong>{' '}
                      remaining
                    </p>
                  </div>
                )}

              <BatteryBar level={battery.currentLevel} />

              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums text-heading">
                  {battery.currentLevel}%
                </span>
                <span className="text-xs text-caption">battery remaining</span>
              </div>

              {battery.drainPerDay !== null && (
                <p className="mt-2 text-sm text-caption">
                  Draining at{' '}
                  <span className="font-medium text-body">
                    {battery.drainPerDay}% per day
                  </span>
                </p>
              )}

              {battery.predictedDaysRemaining !== null &&
                battery.predictedDaysRemaining >= 30 && (
                  <p className="mt-1 text-sm text-caption">
                    At current rate, this battery will need replacing in
                    approximately{' '}
                    <strong className="font-semibold text-body">
                      {battery.predictedDaysRemaining} days
                    </strong>
                    .
                  </p>
                )}
            </div>
          )}

          {/* ── Temperature insights ───────────────────────────────────── */}
          {temperature && (
            <div>
              <span className="text-2xl font-bold tabular-nums text-heading">
                {temperature.currentTemp}°
              </span>
              <p className="mt-0.5 text-xs text-caption">Current temperature</p>

              {temperature.avgTemp30d !== null && (
                <p className="mt-2 text-sm text-caption">
                  30-day average:{' '}
                  <span className="font-medium text-body">
                    {temperature.avgTemp30d}°
                  </span>
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

// ── History chart panel ────────────────────────────────────────────────────────

function HistoryChart({
  source,
  deviceLabel,
  period,
}: {
  source: string
  deviceLabel: string
  period: Period
}) {
  const meta = getSourceMeta(source)
  const showRange = period === '7d' || period === '30d'

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'history', source, deviceLabel, period],
    queryFn: () => api.dashboard.getHistory(source, deviceLabel, period),
    staleTime: 60_000,
  })

  return (
    <div>
      <p className="mb-3 text-sm font-medium text-heading">{meta.chartTitle}</p>
      <TimeSeriesChart
        data={data?.data ?? []}
        label={meta.label}
        color={meta.color}
        unit={meta.unit}
        height={180}
        loading={isLoading}
        showRange={showRange}
        emptyMessage="No data recorded for this period."
      />
    </div>
  )
}

// ── Period selector tabs ───────────────────────────────────────────────────────

const PERIODS: { value: Period; label: string }[] = [
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
]

function PeriodTabs({
  value,
  onChange,
}: {
  value: Period
  onChange: (period: Period) => void
}) {
  return (
    <div
      className="flex gap-1"
      role="tablist"
      aria-label="Select history time period"
    >
      {PERIODS.map(p => (
        <button
          key={p.value}
          role="tab"
          aria-selected={value === p.value}
          onClick={() => onChange(p.value)}
          className={cn(
            'min-h-[40px] rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            value === p.value
              ? 'bg-fairy-500 text-white'
              : 'surface text-body hover:brightness-95 dark:hover:brightness-110',
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}

// ── Device type badge ─────────────────────────────────────────────────────────

function DeviceTypeBadge({ type }: { type: string }) {
  const colours: Record<string, string> = {
    switch: 'bg-blue-500/15 text-blue-400',
    dimmer: 'bg-purple-500/15 text-purple-400',
    sensor: 'bg-cyan-500/15 text-cyan-400',
    twinkly: 'bg-pink-500/15 text-pink-400',
    fairy: 'bg-cyan-500/15 text-cyan-400',
  }
  const cls = colours[type.toLowerCase()] ?? 'bg-slate-500/15 text-slate-400'
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold',
        cls,
      )}
    >
      {type}
    </span>
  )
}

// ── All attributes collapsible ────────────────────────────────────────────────

function AllAttributesSection({
  attributeEntries,
}: {
  attributeEntries: [string, unknown][]
}) {
  const [isOpen, setIsOpen] = useState(false)
  const headingId = 'all-attributes-heading'
  const panelId = 'all-attributes-panel'

  if (attributeEntries.length === 0) return null

  return (
    <section aria-labelledby={headingId}>
      <div className="card rounded-xl border px-5">
        <button
          id={headingId}
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => setIsOpen(o => !o)}
          className={cn(
            'flex w-full items-center justify-between py-4 text-left transition-colors',
            'min-h-[44px]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            !isOpen && 'border-b border-[var(--border-secondary)]',
          )}
        >
          <span className="text-sm font-semibold text-heading">
            All attributes
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-[var(--text-secondary)] transition-transform duration-300',
              isOpen && 'rotate-180',
            )}
            aria-hidden="true"
          />
        </button>

        <div
          id={panelId}
          role="region"
          aria-labelledby={headingId}
          className="grid transition-all duration-300"
          style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
        >
          <div className="overflow-hidden">
            <dl className="divide-y divide-[var(--border-secondary)] pb-2">
              {attributeEntries.map(([key, value]) => {
                const highlighted = isHighlightedAttribute(key)
                const unit = attributeUnit(key)
                const formatted = formatAttributeValue(value)

                return (
                  <div
                    key={key}
                    className="flex items-baseline justify-between gap-4 py-2.5 first:pt-3"
                  >
                    <dt className="shrink-0 text-sm text-body capitalize">
                      {key.replace(/_/g, ' ')}
                    </dt>
                    <dd
                      className={cn(
                        'text-right text-sm tabular-nums',
                        highlighted ? 'font-semibold text-heading' : 'text-body',
                      )}
                    >
                      {formatted}
                      {unit && (
                        <span className="ml-0.5 text-xs text-caption">
                          {unit}
                        </span>
                      )}
                    </dd>
                  </div>
                )
              })}
            </dl>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [period, setPeriod] = useState<Period>('24h')

  // Fetch all hub devices and find the one matching :id
  const {
    data: devices,
    isLoading: devicesLoading,
    isError: devicesError,
  } = useQuery({
    queryKey: ['hubitat', 'devices'],
    queryFn: api.hubitat.getDevices,
    staleTime: 60_000,
  })

  const device = devices?.find(d => String(d.id) === id)

  const {
    data: context,
    isLoading: contextLoading,
    isError: contextError,
  } = useQuery({
    queryKey: ['dashboard', 'device-context', id],
    queryFn: () => api.dashboard.getDeviceContext(id!),
    enabled: !!id && !!device,
    staleTime: 60_000,
  })

  const {
    data: deviceInsights,
    isLoading: insightsLoading,
  } = useQuery({
    queryKey: ['dashboard', 'device', id, 'insights'],
    queryFn: () => api.dashboard.getDeviceInsights(id!),
    enabled: !!id && !!device,
    staleTime: 60_000,
  })

  const isLoading = devicesLoading || (!!device && (contextLoading || insightsLoading))
  const isError = devicesError || contextError

  // ── Loading state ───────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div>
        <PageSkeleton />
      </div>
    )
  }

  // ── Error state ─────────────────────────────────────────────────────────

  if (isError) {
    return (
      <div>
        <button
          onClick={() => navigate(-1)}
          className={cn(
            'mb-6 flex min-h-[44px] items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium',
            'surface text-body transition-colors hover:brightness-95 dark:hover:brightness-110',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </button>

        <div
          className="card rounded-xl border p-5"
          role="alert"
          aria-live="assertive"
        >
          <p className="text-sm text-red-400">
            Could not load device details. The device may be offline.
          </p>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 rounded-lg bg-fairy-500/15 px-4 py-2 text-sm font-medium text-fairy-400 transition-colors hover:bg-fairy-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            Go back
          </button>
        </div>
      </div>
    )
  }

  // ── Device not found ────────────────────────────────────────────────────

  if (!device) {
    return (
      <div>
        <button
          onClick={() => navigate(-1)}
          className={cn(
            'mb-6 flex min-h-[44px] items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium',
            'surface text-body transition-colors hover:brightness-95 dark:hover:brightness-110',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </button>

        <div
          className="card rounded-xl border p-5"
          role="alert"
          aria-live="assertive"
        >
          <p className="text-sm text-body">Device not found.</p>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 rounded-lg bg-fairy-500/15 px-4 py-2 text-sm font-medium text-fairy-400 transition-colors hover:bg-fairy-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            Go back
          </button>
        </div>
      </div>
    )
  }

  // ── Success state ───────────────────────────────────────────────────────

  const attributes = device.attributes ?? {}
  const attributeEntries = Object.entries(attributes)

  const historySources = context?.historySources ?? []
  const roomDevices = deviceInsights?.roomDevices ?? []

  return (
    <div className="space-y-6">
      {/* ── 1. Header ────────────────────────────────────────────────────── */}
      <header>
        <button
          onClick={() => navigate(-1)}
          className={cn(
            'mb-4 flex min-h-[44px] items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium',
            'surface text-body transition-colors hover:brightness-95 dark:hover:brightness-110',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
          aria-label="Go back to devices list"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </button>

        <h1 className="text-heading text-xl font-semibold">{device.label}</h1>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <DeviceTypeBadge type={device.device_type} />
          {device.device_name && device.device_name !== device.label && (
            <span className="text-xs text-caption">{device.device_name}</span>
          )}
        </div>
      </header>

      {/* ── 2. Headline insights ──────────────────────────────────────────── */}
      <HeadlineInsights deviceInsights={deviceInsights} />

      {/* ── 3. History charts ─────────────────────────────────────────────── */}
      <section aria-labelledby="history-heading">
        <div className="card rounded-xl border p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2
              id="history-heading"
              className="text-sm font-semibold text-heading"
            >
              History
            </h2>

            {historySources.length > 0 && (
              <PeriodTabs value={period} onChange={setPeriod} />
            )}
          </div>

          {historySources.length > 0 ? (
            <div className="space-y-8">
              {historySources.map(s => (
                <HistoryChart
                  key={s.source}
                  source={s.source}
                  deviceLabel={device.label}
                  period={period}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-caption">
              No historical data yet. Data collection starts automatically
              and trends will appear within a few hours.
            </p>
          )}
        </div>
      </section>

      {/* ── 4. Room and scene context ─────────────────────────────────────── */}
      {context && (
        <section aria-labelledby="context-heading">
          <div className="card rounded-xl border p-5">
            <h2
              id="context-heading"
              className="mb-4 text-sm font-semibold text-heading"
            >
              Rooms and scenes
            </h2>

            <div className="space-y-4">
              {/* Rooms */}
              {context.rooms.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-medium text-caption">
                    Assigned to{' '}
                    {context.rooms.length === 1
                      ? '1 room'
                      : `${context.rooms.length} rooms`}
                  </p>
                  <ul className="space-y-1" role="list">
                    {context.rooms.map(r => {
                      const hasConfig =
                        r.config && Object.keys(r.config).length > 0
                      return (
                        <li key={r.room_name}>
                          <Link
                            to={`/rooms/${encodeURIComponent(r.room_name)}`}
                            className={cn(
                              'flex min-h-[44px] items-center gap-2 rounded-lg px-2 -mx-2',
                              'text-sm text-fairy-400 transition-colors hover:bg-fairy-500/10',
                              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                            )}
                          >
                            <span className="flex-1">{r.room_name}</span>
                            {hasConfig &&
                              !!(r.config as Record<string, unknown>).exclude_from_all_off && (
                                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                                  Keep on
                                </span>
                              )}
                            <ChevronRight
                              className="h-4 w-4 shrink-0 opacity-50"
                              aria-hidden="true"
                            />
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-caption">
                  Not assigned to any room.{' '}
                  <Link
                    to="/rooms"
                    className="text-fairy-400 underline underline-offset-2 hover:text-fairy-300 focus-visible:outline-2 focus-visible:outline-fairy-500"
                  >
                    Manage rooms
                  </Link>
                </p>
              )}

              {/* Scenes */}
              {context.scenes.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-medium text-caption">
                    Used in{' '}
                    {context.scenes.length === 1
                      ? '1 scene'
                      : `${context.scenes.length} scenes`}
                  </p>
                  <ul className="space-y-1" role="list">
                    {context.scenes.map(sceneName => (
                      <li key={sceneName}>
                        <Link
                          to={`/scenes/${encodeURIComponent(sceneName)}`}
                          className={cn(
                            'flex min-h-[44px] items-center gap-2 rounded-lg px-2 -mx-2',
                            'text-sm text-fairy-400 transition-colors hover:bg-fairy-500/10',
                            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                          )}
                        >
                          <span className="flex-1">{sceneName}</span>
                          <ChevronRight
                            className="h-4 w-4 shrink-0 opacity-50"
                            aria-hidden="true"
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-caption">
                  Not used in any scenes.
                </p>
              )}

              {/* Other devices in this room */}
              {roomDevices.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-caption">
                    Other devices in this room
                  </p>
                  <ul className="space-y-1" role="list">
                    {roomDevices.map(d => (
                      <li key={d.id}>
                        <Link
                          to={`/devices/${d.id}`}
                          className={cn(
                            'flex min-h-[44px] items-center gap-2 rounded-lg px-2 -mx-2',
                            'text-sm text-fairy-400 transition-colors hover:bg-fairy-500/10',
                            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                          )}
                        >
                          <span className="flex-1">{d.label}</span>
                          <span className="shrink-0 rounded-full bg-slate-500/15 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                            {d.device_type}
                          </span>
                          <ChevronRight
                            className="h-4 w-4 shrink-0 opacity-50"
                            aria-hidden="true"
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Last event */}
              {context.lastEvent && (
                <p className="text-xs text-caption">
                  Last event:{' '}
                  <time
                    dateTime={context.lastEvent}
                    className="text-body"
                  >
                    {context.lastEvent}
                  </time>
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── 5. All attributes (collapsed by default) ─────────────────────── */}
      <AllAttributesSection attributeEntries={attributeEntries} />
    </div>
  )
}
