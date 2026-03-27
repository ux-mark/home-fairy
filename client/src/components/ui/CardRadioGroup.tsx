import type { ElementType } from 'react'
import { cn } from '@/lib/utils'

export interface CardRadioOption {
  value: string
  label: string
  description?: string
  icon: ElementType
}

interface CardRadioGroupProps {
  options: CardRadioOption[]
  value: string
  onChange: (value: string) => void
  /** Used to group related radio cards accessibly */
  name: string
  'aria-label'?: string
}

export function CardRadioGroup({
  options,
  value,
  onChange,
  name,
  'aria-label': ariaLabel,
}: CardRadioGroupProps) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel ?? name}
      className="space-y-2"
    >
      {options.map(option => {
        const isSelected = value === option.value
        const Icon = option.icon
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            data-name={name}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
              'min-h-[44px]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              isSelected
                ? 'border-fairy-500 bg-fairy-500/10'
                : 'border-[var(--border-secondary)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]',
            )}
          >
            {/* Icon container */}
            <span
              aria-hidden="true"
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                isSelected
                  ? 'bg-fairy-500/20'
                  : 'bg-[var(--bg-tertiary)]',
              )}
            >
              <Icon
                className={cn(
                  'h-4 w-4',
                  isSelected ? 'text-fairy-400' : 'text-caption',
                )}
              />
            </span>

            {/* Label and description */}
            <span className="flex flex-col">
              <span className="text-sm font-medium text-heading">{option.label}</span>
              {option.description && (
                <span className="mt-0.5 text-xs text-caption">{option.description}</span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
