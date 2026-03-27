import { useState, useMemo } from 'react'
import { ChevronDown } from 'lucide-react'
import type { SonosFavourite } from '@/lib/api'

// ── Content type classification by URI prefix ────────────────────────────────

const CONTENT_TYPES = [
  { prefix: 'x-sonos-spotify:spotify:playlist:', label: 'Spotify playlists' },
  { prefix: 'x-sonos-spotify:spotify:album:', label: 'Spotify albums' },
  { prefix: 'x-sonos-spotify:spotify:track:', label: 'Spotify tracks' },
  { prefix: 'x-rincon-stream:', label: 'Radio streams' },
  { prefix: 'x-sonosapi-stream:', label: 'Sonos Radio' },
  { prefix: 'x-sonos-htastream:', label: 'TV and HDMI' },
  { prefix: 'x-file-cifs:', label: 'Local library' },
  { prefix: 'x-rincon-cpcontainer:', label: 'Sonos playlists' },
] as const

function getContentType(uri?: string): string {
  if (!uri) return 'Other'
  for (const ct of CONTENT_TYPES) {
    if (uri.startsWith(ct.prefix)) return ct.label
  }
  return 'Other'
}

// ── Component ────────────────────────────────────────────────────────────────

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
  const [selectedType, setSelectedType] = useState('')

  // Group favourites by content type, only including types that have items
  const { typeOptions, filteredFavourites } = useMemo(() => {
    const typeMap = new Map<string, SonosFavourite[]>()
    for (const fav of favourites) {
      const type = getContentType(fav.uri)
      const list = typeMap.get(type) ?? []
      list.push(fav)
      typeMap.set(type, list)
    }

    // Stable ordering: follow CONTENT_TYPES order, then "Other" at end
    const orderedTypes: string[] = []
    for (const ct of CONTENT_TYPES) {
      if (typeMap.has(ct.label)) orderedTypes.push(ct.label)
    }
    if (typeMap.has('Other')) orderedTypes.push('Other')

    const filtered = selectedType
      ? favourites.filter(f => getContentType(f.uri) === selectedType)
      : favourites

    return {
      typeOptions: orderedTypes.map(t => ({ label: t, count: typeMap.get(t)!.length })),
      filteredFavourites: filtered,
    }
  }, [favourites, selectedType])

  const selectClass =
    'surface w-full appearance-none rounded-lg border border-[var(--border-secondary)] px-3 py-2 text-sm text-heading min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500'

  // When type changes, clear selection if current value doesn't match new filter
  function handleTypeChange(type: string) {
    setSelectedType(type)
    if (value && value !== '__continue__') {
      const matchingFavs = type
        ? favourites.filter(f => getContentType(f.uri) === type)
        : favourites
      if (!matchingFavs.some(f => f.title === value)) {
        onChange('')
      }
    }
  }

  return (
    <div className="space-y-3">
      {/* Content type filter — only show if there are multiple types */}
      {typeOptions.length > 1 && (
        <div>
          <label htmlFor={`${id}-type`} className="text-caption text-xs mb-1.5 block">
            Content type
          </label>
          <div className="relative">
            <select
              id={`${id}-type`}
              value={selectedType}
              onChange={e => handleTypeChange(e.target.value)}
              className={selectClass}
            >
              <option value="">All types</option>
              {typeOptions.map(t => (
                <option key={t.label} value={t.label}>
                  {t.label} ({t.count})
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-caption"
              aria-hidden="true"
            />
          </div>
        </div>
      )}

      {/* Favourite item selector */}
      <div>
        {typeOptions.length > 1 && (
          <label htmlFor={id} className="text-caption text-xs mb-1.5 block">
            Item
          </label>
        )}
        <div className="relative">
          <select
            id={id}
            value={value}
            onChange={e => onChange(e.target.value)}
            className={selectClass}
          >
            <option value="">Select a favourite</option>
            {includeContinue && (
              <option value="__continue__">Continue what's already playing</option>
            )}
            {filteredFavourites.map(fav => (
              <option key={fav.title} value={fav.title}>
                {fav.title}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-caption"
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  )
}
