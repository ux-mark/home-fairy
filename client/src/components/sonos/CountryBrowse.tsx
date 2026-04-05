import { useState } from 'react'
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Globe,
  MapPin,
  Music2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/Skeleton'
import { countryCodeToFlag, isValidIsoCode } from './countryUtils'

// ── Types ─────────────────────────────────────────────────────────────────────

/** Common shape for an artist with country data */
export interface CountryArtistItem {
  id: string
  name: string
  country_code: string | null
  country_name: string | null
  sub_region: string | null
  image_url?: string | null
}

interface CountryEntry {
  code: string
  name: string
  flag: string
  artistCount: number
}

// ── Skeleton / Error ─────────────────────────────────────────────────────────

function ListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-2.5">
          <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-3/4 rounded" />
            <Skeleton className="h-3 w-1/2 rounded" />
          </div>
        </li>
      ))}
    </ul>
  )
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <p className="text-sm text-red-400">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg bg-[var(--bg-secondary)] px-4 py-2 text-xs font-medium text-caption hover:text-body"
      >
        Retry
      </button>
    </div>
  )
}

// ── Country list ─────────────────────────────────────────────────────────────

export function CountryList({
  artists,
  isLoading,
  isError,
  error,
  onRetry,
  onSelectCountry,
  enrichmentStatusBar,
}: {
  artists: CountryArtistItem[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  onRetry: () => void
  onSelectCountry: (code: string, name: string) => void
  enrichmentStatusBar?: React.ReactNode
}) {
  if (isLoading) return <ListSkeleton />

  if (isError) {
    return (
      <ErrorState
        message={(error as Error)?.message ?? 'Failed to load countries'}
        onRetry={onRetry}
      />
    )
  }

  // Build country list from artists with valid ISO codes
  const countryMap = new Map<string, { name: string; count: number }>()
  for (const a of artists) {
    if (!isValidIsoCode(a.country_code)) continue
    const existing = countryMap.get(a.country_code)
    if (existing) {
      existing.count++
    } else {
      countryMap.set(a.country_code, { name: a.country_name ?? a.country_code, count: 1 })
    }
  }

  const countries: CountryEntry[] = Array.from(countryMap.entries())
    .map(([code, { name, count }]) => ({
      code,
      name,
      flag: countryCodeToFlag(code),
      artistCount: count,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

  const hasCountryData = countries.length > 0

  return (
    <div>
      {enrichmentStatusBar}

      {!hasCountryData && artists.length > 0 && (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <Globe className="h-10 w-10 text-caption/40" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-heading">No country data yet</p>
            <p className="mt-1 max-w-xs text-xs text-caption">
              Use the "Enrich countries" button above to look up artist origins via MusicBrainz.
            </p>
          </div>
        </div>
      )}

      {!hasCountryData && artists.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <Music2 className="h-10 w-10 text-caption/40" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-heading">No artists found</p>
            <p className="mt-1 max-w-xs text-xs text-caption">
              No artist data is available to browse by country.
            </p>
          </div>
        </div>
      )}

      {hasCountryData && (
        <ul className="-mx-4">
          {countries.map(country => (
            <li key={country.code}>
              <button
                type="button"
                onClick={() => onSelectCountry(country.code, country.name)}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-2.5 text-left',
                  'transition-colors hover:bg-[var(--bg-secondary)]',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                  'min-h-[44px]',
                )}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center text-2xl" role="img" aria-label={country.name}>
                  {country.flag}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-heading">{country.name}</p>
                  <p className="text-xs text-caption">
                    {country.artistCount} {country.artistCount === 1 ? 'artist' : 'artists'}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-caption/40" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Country artist list (drill-in from country) ─────────────────────────────

export function CountryArtistList({
  countryCode,
  countryName,
  artists,
  isLoading,
  isError,
  error,
  onRetry,
  onBack,
  renderArtistRow,
}: {
  countryCode: string
  countryName: string
  artists: CountryArtistItem[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  onRetry: () => void
  onBack: () => void
  renderArtistRow: (artist: CountryArtistItem) => React.ReactNode
}) {
  const [collapsedRegions, setCollapsedRegions] = useState<Set<string>>(new Set())

  const toggleRegion = (region: string) => {
    setCollapsedRegions(prev => {
      const next = new Set(prev)
      if (next.has(region)) next.delete(region)
      else next.add(region)
      return next
    })
  }

  const filtered = artists.filter(a => a.country_code === countryCode)
  const flag = countryCodeToFlag(countryCode)

  // Group by sub_region
  const regionGroups = new Map<string, CountryArtistItem[]>()
  for (const a of filtered) {
    const key = a.sub_region ?? 'General'
    if (!regionGroups.has(key)) regionGroups.set(key, [])
    regionGroups.get(key)!.push(a)
  }
  const sortedRegions = Array.from(regionGroups.entries())
    .map(([region, items]) => ({ region, items }))
    .sort((a, b) => {
      if (a.region === 'General') return 1
      if (b.region === 'General') return -1
      return a.region.localeCompare(b.region, undefined, { sensitivity: 'base' })
    })
  const hasSubRegions = sortedRegions.length > 1 || (sortedRegions.length === 1 && sortedRegions[0].region !== 'General')

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to countries"
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-secondary)]',
            'text-caption transition-colors hover:bg-[var(--bg-tertiary)] hover:text-body',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <span className="text-2xl" role="img" aria-hidden="true">{flag}</span>
        <h2 className="truncate text-lg font-semibold text-heading">{countryName}</h2>
        <span className="text-xs text-caption">{filtered.length} {filtered.length === 1 ? 'artist' : 'artists'}</span>
      </div>

      {isLoading && <ListSkeleton />}

      {isError && (
        <ErrorState
          message={(error as Error)?.message ?? 'Failed to load artists'}
          onRetry={onRetry}
        />
      )}

      {!isLoading && !isError && filtered.length > 0 && hasSubRegions && (
        <div className="-mx-4">
          {sortedRegions.map(group => {
            const isCollapsed = collapsedRegions.has(group.region)
            return (
              <div key={group.region}>
                <button
                  type="button"
                  onClick={() => toggleRegion(group.region)}
                  className={cn(
                    'flex w-full items-center gap-2 px-4 py-2.5 text-left',
                    'bg-[var(--bg-secondary)] transition-colors hover:bg-[var(--bg-tertiary)]',
                    'min-h-[40px]',
                  )}
                  aria-expanded={!isCollapsed}
                >
                  <MapPin className="h-4 w-4 shrink-0 text-fairy-500" aria-hidden="true" />
                  <span className="flex-1 text-sm font-semibold text-heading">{group.region}</span>
                  <span className="text-xs text-caption">{group.items.length}</span>
                  <ChevronDown
                    className={cn('h-4 w-4 text-caption/50 transition-transform', isCollapsed && '-rotate-90')}
                    aria-hidden="true"
                  />
                </button>
                {!isCollapsed && (
                  <ul>
                    {group.items.map(artist => renderArtistRow(artist))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!isLoading && !isError && filtered.length > 0 && !hasSubRegions && (
        <ul className="-mx-4">
          {filtered.map(artist => renderArtistRow(artist))}
        </ul>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <Music2 className="h-10 w-10 text-caption/40" aria-hidden="true" />
          <p className="text-sm text-caption">No artists found from {countryName}</p>
        </div>
      )}
    </div>
  )
}

