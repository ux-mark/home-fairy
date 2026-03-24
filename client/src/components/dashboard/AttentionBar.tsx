import { useState } from 'react'
import { AlertTriangle, AlertCircle, Info } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import type { AttentionItem } from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AttentionBarProps {
  items: AttentionItem[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<AttentionItem['severity'], number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

function sortBySeverity(items: AttentionItem[]): AttentionItem[] {
  return [...items].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  )
}

// ── Attention item card ───────────────────────────────────────────────────────

interface ItemCardProps {
  item: AttentionItem
}

function ItemCard({ item }: ItemCardProps) {
  const isCritical = item.severity === 'critical'

  // Border colour by severity — always paired with icon so colour is not sole indicator
  const borderClass = {
    critical: 'border-l-red-500',
    warning: 'border-l-amber-500',
    info: 'border-l-blue-500',
  }[item.severity]

  // Icon and its colour by severity
  const iconProps = {
    critical: {
      Icon: AlertTriangle,
      className: 'h-5 w-5 shrink-0 text-red-400',
      label: 'Critical alert',
    },
    warning: {
      Icon: AlertCircle,
      className: 'h-5 w-5 shrink-0 text-amber-400',
      label: 'Warning',
    },
    info: {
      Icon: Info,
      className: 'h-5 w-5 shrink-0 text-blue-400',
      label: 'Information',
    },
  }[item.severity]

  const { Icon, className: iconClass, label: iconLabel } = iconProps

  return (
    <li
      role={isCritical ? 'alert' : 'status'}
      aria-label={`${iconLabel}: ${item.title}`}
      className={cn(
        'card rounded-xl p-4 flex items-start gap-3',
        'border-l-4',
        borderClass,
      )}
    >
      {/* Severity icon — paired with title text so colour is not the sole indicator */}
      <Icon
        className={cn('mt-0.5', iconClass)}
        aria-hidden="true"
      />

      {/* Message */}
      <div className="min-w-0 flex-1">
        <p className="text-heading text-sm font-medium leading-snug">
          {item.title}
        </p>
        <p className="text-caption mt-0.5 text-xs leading-snug">
          {item.description}
        </p>
      </div>

      {/* Device link — only when a deviceId is present */}
      {item.deviceId !== null && (
        <Link
          to={`/devices/${item.deviceId}`}
          aria-label={`View device: ${item.deviceLabel ?? 'device'}`}
          className={cn(
            'shrink-0 text-sm text-fairy-400',
            'hover:bg-fairy-500/10 rounded-lg px-3 py-2',
            'min-h-[44px] flex items-center transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
        >
          View device
        </Link>
      )}
    </li>
  )
}

// ── AttentionBar ──────────────────────────────────────────────────────────────

const INITIAL_VISIBLE = 5

/**
 * Stacked list of attention items (critical, warning, info).
 * Returns null when items is empty — absence means everything is fine.
 */
export default function AttentionBar({ items }: AttentionBarProps) {
  const [expanded, setExpanded] = useState(false)

  // Nothing to show — silence is the success state here
  if (items.length === 0) return null

  const sorted = sortBySeverity(items)
  const hasMore = sorted.length > INITIAL_VISIBLE
  const visible = expanded ? sorted : sorted.slice(0, INITIAL_VISIBLE)
  const hiddenCount = sorted.length - INITIAL_VISIBLE

  return (
    <section aria-label="Items requiring attention">
      <ul role="list" className="space-y-2">
        {visible.map(item => (
          <ItemCard key={item.id} item={item} />
        ))}
      </ul>

      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded(prev => !prev)}
          aria-expanded={expanded}
          className={cn(
            'mt-2 w-full rounded-lg px-3 py-2 text-sm font-medium',
            'text-body hover:bg-[var(--bg-tertiary)] transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            'min-h-[44px] flex items-center justify-center',
          )}
        >
          {expanded
            ? 'Show fewer items'
            : `Show ${hiddenCount} more ${hiddenCount === 1 ? 'item' : 'items'}`}
        </button>
      )}
    </section>
  )
}
