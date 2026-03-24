import { cn } from '@/lib/utils'

// ── Device/entity type badge ────────────────────────────────────────────────

const typeColors: Record<string, string> = {
  lifx: 'bg-amber-500/15 text-amber-400',
  switch: 'bg-blue-500/15 text-blue-400',
  dimmer: 'bg-purple-500/15 text-purple-400',
  sensor: 'bg-cyan-500/15 text-cyan-400',
  contact: 'bg-amber-500/15 text-amber-400',
  twinkly: 'bg-pink-500/15 text-pink-400',
  fairy: 'bg-cyan-500/15 text-cyan-400',
  motion: 'bg-green-500/15 text-green-400',
}

interface TypeBadgeProps {
  /** The device type key (lifx, switch, dimmer, etc.) */
  type: string
  /** Override the display label (defaults to the type string, with "lifx" → "Light") */
  label?: string
}

export function TypeBadge({ type, label }: TypeBadgeProps) {
  const cls = typeColors[type.toLowerCase()] ?? 'bg-slate-500/15 text-slate-400'
  const display = label ?? (type.toLowerCase() === 'lifx' ? 'Light' : type)
  return (
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold', cls)}>
      {display}
    </span>
  )
}

// ── Count badge ─────────────────────────────────────────────────────────────

interface CountBadgeProps {
  count: number
  /** Style variant */
  variant?: 'default' | 'fairy' | 'active'
}

export function CountBadge({ count, variant = 'default' }: CountBadgeProps) {
  if (count <= 0) return null
  return (
    <span
      className={cn(
        'rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none',
        variant === 'fairy' && 'bg-fairy-500/15 text-fairy-400',
        variant === 'active' && 'bg-white/20',
        variant === 'default' && 'surface text-caption',
      )}
    >
      {count}
    </span>
  )
}
