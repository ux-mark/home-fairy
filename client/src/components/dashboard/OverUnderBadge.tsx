import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface OverUnderBadgeProps {
  /** Positive = above normal, negative = below normal. null = don't render. */
  percent: number | null
  /** Custom label text — overrides auto-generated text but keeps colour logic. */
  label?: string
  /** sm for inline use, md for standalone. Default: sm */
  size?: 'sm' | 'md'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface BadgeStyle {
  colorClass: string
  autoText: string
}

function resolveBadgeStyle(percent: number): BadgeStyle {
  const abs = Math.abs(percent)
  const isAbove = percent > 0

  if (abs < 5) {
    return {
      colorClass: 'bg-green-500/15 text-green-400',
      autoText: 'Normal',
    }
  }

  if (isAbove) {
    // Above normal
    if (abs <= 30) {
      return {
        colorClass: 'bg-amber-500/15 text-amber-400',
        autoText: `${Math.round(abs)}% above normal`,
      }
    }
    return {
      colorClass: 'bg-red-500/15 text-red-400',
      autoText: `${Math.round(abs)}% above normal`,
    }
  } else {
    // Below normal
    if (abs <= 30) {
      return {
        colorClass: 'bg-green-500/15 text-green-400',
        autoText: `${Math.round(abs)}% below normal`,
      }
    }
    return {
      colorClass: 'bg-blue-500/15 text-blue-400',
      autoText: `${Math.round(abs)}% below normal`,
    }
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Inline badge showing how a metric compares to its normal range.
 * Colour is always paired with text so it is never the sole indicator.
 */
export default function OverUnderBadge({
  percent,
  label,
  size = 'sm',
}: OverUnderBadgeProps) {
  // null percent → nothing to show
  if (percent === null) return null

  const { colorClass, autoText } = resolveBadgeStyle(percent)
  const displayText = label ?? autoText

  const sizeClass =
    size === 'md'
      ? 'px-2.5 py-0.5 text-xs'
      : 'px-2 py-0.5 text-[10px]'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        sizeClass,
        colorClass,
      )}
    >
      {displayText}
    </span>
  )
}
