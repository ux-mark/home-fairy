import { useState, useMemo, useEffect, useRef } from 'react'
import { ListMusic, Radio, Disc3, Music, Folder, Podcast, BookOpen, RotateCcw, ImageOff, LibraryBig, Search } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import type { SonosFavourite, SonosGenreAlbum } from '@/lib/api'

// ── Content type classification by URI prefix ────────────────────────────────

type ContentType = 'Radio' | 'Playlists' | 'Podcasts' | 'Audiobooks' | 'Albums' | 'Tracks' | 'Other' | 'Library'

function getContentType(fav: SonosFavourite): Exclude<ContentType, 'Library'> {
  // Prefer UPnP content class from metadata (most reliable)
  const cls = fav.contentClass?.toLowerCase() ?? ''
  if (cls.includes('podcast')) return 'Podcasts'
  if (cls.includes('audiobook')) return 'Audiobooks'
  if (cls.includes('audiobroadcast')) return 'Radio'
  if (cls.includes('playlistcontainer')) return 'Playlists'
  if (cls.includes('musicalbum')) return 'Albums'
  if (cls.includes('musictrack')) return 'Tracks'

  // Fall back to URI pattern matching
  const uri = fav.uri
  if (!uri) return 'Other'

  const decoded = decodeURIComponent(uri).toLowerCase()

  if (decoded.includes('spotify')) {
    if (decoded.includes('episode') || decoded.includes('show')) return 'Podcasts'
    if (decoded.includes('audiobook')) return 'Audiobooks'
    if (decoded.includes('playlist')) return 'Playlists'
    if (decoded.includes('album')) return 'Albums'
    if (decoded.includes('track')) return 'Tracks'
    return 'Other'
  }

  if (uri.startsWith('x-sonosapi-stream:') || uri.startsWith('x-rincon-stream:')) return 'Radio'
  if (uri.startsWith('x-sonosapi-hls-static:')) return 'Audiobooks'
  if (uri.startsWith('x-rincon-cpcontainer:')) return 'Playlists'

  return 'Other'
}

/** Items with no URI and a generic container class are service bookmarks, not playable content */
function isPlayable(fav: SonosFavourite): boolean {
  if (fav.uri) return true
  // Items with no URI but a specific content class (podcast, audiobook, etc.) are playable via title match
  const cls = fav.contentClass ?? ''
  return cls !== 'object.container' && cls !== ''
}

// ── Pill filter config ────────────────────────────────────────────────────────

const ALL_TYPES: ContentType[] = ['Radio', 'Playlists', 'Podcasts', 'Audiobooks', 'Albums', 'Tracks', 'Other']

const TYPE_ICON: Record<ContentType | 'All', React.ElementType> = {
  All: ListMusic,
  Radio: Radio,
  Playlists: ListMusic,
  Podcasts: Podcast,
  Audiobooks: BookOpen,
  Albums: Disc3,
  Tracks: Music,
  Other: Folder,
  Library: LibraryBig,
}

// ── Component ─────────────────────────────────────────────────────────────────

interface FavouriteSelectorProps {
  favourites: SonosFavourite[]
  value: string
  onChange: (value: string) => void
  id: string
  includeContinue?: boolean
  nasUri?: string | null
  onNasUriChange?: (uri: string | null) => void
}

export function FavouriteSelector({
  favourites,
  value,
  onChange,
  id,
  includeContinue = true,
  nasUri,
  onNasUriChange,
}: FavouriteSelectorProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const [librarySearch, setLibrarySearch] = useState('')

  // Fetch NAS albums only when the caller opts in to NAS support
  const { data: nasAlbums = [], isLoading: nasAlbumsLoading } = useQuery({
    queryKey: ['sonos', 'library', 'albums'],
    queryFn: api.sonos.getLibraryAlbums,
    staleTime: 300_000,
    enabled: !!onNasUriChange,
  })

  // Capture the initial prop values in refs so the scroll effect can read them
  // without creating a stale closure. We must NOT read .current during render
  // (React 19 disallows it), so the useState initializer closes directly over
  // the prop values instead.
  const initialValue = useRef(value)
  const initialNasUri = useRef(nasUri)

  const [selectedType, setSelectedType] = useState<ContentType | 'All'>(() => {
    // Close over the props at mount time — safe because useState initializers
    // only run once, equivalent to reading the initial prop value.
    if (nasUri) return 'Library'
    if (!value || value === '__continue__') return 'All'
    const fav = favourites.find(f => f.title === value)
    if (!fav) return 'All'
    return getContentType(fav)
  })

  useEffect(() => {
    if (!initialValue.current || initialValue.current === '__continue__') return
    if (initialNasUri.current) return // NAS items are in library tab, no scroll needed
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

  // Exclude generic service bookmarks (no URI + generic object.container class)
  const playableFavourites = useMemo(() => favourites.filter(isPlayable), [favourites])

  // Determine which content types are present in the favourites list
  const presentTypes = useMemo<ContentType[]>(() => {
    const seen = new Set<ContentType>()
    for (const fav of playableFavourites) {
      seen.add(getContentType(fav))
    }
    // Include Library tab if the caller supports NAS and there are albums
    if (onNasUriChange && nasAlbums.length > 0) {
      seen.add('Library')
    }
    return ALL_TYPES.filter(t => seen.has(t))
  }, [playableFavourites, nasAlbums, onNasUriChange])

  // Filter the displayed favourites based on the selected pill
  const filteredFavourites = useMemo<SonosFavourite[]>(() => {
    if (selectedType === 'All' || selectedType === 'Library') return playableFavourites
    return playableFavourites.filter(f => getContentType(f) === selectedType)
  }, [playableFavourites, selectedType])

  // Filter NAS albums by search text
  const filteredNasAlbums = useMemo<SonosGenreAlbum[]>(() => {
    if (!librarySearch.trim()) return nasAlbums
    const q = librarySearch.toLowerCase()
    return nasAlbums.filter(a =>
      a.name.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q),
    )
  }, [nasAlbums, librarySearch])

  // When the type pill changes, clear selection if the current value no longer
  // appears in the filtered list
  function handleTypeChange(type: ContentType | 'All') {
    // Switching away from Library: if a NAS item was selected, clear it
    if (selectedType === 'Library' && type !== 'Library') {
      if (nasUri) {
        onNasUriChange?.(null)
        onChange('')
      }
    }
    // Switching away from a Sonos type to Library: clear Sonos selection
    if (selectedType !== 'Library' && type === 'Library') {
      if (value && value !== '__continue__') {
        onChange('')
      }
    }
    setSelectedType(type)
    if (value && value !== '__continue__' && type !== 'Library') {
      const next = type === 'All' ? favourites : favourites.filter(f => getContentType(f) === type)
      if (!next.some(f => f.title === value)) {
        onChange('')
      }
    }
  }

  // Only render the pill row when there is more than one content type present
  const showPills = presentTypes.length > 1

  // Pills to render: always include "All", then each present type
  const pills: Array<ContentType | 'All'> = showPills ? ['All', ...presentTypes] : []

  const isLibraryView = selectedType === 'Library'

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

      {/* Library search — only when in Library tab */}
      {isLibraryView && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-caption pointer-events-none" aria-hidden="true" />
          <input
            type="search"
            value={librarySearch}
            onChange={e => setLibrarySearch(e.target.value)}
            placeholder="Search albums or artists"
            aria-label="Search NAS library albums"
            className="w-full h-11 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-secondary)] pl-9 pr-3 text-sm text-heading placeholder:text-caption focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          />
        </div>
      )}

      {/* Item list */}
      <div
        ref={listRef}
        id={id}
        role="listbox"
        aria-label={isLibraryView ? 'Select a NAS album' : 'Select a favourite'}
        aria-activedescendant={
          isLibraryView
            ? (nasUri ? `${id}-nas-${nasUri}` : undefined)
            : (value ? `${id}-item-${value}` : undefined)
        }
        className="overflow-y-auto rounded-lg border border-[var(--border-secondary)]"
        style={{ maxHeight: '240px' }}
      >
        {/* "Continue what's already playing" option — always visible, not filtered */}
        {includeContinue && (
          <button
            id={`${id}-item-__continue__`}
            type="button"
            role="option"
            aria-selected={value === '__continue__'}
            onClick={() => {
              onChange('__continue__')
              onNasUriChange?.(null)
            }}
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

        {/* Separator between special option and content list */}
        {includeContinue && (isLibraryView ? nasAlbums.length > 0 : filteredFavourites.length > 0) && (
          <div className="border-t border-[var(--border-secondary)]" role="separator" />
        )}

        {/* Library view */}
        {isLibraryView ? (
          nasAlbumsLoading ? (
            <div className="px-3 py-4 text-center text-sm text-caption">
              Loading library...
            </div>
          ) : filteredNasAlbums.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-caption">
              {librarySearch ? 'No albums match your search' : 'No albums in library'}
            </div>
          ) : (
            filteredNasAlbums.map(album => {
              const isSelected = nasUri === album.objectId
              return (
                <button
                  id={`${id}-nas-${album.objectId}`}
                  key={album.objectId}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(album.name)
                    onNasUriChange?.(album.objectId)
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 text-left transition-colors',
                    'min-h-[44px]',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                    isSelected
                      ? 'border-l-2 border-fairy-500 bg-fairy-500/10 pl-[10px]'
                      : 'border-l-2 border-transparent hover:bg-[var(--bg-tertiary)]',
                  )}
                >
                  {/* Album art placeholder */}
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--bg-tertiary)]">
                    <LibraryBig className="h-4 w-4 text-caption" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-body">{album.name}</span>
                    <span className="block truncate text-xs text-caption">{album.artist}</span>
                  </span>
                </button>
              )
            })
          )
        ) : (
          /* Sonos favourites view */
          filteredFavourites.length === 0 ? (
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
                  onClick={() => {
                    onChange(fav.title)
                    onNasUriChange?.(null)
                  }}
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
          )
        )}
      </div>
    </div>
  )
}
