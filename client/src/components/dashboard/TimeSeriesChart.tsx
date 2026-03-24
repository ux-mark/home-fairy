import {
  Chart,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import type { ChartOptions, ChartData } from 'chart.js'

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip)

// ── Types ────────────────────────────────────────────────────────────────────

interface DataPoint {
  value: number
  min?: number
  max?: number
  recorded_at: string
}

export interface TimeSeriesChartProps {
  data: DataPoint[]
  label: string
  color?: string
  unit?: string
  height?: number
  showRange?: boolean
  loading?: boolean
  emptyMessage?: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse an ISO-8601 or date string into a Date object safely.
 * Returns null if the string cannot be parsed.
 */
function parseDate(raw: string): Date | null {
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Determine the span of the dataset in milliseconds.
 * Returns 0 if fewer than 2 parseable timestamps are present.
 */
function spanMs(data: DataPoint[]): number {
  const times = data
    .map(d => parseDate(d.recorded_at))
    .filter((d): d is Date => d !== null)
    .map(d => d.getTime())
  if (times.length < 2) return 0
  return Math.max(...times) - Math.min(...times)
}

/** Format a timestamp as HH:MM (24-hour) for intra-day data. */
function formatTime(raw: string): string {
  const d = parseDate(raw)
  if (!d) return raw
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/** Format a timestamp as MM/DD for multi-day data. */
function formatDate(raw: string): string {
  const d = parseDate(raw)
  if (!d) return raw
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}/${dd}`
}

/**
 * Format a full readable timestamp for the tooltip.
 * e.g. "Mon 23 Mar, 14:32"
 */
function formatTooltipTimestamp(raw: string): string {
  const d = parseDate(raw)
  if (!d) return raw
  return d.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/**
 * Convert a hex or rgb CSS colour to an rgba string with a given alpha.
 * Falls back to rgba(16,185,129,alpha) — fairy-500 — if parsing fails.
 */
function withAlpha(color: string, alpha: number): string {
  // Already an rgba/rgb string
  if (color.startsWith('rgb')) {
    // Strip any existing alpha by parsing the numbers
    const nums = color.match(/[\d.]+/g)
    if (nums && nums.length >= 3) {
      return `rgba(${nums[0]}, ${nums[1]}, ${nums[2]}, ${alpha})`
    }
  }
  // Hex colour (#rrggbb or #rgb)
  if (color.startsWith('#')) {
    let hex = color.slice(1)
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map(c => c + c)
        .join('')
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      return `rgba(${r}, ${g}, ${b}, ${alpha})`
    }
  }
  // Named colour fallback — return fairy-500
  return `rgba(16, 185, 129, ${alpha})`
}

// ── Shared chart theme constants ─────────────────────────────────────────────

const GRID_COLOR = 'rgba(148, 163, 184, 0.15)'
const TICK_COLOR = 'rgb(148, 163, 184)'

// ── Loading skeleton ─────────────────────────────────────────────────────────

function ChartSkeleton({ height }: { height: number }) {
  return (
    <div
      className="animate-pulse rounded bg-[var(--bg-tertiary)]"
      style={{ height }}
      role="status"
      aria-label="Loading chart data"
    />
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function ChartEmpty({ message, height }: { message: string; height: number }) {
  return (
    <div
      className="flex items-center justify-center"
      style={{ height }}
      role="status"
    >
      <p className="text-center text-sm text-[var(--text-muted)]">{message}</p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const DEFAULT_COLOR = '#10b981' // fairy-500
const DEFAULT_HEIGHT = 200
const DEFAULT_EMPTY_MESSAGE =
  'Not enough data yet. Trends will appear after a few hours of collection.'

export default function TimeSeriesChart({
  data,
  label,
  color = DEFAULT_COLOR,
  unit,
  height = DEFAULT_HEIGHT,
  showRange = false,
  loading = false,
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
}: TimeSeriesChartProps) {
  // ── Loading state ────────────────────────────────────────────────────────

  if (loading) {
    return <ChartSkeleton height={height} />
  }

  // ── Empty state ──────────────────────────────────────────────────────────

  if (!data || data.length < 2) {
    return <ChartEmpty message={emptyMessage} height={height} />
  }

  // ── Axis label formatting ────────────────────────────────────────────────

  // Use HH:MM format for data spanning ≤ 36 hours, MM/DD for longer periods.
  const MS_36H = 36 * 60 * 60 * 1000
  const useTimeFormat = spanMs(data) <= MS_36H
  const formatLabel = useTimeFormat ? formatTime : formatDate

  const labels = data.map(d => formatLabel(d.recorded_at))

  // ── Dataset construction ─────────────────────────────────────────────────

  const hasRange =
    showRange && data.some(d => d.min !== undefined && d.max !== undefined)

  const datasets: ChartData<'line'>['datasets'] = []

  // Optional min/max band — rendered behind the main line
  if (hasRange) {
    datasets.push({
      label: `${label} max`,
      data: data.map(d => (d.max !== undefined ? d.max : d.value)),
      borderWidth: 0,
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: '+1', // fill toward the next dataset (min line)
      backgroundColor: withAlpha(color, 0.12),
      tension: 0.3,
    })

    datasets.push({
      label: `${label} min`,
      data: data.map(d => (d.min !== undefined ? d.min : d.value)),
      borderWidth: 0,
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false as const,
      backgroundColor: 'transparent',
      tension: 0.3,
    })
  }

  // Main value line
  datasets.push({
    label,
    data: data.map(d => d.value),
    borderColor: color,
    borderWidth: 2,
    pointRadius: 2,
    pointHoverRadius: 5,
    pointBackgroundColor: color,
    pointBorderColor: color,
    fill: hasRange ? false : 'origin',
    backgroundColor: hasRange ? 'transparent' : withAlpha(color, 0.1),
    tension: 0.3,
  })

  const chartData: ChartData<'line'> = { labels, datasets }

  // ── Chart options ────────────────────────────────────────────────────────

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
        display: false,
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.92)', // slate-900
        borderColor: 'rgba(148, 163, 184, 0.2)',
        borderWidth: 1,
        titleColor: TICK_COLOR,
        bodyColor: '#f1f5f9', // slate-100
        padding: 10,
        callbacks: {
          title(items) {
            // Show the full readable timestamp instead of the short axis label
            const idx = items[0]?.dataIndex
            if (idx === undefined || !data[idx]) return ''
            return formatTooltipTimestamp(data[idx].recorded_at)
          },
          label(ctx) {
            // Only show the main value line in the tooltip (skip range bands)
            if (ctx.dataset.label !== label) return undefined as unknown as string
            const val = ctx.parsed.y
            if (val === null || val === undefined) return ''
            const formatted =
              typeof val === 'number'
                ? val % 1 === 0
                  ? String(val)
                  : val.toFixed(2)
                : String(val)
            return unit ? `${formatted} ${unit}` : formatted
          },
        },
      },
    },
    scales: {
      x: {
        border: {
          display: false,
        },
        grid: {
          color: GRID_COLOR,
        },
        ticks: {
          color: TICK_COLOR,
          font: { size: 11 },
          maxRotation: 0,
          // Keep the tick count reasonable regardless of data density
          maxTicksLimit: 8,
        },
      },
      y: {
        border: {
          display: false,
        },
        grid: {
          color: GRID_COLOR,
        },
        ticks: {
          color: TICK_COLOR,
          font: { size: 11 },
          maxTicksLimit: 6,
          callback(value) {
            const num = Number(value)
            const formatted =
              num % 1 === 0 ? String(num) : num.toFixed(1)
            return unit ? `${formatted} ${unit}` : formatted
          },
        },
      },
    },
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ height }} aria-label={`${label} chart`}>
      <Line data={chartData} options={options} />
    </div>
  )
}
