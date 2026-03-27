import {
  Chart,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import type { ChartOptions, ChartData } from 'chart.js'
import { Activity } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ActivityInsights } from '@/lib/api'

Chart.register(BarElement, CategoryScale, LinearScale, Tooltip)

// ── Constants ─────────────────────────────────────────────────────────────────

const GRID_COLOR = 'rgba(148, 163, 184, 0.15)'
const TICK_COLOR = 'rgb(148, 163, 184)'
const BAR_COLOR = '#10b981' // fairy-500
const BAR_BG = 'rgba(16, 185, 129, 0.7)'

const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(15, 23, 42, 0.92)' as const,
  borderColor: 'rgba(148, 163, 184, 0.2)' as const,
  borderWidth: 1,
  titleColor: TICK_COLOR,
  bodyColor: '#f1f5f9',
  padding: 10,
}

// ── Room activity horizontal bar chart ────────────────────────────────────────

function RoomActivityChart({ ranking }: { ranking: ActivityInsights['roomRanking'] }) {
  if (ranking.length === 0) return null

  const labels = ranking.map((r) => r.room)
  const values = ranking.map((r) => r.events24h)

  const chartData: ChartData<'bar'> = {
    labels,
    datasets: [
      {
        label: 'Events today',
        data: values,
        backgroundColor: BAR_BG,
        borderColor: BAR_COLOR,
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  }

  const options: ChartOptions<'bar'> = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...TOOLTIP_STYLE,
        callbacks: {
          label(ctx) {
            const val = ctx.parsed.x
            return `${val} event${val !== 1 ? 's' : ''} today`
          },
        },
      },
    },
    scales: {
      x: {
        border: { display: false },
        grid: { color: GRID_COLOR },
        ticks: {
          color: TICK_COLOR,
          font: { size: 11 },
          maxTicksLimit: 5,
          callback(value) {
            return Number(value) % 1 === 0 ? String(value) : ''
          },
        },
        beginAtZero: true,
      },
      y: {
        border: { display: false },
        grid: { display: false },
        ticks: {
          color: TICK_COLOR,
          font: { size: 11 },
        },
      },
    },
  }

  // Scale height based on number of rooms (28px per room, min 120)
  const height = Math.max(120, ranking.length * 28)

  return (
    <div style={{ height }} aria-label="Room activity ranking chart">
      <Bar data={chartData} options={options} />
    </div>
  )
}

// ── Hourly pattern bar chart ──────────────────────────────────────────────────

function HourlyPatternChart({ pattern }: { pattern: ActivityInsights['hourlyPattern'] }) {
  if (pattern.length === 0) return null

  const labels = pattern.map((p) => {
    if (p.hour === 0) return '12am'
    if (p.hour === 12) return '12pm'
    return p.hour < 12 ? `${p.hour}am` : `${p.hour - 12}pm`
  })
  const values = pattern.map((p) => p.avgEvents)

  const chartData: ChartData<'bar'> = {
    labels,
    datasets: [
      {
        label: 'Avg events',
        data: values,
        backgroundColor: BAR_BG,
        borderColor: BAR_COLOR,
        borderWidth: 1,
        borderRadius: 2,
      },
    ],
  }

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...TOOLTIP_STYLE,
        callbacks: {
          title(items) {
            const idx = items[0]?.dataIndex ?? 0
            const hour = idx
            const h = hour % 12 || 12
            const suffix = hour < 12 ? 'am' : 'pm'
            const nh = (hour + 1) % 12 || 12
            const ns = (hour + 1) < 12 || (hour + 1) === 24 ? 'am' : 'pm'
            return `${h}${suffix}\u2013${nh}${ns}`
          },
          label(ctx) {
            const val = ctx.parsed.y
            return `${val} avg event${val !== 1 ? 's' : ''}`
          },
        },
      },
    },
    scales: {
      x: {
        border: { display: false },
        grid: { color: GRID_COLOR },
        ticks: {
          color: TICK_COLOR,
          font: { size: 10 },
          maxRotation: 0,
          callback(_value, index) {
            // Show every 3rd label to avoid crowding
            return index % 3 === 0 ? labels[index] : ''
          },
        },
      },
      y: {
        border: { display: false },
        grid: { color: GRID_COLOR },
        ticks: {
          color: TICK_COLOR,
          font: { size: 11 },
          maxTicksLimit: 4,
          callback(value) {
            return Number(value) % 1 === 0 ? String(value) : ''
          },
        },
        beginAtZero: true,
      },
    },
  }

  return (
    <div style={{ height: 140 }} aria-label="Hourly activity pattern chart">
      <Bar data={chartData} options={options} />
    </div>
  )
}

// ── Daily trend bar chart ─────────────────────────────────────────────────────

function DailyTrendChart({ trend }: { trend: ActivityInsights['dailyTrend'] }) {
  if (trend.length === 0) return null

  const labels = trend.map((d) => d.day)
  const values = trend.map((d) => d.totalEvents)

  const chartData: ChartData<'bar'> = {
    labels,
    datasets: [
      {
        label: 'Events',
        data: values,
        backgroundColor: BAR_BG,
        borderColor: BAR_COLOR,
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  }

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...TOOLTIP_STYLE,
        callbacks: {
          label(ctx) {
            const val = ctx.parsed.y
            return `${val} event${val !== 1 ? 's' : ''}`
          },
        },
      },
    },
    scales: {
      x: {
        border: { display: false },
        grid: { color: GRID_COLOR },
        ticks: { color: TICK_COLOR, font: { size: 11 } },
      },
      y: {
        border: { display: false },
        grid: { color: GRID_COLOR },
        ticks: {
          color: TICK_COLOR,
          font: { size: 11 },
          maxTicksLimit: 5,
          callback(value) {
            return Number(value) % 1 === 0 ? String(value) : ''
          },
        },
        beginAtZero: true,
      },
    },
  }

  return (
    <div style={{ height: 120 }} aria-label="Daily activity trend bar chart">
      <Bar data={chartData} options={options} />
    </div>
  )
}

// ── ActivityCard ──────────────────────────────────────────────────────────────

interface ActivityCardProps {
  activity: ActivityInsights | null
}

export default function ActivityCard({ activity }: ActivityCardProps) {
  if (!activity) {
    return (
      <section
        id="activity-card"
        aria-label="Activity patterns"
        className="card rounded-xl border p-5"
      >
        <header className="mb-4 flex items-center gap-2">
          <Activity className="h-4 w-4 text-fairy-400" aria-hidden="true" />
          <h2 className="text-heading text-base font-semibold">Activity</h2>
        </header>
        <div
          className="rounded-lg border border-dashed py-8 text-center"
          style={{ borderColor: 'var(--border-secondary)' }}
        >
          <Activity className="text-caption mx-auto mb-3 h-7 w-7" aria-hidden="true" />
          <p className="text-body text-sm">Activity tracking has started.</p>
          <p className="text-caption mt-1 text-xs">
            Room patterns will appear as motion data is collected.
          </p>
        </div>
      </section>
    )
  }

  const { roomRanking, dailyTrend, hourlyPattern, mostActiveRoom, quietestRoom } = activity
  const totalEvents = roomRanking.reduce((sum, r) => sum + r.events24h, 0)

  return (
    <section
      id="activity-card"
      aria-label="Activity patterns"
      className="card rounded-xl border p-5"
    >
      {/* Header */}
      <header className="mb-4 flex items-center gap-2">
        <Activity className="h-4 w-4 text-fairy-400" aria-hidden="true" />
        <h2 className="text-heading text-base font-semibold">Activity</h2>
      </header>

      {/* Headline */}
      <div className="mb-5 space-y-1">
        <p className="text-body text-sm">
          {totalEvents.toLocaleString()} motion event{totalEvents !== 1 ? 's' : ''} today across{' '}
          {roomRanking.length} room{roomRanking.length !== 1 ? 's' : ''}
        </p>
        {mostActiveRoom && (
          <p className="text-sm font-medium text-heading">
            Most active:{' '}
            <Link
              to={`/rooms/${encodeURIComponent(mostActiveRoom.room)}`}
              className="text-fairy-400 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
            >
              {mostActiveRoom.room}
            </Link>
            {' '}({mostActiveRoom.events24h} events)
            {quietestRoom && (
              <span className="text-caption text-xs font-normal">
                {' '} / Quietest:{' '}
                <Link
                  to={`/rooms/${encodeURIComponent(quietestRoom.room)}`}
                  className="text-fairy-400/80 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                >
                  {quietestRoom.room}
                </Link>
                {' '}({quietestRoom.events24h})
              </span>
            )}
          </p>
        )}
      </div>

      {/* Room activity chart (horizontal bars) */}
      {roomRanking.length > 0 && (
        <div className="mb-5">
          <h3 className="text-caption mb-2 text-xs font-medium">Events by room today</h3>
          <RoomActivityChart ranking={roomRanking} />
        </div>
      )}

      {/* Hourly pattern */}
      {hourlyPattern.length > 0 && (
        <div className="mb-5 border-t pt-4" style={{ borderColor: 'var(--border-primary)' }}>
          <h3 className="text-caption mb-2 text-xs font-medium">Typical hourly pattern (7-day average)</h3>
          <HourlyPatternChart pattern={hourlyPattern} />
        </div>
      )}

      {/* Daily trend */}
      {dailyTrend.length > 0 && (
        <div className="border-t pt-4" style={{ borderColor: 'var(--border-primary)' }}>
          <h3 className="text-caption mb-2 text-xs font-medium">7-day activity trend</h3>
          <DailyTrendChart trend={dailyTrend} />
        </div>
      )}
    </section>
  )
}
