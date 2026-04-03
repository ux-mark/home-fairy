import { useEffect, useRef, useReducer, useState, useCallback } from 'react'
import * as Slider from '@radix-ui/react-slider'
import { cn } from '@/lib/utils'

interface ProgressBarProps {
  /** Elapsed position in seconds (server-authoritative) */
  elapsed: number
  /** Total track duration in seconds. 0 means unknown/live/radio. */
  duration: number
  /** Whether the track is currently playing */
  playing: boolean
  /** Called with the seek target in seconds on commit */
  onSeek: (seconds: number) => void
  className?: string
}

function formatSeconds(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

type TickAction =
  | { type: 'tick' }
  | { type: 'anchor'; elapsed: number }
  | { type: 'seek'; seconds: number }

interface TickState {
  /** The last server-authoritative elapsed value */
  anchor: number
  /** Seconds ticked since anchor was set */
  offset: number
}

function tickReducer(state: TickState, action: TickAction): TickState {
  switch (action.type) {
    case 'tick':
      return { ...state, offset: state.offset + 1 }
    case 'anchor':
      // When the server sends a new elapsed, reset the offset
      return { anchor: action.elapsed, offset: 0 }
    case 'seek':
      return { anchor: action.seconds, offset: 0 }
  }
}

/**
 * Horizontal progress bar with smooth local ticking between server polls.
 *
 * Design:
 * - A reducer holds (anchor, offset) where anchor is the last server elapsed
 *   and offset is the locally-ticked seconds since then.
 * - The interval callback dispatches 'tick' once per second when playing.
 * - Server updates are dispatched as 'anchor' actions from the interval,
 *   avoiding synchronous setState in an effect body.
 * - Drag override freezes the display independently.
 */
export function ProgressBar({
  elapsed,
  duration,
  playing,
  onSeek,
  className,
}: ProgressBarProps) {
  const isSeekable = duration > 0

  const [{ anchor, offset }, dispatch] = useReducer(tickReducer, {
    anchor: elapsed,
    offset: 0,
  })

  // Drag override — non-null while user is scrubbing
  const [dragValue, setDragValue] = useState<number | null>(null)

  // Keep the latest elapsed in a ref so the interval can read it in its callback
  // (updated in an effect, never read during render)
  const latestElapsedRef = useRef(elapsed)
  const anchorRef = useRef(elapsed)
  const dragValueRef = useRef<number | null>(null)

  useEffect(() => {
    latestElapsedRef.current = elapsed
  }, [elapsed])

  useEffect(() => {
    dragValueRef.current = dragValue
  }, [dragValue])

  // Drive ticking and anchor syncing via interval when playing
  useEffect(() => {
    if (!playing) return

    const id = setInterval(() => {
      // Skip display update while dragging
      if (dragValueRef.current !== null) return

      // Check if server has sent a new anchor since the last interval tick
      const serverElapsed = latestElapsedRef.current
      if (serverElapsed !== anchorRef.current) {
        anchorRef.current = serverElapsed
        dispatch({ type: 'anchor', elapsed: serverElapsed })
      } else {
        dispatch({ type: 'tick' })
      }
    }, 1000)

    return () => clearInterval(id)
  }, [playing])

  const rawElapsed = anchor + offset
  const shownElapsed = dragValue ?? rawElapsed
  const clampedElapsed = isSeekable
    ? Math.min(Math.max(0, shownElapsed), duration)
    : 0

  const handleValueChange = useCallback((vals: number[]) => {
    setDragValue(vals[0])
  }, [])

  const handleValueCommit = useCallback(
    (vals: number[]) => {
      setDragValue(null)
      dispatch({ type: 'seek', seconds: vals[0] })
      onSeek(vals[0])
    },
    [onSeek],
  )

  return (
    <div className={cn('space-y-1', className)}>
      <Slider.Root
        className={cn(
          'relative flex touch-none select-none items-center',
          'focus-within:outline-none',
          !isSeekable && 'pointer-events-none opacity-50',
        )}
        min={0}
        max={isSeekable ? duration : 100}
        step={1}
        value={[isSeekable ? clampedElapsed : 0]}
        onValueChange={handleValueChange}
        onValueCommit={handleValueCommit}
        disabled={!isSeekable}
        aria-label="Track position"
        aria-valuetext={`${formatSeconds(clampedElapsed)} of ${isSeekable ? formatSeconds(duration) : 'unknown'}`}
        style={{ userSelect: 'none', WebkitTouchCallout: 'none' } as React.CSSProperties}
      >
        <Slider.Track className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
          <Slider.Range className="absolute h-full bg-fairy-500" />
        </Slider.Track>
        {isSeekable && (
          <Slider.Thumb
            className={cn(
              'relative block h-4 w-4 rounded-full bg-white shadow-md',
              'before:absolute before:inset-[-12px] before:content-[""]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              'transition-shadow hover:ring-2 hover:ring-fairy-500',
              'cursor-grab active:cursor-grabbing',
            )}
            style={{ willChange: 'transform', transform: 'translateZ(0)' }}
            aria-label="Seek"
          />
        )}
      </Slider.Root>

      <div className="flex justify-between">
        <span className="text-[10px] tabular-nums text-caption">
          {formatSeconds(clampedElapsed)}
        </span>
        <span className="text-[10px] tabular-nums text-caption">
          {isSeekable ? formatSeconds(duration) : '--:--'}
        </span>
      </div>
    </div>
  )
}
