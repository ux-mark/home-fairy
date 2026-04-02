import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { SearchInput } from './SearchInput'

export interface SearchableSelectOption {
  value: string
  label: string
}

interface SearchableSelectProps {
  options: SearchableSelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  emptyMessage?: string
  id: string
  'aria-label'?: string
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Search...',
  emptyMessage = 'No matches found',
  id,
  'aria-label': ariaLabel,
}: SearchableSelectProps) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return options
    const q = search.toLowerCase()
    return options.filter(o => o.label.toLowerCase().includes(q))
  }, [options, search])

  return (
    <div className="space-y-2">
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder={placeholder}
        label={ariaLabel ?? placeholder}
      />

      <div
        id={id}
        role="listbox"
        aria-label={ariaLabel}
        aria-activedescendant={value ? `${id}-item-${value}` : undefined}
        className="overflow-y-auto rounded-lg border border-[var(--border-secondary)]"
        style={{ maxHeight: '240px' }}
      >
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-caption">
            {emptyMessage}
          </div>
        ) : (
          filtered.map(option => {
            const isSelected = value === option.value
            return (
              <button
                id={`${id}-item-${option.value}`}
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => onChange(option.value)}
                className={cn(
                  'flex w-full items-center gap-3 px-3 text-left transition-colors',
                  'min-h-[44px]',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                  isSelected
                    ? 'border-l-2 border-fairy-500 bg-fairy-500/10 pl-[10px]'
                    : 'border-l-2 border-transparent hover:bg-[var(--bg-tertiary)]',
                )}
              >
                <span className="text-sm text-body">{option.label}</span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
