import { Sun, Sunrise, Sunset } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SunScheduleEntry } from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SunModeCardProps {
  mode: string
  sunSchedule: SunScheduleEntry[]
  sunPhase: string
  sunTimes: Record<string, string>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse an ISO date string and return an object with hours/minutes,
 * plus a HH:MM formatted string for display.
 * Returns null if the string cannot be parsed.
 */
function parseTime(iso: string): { date: Date; label: string } | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return { date: d, label: `${hh}:${mm}` }
}

/**
 * Convert a Date to minutes since midnight in local time.
 * Used for positioning markers on the 24-hour timeline.
 */
function toMinuteOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

/** Clamp a value between min and max (inclusive). */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Convert a minute-of-day (0–1440) to a percentage string for CSS left/width. */
function minuteToPercent(minute: number): string {
  return `${clamp((minute / 1440) * 100, 0, 100).toFixed(3)}%`
}

// ── Mode badge ────────────────────────────────────────────────────────────────

function ModeBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-fairy-500/15 px-2.5 py-0.5 text-xs font-medium text-fairy-400">
      {label}
    </span>
  )
}

// ── Sun timeline ──────────────────────────────────────────────────────────────

/**
 * A compact horizontal bar showing today's sun-mode transitions.
 *
 * Layout:
 * - A single horizontal track spanning midnight → midnight
 * - A dot at each schedule transition, coloured by past/future
 * - A "now" indicator at the current time-of-day
 * - Time labels beneath each dot on desktop; dots only on mobile
 *
 * Accessibility:
 * - The entire timeline is wrapped in a <figure> with a descriptive caption
 * - Individual transitions are listed in a visually hidden <ul> for screen readers
 */
interface TimelineProps {
  schedule: SunScheduleEntry[]
  now: Date
}

function SunTimeline({ schedule, now }: TimelineProps) {
  const nowMinute = toMinuteOfDay(now)
  const nowPercent = minuteToPercent(nowMinute)

  // Build an array of positioned entries; skip unparseable times
  type PositionedEntry = {
    entry: SunScheduleEntry
    label: string
    percent: string
    minute: number
  }

  const positioned: PositionedEntry[] = []
  for (const entry of schedule) {
    const parsed = parseTime(entry.time)
    if (!parsed) continue
    const minute = toMinuteOfDay(parsed.date)
    positioned.push({
      entry,
      label: parsed.label,
      percent: minuteToPercent(minute),
      minute,
    })
  }

  return (
    <figure aria-label="Sun transition timeline for today">
      {/* Visual timeline track */}
      <div
        className="relative mb-6 h-1 rounded-full bg-[var(--bg-tertiary)]"
        aria-hidden="true"
      >
        {/* Past progress fill */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-fairy-500/30"
          style={{ width: nowPercent }}
        />

        {/* Transition dots */}
        {positioned.map((pos, i) => (
          <div
            key={i}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ left: pos.percent }}
          >
            {/* Dot */}
            <div
              className={cn(
                'h-2.5 w-2.5 rounded-full border-2 transition-colors',
                pos.entry.isPast
                  ? 'border-fairy-600 bg-fairy-500/60'
                  : 'border-fairy-400 bg-[var(--bg-secondary)]',
              )}
            />

            {/* Time label beneath — hidden on small screens */}
            <span
              className={cn(
                'absolute left-1/2 top-4 hidden -translate-x-1/2 whitespace-nowrap text-[10px] leading-none',
                'sm:block',
                pos.entry.isPast ? 'text-caption' : 'text-body',
              )}
            >
              {pos.label}
            </span>
          </div>
        ))}

        {/* Now indicator */}
        <div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ left: nowPercent }}
        >
          <div className="h-3 w-3 rounded-full border-2 border-white bg-fairy-500 shadow-sm" />
        </div>
      </div>

      {/* Screen-reader list of transitions */}
      <ul className="sr-only" role="list">
        {positioned.map((pos, i) => (
          <li key={i}>
            {pos.entry.mode} at {pos.label} ({pos.entry.isPast ? 'past' : 'upcoming'})
          </li>
        ))}
        <li>Current time: {`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`}</li>
      </ul>

      {/* Mobile label: just show transition count */}
      <p className="text-caption mt-1 text-right text-xs sm:hidden" aria-hidden="true">
        {positioned.filter(p => !p.entry.isPast).length} transitions remaining
      </p>
    </figure>
  )
}

// ── SunModeCard ───────────────────────────────────────────────────────────────

export default function SunModeCard({
  mode,
  sunSchedule,
  sunPhase,
  sunTimes,
}: SunModeCardProps) {
  const now = new Date()

  // Next transition: first schedule entry that is not yet past
  const nextTransition = sunSchedule.find(e => !e.isPast) ?? null

  // Sunrise / sunset display times
  const sunriseParsed = sunTimes.sunrise ? parseTime(sunTimes.sunrise) : null
  const sunsetParsed = sunTimes.sunset ? parseTime(sunTimes.sunset) : null

  // Next transition display
  let nextTransitionLabel: string
  if (nextTransition) {
    const parsed = parseTime(nextTransition.time)
    nextTransitionLabel = parsed
      ? `Next: ${nextTransition.mode} at ${parsed.label}`
      : `Next: ${nextTransition.mode}`
  } else {
    nextTransitionLabel = 'No more transitions today'
  }

  return (
    <section
      aria-label="Sun and mode"
      className="card rounded-xl border p-5"
    >
      {/* Header */}
      <header className="mb-4 flex items-center gap-2">
        <Sun className="h-4 w-4 text-amber-400" aria-hidden="true" />
        <h2 className="text-heading text-base font-semibold">Sun and mode</h2>
      </header>

      {/* Current mode + sun phase row */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ModeBadge label={mode} />
        {sunPhase && sunPhase.toLowerCase() !== mode.toLowerCase() && (
          <span className="text-caption text-sm">{sunPhase}</span>
        )}
      </div>

      {/* Next transition */}
      <p className="text-body mb-4 text-sm">
        {nextTransitionLabel}
      </p>

      {/* Sunrise / sunset row */}
      {(sunriseParsed || sunsetParsed) && (
        <div className="mb-5 flex flex-wrap items-center gap-5">
          {sunriseParsed && (
            <div className="flex items-center gap-1.5">
              <Sunrise
                className="h-4 w-4 shrink-0 text-amber-300"
                aria-hidden="true"
              />
              <span className="sr-only">Sunrise at</span>
              <span className="text-heading text-sm font-medium tabular-nums">
                {sunriseParsed.label}
              </span>
            </div>
          )}
          {sunsetParsed && (
            <div className="flex items-center gap-1.5">
              <Sunset
                className="h-4 w-4 shrink-0 text-orange-400"
                aria-hidden="true"
              />
              <span className="sr-only">Sunset at</span>
              <span className="text-heading text-sm font-medium tabular-nums">
                {sunsetParsed.label}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Sun timeline */}
      {sunSchedule.length > 0 && (
        <SunTimeline schedule={sunSchedule} now={now} />
      )}
    </section>
  )
}
