import { useState, useMemo, useEffect, useRef } from 'react'
import { ListMusic, Radio, Disc3, Music, Folder, RotateCcw, ImageOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SonosFavourite } from '@/lib/api'

// ── Content type classification by URI prefix ────────────────────────────────

type ContentType = 'Radio' | 'Playlists' | 'Albums' | 'Tracks' | 'Other'

function getContentType(uri?: string): ContentType {
  if (!uri) return 'Other'

  if (uri.includes('spotify')) {
    const decoded = decodeURIComponent(uri).toLowerCase()
    if (decoded.includes('playlist')) return 'Playlists'
    if (decoded.includes('album')) return 'Albums'
    if (decoded.includes('track')) return 'Tracks'
    return 'Other'
  }

  if (uri.startsWith('x-sonosapi-stream:') || uri.startsWith('x-rincon-stream:')) return 'Radio'
  if (uri.startsWith('x-rincon-cpcontainer:')) return 'Playlists'

  return 'Other'
}

// ── Pill filter config ────────────────────────────────────────────────────────

const ALL_TYPES: ContentType[] = ['Radio', 'Playlists', 'Albums', 'Tracks', 'Other']

const TYPE_ICON: Record<ContentType | 'All', React.ElementType> = {
  All: ListMusic,
  Radio: Radio,
  Playlists: ListMusic,
  Albums: Disc3,
  Tracks: Music,
  Other: Folder,
}

// ── Component ─────────────────────────────────────────────────────────────────

interface FavouriteSelectorProps {
  favourites: SonosFavourite[]
  value: string
  onChange: (value: string) => void
  id: string
  includeContinue?: boolean
}

export function FavouriteSelector({
  favourites,
  value,
  onChange,
  id,
  includeContinue = true,
}: FavouriteSelectorProps) {
  const listRef = useRef<HTMLDivElement>(null)

  // On mount, if a value is pre-selected, set the type filter to its content type
  // and scroll it into view
  const initialValue = useRef(value)
  const [selectedType, setSelectedType] = useState<ContentType | 'All'>(() => {
    if (!value || value === '__continue__') return 'All'
    const fav = favourites.find(f => f.title === value)
    if (!fav) return 'All'
    return getContentType(fav.uri)
  })

  useEffect(() => {
    if (!initialValue.current || initialValue.current === '__continue__') return
    // Wait a tick for the list to render with the correct filter
    requestAnimationFrame(() => {
      const container = listRef.current
      if (!container) return
      const selectedEl = container.querySelector('[aria-selected="true"]') as HTMLElement | null
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    })
  }, [])

  // Exclude items with no URI — they're non-playable service bookmarks
  const playableFavourites = useMemo(() => favourites.filter(f => f.uri), [favourites])

  // Determine which content types are present in the favourites list
  const presentTypes = useMemo<ContentType[]>(() => {
    const seen = new Set<ContentType>()
    for (const fav of playableFavourites) {
      seen.add(getContentType(fav.uri))
    }
    return ALL_TYPES.filter(t => seen.has(t))
  }, [playableFavourites])

  // Filter the displayed favourites based on the selected pill
  const filteredFavourites = useMemo<SonosFavourite[]>(() => {
    if (selectedType === 'All') return playableFavourites
    return playableFavourites.filter(f => getContentType(f.uri) === selectedType)
  }, [playableFavourites, selectedType])

  // When the type pill changes, clear selection if the current value no longer
  // appears in the filtered list
  function handleTypeChange(type: ContentType | 'All') {
    setSelectedType(type)
    if (value && value !== '__continue__') {
      const next = type === 'All' ? favourites : favourites.filter(f => getContentType(f.uri) === type)
      if (!next.some(f => f.title === value)) {
        onChange('')
      }
    }
  }

  // Only render the pill row when there is more than one content type present
  const showPills = presentTypes.length > 1

  // Pills to render: always include "All", then each present type
  const pills: Array<ContentType | 'All'> = showPills ? ['All', ...presentTypes] : []

  return (
    <div className="space-y-3">
      {/* Content type pill filters */}
      {showPills && (
        <div
          role="group"
          aria-label="Filter by content type"
          className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {pills.map(type => {
            const Icon = TYPE_ICON[type]
            const isActive = selectedType === type
            return (
              <button
                key={type}
                type="button"
                onClick={() => handleTypeChange(type)}
                aria-pressed={isActive}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                  'min-h-[44px] min-w-[44px]',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                  isActive
                    ? 'bg-fairy-500 text-white'
                    : 'bg-[var(--bg-tertiary)] text-caption hover:bg-[var(--bg-secondary)]',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{type}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Favourite item list */}
      <div
        ref={listRef}
        id={id}
        role="listbox"
        aria-label="Select a favourite"
        aria-activedescendant={value ? `${id}-item-${value}` : undefined}
        className="overflow-y-auto rounded-lg border border-[var(--border-secondary)]"
        style={{ maxHeight: '240px' }}
      >
        {/* "Continue what's already playing" option */}
        {includeContinue && (
          <button
            id={`${id}-item-__continue__`}
            type="button"
            role="option"
            aria-selected={value === '__continue__'}
            onClick={() => onChange('__continue__')}
            className={cn(
              'flex w-full items-center gap-3 px-3 text-left transition-colors',
              'min-h-[44px]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              value === '__continue__'
                ? 'border-l-2 border-fairy-500 bg-fairy-500/10 pl-[10px]'
                : 'border-l-2 border-transparent hover:bg-[var(--bg-tertiary)]',
            )}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--bg-tertiary)]">
              <RotateCcw className="h-4 w-4 text-caption" aria-hidden="true" />
            </span>
            <span className="text-sm text-body">Continue what's already playing</span>
          </button>
        )}

        {/* Separator between special option and favourites list */}
        {includeContinue && filteredFavourites.length > 0 && (
          <div className="border-t border-[var(--border-secondary)]" role="separator" />
        )}

        {/* Favourite items */}
        {filteredFavourites.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-caption">
            No favourites in this category
          </div>
        ) : (
          filteredFavourites.map(fav => {
            const isSelected = value === fav.title
            return (
              <button
                id={`${id}-item-${fav.title}`}
                key={fav.title}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => onChange(fav.title)}
                className={cn(
                  'flex w-full items-center gap-3 px-3 text-left transition-colors',
                  'min-h-[44px]',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                  isSelected
                    ? 'border-l-2 border-fairy-500 bg-fairy-500/10 pl-[10px]'
                    : 'border-l-2 border-transparent hover:bg-[var(--bg-tertiary)]',
                )}
              >
                {/* Album art or placeholder */}
                <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[var(--bg-tertiary)]">
                  {fav.albumArtURI ? (
                    <img
                      src={fav.albumArtURI}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={e => {
                        // Replace broken image with fallback icon container
                        const img = e.currentTarget
                        img.style.display = 'none'
                        const parent = img.parentElement
                        if (parent && !parent.querySelector('[data-fallback]')) {
                          const fallback = document.createElement('span')
                          fallback.setAttribute('data-fallback', '')
                          fallback.setAttribute('aria-hidden', 'true')
                          fallback.className = 'flex h-full w-full items-center justify-center'
                          fallback.innerHTML =
                            '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-caption"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>'
                          parent.appendChild(fallback)
                        }
                      }}
                    />
                  ) : (
                    <ImageOff className="h-4 w-4 text-caption" aria-hidden="true" />
                  )}
                </span>

                {/* Title */}
                <span className="text-sm text-body">{fav.title}</span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
