import { useState } from 'react'
import { Thermometer, Cloud, Droplets, Wind, ArrowUp, ArrowDown, Minus, ChevronDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useQuery, useQueries } from '@tanstack/react-query'
import { PeriodSelector } from '@/components/ui/PeriodSelector'
import type { Period } from '@/components/ui/PeriodSelector'
import { Line } from 'react-chartjs-2'
import type { ChartOptions, ChartData } from 'chart.js'
import { api } from '@/lib/api'
import { cn, parseServerDate } from '@/lib/utils'
import { Accordion } from '@/components/ui/Accordion'
import { Skeleton } from '@/components/ui/Skeleton'
import OverUnderBadge from '@/components/dashboard/OverUnderBadge'
import type { DashboardSummary, TemperatureInsights, LuxInsights, HistoryPoint } from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface EnvironmentCardProps {
  weather: DashboardSummary['weather']
  rooms: DashboardSummary['rooms']
  tempInsights?: TemperatureInsights | null
  luxInsights?: LuxInsights | null
  open: boolean
  onToggle: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// getTempUnit() removed — now read via useQuery(['system', 'preferences']) in the component

function toDisplay(celsius: number, unit: 'C' | 'F'): number {
  return unit === 'F'
    ? Math.round(celsius * 9 / 5 + 32)
    : Math.round(celsius * 10) / 10
}

/** Format a temperature value with its degree symbol and unit. */
function formatTemp(celsius: number, unit: 'C' | 'F'): string {
  const val = toDisplay(celsius, unit)
  return `${val}\u00b0${unit}`
}

/** Capitalise only the first character of a string. */
function capitaliseFirst(str: string): string {
  if (!str) return str
  return str.charAt(0).toUpperCase() + str.slice(1)
}

// ── Outdoor weather section ───────────────────────────────────────────────────

function OutdoorSection({
  weather,
  unit,
}: {
  weather: NonNullable<DashboardSummary['weather']>
  unit: 'C' | 'F'
}) {
  return (
    <div className="mb-5">
      <h3 className="text-caption mb-2 text-xs font-medium">Outdoors</h3>
      <div className="surface flex items-start gap-3 rounded-xl p-3">
        {/* Icon placeholder — no weather icon assets available; use a lucide icon */}
        <Cloud
          className="mt-0.5 h-8 w-8 shrink-0 text-sky-400"
          aria-hidden="true"
        />

        <div className="min-w-0 flex-1">
          {/* Temperature + description */}
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-heading text-2xl font-semibold tabular-nums">
              {formatTemp(weather.temp, unit)}
            </span>
            <span className="text-body text-sm capitalize">
              {weather.description}
            </span>
          </div>

          {/* Humidity and wind */}
          <dl className="mt-1.5 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1">
              <Droplets
                className="h-3.5 w-3.5 shrink-0 text-sky-400"
                aria-hidden="true"
              />
              <dt className="sr-only">Humidity</dt>
              <dd className="text-caption text-xs">{weather.humidity}%</dd>
            </div>
            <div className="flex items-center gap-1">
              <Wind
                className="h-3.5 w-3.5 shrink-0 text-slate-400"
                aria-hidden="true"
              />
              <dt className="sr-only">Wind speed</dt>
              <dd className="text-caption text-xs">
                {Math.round(weather.wind_speed)} m/s
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}

// ── Temperature + brightness insights summary ─────────────────────────────────

function TempInsightsSummary({
  tempInsights,
  luxInsights,
  unit,
}: {
  tempInsights: TemperatureInsights
  luxInsights?: LuxInsights | null
  unit: 'C' | 'F'
}) {
  const avgDisplay = toDisplay(tempInsights.houseAvgTemp, unit)

  const overUnderLabel =
    tempInsights.overUnderTemp !== null
      ? `${Math.abs(Math.round(toDisplay(tempInsights.overUnderTemp, unit) - toDisplay(0, unit)))}° ${tempInsights.overUnderTemp > 0 ? 'warmer' : 'cooler'} than usual`
      : null

  const deltaText =
    tempInsights.indoorOutdoorDelta !== null
      ? (() => {
          const delta = tempInsights.indoorOutdoorDelta
          const absVal = Math.abs(Math.round(toDisplay(Math.abs(delta), unit) - toDisplay(0, unit)))
          const direction = delta >= 0 ? 'warmer' : 'cooler'
          return `${absVal}° ${direction} inside`
        })()
      : null

  return (
    <div className="mb-3">
      {/* House average + trend + over/under badge */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-heading text-lg font-semibold tabular-nums">
          House average: {avgDisplay}°
        </span>

        {/* Trend arrow — colour paired with sr-only text */}
        {tempInsights.trend === 'warming' && (
          <span className="inline-flex items-center gap-0.5">
            <ArrowUp className="h-4 w-4 text-red-400" aria-hidden="true" />
            <span className="sr-only">Warming trend</span>
          </span>
        )}
        {tempInsights.trend === 'cooling' && (
          <span className="inline-flex items-center gap-0.5">
            <ArrowDown className="h-4 w-4 text-blue-400" aria-hidden="true" />
            <span className="sr-only">Cooling trend</span>
          </span>
        )}
        {tempInsights.trend === 'stable' && (
          <span className="inline-flex items-center gap-0.5">
            <Minus className="text-caption h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Stable trend</span>
          </span>
        )}

        {tempInsights.overUnderTemp !== null && overUnderLabel && (
          <OverUnderBadge
            percent={tempInsights.overUnderTemp}
            label={overUnderLabel}
            size="sm"
          />
        )}
      </div>

      {/* Indoor/outdoor delta */}
      {deltaText && (
        <p className="text-caption mt-1 text-xs">{deltaText}</p>
      )}

      {/* Brightness summary — shown inline here so the lux section is not separate */}
      {luxInsights && (
        <p className="text-caption mt-1 text-xs">
          {capitaliseFirst(luxInsights.brightnessLevel)},{' '}
          {luxInsights.houseAvgLux} lux average
          {luxInsights.overUnderLuxPercent !== null && (
            <span className="ml-1.5 inline-flex align-middle">
              <OverUnderBadge percent={luxInsights.overUnderLuxPercent} size="sm" />
            </span>
          )}
        </p>
      )}
    </div>
  )
}

// ── Room row ──────────────────────────────────────────────────────────────────

type RoomEntry = DashboardSummary['rooms'][number]

interface RoomRowProps {
  room: RoomEntry
  unit: 'C' | 'F'
  outlier?: TemperatureInsights['roomOutliers'][number] | null
}

function RoomRow({ room, unit, outlier }: RoomRowProps) {
  const isWarmer = outlier ? outlier.deviation > 0 : false
  const highlightClass = outlier
    ? isWarmer
      ? 'bg-amber-500/5 rounded-lg -mx-2 px-2'
      : 'bg-blue-500/5 rounded-lg -mx-2 px-2'
    : ''

  return (
    <li
      className={cn(
        'flex items-center justify-between gap-3 py-2.5',
        highlightClass,
      )}
    >
      <Link
        to={`/rooms/${encodeURIComponent(room.name)}`}
        className="text-fairy-400 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 text-sm font-medium leading-snug"
      >
        {room.name}
      </Link>
      <div className="shrink-0 text-right">
        <span className="text-heading text-sm font-semibold tabular-nums">
          {formatTemp(room.temperature!, unit)}
        </span>
        {/* Lux shown on the same row in muted text, below the temperature */}
        {room.lux !== null && (
          <p className="text-caption text-xs leading-snug">
            {room.lux} lux
          </p>
        )}
        {outlier && (
          <p
            className={cn(
              'text-xs leading-snug',
              isWarmer ? 'text-amber-400' : 'text-blue-400',
            )}
          >
            {Math.abs(Math.round(toDisplay(Math.abs(outlier.deviation), unit) - toDisplay(0, unit)))}°{' '}
            {isWarmer ? 'warmer' : 'cooler'} than average
          </p>
        )}
      </div>
    </li>
  )
}

// ── Room band ─────────────────────────────────────────────────────────────────

interface RoomBandProps {
  label: string
  items: RoomEntry[]
  unit: 'C' | 'F'
  outlierMap: Map<string, TemperatureInsights['roomOutliers'][number]>
  defaultOpen: boolean
  accentClass?: string
  headerColorClass?: string
}

function RoomBand({
  label,
  items,
  unit,
  outlierMap,
  defaultOpen,
  accentClass,
  headerColorClass,
}: RoomBandProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const bandId = `room-band-${label.toLowerCase().replace(/\s+/g, '-')}`
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
          headerColorClass ?? 'text-body',
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
            {items.map(room => (
              <RoomRow
                key={room.name}
                room={room}
                unit={unit}
                outlier={outlierMap.get(room.name) ?? null}
              />
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

// ── Indoor rooms section ──────────────────────────────────────────────────────

function IndoorSection({
  rooms,
  unit,
  tempInsights,
  luxInsights,
}: {
  rooms: RoomEntry[]
  unit: 'C' | 'F'
  tempInsights?: TemperatureInsights | null
  luxInsights?: LuxInsights | null
}) {
  const roomsWithTemp = rooms.filter(r => r.temperature !== null)

  if (roomsWithTemp.length === 0) return null

  // Build a lookup map of outliers by room name for O(1) access
  const outlierMap = new Map(
    (tempInsights?.roomOutliers ?? []).map(o => [o.room, o]),
  )

  // Separate rooms: outliers vs non-outliers
  const outlierRoomNames = new Set((tempInsights?.roomOutliers ?? []).map(o => o.room))
  const outlierRooms = roomsWithTemp.filter(r => outlierRoomNames.has(r.name))
  const normalRooms = roomsWithTemp.filter(r => !outlierRoomNames.has(r.name))

  return (
    <div className="mb-5">
      <h3 className="text-caption mb-2 text-xs font-medium">Indoors</h3>

      {tempInsights && (
        <TempInsightsSummary
          tempInsights={tempInsights}
          luxInsights={luxInsights}
          unit={unit}
        />
      )}

      <div className="space-y-2">
        {/* Outliers band — only shown when outliers exist, defaults open */}
        {outlierRooms.length > 0 && (
          <RoomBand
            label={`${outlierRooms.length} ${outlierRooms.length === 1 ? 'room' : 'rooms'} outside normal range`}
            items={outlierRooms}
            unit={unit}
            outlierMap={outlierMap}
            defaultOpen={true}
            accentClass="bg-amber-500/5"
            headerColorClass="text-amber-400"
          />
        )}

        {/* All rooms band — defaults closed */}
        {normalRooms.length > 0 && (
          <RoomBand
            label={`All rooms (${normalRooms.length})`}
            items={normalRooms}
            unit={unit}
            outlierMap={outlierMap}
            defaultOpen={false}
          />
        )}
      </div>
    </div>
  )
}

// ── Multi-room overlay charts ──────────────────────────────────────────────────

const ROOM_PALETTE = [
  '#10b981', // green
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
] as const

const CHART_GRID_COLOR = 'rgba(148, 163, 184, 0.15)'
const CHART_TICK_COLOR = 'rgb(148, 163, 184)'

/** Parse a server timestamp into HH:MM (24-hour local time). Returns raw string on failure. */
function formatChartTime(raw: string): string {
  const d = parseServerDate(raw)
  if (isNaN(d.getTime())) return raw
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Parse a server timestamp into MM/DD for multi-day data. Returns raw string on failure. */
function formatChartDate(raw: string): string {
  const d = parseServerDate(raw)
  if (isNaN(d.getTime())) return raw
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

/** Format a full readable timestamp for tooltips (local time). */
function formatChartTooltipTime(raw: string): string {
  const d = parseServerDate(raw)
  if (isNaN(d.getTime())) return raw
  return d.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** Return the span in hours across a set of timestamps. */
function spanHours(timestamps: string[]): number {
  const times = timestamps
    .map(raw => parseServerDate(raw).getTime())
    .filter(t => !isNaN(t))
  if (times.length < 2) return 0
  return (Math.max(...times) - Math.min(...times)) / (1000 * 60 * 60)
}


interface MultiLineChartProps {
  /** One entry per room, in palette order. */
  series: Array<{ roomName: string; points: HistoryPoint[] }>
  unit: string
  ariaLabel: string
}

function MultiLineChart({ series, unit, ariaLabel }: MultiLineChartProps) {
  // Collect all unique timestamps across all series (sorted) to use as shared x-axis labels.
  const allTimestamps = Array.from(
    new Set(series.flatMap(s => s.points.map(p => p.recorded_at))),
  ).sort()

  // Use MM/DD date format for periods spanning more than 36 hours
  const useMultiDay = spanHours(allTimestamps) > 36
  const labels = allTimestamps.map(useMultiDay ? formatChartDate : formatChartTime)

  const datasets: ChartData<'line'>['datasets'] = series.map((s, i) => {
    const color = ROOM_PALETTE[i % ROOM_PALETTE.length]
    // Build a lookup for quick access by timestamp
    const byTime = new Map(s.points.map(p => [p.recorded_at, p.value]))
    return {
      label: s.roomName,
      data: allTimestamps.map(ts => byTime.get(ts) ?? null),
      borderColor: color,
      borderWidth: 2,
      pointRadius: 2,
      pointHoverRadius: 5,
      pointBackgroundColor: color,
      pointBorderColor: color,
      backgroundColor: 'transparent',
      tension: 0.3,
      spanGaps: true,
    }
  })

  const chartData: ChartData<'line'> = { labels, datasets }

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        align: 'start',
        labels: {
          color: CHART_TICK_COLOR,
          boxWidth: 12,
          boxHeight: 2,
          padding: 12,
          font: { size: 11 },
          // Use lines, not boxes
          usePointStyle: true,
          pointStyle: 'line',
        },
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        borderColor: 'rgba(148, 163, 184, 0.2)',
        borderWidth: 1,
        titleColor: CHART_TICK_COLOR,
        bodyColor: '#f1f5f9',
        padding: 10,
        callbacks: {
          title(items) {
            const idx = items[0]?.dataIndex
            if (idx === undefined || !allTimestamps[idx]) return ''
            return formatChartTooltipTime(allTimestamps[idx])
          },
          label(ctx) {
            const val = ctx.parsed.y
            if (val === null || val === undefined) return ''
            const formatted = typeof val === 'number'
              ? val % 1 === 0 ? String(val) : val.toFixed(1)
              : String(val)
            return `${ctx.dataset.label}: ${formatted} ${unit}`
          },
        },
      },
    },
    scales: {
      x: {
        border: { display: false },
        grid: { color: CHART_GRID_COLOR },
        ticks: {
          color: CHART_TICK_COLOR,
          font: { size: 11 },
          maxRotation: 0,
          maxTicksLimit: 8,
        },
      },
      y: {
        border: { display: false },
        grid: { color: CHART_GRID_COLOR },
        ticks: {
          color: CHART_TICK_COLOR,
          font: { size: 11 },
          maxTicksLimit: 6,
          callback(value) {
            const num = Number(value)
            const formatted = num % 1 === 0 ? String(num) : num.toFixed(1)
            return `${formatted} ${unit}`
          },
        },
      },
    },
  }

  return (
    <div style={{ height: 160 }} aria-label={ariaLabel}>
      <Line data={chartData} options={options} />
    </div>
  )
}

interface EnvironmentChartsProps {
  rooms: DashboardSummary['rooms']
}

const PERIOD_LABELS: Record<Period, string> = {
  '24h': '24 hours',
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
  '1y': '1 year',
}

function EnvironmentCharts({ rooms }: EnvironmentChartsProps) {
  const [period, setPeriod] = useState<Period>('24h')
  const periodLabel = PERIOD_LABELS[period]

  const roomsWithTemp = rooms.filter(r => r.temperature !== null)

  // Limit to top 6 rooms; since we have no prior point count, use order from the rooms list.
  // When data loads we will re-rank by point count and keep the same palette mapping stable
  // within a render cycle, so we slice before fetching.
  const candidateRooms = roomsWithTemp.slice(0, 6)

  // Fetch temperature history for all candidate rooms in parallel
  const tempQueries = useQueries({
    queries: candidateRooms.map(room => ({
      queryKey: ['dashboard', 'history', 'temperature', room.name, period],
      queryFn: () => api.dashboard.getHistory('temperature', room.name, period),
      staleTime: 5 * 60 * 1000,
    })),
  })

  // Fetch lux history for all candidate rooms in parallel
  const luxQueries = useQueries({
    queries: candidateRooms.map(room => ({
      queryKey: ['dashboard', 'history', 'lux', room.name, period],
      queryFn: () => api.dashboard.getHistory('lux', room.name, period),
      staleTime: 5 * 60 * 1000,
    })),
  })

  const tempLoading = tempQueries.some(q => q.isLoading)
  const luxLoading = luxQueries.some(q => q.isLoading)

  // Build series arrays, ranked by point count (most data first, up to 6)
  const rawTempSeries = candidateRooms.map((room, i) => ({
    roomName: room.name,
    points: tempQueries[i]?.data?.data ?? [],
  }))

  const rankedTempSeries = [...rawTempSeries]
    .sort((a, b) => b.points.length - a.points.length)
    .slice(0, 6)
    .filter(s => s.points.length >= 1)

  const rawLuxSeries = candidateRooms.map((room, i) => ({
    roomName: room.name,
    points: luxQueries[i]?.data?.data ?? [],
  }))

  // Match lux series to same rooms as temp series (same palette order)
  const rankedLuxSeries = rankedTempSeries
    .map(ts => rawLuxSeries.find(ls => ls.roomName === ts.roomName))
    .filter((s): s is { roomName: string; points: HistoryPoint[] } => s !== undefined)
    .filter(s => s.points.length >= 1)

  const hasEnoughTempData = rankedTempSeries.some(s => s.points.length >= 2)
  const hasAnyLuxData = rankedLuxSeries.some(s => s.points.length >= 2)

  return (
    <div className="border-t pt-4 space-y-5" style={{ borderColor: 'var(--border-primary)' }}>
      {/* Period selector — controls both temp and lux charts */}
      <PeriodSelector value={period} onChange={setPeriod} />

      {/* Temperature overlay chart */}
      <div>
        <p className="text-caption mb-3 text-xs font-medium">Temperature — {periodLabel}</p>
        {tempLoading ? (
          <div role="status" aria-label="Loading chart data" style={{ height: 160 }}>
            <Skeleton className="h-full w-full rounded" />
          </div>
        ) : !hasEnoughTempData ? (
          <div
            className="flex items-center justify-center"
            style={{ height: 160 }}
            role="status"
          >
            <p className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              Trends will appear after a few hours of collection.
            </p>
          </div>
        ) : (
          <MultiLineChart
            series={rankedTempSeries}
            unit="°"
            ariaLabel={`Temperature over ${periodLabel} by room`}
          />
        )}
      </div>

      {/* Lux overlay chart — only rendered when lux data exists */}
      {(luxLoading || hasAnyLuxData) && (
        <div className="border-t pt-4" style={{ borderColor: 'var(--border-primary)' }}>
          <p className="text-caption mb-3 text-xs font-medium">Brightness — {periodLabel}</p>
          {luxLoading ? (
            <div role="status" aria-label="Loading chart data" style={{ height: 160 }}>
            <Skeleton className="h-full w-full rounded" />
          </div>
          ) : !hasAnyLuxData ? null : (
            <MultiLineChart
              series={rankedLuxSeries}
              unit="lux"
              ariaLabel={`Brightness over ${periodLabel} by room`}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── EnvironmentCard ───────────────────────────────────────────────────────────

export default function EnvironmentCard({
  weather,
  rooms,
  tempInsights,
  luxInsights,
  open,
  onToggle,
}: EnvironmentCardProps) {
  const { data: prefs } = useQuery({
    queryKey: ['system', 'preferences'],
    queryFn: api.system.getPreferences,
  })
  const unit: 'C' | 'F' = prefs?.temp_unit === 'F' ? 'F' : 'C'

  const roomsWithTemp = rooms.filter(r => r.temperature !== null)
  const hasWeather = weather !== null
  const hasIndoor = roomsWithTemp.length > 0
  const hasAnyData = hasWeather || hasIndoor

  // ── Empty state ────────────────────────────────────────────────────────────

  if (!hasAnyData) {
    return (
      <section
        id="environment-card"
        aria-label="Environment"
        className="card rounded-xl border p-5"
      >
        <header className="mb-4 flex items-center gap-2">
          <Thermometer
            className="h-4 w-4 text-fairy-400"
            aria-hidden="true"
          />
          <h2 className="text-heading text-base font-semibold">Environment</h2>
        </header>

        <div
          className="rounded-lg border border-dashed py-8 text-center"
          style={{ borderColor: 'var(--border-secondary)' }}
        >
          <Thermometer
            className="text-caption mx-auto mb-3 h-7 w-7"
            aria-hidden="true"
          />
          <p className="text-body text-sm">No environment data available.</p>
          <p className="text-caption mt-1 text-xs">
            Temperature sensors and weather will appear here.
          </p>
        </div>
      </section>
    )
  }

  // ── Content ────────────────────────────────────────────────────────────────

  // Build trailing summary for the accordion header
  const outlierCount = tempInsights?.roomOutliers?.length ?? 0

  return (
    <Accordion
      id="environment-card"
      title={<><Thermometer className="h-4 w-4 text-fairy-400" aria-hidden="true" /> Environment</>}
      open={open}
      onToggle={onToggle}
      trailing={!open && tempInsights ? (
          <span className="flex items-center gap-2 text-xs">
            <span className="text-heading font-semibold tabular-nums">
              {toDisplay(tempInsights.houseAvgTemp, unit)}°
            </span>
            {tempInsights.trend === 'warming' && (
              <span className="inline-flex items-center gap-0.5">
                <ArrowUp className="h-3.5 w-3.5 text-red-400" aria-hidden="true" />
                <span className="sr-only">Warming</span>
              </span>
            )}
            {tempInsights.trend === 'cooling' && (
              <span className="inline-flex items-center gap-0.5">
                <ArrowDown className="h-3.5 w-3.5 text-blue-400" aria-hidden="true" />
                <span className="sr-only">Cooling</span>
              </span>
            )}
            {tempInsights.trend === 'stable' && (
              <span className="inline-flex items-center gap-0.5">
                <Minus className="text-caption h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">Stable</span>
              </span>
            )}
            {outlierCount > 0 && (
              <span className="text-amber-400">
                {outlierCount} outlier{outlierCount !== 1 ? 's' : ''}
              </span>
            )}
          </span>
        ) : undefined
      }
    >
      {hasWeather && <OutdoorSection weather={weather!} unit={unit} />}

      {hasIndoor && (
        <IndoorSection
          rooms={rooms}
          unit={unit}
          tempInsights={tempInsights}
          luxInsights={luxInsights}
        />
      )}

      {hasIndoor && <EnvironmentCharts rooms={rooms} />}
    </Accordion>
  )
}
