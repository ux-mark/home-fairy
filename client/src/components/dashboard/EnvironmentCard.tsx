import { useState } from 'react'
import { Thermometer, Cloud, Droplets, Wind, ArrowUp, ArrowDown, Minus, ChevronDown } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import TimeSeriesChart from '@/components/dashboard/TimeSeriesChart'
import OverUnderBadge from '@/components/dashboard/OverUnderBadge'
import type { DashboardSummary, TemperatureInsights, LuxInsights } from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface EnvironmentCardProps {
  weather: DashboardSummary['weather']
  rooms: DashboardSummary['rooms']
  tempInsights?: TemperatureInsights | null
  luxInsights?: LuxInsights | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Read the user's preferred temperature unit from localStorage.
 * Defaults to 'C' if the key is absent or contains an unrecognised value.
 */
function getTempUnit(): 'C' | 'F' {
  try {
    const stored = localStorage.getItem('temp_unit')
    return stored === 'F' ? 'F' : 'C'
  } catch {
    return 'C'
  }
}

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
      <span className="text-heading text-sm font-medium leading-snug">
        {room.name}
      </span>
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

// ── Chart section ─────────────────────────────────────────────────────────────

function TempChartSection({ roomName }: { roomName: string }) {
  const { data: historyData, isLoading } = useQuery({
    queryKey: ['dashboard', 'history', 'temperature', roomName, '24h'],
    queryFn: () => api.dashboard.getHistory('temperature', roomName, '24h'),
    staleTime: 5 * 60 * 1000,
  })

  return (
    <div className="border-t pt-4" style={{ borderColor: 'var(--border-primary)' }}>
      <p className="text-caption mb-3 text-xs font-medium">
        24-hour trend — {roomName}
      </p>
      <TimeSeriesChart
        data={historyData?.data ?? []}
        label="Temperature"
        unit="°"
        height={140}
        loading={isLoading}
        emptyMessage="Temperature trends will appear after a few hours of collection."
      />
    </div>
  )
}

// ── EnvironmentCard ───────────────────────────────────────────────────────────

export default function EnvironmentCard({
  weather,
  rooms,
  tempInsights,
  luxInsights,
}: EnvironmentCardProps) {
  const unit = getTempUnit()

  const roomsWithTemp = rooms.filter(r => r.temperature !== null)
  const hasWeather = weather !== null
  const hasIndoor = roomsWithTemp.length > 0
  const hasAnyData = hasWeather || hasIndoor

  // Pick the first room with temperature data for the chart
  const chartRoom = roomsWithTemp[0]

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

  return (
    <section
      id="environment-card"
      aria-label="Environment"
      className={cn('card rounded-xl border p-5')}
    >
      <header className="mb-4 flex items-center gap-2">
        <Thermometer
          className="h-4 w-4 text-fairy-400"
          aria-hidden="true"
        />
        <h2 className="text-heading text-base font-semibold">Environment</h2>
      </header>

      {hasWeather && <OutdoorSection weather={weather!} unit={unit} />}

      {hasIndoor && (
        <IndoorSection
          rooms={rooms}
          unit={unit}
          tempInsights={tempInsights}
          luxInsights={luxInsights}
        />
      )}

      {hasIndoor && chartRoom && (
        <TempChartSection roomName={chartRoom.name} />
      )}
    </section>
  )
}
