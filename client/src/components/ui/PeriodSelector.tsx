import { FilterChip } from '@/components/ui/FilterChip'

export type Period = '24h' | '7d' | '30d' | '90d' | '1y'

export const PERIODS: { value: Period; label: string }[] = [
  { value: '24h', label: '1d' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: '1y', label: '1y' },
]

interface PeriodSelectorProps {
  value: Period
  onChange: (period: Period) => void
  /** Subset of periods to show (defaults to all) */
  periods?: Period[]
}

export function PeriodSelector({ value, onChange, periods }: PeriodSelectorProps) {
  const items = periods
    ? PERIODS.filter(p => periods.includes(p.value))
    : PERIODS

  return (
    <div className="flex gap-1" role="tablist" aria-label="Select time period">
      {items.map(p => (
        <FilterChip
          key={p.value}
          label={p.label}
          active={value === p.value}
          onClick={() => onChange(p.value)}
        />
      ))}
    </div>
  )
}
