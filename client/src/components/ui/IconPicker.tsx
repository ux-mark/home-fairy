import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LucideIcon, ICON_CATEGORIES } from './LucideIcon'

interface IconPickerProps {
  /** Currently selected icon name (kebab-case) */
  value: string | null
  /** Called when the user selects an icon */
  onChange: (iconName: string) => void
  /** Called when the picker should close */
  onClose: () => void
}

export function IconPicker({ value, onChange, onClose }: IconPickerProps) {
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Focus search input on mount
  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  const query = search.toLowerCase().trim()

  // Filter categories and icons by search query
  const filteredCategories = ICON_CATEGORIES
    .map(category => ({
      ...category,
      icons: category.icons.filter(icon => {
        if (!query) return true
        return (
          icon.name.includes(query) ||
          icon.keywords.some(kw => kw.includes(query))
        )
      }),
    }))
    .filter(category => category.icons.length > 0)

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Choose an icon"
      className="card w-72 rounded-xl border shadow-xl"
    >
      {/* Search input */}
      <div className="relative border-b border-[var(--border-secondary)] px-3 py-2">
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search icons..."
          aria-label="Search icons"
          className="w-full bg-transparent py-1 pr-6 text-sm text-heading placeholder:text-caption outline-none"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-caption hover:text-heading"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Icon grid */}
      <div className="max-h-64 overflow-y-auto p-3">
        {filteredCategories.length === 0 ? (
          <p className="py-4 text-center text-sm text-caption">No icons match your search</p>
        ) : (
          <div className="space-y-3">
            {filteredCategories.map(category => (
              <div key={category.label}>
                <p className="mb-1.5 text-[11px] font-semibold text-caption">
                  {category.label}
                </p>
                <div className="grid grid-cols-6 gap-1">
                  {category.icons.map(icon => (
                    <button
                      key={icon.name}
                      type="button"
                      onClick={() => {
                        onChange(icon.name)
                        onClose()
                      }}
                      aria-label={icon.name.replace(/-/g, ' ')}
                      title={icon.name.replace(/-/g, ' ')}
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                        'hover:bg-fairy-500/15 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-fairy-500',
                        value === icon.name
                          ? 'bg-fairy-500/20 text-fairy-400 ring-1 ring-fairy-500/40'
                          : 'text-body',
                      )}
                    >
                      <LucideIcon name={icon.name} className="h-5 w-5" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
