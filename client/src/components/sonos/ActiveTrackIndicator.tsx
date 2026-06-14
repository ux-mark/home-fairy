import { cn } from '@/lib/utils'

interface ActiveTrackIndicatorProps {
  isActive: boolean
  isPlaying: boolean
  className?: string
}

/**
 * Animated equalizer bars shown next to the currently playing track.
 * Returns null when not active to keep DOM clean.
 */
export function ActiveTrackIndicator({ isActive, isPlaying, className }: ActiveTrackIndicatorProps) {
  if (!isActive) return null

  return (
    <div
      className={cn('flex items-end gap-[2px] h-4 w-4 shrink-0', className)}
      aria-label="Currently playing"
      role="img"
    >
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className={cn(
            'block w-[3px] rounded-full bg-fairy-400 transition-none',
            isPlaying ? 'animate-equalizer' : 'h-[4px]',
          )}
          style={isPlaying ? { animationDelay: `${i * 0.2}s` } : undefined}
        />
      ))}
    </div>
  )
}
