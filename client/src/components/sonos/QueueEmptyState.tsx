import { Music, Music2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGoToBrowseResumed } from '@/hooks/useGoToBrowseResumed'

// ── Props ─────────────────────────────────────────────────────────────────────

interface QueueEmptyStateProps {
  speaker: string
  /** Compact variant for InlineQueue */
  compact?: boolean
}

// ── QueueEmptyState ───────────────────────────────────────────────────────────

export function QueueEmptyState({ speaker, compact = false }: QueueEmptyStateProps) {
  const goToBrowseResumed = useGoToBrowseResumed()

  function handleBrowse() {
    goToBrowseResumed(speaker)
  }

  if (compact) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center px-4">
        <Music2 className="h-8 w-8 text-slate-500" aria-hidden="true" />
        <div>
          <p className="text-xs font-semibold text-heading">Queue is empty</p>
          <p className="mt-0.5 text-xs text-caption">Start playing music to build a queue.</p>
        </div>
        <button
          onClick={handleBrowse}
          className={cn(
            'flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors',
            'surface text-body hover:brightness-95 dark:hover:brightness-110',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
          aria-label="Browse music"
        >
          <Music className="h-4 w-4 shrink-0" aria-hidden="true" />
          Browse music
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center gap-5 py-20 text-center px-8">
      {/* Illustration */}
      <div className="relative">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-800/60">
          <Music2 className="h-9 w-9 text-slate-500" aria-hidden="true" />
        </div>
        {/* Decorative ring */}
        <div className="absolute inset-[-6px] rounded-full border border-slate-700/40" aria-hidden="true" />
      </div>

      <div>
        <p className="text-base font-semibold text-heading">Nothing in the queue</p>
        <p className="mt-1.5 text-sm text-caption leading-relaxed">
          Add music from Browse or tap any album to start a queue.
        </p>
      </div>

      <button
        onClick={handleBrowse}
        className={cn(
          'flex min-h-[44px] items-center gap-2.5 rounded-xl px-5 py-2.5 text-sm font-medium transition-colors',
          'bg-fairy-500/15 text-fairy-400 hover:bg-fairy-500/25 hover:text-fairy-300',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
        )}
        aria-label="Browse music"
      >
        <Music className="h-4 w-4 shrink-0" aria-hidden="true" />
        Browse music
      </button>
    </div>
  )
}
