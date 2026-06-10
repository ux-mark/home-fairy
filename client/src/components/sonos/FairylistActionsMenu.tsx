import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ListEnd, ListStart, MoreVertical, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── FairylistActionsMenu ──────────────────────────────────────────────────────
// Kebab menu for whole-Fairylist actions: add the entire list to the queue,
// play it next, or delete it. Used by FairylistAccordion rows and the
// FairylistDetail header. Follows the MusicItemMenu role=menu/menuitem pattern.

export interface FairylistActionsMenuProps {
  /** Fairylist name — used for aria-labels */
  name: string
  /** Disables "Add to queue" / "Play next" (e.g. no speaker selected) */
  queueDisabled: boolean
  onAddToQueue: () => void
  onPlayNext: () => void
  onDelete: () => void
  /** Class for the trigger button (size varies by context) */
  buttonClassName?: string
}

const menuItemCls =
  'flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-body transition-colors hover:bg-[var(--bg-tertiary)] hover:text-heading disabled:opacity-40 disabled:hover:bg-transparent'

const ESTIMATED_HEIGHT = 3 * 44 + 8

export function FairylistActionsMenu({
  name,
  queueDisabled,
  onAddToQueue,
  onPlayNext,
  onDelete,
  buttonClassName,
}: FairylistActionsMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const menuBtnRef = useRef<HTMLButtonElement>(null)

  const handleOpen = () => {
    if (menuOpen) {
      setMenuOpen(false)
      return
    }
    if (menuBtnRef.current) {
      const rect = menuBtnRef.current.getBoundingClientRect()
      const showAbove = rect.bottom + ESTIMATED_HEIGHT > window.innerHeight
      setMenuPos({
        top: showAbove ? rect.top - ESTIMATED_HEIGHT - 4 : rect.bottom + 4,
        right: window.innerWidth - rect.right,
      })
    }
    setMenuOpen(true)
  }

  return (
    <div className="shrink-0">
      <button
        ref={menuBtnRef}
        type="button"
        onClick={handleOpen}
        onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
        aria-label={`More options for ${name}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className={cn(
          'flex items-center justify-center rounded-lg',
          'text-caption transition-colors hover:bg-[var(--bg-tertiary)] hover:text-body',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          buttonClassName ?? 'h-10 w-10',
        )}
      >
        <MoreVertical className="h-4 w-4" aria-hidden="true" />
      </button>

      {menuOpen &&
        menuPos &&
        createPortal(
          <ul
            role="menu"
            style={{ position: 'fixed', top: menuPos.top, right: menuPos.right }}
            className="z-[200] min-w-[200px] overflow-hidden rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] py-1 shadow-lg"
          >
            <li role="none">
              <button
                role="menuitem"
                disabled={queueDisabled}
                aria-label={`Add ${name} to queue`}
                onClick={() => {
                  setMenuOpen(false)
                  onAddToQueue()
                }}
                className={menuItemCls}
              >
                <ListEnd className="h-4 w-4 shrink-0" aria-hidden="true" />
                Add to queue
              </button>
            </li>
            <li role="none">
              <button
                role="menuitem"
                disabled={queueDisabled}
                aria-label={`Play ${name} next`}
                onClick={() => {
                  setMenuOpen(false)
                  onPlayNext()
                }}
                className={menuItemCls}
              >
                <ListStart className="h-4 w-4 shrink-0" aria-hidden="true" />
                Play next
              </button>
            </li>
            <li role="none">
              <button
                role="menuitem"
                aria-label={`Delete ${name}`}
                onClick={() => {
                  setMenuOpen(false)
                  onDelete()
                }}
                className={cn(menuItemCls, 'text-red-400 hover:text-red-300')}
              >
                <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                Delete
              </button>
            </li>
          </ul>,
          document.body,
        )}
    </div>
  )
}
