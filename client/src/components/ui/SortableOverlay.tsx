import { useEffect, useRef } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SortableOverlayProps {
  open: boolean
  onClose: () => void
  onDone: () => void
  isSaving: boolean
  title: string
  children: React.ReactNode
}

// ── Shared overlay shell ──────────────────────────────────────────────────────

/**
 * A reusable slide-up panel that handles:
 * - Fixed position backdrop + panel animation
 * - Focus trapping and Escape-to-close
 * - Cancel / Done header bar
 *
 * Children provide the actual sortable content.
 */
export function SortableOverlay({
  open,
  onClose,
  onDone,
  isSaving,
  title,
  children,
}: SortableOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null)

  // Move focus into the overlay when it opens
  useEffect(() => {
    if (open) {
      const id = setTimeout(() => cancelBtnRef.current?.focus(), 50)
      return () => clearTimeout(id)
    }
  }, [open])

  // Keyboard: Escape closes, Tab traps focus within the overlay
  useEffect(() => {
    if (!open) return
    const el = overlayRef.current
    if (!el) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const focusable = el!.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        className={[
          'fixed inset-0 z-40 bg-black/60 transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none',
        ].join(' ')}
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Slide-up panel */}
      <div
        ref={overlayRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={[
          'fixed inset-x-0 bottom-0 z-50 flex flex-col transition-transform duration-300 ease-out',
          'max-h-[calc(100dvh-4rem)]',
          open ? 'translate-y-0' : 'translate-y-full',
        ].join(' ')}
        style={{ borderRadius: '1rem 1rem 0 0', background: 'var(--bg-secondary)' }}
      >
        {/* Header bar */}
        <div
          className="flex shrink-0 items-center justify-between border-b px-4 py-3"
          style={{ borderColor: 'var(--border-secondary)' }}
        >
          <button
            ref={cancelBtnRef}
            onClick={onClose}
            disabled={isSaving}
            className="min-h-[44px] min-w-[44px] text-sm text-slate-400 hover:text-slate-300 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 disabled:opacity-50"
          >
            Cancel
          </button>

          <h2 className="text-sm font-semibold text-heading">{title}</h2>

          <button
            onClick={onDone}
            disabled={isSaving}
            className="min-h-[44px] min-w-[44px] text-sm font-semibold text-fairy-400 hover:text-fairy-300 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Done'}
          </button>
        </div>

        {/* Scrollable content area */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {children}
        </div>
      </div>
    </>
  )
}

