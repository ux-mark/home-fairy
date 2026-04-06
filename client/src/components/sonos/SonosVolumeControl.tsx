import { useCallback, useEffect, useRef } from 'react'
import { useState } from 'react'
import * as Slider from '@radix-ui/react-slider'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SonosVolumeControlProps {
  /** Current volume level 0–100 (server-authoritative) */
  value: number
  /** Called with the final level on pointer-up / touch-end */
  onChange: (level: number) => void
  /** Optional real-time drag callback for parent display updates */
  onDragChange?: (level: number) => void
  /** Accessible label (e.g. "Living Room volume") */
  label: string
  /** Additional className for the root element */
  className?: string
  /** Whether the control is disabled */
  disabled?: boolean
  /** Called on first pointer/touch interaction with the slider */
  onInteractionStart?: () => void
  /** Show a spinner in the thumb while a volume change is processing */
  loading?: boolean
}

/**
 * Horizontal volume slider using Radix Slider.
 *
 * Manages its own internal drag state so the thumb tracks the finger
 * at 60 fps with zero lag on mobile (Safari, Chrome, Firefox).
 *
 * - onValueChange  → updates local dragValue instantly (no debounce)
 * - onValueCommit  → fires parent onChange once on pointer-up / touch-end,
 *                    then clears the override so the next server value shows
 * - While dragValue is set, incoming `value` prop changes are silently
 *   ignored, so server refetches cannot snap the thumb mid-gesture.
 *
 * Keyboard: arrow keys ±1, Page Up/Down ±10.
 */
export function SonosVolumeControl({
  value,
  onChange,
  onDragChange,
  label,
  className,
  disabled = false,
  onInteractionStart,
  loading = false,
}: SonosVolumeControlProps) {
  // null means "use server value"; non-null means "user is dragging"
  const [dragValue, setDragValue] = useState<number | null>(null)
  // Holds the committed value after pointer-up until the server catches up
  const [optimisticValue, setOptimisticValue] = useState<number | null>(null)
  const prevValueRef = useRef(value)
  const interactionFired = useRef(false)

  // Clear optimistic override when the server value changes (success or failure)
  useEffect(() => {
    if (value !== prevValueRef.current) {
      prevValueRef.current = value
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOptimisticValue(null)
    }
  }, [value])

  const displayValue = dragValue ?? optimisticValue ?? value

  const handleValueChange = useCallback(
    (vals: number[]) => {
      const next = vals[0]
      setDragValue(next)
      onDragChange?.(next)
      if (!interactionFired.current && onInteractionStart) {
        interactionFired.current = true
        onInteractionStart()
      }
    },
    [onDragChange, onInteractionStart],
  )

  const handleValueCommit = useCallback(
    (vals: number[]) => {
      const committed = vals[0]
      setDragValue(null)
      setOptimisticValue(committed)
      onChange(committed)
      // Reset so next interaction can re-trigger
      interactionFired.current = false
    },
    [onChange],
  )

  return (
    <div
      className={cn('flex items-center gap-3', className)}
      // Prevent text selection and long-press popups on iOS Safari during drag
      style={{ userSelect: 'none', WebkitTouchCallout: 'none' } as React.CSSProperties}
    >
      <Slider.Root
        className={cn(
          'relative flex w-full flex-1 touch-none select-none items-center',
          'focus-within:outline-none',
          disabled && 'opacity-50',
        )}
        min={0}
        max={100}
        step={1}
        value={[displayValue]}
        onValueChange={handleValueChange}
        onValueCommit={handleValueCommit}
        disabled={disabled}
        aria-label={label}
      >
        <Slider.Track className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
          <Slider.Range className="absolute h-full bg-fairy-500" />
        </Slider.Track>
        <Slider.Thumb
          className={cn(
            'relative flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-md ring-2 ring-fairy-500/50',
            'before:absolute before:inset-[-8px] before:content-[""]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            'transition-shadow hover:ring-fairy-500',
            loading ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
          )}
          style={{ willChange: 'transform', transform: 'translateZ(0)' }}
          aria-label={label}
        >
          {loading && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-fairy-500" aria-hidden="true" />
          )}
        </Slider.Thumb>
      </Slider.Root>

      <span
        className="w-9 shrink-0 text-right text-xs tabular-nums text-caption"
        aria-live="polite"
        aria-atomic="true"
      >
        {displayValue}%
      </span>
    </div>
  )
}
