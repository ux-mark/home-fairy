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
import { cn } from '@/lib/utils'

Chart.register(BarElement, CategoryScale, LinearScale, Tooltip)

// ── Constants ─────────────────────────────────────────────────────────────────

const GRID_COLOR = 'rgba(148, 163, 184, 0.15)'
const TICK_COLOR = 'rgb(148, 163, 184)'
const BAR_COLOR = '#10b981' // fairy-500

// ── Daily trend bar chart ─────────────────────────────────────────────────────

interface DailyTrendChartProps {
  trend: ActivityInsights['dailyTrend']
}

function DailyTrendChart({ trend }: DailyTrendChartProps) {
  if (trend.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg bg-[var(--bg-tertiary)]"
        style={{ height: 120 }}
        role="status"
      >
        <p className="text-center text-sm text-[var(--text-muted)]">
          No activity data yet for the past 7 days.
        </p>
      </div>
    )
  }

  const labels = trend.map(d => d.day)
  const values = trend.map(d => d.totalEvents)

  const chartData: ChartData<'bar'> = {
    labels,
    datasets: [
      {
        label: 'Events',
        data: values,
        backgroundColor: `rgba(16, 185, 129, 0.7)`, // fairy-500 at 70%
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
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        borderColor: 'rgba(148, 163, 184, 0.2)',
        borderWidth: 1,
        titleColor: TICK_COLOR,
        bodyColor: '#f1f5f9',
        padding: 10,
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

// ── Room ranking row ───────────────────────────────────────────────────────────

interface RoomRankingRowProps {
  entry: ActivityInsights['roomRanking'][number]
  rank: number
  maxEvents: number
}

function RoomRankingRow({ entry, rank, maxEvents }: RoomRankingRowProps) {
  return (
    <li className="flex items-start gap-3 py-2">
      {/* Rank number */}
      <span
        className="text-caption mt-0.5 w-4 shrink-0 text-right text-xs tabular-nums"
        aria-hidden="true"
      >
        {rank}
      </span>

      {/* Room name + peak hours */}
      <div className="min-w-0 flex-1">
        <Link
          to={`/rooms/${encodeURIComponent(entry.room)}`}
          className={cn(
            'block text-sm font-medium text-fairy-400 hover:underline',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            'min-h-[44px] flex items-center',
          )}
        >
          {entry.room}
        </Link>
        {entry.peakHours && (
          <p className="text-caption text-xs">Peak: {entry.peakHours}</p>
        )}
      </div>

      {/* Event count badge */}
      <span
        className={cn(
          'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums',
          maxEvents > 0 && entry.events24h / maxEvents >= 0.75
            ? 'bg-fairy-500/20 text-fairy-400'
            : 'bg-slate-700/60 text-body',
        )}
        aria-label={`${entry.events24h} events today`}
      >
        {entry.events24h}
      </span>
    </li>
  )
}

// ── ActivityCard ──────────────────────────────────────────────────────────────

interface ActivityCardProps {
  activity: ActivityInsights | null
}

export default function ActivityCard({ activity }: ActivityCardProps) {
  // ── Empty state ──────────────────────────────────────────────────────────────
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

  const { roomRanking, dailyTrend, mostActiveRoom, quietestRoom } = activity
  const maxEvents = roomRanking[0]?.events24h ?? 0

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

      {/* Most / quietest active room callout */}
      {mostActiveRoom && (
        <div className="mb-4 space-y-1">
          <p className="text-sm font-medium text-heading">
            <Link
              to={`/rooms/${encodeURIComponent(mostActiveRoom.room)}`}
              className="text-fairy-400 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
            >
              {mostActiveRoom.room}
            </Link>{' '}
            is the most active room ({mostActiveRoom.events24h} event{mostActiveRoom.events24h !== 1 ? 's' : ''} today)
          </p>
          {quietestRoom && (
            <p className="text-caption text-xs">
              Quietest:{' '}
              <Link
                to={`/rooms/${encodeURIComponent(quietestRoom.room)}`}
                className="text-fairy-400/80 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
              >
                {quietestRoom.room}
              </Link>{' '}
              ({quietestRoom.events24h} event{quietestRoom.events24h !== 1 ? 's' : ''} today)
            </p>
          )}
        </div>
      )}

      {/* Room ranking list */}
      {roomRanking.length > 0 && (
        <div className="mb-4">
          <h3 className="text-caption mb-1 text-xs font-medium">Rooms by activity today</h3>
          <ul
            role="list"
            aria-label="Room activity ranking"
            className="divide-y"
            style={{ borderColor: 'var(--border-primary)' }}
          >
            {roomRanking.map((entry, i) => (
              <RoomRankingRow
                key={entry.room}
                entry={entry}
                rank={i + 1}
                maxEvents={maxEvents}
              />
            ))}
          </ul>
        </div>
      )}

      {/* Daily activity trend */}
      <div className="border-t pt-4" style={{ borderColor: 'var(--border-primary)' }}>
        <h3 className="text-caption mb-3 text-xs font-medium">7-day activity trend</h3>
        <DailyTrendChart trend={dailyTrend} />
      </div>
    </section>
  )
}
