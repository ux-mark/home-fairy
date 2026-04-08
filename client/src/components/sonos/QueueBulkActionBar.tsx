import { Heart, ListStart, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Props ─────────────────────────────────────────────────────────────────────

interface QueueBulkActionBarProps {
  selectedCount: number
  totalCount: number
  onPlayNext: () => void
  onRemove: () => void
  onAddToFavourites: () => void
  onSelectAll: () => void
  onCancel: () => void
  isRemoving: boolean
}

// ── QueueBulkActionBar ────────────────────────────────────────────────────────

export function QueueBulkActionBar({
  selectedCount,
  totalCount,
  onPlayNext,
  onRemove,
  onAddToFavourites,
  onSelectAll,
  onCancel,
  isRemoving,
}: QueueBulkActionBarProps) {
  const allSelected = selectedCount === totalCount

  return (
    <div
      className={cn(
        'sticky bottom-0 z-20 border-t bg-[var(--bg-secondary)] shadow-[0_-4px_24px_rgba(0,0,0,0.4)]',
        'border-[var(--border-primary)]',
      )}
      role="toolbar"
      aria-label="Bulk actions"
    >
      {/* Selection summary + cancel */}
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-sm font-medium text-heading">
          {selectedCount === 0
            ? 'Select tracks'
            : `${selectedCount} selected`}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onSelectAll}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              'text-fairy-400 hover:text-fairy-300',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            )}
          >
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
          <button
            onClick={onCancel}
            aria-label="Exit multi-select mode"
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg text-caption transition-colors',
              'hover:bg-[var(--bg-tertiary)] hover:text-body',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            )}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-3 divide-x divide-[var(--border-secondary)] border-t border-[var(--border-secondary)]">
        <button
          onClick={onPlayNext}
          disabled={selectedCount === 0}
          className={cn(
            'flex flex-col items-center gap-1.5 py-3 text-[11px] font-medium transition-colors',
            'text-fairy-400 hover:bg-fairy-500/10 disabled:opacity-40 disabled:cursor-not-allowed',
            'focus-visible:outline-2 focus-visible:outline-fairy-500',
          )}
          aria-label={`Play ${selectedCount} selected tracks next`}
        >
          <ListStart className="h-4 w-4" aria-hidden="true" />
          Play next
        </button>

        <button
          onClick={onAddToFavourites}
          disabled={selectedCount === 0}
          className={cn(
            'flex flex-col items-center gap-1.5 py-3 text-[11px] font-medium transition-colors',
            'text-slate-400 hover:bg-[var(--bg-tertiary)] disabled:opacity-40 disabled:cursor-not-allowed',
            'focus-visible:outline-2 focus-visible:outline-fairy-500',
          )}
          aria-label={`Add ${selectedCount} selected tracks to favourites`}
        >
          <Heart className="h-4 w-4" aria-hidden="true" />
          Favourites
        </button>

        <button
          onClick={onRemove}
          disabled={selectedCount === 0 || isRemoving}
          className={cn(
            'flex flex-col items-center gap-1.5 py-3 text-[11px] font-medium transition-colors',
            'text-red-400 hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed',
            'focus-visible:outline-2 focus-visible:outline-fairy-500',
          )}
          aria-label={`Remove ${selectedCount} selected tracks from queue`}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Remove
        </button>
      </div>
    </div>
  )
}
