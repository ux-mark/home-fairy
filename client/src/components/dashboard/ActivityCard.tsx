import { useState, useMemo } from 'react'
import {
  Chart,
  BarElement,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'
import type { ChartOptions, ChartData } from 'chart.js'
import { Activity } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ActivityInsights } from '@/lib/api'
import { LucideIcon } from '@/components/ui/LucideIcon'
import { cn } from '@/lib/utils'

Chart.register(BarElement, CategoryScale, LinearScale, LineElement, PointElement, Filler, Tooltip, Legend)

// ── Constants ─────────────────────────────────────────────────────────────────

const GRID_COLOR = 'rgba(148, 163, 184, 0.15)'
const TICK_COLOR = 'rgb(148, 163, 184)'

const ROOM_PALETTE = [
  '#10b981', // green
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
]

const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(15, 23, 42, 0.92)' as const,
  borderColor: 'rgba(148, 163, 184, 0.2)' as const,
  borderWidth: 1,
  titleColor: TICK_COLOR,
  bodyColor: '#f1f5f9',
  padding: 10,
}

function getRoomColor(index: number): string {
  return ROOM_PALETTE[index % ROOM_PALETTE.length]
}

// ── Room toggle pills ─────────────────────────────────────────────────────────

interface RoomToggleProps {
  rooms: string[]
  activeRooms: Set<string>
  roomIcons: Record<string, string | null>
  onToggle: (room: string) => void
}

function RoomToggles({ rooms, activeRooms, roomIcons, onToggle }: RoomToggleProps) {
  return (
    <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter by room">
      {rooms.map((room, i) => {
        const active = activeRooms.has(room)
        const color = getRoomColor(i)
        const icon = roomIcons[room]
        return (
          <button
            key={room}
            type="button"
            onClick={() => onToggle(room)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all min-h-[32px]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              active
                ? 'text-white shadow-sm'
                : 'bg-slate-800/50 text-slate-500',
            )}
            style={active ? { backgroundColor: color } : undefined}
            aria-pressed={active}
          >
            <LucideIcon name={icon} className="h-3 w-3 shrink-0" aria-hidden="true" />
            {room}
          </button>
        )
      })}
    </div>
  )
}

// ── Room activity horizontal bar chart ────────────────────────────────────────

function RoomActivityChart({
  ranking,
  activeRooms,
  roomIndexMap,
}: {
  ranking: ActivityInsights['roomRanking']
  activeRooms: Set<string>
  roomIndexMap: Map<string, number>
}) {
  const filtered = ranking.filter((r) => activeRooms.has(r.room))
  if (filtered.length === 0) return null

  const labels = filtered.map((r) => r.room)
  const values = filtered.map((r) => r.events24h)
  const colors = filtered.map((r) => getRoomColor(roomIndexMap.get(r.room) ?? 0))

  const chartData: ChartData<'bar'> = {
    labels,
    datasets: [
      {
        label: 'Events today',
        data: values,
        backgroundColor: colors.map((c) => c + 'b3'), // 70% opacity
        borderColor: colors,
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
        ticks: { color: TICK_COLOR, font: { size: 11 } },
      },
    },
  }

  const height = Math.max(120, filtered.length * 28)

  return (
    <div style={{ height }} aria-label="Room activity ranking chart">
      <Bar data={chartData} options={options} />
    </div>
  )
}

// ── Hourly pattern area chart (multi-room lines) ─────────────────────────────

function HourlyPatternChart({
  hourlyByRoom,
  activeRooms,
  roomIndexMap,
}: {
  hourlyByRoom: ActivityInsights['hourlyByRoom']
  activeRooms: Set<string>
  roomIndexMap: Map<string, number>
}) {
  const filtered = hourlyByRoom.filter((r) => activeRooms.has(r.room))
  if (filtered.length === 0) return null

  const labels = Array.from({ length: 24 }, (_, h) => {
    if (h === 0) return '12am'
    if (h === 12) return '12pm'
    return h < 12 ? `${h}am` : `${h - 12}pm`
  })

  const chartData: ChartData<'line'> = {
    labels,
    datasets: filtered.map((room) => {
      const color = getRoomColor(roomIndexMap.get(room.room) ?? 0)
      return {
        label: room.room,
        data: room.data.map((d) => d.avgEvents),
        borderColor: color,
        backgroundColor: color + '20', // 12% opacity fill
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.3,
        fill: true,
      }
    }),
  }

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...TOOLTIP_STYLE,
        callbacks: {
          title(items) {
            const idx = items[0]?.dataIndex ?? 0
            const h = idx % 12 || 12
            const suffix = idx < 12 ? 'am' : 'pm'
            const nh = (idx + 1) % 12 || 12
            const ns = (idx + 1) < 12 || (idx + 1) === 24 ? 'am' : 'pm'
            return `${h}${suffix}\u2013${nh}${ns}`
          },
          label(ctx) {
            return `${ctx.dataset.label}: ${ctx.parsed.y} avg events`
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
    <div style={{ height: 160 }} aria-label="Hourly activity pattern by room">
      <Line data={chartData} options={options} />
    </div>
  )
}

// ── Daily trend stacked bar chart ─────────────────────────────────────────────

function DailyTrendChart({
  dailyByRoom,
  activeRooms,
  roomIndexMap,
}: {
  dailyByRoom: ActivityInsights['dailyByRoom']
  activeRooms: Set<string>
  roomIndexMap: Map<string, number>
}) {
  const filtered = dailyByRoom.filter((r) => activeRooms.has(r.room))
  if (filtered.length === 0 || filtered[0].data.length === 0) return null

  const labels = filtered[0].data.map((d) => d.day)

  const chartData: ChartData<'bar'> = {
    labels,
    datasets: filtered.map((room) => {
      const color = getRoomColor(roomIndexMap.get(room.room) ?? 0)
      return {
        label: room.room,
        data: room.data.map((d) => d.totalEvents),
        backgroundColor: color + 'b3',
        borderColor: color,
        borderWidth: 1,
        borderRadius: 2,
      }
    }),
  }

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...TOOLTIP_STYLE,
        callbacks: {
          label(ctx) {
            return `${ctx.dataset.label}: ${ctx.parsed.y} events`
          },
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        border: { display: false },
        grid: { color: GRID_COLOR },
        ticks: { color: TICK_COLOR, font: { size: 11 } },
      },
      y: {
        stacked: true,
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
    <div style={{ height: 140 }} aria-label="Daily activity trend by room">
      <Bar data={chartData} options={options} />
    </div>
  )
}

// ── ActivityCard ──────────────────────────────────────────────────────────────

interface ActivityCardProps {
  activity: ActivityInsights | null
}

export default function ActivityCard({ activity }: ActivityCardProps) {
  const allRooms = useMemo(
    () => activity?.roomRanking.map((r) => r.room) ?? [],
    [activity],
  )
  const [activeRooms, setActiveRooms] = useState<Set<string>>(() => new Set(allRooms))

  // Keep active rooms in sync when data changes
  const roomIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    allRooms.forEach((r, i) => map.set(r, i))
    return map
  }, [allRooms])

  // If allRooms changed (e.g., on first load), ensure activeRooms matches
  useMemo(() => {
    if (allRooms.length > 0 && activeRooms.size === 0) {
      setActiveRooms(new Set(allRooms))
    }
  }, [allRooms, activeRooms.size])

  function toggleRoom(room: string) {
    setActiveRooms((prev) => {
      const next = new Set(prev)
      if (next.has(room)) {
        // Don't allow deselecting all rooms
        if (next.size > 1) next.delete(room)
      } else {
        next.add(room)
      }
      return next
    })
  }

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

  const { roomRanking, hourlyByRoom, dailyByRoom, roomIcons, mostActiveRoom, quietestRoom } = activity
  const activeCount = roomRanking
    .filter((r) => activeRooms.has(r.room))
    .reduce((sum, r) => sum + r.events24h, 0)

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
      <div className="mb-4 space-y-1">
        <p className="text-body text-sm">
          {activeCount.toLocaleString()} motion event{activeCount !== 1 ? 's' : ''} today
          {activeRooms.size < allRooms.length && (
            <span className="text-caption"> ({activeRooms.size} of {allRooms.length} rooms)</span>
          )}
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
            {' '}({mostActiveRoom.events24h})
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

      {/* Room toggle pills */}
      <RoomToggles rooms={allRooms} activeRooms={activeRooms} roomIcons={roomIcons} onToggle={toggleRoom} />

      {/* Room activity chart (horizontal bars, coloured per room) */}
      {roomRanking.length > 0 && (
        <div className="mb-5">
          <h3 className="text-caption mb-2 text-xs font-medium">Events by room today</h3>
          <RoomActivityChart ranking={roomRanking} activeRooms={activeRooms} roomIndexMap={roomIndexMap} />
        </div>
      )}

      {/* Hourly pattern (multi-room area/line chart) */}
      {hourlyByRoom.length > 0 && (
        <div className="mb-5 border-t pt-4" style={{ borderColor: 'var(--border-primary)' }}>
          <h3 className="text-caption mb-2 text-xs font-medium">Typical hourly pattern (7-day average)</h3>
          <HourlyPatternChart hourlyByRoom={hourlyByRoom} activeRooms={activeRooms} roomIndexMap={roomIndexMap} />
        </div>
      )}

      {/* Daily trend (stacked bar chart, coloured per room) */}
      {dailyByRoom.length > 0 && (
        <div className="border-t pt-4" style={{ borderColor: 'var(--border-primary)' }}>
          <h3 className="text-caption mb-2 text-xs font-medium">7-day activity trend</h3>
          <DailyTrendChart dailyByRoom={dailyByRoom} activeRooms={activeRooms} roomIndexMap={roomIndexMap} />
        </div>
      )}
    </section>
  )
}
