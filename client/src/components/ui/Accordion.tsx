import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AccordionProps {
  /** Unique ID prefix for a11y attributes */
  id: string
  /** Title shown in the header — accepts a string or a ReactNode (e.g. icon + text) */
  title: React.ReactNode
  /** Whether the accordion is currently open */
  open: boolean
  /** Toggle callback */
  onToggle: () => void
  /** Optional count badge shown next to the title */
  count?: number
  /** Wrap in a card container (default: true) */
  card?: boolean
  /** Optional trailing content in the header (e.g. action buttons, badges) */
  trailing?: React.ReactNode
  /** Content rendered inside the collapsible body */
  children: React.ReactNode
}

export function Accordion({
  id,
  title,
  open,
  onToggle,
  count,
  card = true,
  trailing,
  children,
}: AccordionProps) {
  const headingId = `${id}-heading`
  const panelId = `${id}-panel`

  return (
    <div className={card ? 'card rounded-xl border' : undefined}>
      <button
        id={headingId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className={cn(
          'flex w-full min-h-[44px] items-center justify-between gap-3 px-4 py-3 text-left transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          card && 'rounded-xl hover:bg-white/5',
          !card && !open && 'border-b border-[var(--border-secondary)]',
        )}
      >
        <span className="flex items-center gap-2">
          <span className="text-heading text-sm font-semibold">{title}</span>
          {count !== undefined && count > 0 && (
            <span className="rounded-full bg-fairy-500/15 px-2 py-0.5 text-[10px] font-bold text-fairy-400">
              {count}
            </span>
          )}
          {trailing}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-[var(--text-secondary)] transition-transform duration-300',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      <div
        id={panelId}
        role="region"
        aria-labelledby={headingId}
        className="grid transition-all duration-300"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className={cn(card ? 'px-4 pb-4' : 'pb-4')}>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
