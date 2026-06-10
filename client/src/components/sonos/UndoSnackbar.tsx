import { cn } from '@/lib/utils'

// ── UndoSnackbar ──────────────────────────────────────────────────────────────
// Pill snackbar shown while an undoable queue action is pending. Positioning
// is the caller's job via className (absolute in QueueView, fixed elsewhere).

export function UndoSnackbar({
  label,
  onUndo,
  className,
}: {
  label: string
  onUndo: () => void
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-full px-4 py-2.5 shadow-lg',
        'bg-slate-800 border border-slate-700',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <span className="text-sm text-slate-200 whitespace-nowrap">{label}</span>
      <button
        onClick={onUndo}
        className="text-sm font-semibold text-fairy-400 hover:text-fairy-300 transition-colors focus-visible:outline-2 focus-visible:outline-fairy-500 rounded"
      >
        Undo
      </button>
    </div>
  )
}
