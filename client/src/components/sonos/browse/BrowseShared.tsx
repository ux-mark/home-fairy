import { AlertTriangle, Music2, RefreshCw } from 'lucide-react'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'

// ── ListSkeleton ──────────────────────────────────────────────────────────────

export function ListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-2.5">
          <Skeleton className="h-12 w-12 shrink-0 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-3/4 rounded" />
            <Skeleton className="h-3 w-1/2 rounded" />
          </div>
        </li>
      ))}
    </ul>
  )
}

// ── TrackListSkeleton ─────────────────────────────────────────────────────────

export function TrackListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <ul aria-busy="true" aria-label="Loading tracks">
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

// ── ErrorState ────────────────────────────────────────────────────────────────

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string
  message: string
  onRetry: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-400" aria-hidden="true" />
      <div>
        <p className="text-sm font-medium text-heading">{title}</p>
        <p className="mt-1 max-w-xs text-xs text-caption">{message}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className={cn(
          'flex items-center gap-2 rounded-lg bg-[var(--bg-secondary)] px-4 py-2 text-sm font-medium text-body',
          'transition-colors hover:bg-[var(--bg-tertiary)]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          'min-h-[44px]',
        )}
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Retry
      </button>
    </div>
  )
}

// ── ConnectSpotifyPrompt ──────────────────────────────────────────────────────

export function ConnectSpotifyPrompt({ configured }: { configured: boolean }) {
  if (!configured) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1DB954]/10">
          <Music2 className="h-8 w-8 text-[#1DB954]" aria-hidden="true" />
        </div>
        <div>
          <p className="text-base font-semibold text-heading">Spotify not configured</p>
          <p className="mt-1 max-w-xs text-sm text-caption">
            Add your Spotify Developer credentials to the server .env file, then restart.
          </p>
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1DB954]/10">
        <Music2 className="h-8 w-8 text-[#1DB954]" aria-hidden="true" />
      </div>
      <div>
        <p className="text-base font-semibold text-heading">Connect Spotify</p>
        <p className="mt-1 max-w-xs text-sm text-caption">
          Link your Spotify account to browse playlists and control playback.
        </p>
      </div>
      <a
        href="/api/spotify/auth"
        className={cn(
          'flex items-center gap-2 rounded-xl bg-[#1DB954] px-6 py-3 text-sm font-semibold text-white',
          'transition-opacity hover:opacity-90',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          'min-h-[44px]',
        )}
      >
        Connect Spotify
      </a>
    </div>
  )
}

// ── BrowseModeTabs ────────────────────────────────────────────────────────────
// Generic tab strip. Pass any array of { value, label } options.

interface BrowseModeTab<T extends string> {
  value: T
  label: string
}

interface BrowseModeTabsProps<T extends string> {
  mode: T
  onChangeMode: (m: T) => void
  tabs: BrowseModeTab<T>[]
}

export function BrowseModeTabs<T extends string>({
  mode,
  onChangeMode,
  tabs,
}: BrowseModeTabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label="Browse by"
      className="mb-4 flex gap-2 overflow-x-auto pb-0.5"
    >
      {tabs.map(tab => (
        <button
          key={tab.value}
          role="tab"
          aria-selected={mode === tab.value}
          onClick={() => onChangeMode(tab.value)}
          className={cn(
            'shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors',
            'min-h-[36px]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            mode === tab.value
              ? 'bg-fairy-500 text-white'
              : 'bg-[var(--bg-secondary)] text-caption hover:text-body',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
