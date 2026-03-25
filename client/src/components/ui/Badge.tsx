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
  // Kasa device types — all share teal
  kasa_plug: 'bg-teal-500/15 text-teal-400',
  kasa_strip: 'bg-teal-500/15 text-teal-400',
  kasa_outlet: 'bg-teal-500/15 text-teal-400',
  kasa_switch: 'bg-teal-500/15 text-teal-400',
  kasa_dimmer: 'bg-teal-500/15 text-teal-400',
  plug: 'bg-teal-500/15 text-teal-400',
  strip: 'bg-teal-500/15 text-teal-400',
  outlet: 'bg-teal-500/15 text-teal-400',
}

/** Human-readable labels for device types. Used when no explicit label is passed. */
const typeLabels: Record<string, string> = {
  lifx: 'Light',
  switch: 'Switch',
  dimmer: 'Dimmer',
  sensor: 'Sensor',
  contact: 'Contact',
  twinkly: 'Twinkly',
  fairy: 'Fairy',
  motion: 'Motion',
  unknown: 'Device',
  // Kasa types — all shown as "Kasa plug" to the user
  kasa_plug: 'Kasa plug',
  kasa_strip: 'Kasa plug',
  kasa_outlet: 'Kasa plug',
  kasa_switch: 'Kasa plug',
  kasa_dimmer: 'Kasa plug',
  plug: 'Kasa plug',
  strip: 'Kasa plug',
  outlet: 'Kasa plug',
}

interface TypeBadgeProps {
  /** The device type key (lifx, switch, dimmer, kasa_plug, etc.) */
  type: string
  /** Override the display label (defaults to a human-readable name derived from the type) */
  label?: string
}

export function TypeBadge({ type, label }: TypeBadgeProps) {
  const key = type.toLowerCase()
  const cls = typeColors[key] ?? 'bg-slate-500/15 text-slate-400'
  const display = label ?? typeLabels[key] ?? type.replace(/_/g, ' ')
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
