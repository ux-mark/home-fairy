import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

export interface PillSelectOption {
  value: string
  label: string
  /** Lucide icon name — reserved for future use with mode/room icons */
  icon?: string
}

interface PillSelectProps {
  options: PillSelectOption[]
  value: string
  onChange: (value: string) => void
  id: string
  /** Shown as first unselected pill; clicking it resets value to '' */
  placeholder?: string
  'aria-label'?: string
}

export function PillSelect({
  options,
  value,
  onChange,
  id,
  placeholder,
  'aria-label': ariaLabel,
}: PillSelectProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Scroll the selected pill into view on mount and when value changes
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const selectedId = value ? `${id}-option-${value}` : `${id}-option-placeholder`
    const selected = container.querySelector(`#${CSS.escape(selectedId)}`) as HTMLElement | null
    if (selected) {
      selected.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
    }
  }, [id, value])

  return (
    <div
      ref={containerRef}
      id={id}
      role="listbox"
      aria-label={ariaLabel}
      aria-activedescendant={value ? `${id}-option-${value}` : undefined}
      className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    >
      {placeholder !== undefined && (
        <button
          id={`${id}-option-placeholder`}
          key="placeholder"
          type="button"
          role="option"
          aria-selected={value === ''}
          onClick={() => onChange('')}
          className={cn(
            'inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
            'min-h-[44px] min-w-[44px]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            value === ''
              ? 'bg-fairy-500 text-white'
              : 'bg-[var(--bg-tertiary)] text-caption hover:bg-[var(--bg-secondary)]',
          )}
        >
          {placeholder}
        </button>
      )}

      {options.map(option => {
        const isSelected = value === option.value
        return (
          <button
            id={`${id}-option-${option.value}`}
            key={option.value}
            type="button"
            role="option"
            aria-selected={isSelected}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              'min-h-[44px] min-w-[44px]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              isSelected
                ? 'bg-fairy-500 text-white'
                : 'bg-[var(--bg-tertiary)] text-caption hover:bg-[var(--bg-secondary)]',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
