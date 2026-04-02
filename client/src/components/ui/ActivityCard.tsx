import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronDown,
  ChevronRight,
  Sparkles,
  Moon,
  Power,
  BatteryLow,
  AlertTriangle,
  Cloud,
  Timer,
  SunMoon,
  Activity,
  Info,
  Zap,
} from 'lucide-react'
import { cn, formatTimeAgo } from '@/lib/utils'

interface ActivityChild {
  id: number
  message: string
  debug: string | null
  category: string | null
  created_at: string
}

interface ActivityItemData {
  id: number
  message: string
  type: string
  room: string | null
  user: string | null
  isFairyQueen: boolean
  timestamp: string
  category: string | null
  childCount: number
  children: ActivityChild[]
}

const TYPE_ICONS: Record<string, typeof Sparkles> = {
  awakened: Sparkles,
  hushed: Moon,
  manual_on: Zap,
  manual_off: Power,
  motion: Activity,
  motion_inactive: Activity,
  no_motion: Timer,
  mode_change: SunMoon,
  nighttime: Moon,
  all_off: Power,
  alert: BatteryLow,
  error: AlertTriangle,
  weather: Cloud,
  device_event: Activity,
  system: Info,
}

function renderMessage(message: string, isFairyQueen: boolean) {
  if (!isFairyQueen) return message

  // Replace "Fairy Queen" in the message with a link
  const idx = message.indexOf('Fairy Queen')
  if (idx === -1) return message

  return (
    <>
      {message.slice(0, idx)}
      <Link
        to="/fairy-queen"
        className="text-fairy-400 hover:text-fairy-300 hover:underline transition-colors"
      >
        Fairy Queen
      </Link>
      {message.slice(idx + 'Fairy Queen'.length)}
    </>
  )
}

export function ActivityCard({ activity }: { activity: ActivityItemData }) {
  const [expanded, setExpanded] = useState(false)
  const Icon = TYPE_ICONS[activity.type] || Info

  return (
    <div className="border-b border-[var(--border-primary)] py-3 last:border-0">
      <div className="flex items-start gap-3">
        <Icon
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0',
            activity.type === 'error' || activity.type === 'alert'
              ? 'text-amber-400'
              : activity.isFairyQueen
                ? 'text-fairy-400'
                : 'text-caption',
          )}
          aria-hidden="true"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-caption">
              {formatTimeAgo(activity.timestamp)}
            </span>
            {activity.room && (
              <span className="inline-flex rounded surface px-1.5 py-0.5 text-[10px] font-medium text-body">
                {activity.room}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-heading">
            {renderMessage(activity.message, activity.isFairyQueen)}
          </p>

          {activity.childCount > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-1.5 flex items-center gap-1 text-xs text-caption hover:text-body transition-colors"
            >
              {expanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              {activity.childCount} {activity.childCount === 1 ? 'event' : 'events'}
            </button>
          )}

          {expanded && activity.children.length > 0 && (
            <div className="mt-2 rounded-lg surface p-3 space-y-1.5">
              {activity.children.map(child => (
                <div key={child.id} className="text-xs text-body">
                  {child.category && (
                    <span className="inline-flex rounded bg-white/5 px-1 py-0.5 text-[10px] font-medium text-caption mr-1.5">
                      {child.category}
                    </span>
                  )}
                  {child.message}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
