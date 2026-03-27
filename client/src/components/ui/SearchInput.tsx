import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Optional match summary text shown below the input */
  matchSummary?: string
  /** Make the search bar sticky at the top */
  sticky?: boolean
  /** Additional className for the wrapper */
  className?: string
  /** aria-label for the input */
  label?: string
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  matchSummary,
  sticky = false,
  className,
  label,
}: SearchInputProps) {
  return (
    <div className={cn(sticky && 'sticky top-0 z-10 pb-3 pt-1 chrome', className)}>
      <div className="relative">
        <Search
          className="text-caption absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
          aria-hidden="true"
        />
        <input
          type="search"
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          aria-label={label ?? placeholder}
          className="input-field h-11 w-full rounded-lg border pl-10 pr-10 text-sm placeholder:text-[var(--text-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-md text-caption hover:text-heading transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {matchSummary && value.trim() && (
        <p className="mt-1.5 text-[11px] text-caption">{matchSummary}</p>
      )}
    </div>
  )
}
