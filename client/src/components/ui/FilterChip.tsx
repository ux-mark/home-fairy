import { cn } from '@/lib/utils'

interface FilterChipProps {
  label: string
  active: boolean
  onClick: () => void
  /** Optional count shown as a badge inside the chip */
  count?: number
}

export function FilterChip({ label, active, onClick, count }: FilterChipProps) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors min-h-[44px]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
        active
          ? 'bg-fairy-500 text-white'
          : 'surface text-body hover:text-heading',
      )}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            'ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none',
            active ? 'bg-white/20' : 'bg-fairy-500/15 text-fairy-400',
          )}
        >
          {count}
        </span>
      )}
    </button>
  )
}
