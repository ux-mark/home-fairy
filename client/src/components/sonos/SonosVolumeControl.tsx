import { useCallback, useRef } from 'react'
import * as Slider from '@radix-ui/react-slider'
import { cn } from '@/lib/utils'

interface SonosVolumeControlProps {
  /** Current volume level 0–100 */
  value: number
  /** Called with the new level after debounce */
  onChange: (level: number) => void
  /** Whether an API call is in flight */
  isPending?: boolean
  /** Accessible label (e.g. "Living Room volume") */
  label: string
  /** Additional className for the root element */
  className?: string
  /** Whether the control is disabled */
  disabled?: boolean
}

const DEBOUNCE_MS = 300

/**
 * Horizontal volume slider using Radix Slider.
 * Debounces onChange by 300ms to avoid spamming the Sonos API while dragging.
 * Keyboard: arrow keys ±1, Page Up/Down ±10.
 */
export function SonosVolumeControl({
  value,
  onChange,
  isPending = false,
  label,
  className,
  disabled = false,
}: SonosVolumeControlProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleValueChange = useCallback(
    (vals: number[]) => {
      const next = vals[0]
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        onChange(next)
      }, DEBOUNCE_MS)
    },
    [onChange],
  )

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Slider.Root
        className={cn(
          'relative flex flex-1 touch-none select-none items-center',
          'focus-within:outline-none',
          (disabled || isPending) && 'opacity-50',
        )}
        min={0}
        max={100}
        step={1}
        value={[value]}
        onValueChange={handleValueChange}
        disabled={disabled || isPending}
        aria-label={label}
      >
        <Slider.Track className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
          <Slider.Range className="absolute h-full bg-fairy-500" />
        </Slider.Track>
        <Slider.Thumb
          className={cn(
            'relative block h-7 w-7 rounded-full bg-white shadow-md ring-2 ring-fairy-500/50',
            'before:absolute before:inset-[-8px] before:content-[""]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            'transition-shadow hover:ring-fairy-500',
            'cursor-grab active:cursor-grabbing',
          )}
          aria-label={label}
        />
      </Slider.Root>
      <span
        className="w-9 shrink-0 text-right text-xs tabular-nums text-caption"
        aria-live="polite"
        aria-atomic="true"
      >
        {value}%
      </span>
    </div>
  )
}
