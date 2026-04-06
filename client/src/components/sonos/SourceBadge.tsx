import { cn } from '@/lib/utils'

const SOURCE_STYLES: Record<string, { label: string; className: string }> = {
  sonos: { label: 'Sonos', className: 'bg-purple-500/15 text-purple-400' },
  spotify: { label: 'Spotify', className: 'bg-emerald-500/15 text-emerald-400' },
  nas: { label: 'NAS', className: 'bg-blue-500/15 text-blue-400' },
  radio: { label: 'Radio', className: 'bg-amber-500/15 text-amber-400' },
}

interface SourceBadgeProps {
  source: string
  className?: string
}

export function SourceBadge({ source, className }: SourceBadgeProps) {
  const style = SOURCE_STYLES[source] ?? { label: source, className: 'bg-[var(--bg-tertiary)] text-caption' }
  return (
    <span
      className={cn(
        'inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        style.className,
        className,
      )}
    >
      {style.label}
    </span>
  )
}
