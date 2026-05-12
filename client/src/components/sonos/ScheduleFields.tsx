import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { TimeMaskedInput } from './TimeMaskedInput'

/**
 * ScheduleFields — collapsible "Schedule (optional)" disclosure for
 * Sonos auto-play rules. Wraps day-of-week chips + two time inputs.
 *
 * Schedule semantics:
 *  - days_of_week === null → every day (rule has no day filter).
 *  - days_of_week === []  → invalid (user toggled days on then off).
 *                            We let the parent disable Save and show an
 *                            inline error with a "Clear selection" reset.
 *  - days_of_week === [1..7 subset] → only those days.
 *  - time_start / time_end both null → all hours.
 *  - time_start XOR time_end set → invalid; parent disables Save.
 *  - time_end <= time_start → wrap-around past midnight (e.g. 22:00→06:00).
 */

export interface ScheduleValue {
  daysOfWeek: number[] | null
  timeStart: string | null
  timeEnd: string | null
}

interface Props {
  value: ScheduleValue
  onChange: (next: ScheduleValue) => void
  onValidityChange?: (valid: boolean) => void
  /** Stable id prefix for inputs/labels (multiple instances on one page). */
  idPrefix: string
}

const DAYS: { iso: number; short: string; long: string }[] = [
  { iso: 1, short: 'Mon', long: 'Monday' },
  { iso: 2, short: 'Tue', long: 'Tuesday' },
  { iso: 3, short: 'Wed', long: 'Wednesday' },
  { iso: 4, short: 'Thu', long: 'Thursday' },
  { iso: 5, short: 'Fri', long: 'Friday' },
  { iso: 6, short: 'Sat', long: 'Saturday' },
  { iso: 7, short: 'Sun', long: 'Sunday' },
]

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function daysSummary(days: number[] | null): string {
  if (days === null) return 'Every day'
  if (days.length === 0) return 'No days'
  if (days.length === 7) return 'Every day'
  if (days.length === 5 && [1, 2, 3, 4, 5].every(d => days.includes(d))) return 'Weekdays'
  if (days.length === 2 && days.includes(6) && days.includes(7)) return 'Weekends'
  const sorted = [...days].sort((a, b) => a - b)
  return sorted.map(d => DAYS[d - 1].short).join(', ')
}

function timeSummary(start: string | null, end: string | null): string {
  if (!start && !end) return 'all hours'
  if (start && end) return `${start}–${end}`
  return 'all hours'
}

export function summariseSchedule(value: ScheduleValue): string {
  const noDays = value.daysOfWeek === null
  const noTime = !value.timeStart && !value.timeEnd
  if (noDays && noTime) return 'Always on (no schedule)'
  return `${daysSummary(value.daysOfWeek)} · ${timeSummary(value.timeStart, value.timeEnd)}`
}

export function ScheduleFields(props: Props) {
  const { value, onChange, onValidityChange, idPrefix } = props
  const [open, setOpen] = useState<boolean>(() => {
    return value.daysOfWeek !== null || !!value.timeStart || !!value.timeEnd
  })

  const daysIsEmptyArray = Array.isArray(value.daysOfWeek) && value.daysOfWeek.length === 0
  const timePairHalfSet = (!!value.timeStart) !== (!!value.timeEnd)
  const timeStartBad = !!value.timeStart && !HHMM_RE.test(value.timeStart)
  const timeEndBad = !!value.timeEnd && !HHMM_RE.test(value.timeEnd)
  const isValid = !daysIsEmptyArray && !timePairHalfSet && !timeStartBad && !timeEndBad

  useEffect(() => {
    onValidityChange?.(isValid)
  }, [isValid, onValidityChange])

  const summary = useMemo(() => summariseSchedule(value), [value])

  const toggleDay = (iso: number) => {
    const current = value.daysOfWeek ?? [...Array(7)].map((_, i) => i + 1)
    let next: number[]
    if (current.includes(iso)) {
      next = current.filter(d => d !== iso)
    } else {
      next = [...current, iso].sort((a, b) => a - b)
    }
    // Collapse "all 7 selected" back to null (every day) — the canonical form.
    onChange({
      ...value,
      daysOfWeek: next.length === 7 ? null : next,
    })
  }

  const clearDays = () => {
    onChange({ ...value, daysOfWeek: null })
  }

  const isDayActive = (iso: number): boolean => {
    if (value.daysOfWeek === null) return true
    return value.daysOfWeek.includes(iso)
  }

  // Wrap-around hint when end <= start (lexical comparison works for HH:MM).
  const wrapAround = !!value.timeStart && !!value.timeEnd
    && HHMM_RE.test(value.timeStart) && HHMM_RE.test(value.timeEnd)
    && value.timeEnd <= value.timeStart

  return (
    <div className="rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-secondary)]">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-controls={`${idPrefix}-schedule-body`}
        className={cn(
          'flex w-full items-center justify-between gap-2 px-4 py-3 min-h-[44px] text-left',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          'rounded-lg',
        )}
      >
        <span className="text-heading text-sm font-medium">Schedule (optional)</span>
        <span className="text-caption text-xs truncate ml-2">{summary}</span>
      </button>

      {open && (
        <div id={`${idPrefix}-schedule-body`} className="px-4 pb-4 space-y-4 border-t border-[var(--border-secondary)] pt-4">
          {/* Day chips */}
          <div>
            <p className="text-heading text-sm mb-2">Days</p>
            <div role="group" aria-label="Days of week" className="flex flex-wrap gap-2">
              {DAYS.map(d => {
                const active = isDayActive(d.iso)
                return (
                  <button
                    key={d.iso}
                    type="button"
                    onClick={() => toggleDay(d.iso)}
                    aria-pressed={active}
                    aria-label={d.long}
                    className={cn(
                      'shrink-0 inline-flex items-center justify-center rounded-full px-3 min-h-[44px] text-sm font-medium transition-colors',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                      active
                        ? 'bg-fairy-500 text-white'
                        : 'surface text-body hover:text-heading border border-[var(--border-secondary)]',
                    )}
                  >
                    {d.short}
                  </button>
                )
              })}
            </div>
            {daysIsEmptyArray && (
              <div className="mt-2">
                <p className="text-xs text-red-400">
                  Pick at least one day, or clear your selection to mean every day.
                </p>
                <button
                  type="button"
                  onClick={clearDays}
                  className="mt-1 text-xs text-fairy-400 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 rounded"
                >
                  Clear selection
                </button>
              </div>
            )}
            {!daysIsEmptyArray && value.daysOfWeek !== null && (
              <button
                type="button"
                onClick={clearDays}
                className="mt-2 text-xs text-caption hover:text-fairy-400 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 rounded"
              >
                Reset to every day
              </button>
            )}
          </div>

          {/* Time window */}
          <div>
            <p className="text-heading text-sm mb-2">Time window</p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-col gap-1">
                <label htmlFor={`${idPrefix}-time-start`} className="text-caption text-xs">Start</label>
                <TimeMaskedInput
                  id={`${idPrefix}-time-start`}
                  value={value.timeStart}
                  onChange={(v) => onChange({ ...value, timeStart: v })}
                  aria-label="Schedule start time"
                  invalid={timeStartBad}
                />
              </div>
              <span className="text-caption text-sm self-end pb-2.5">to</span>
              <div className="flex flex-col gap-1">
                <label htmlFor={`${idPrefix}-time-end`} className="text-caption text-xs">End</label>
                <TimeMaskedInput
                  id={`${idPrefix}-time-end`}
                  value={value.timeEnd}
                  onChange={(v) => onChange({ ...value, timeEnd: v })}
                  aria-label="Schedule end time"
                  invalid={timeEndBad || timePairHalfSet}
                />
              </div>
            </div>
            <p className="text-caption text-xs mt-2">
              Leave blank for all hours. Times wrap past midnight (e.g. 22:00 → 06:00).
            </p>
            {timePairHalfSet && (
              <p className="text-xs text-red-400 mt-1">
                Set both start and end times, or leave both blank.
              </p>
            )}
            {(timeStartBad || timeEndBad) && !timePairHalfSet && (
              <p className="text-xs text-red-400 mt-1">
                Times must be HH:MM (24h).
              </p>
            )}
            {wrapAround && (
              <p className="text-xs text-fairy-400 mt-1">Wraps past midnight</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
