import { Speaker } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SpeakerSelectorProps {
  speakers: Array<{ name: string }>
  selectedSpeaker: string
  onSpeakerChange: (name: string) => void
  className?: string
}

/**
 * Dropdown to switch between Sonos speakers in the Now Playing view.
 * Uses a native select for simplicity and maximum compatibility.
 */
export function SpeakerSelector({
  speakers,
  selectedSpeaker,
  onSpeakerChange,
  className,
}: SpeakerSelectorProps) {
  if (speakers.length === 0) return null

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Speaker className="h-4 w-4 shrink-0 text-caption" aria-hidden="true" />
      <label htmlFor="speaker-selector" className="sr-only">
        Select speaker
      </label>
      <select
        id="speaker-selector"
        value={selectedSpeaker}
        onChange={e => onSpeakerChange(e.target.value)}
        className={cn(
          'min-h-[44px] flex-1 rounded-lg px-3 py-2 text-sm font-medium',
          'bg-[var(--bg-secondary)] text-body',
          'border border-[var(--border-primary)]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          'cursor-pointer',
        )}
      >
        {speakers.map(s => (
          <option key={s.name} value={s.name}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  )
}
