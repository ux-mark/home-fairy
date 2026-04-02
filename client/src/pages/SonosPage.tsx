import { useState, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Speaker, Music2, ListMusic, Disc3, Radio, AlertTriangle, RefreshCw, Settings } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { api, type SonosNowPlayingEntry } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { Skeleton, SkeletonList } from '@/components/ui/Skeleton'
import { SonosSpeakerCard } from '@/components/sonos/SonosSpeakerCard'
import { SonosGroupCard } from '@/components/sonos/SonosGroupCard'
import { SonosVolumeControl } from '@/components/sonos/SonosVolumeControl'

// ── Tab definition ────────────────────────────────────────────────────────────

type TabId = 'speakers' | 'genres' | 'playlists' | 'albums' | 'radio'

const TABS: Array<{ id: TabId; label: string; Icon: React.ElementType }> = [
  { id: 'speakers', label: 'Speakers', Icon: Speaker },
  { id: 'genres', label: 'Genres', Icon: Music2 },
  { id: 'playlists', label: 'Playlists', Icon: ListMusic },
  { id: 'albums', label: 'Albums', Icon: Disc3 },
  { id: 'radio', label: 'Radio', Icon: Radio },
]

// ── Placeholder tab content ───────────────────────────────────────────────────

const PLACEHOLDER_COPY: Record<Exclude<TabId, 'speakers'>, { heading: string; body: string }> = {
  genres: {
    heading: 'Genres',
    body: 'Browse music by genre — coming soon. Use Speakers to browse your favourites.',
  },
  playlists: {
    heading: 'Playlists',
    body: 'Your Sonos playlists — coming soon. Use Speakers to browse your favourites.',
  },
  albums: {
    heading: 'Albums',
    body: 'Browse saved albums — coming soon. Use Speakers to browse your favourites.',
  },
  radio: {
    heading: 'Radio',
    body: 'Your radio stations — coming soon. Use Speakers to browse your favourites.',
  },
}

function PlaceholderTab({ id }: { id: Exclude<TabId, 'speakers'> }) {
  const { heading, body } = PLACEHOLDER_COPY[id]
  const TabConfig = TABS.find(t => t.id === id)!
  const Icon = TabConfig.Icon
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <Icon className="h-10 w-10 text-caption/40" aria-hidden="true" />
      <div>
        <h2 className="text-lg font-semibold text-heading">{heading}</h2>
        <p className="mt-1 max-w-xs text-sm text-caption">{body}</p>
      </div>
    </div>
  )
}

// ── Master volume ─────────────────────────────────────────────────────────────

function MasterVolumeControl() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: zones } = useQuery({
    queryKey: ['sonos', 'zones'],
    queryFn: api.sonos.getZones,
    staleTime: 10_000,
    retry: false,
  })

  // Derive an average volume across all coordinators
  const avgVolume = (() => {
    if (!zones || zones.length === 0) return 30
    const vols = zones.map(z => z.coordinator.state.volume)
    return Math.round(vols.reduce((a, b) => a + b, 0) / vols.length)
  })()

  const volumeMutation = useMutation({
    mutationFn: async (level: number) => {
      if (!zones) return
      const coordinators = zones.map(z => z.coordinator.roomName)
      await Promise.allSettled(coordinators.map(s => api.sonos.setVolume(s, level)))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sonos', 'zones'] })
      queryClient.invalidateQueries({ queryKey: ['sonos', 'now-playing'] })
    },
    onError: () => toast({ message: 'Could not update volume', type: 'error' }),
  })

  if (!zones || zones.length === 0) return null

  return (
    <div className="card mb-4 rounded-xl border p-4" style={{ borderColor: 'var(--border-primary)' }}>
      <p className="mb-2 text-xs font-medium text-caption">All speakers</p>
      <SonosVolumeControl
        value={avgVolume}
        onChange={level => volumeMutation.mutate(level)}
        label="All speakers volume"
      />
    </div>
  )
}

// ── Speakers tab ──────────────────────────────────────────────────────────────

function SpeakersTab() {
  const queryClient = useQueryClient()

  const {
    data: nowPlaying,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['sonos', 'now-playing'],
    queryFn: api.sonos.getNowPlaying,
    refetchInterval: 5_000,
    staleTime: 4_000,
    retry: 1,
  })

  const { data: speakers } = useQuery({
    queryKey: ['sonos', 'speakers'],
    queryFn: api.sonos.getSpeakers,
    staleTime: 60_000,
    retry: false,
  })

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['sonos', 'now-playing'] })
    refetch()
  }, [queryClient, refetch])

  const sortedNowPlaying = useMemo(() => {
    if (!nowPlaying) return nowPlaying
    const rank = (playbackState: string | undefined) => {
      if (playbackState === 'PLAYING') return 0
      if (playbackState === 'PAUSED_PLAYBACK') return 1
      return 2
    }
    return [...nowPlaying].sort((a, b) => {
      const rankDiff = rank(a.state?.playbackState) - rank(b.state?.playbackState)
      if (rankDiff !== 0) return rankDiff
      // Within PLAYING group: lower elapsedTime = started more recently = sort first
      if (a.state?.playbackState === 'PLAYING' && b.state?.playbackState === 'PLAYING') {
        return (a.state.elapsedTime ?? 0) - (b.state.elapsedTime ?? 0)
      }
      return 0
    })
  }, [nowPlaying])

  // Group entries: coordinators lead their groups; solo speakers are their own group
  const renderItems = useMemo(() => {
    if (!sortedNowPlaying) return []

    // Track which speaker names have been assigned to a rendered group
    const placed = new Set<string>()
    const items: Array<{ type: 'solo'; entry: SonosNowPlayingEntry } | { type: 'group'; coordinator: SonosNowPlayingEntry; members: SonosNowPlayingEntry[] }> = []

    for (const entry of sortedNowPlaying) {
      if (placed.has(entry.speakerName)) continue
      const grp = entry.group
      if (grp && grp.members.length > 1 && grp.isCoordinator) {
        // This is a coordinator: collect all grouped members from sortedNowPlaying
        const memberEntries = grp.members
          .filter(m => m !== entry.speakerName)
          .map(memberName => sortedNowPlaying.find(e => e.speakerName === memberName))
          .filter((e): e is SonosNowPlayingEntry => e !== undefined)
        items.push({ type: 'group', coordinator: entry, members: memberEntries })
        placed.add(entry.speakerName)
        memberEntries.forEach(m => placed.add(m.speakerName))
      } else if (!grp || grp.members.length <= 1) {
        // Solo speaker
        items.push({ type: 'solo', entry })
        placed.add(entry.speakerName)
      } else {
        // Member of a group whose coordinator hasn't been encountered yet — will be handled when coordinator appears
        // If the coordinator is not in the configured speakers list, render this as a solo card
        const coordinatorPresent = sortedNowPlaying.some(e => e.speakerName === grp.coordinator)
        if (!coordinatorPresent) {
          items.push({ type: 'solo', entry })
          placed.add(entry.speakerName)
        }
        // Otherwise skip — coordinator will place it
      }
    }

    return items
  }, [sortedNowPlaying])

  // Loading
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full rounded-xl" />
        <SkeletonList count={2} height="h-44" />
      </div>
    )
  }

  // Sonos offline
  if (isError) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-red-400" aria-hidden="true" />
        <h2 className="text-base font-semibold text-heading">Sonos is offline</h2>
        <p className="mt-1 text-sm text-caption">
          Unable to reach your Sonos system. Check that your speakers are powered on.
        </p>
        <button
          onClick={handleRefresh}
          className={cn(
            'mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            'surface text-body hover:brightness-95 dark:hover:brightness-110',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </button>
      </div>
    )
  }

  // No speakers configured
  if (!speakers || speakers.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-6 text-center">
        <Speaker className="mx-auto mb-2 h-8 w-8 text-caption" aria-hidden="true" />
        <h2 className="text-base font-semibold text-heading">No speakers set up</h2>
        <p className="mt-1 text-sm text-caption">
          Add speakers in Settings to control your music here.
        </p>
        <Link
          to="/sonos-setup"
          className={cn(
            'mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            'bg-fairy-500 text-white hover:bg-fairy-600',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
        >
          <Settings className="h-4 w-4" aria-hidden="true" />
          Go to Sonos settings
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <MasterVolumeControl />

      {renderItems.length > 0 ? (
        renderItems.map(item => {
          if (item.type === 'solo') {
            return (
              <SonosSpeakerCard
                key={item.entry.speakerName}
                roomName={item.entry.roomName}
                speakerName={item.entry.speakerName}
                state={item.entry.state}
                error={item.entry.error}
                onRefresh={handleRefresh}
                group={item.entry.group}
              />
            )
          }

          // Unified group card
          return (
            <SonosGroupCard
              key={item.coordinator.speakerName}
              coordinator={item.coordinator}
              members={item.members}
              onRefresh={handleRefresh}
            />
          )
        })
      ) : (
        <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-6 text-center">
          <Speaker className="mx-auto mb-2 h-8 w-8 text-caption" aria-hidden="true" />
          <p className="text-sm text-caption">
            No speaker state available. Make sure Sonos is reachable.
          </p>
          <button
            onClick={handleRefresh}
            className={cn(
              'mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              'surface text-body hover:brightness-95 dark:hover:brightness-110',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            )}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh
          </button>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SonosPage() {
  const [activeTab, setActiveTab] = useState<TabId>('speakers')

  return (
    <div className="flex min-h-[calc(100svh-57px)] flex-col">
      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto px-4 pb-24 pt-4">
        <h1 className="sr-only">Sonos</h1>

        {/* Tab content */}
        <div role="tabpanel" aria-labelledby={`tab-${activeTab}`} id={`panel-${activeTab}`}>
          {activeTab === 'speakers' && <SpeakersTab />}
          {activeTab !== 'speakers' && <PlaceholderTab id={activeTab as Exclude<TabId, 'speakers'>} />}
        </div>
      </div>

      {/* Bottom tab bar — fixed to viewport bottom */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--border-primary)] bg-[var(--bg-primary)]"
        aria-label="Sonos navigation"
      >
        {/* Safe area inset for home-indicator on iOS */}
        <div
          className="flex"
          role="tablist"
          aria-label="Sonos sections"
        >
          {TABS.map(({ id, label, Icon }) => {
            const isActive = activeTab === id
            return (
              <button
                key={id}
                id={`tab-${id}`}
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${id}`}
                onClick={() => setActiveTab(id)}
                className={cn(
                  'flex flex-1 flex-col items-center justify-center gap-1 pb-safe pt-3 pb-3',
                  'min-h-[56px] text-[10px] font-medium transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-fairy-500',
                  isActive
                    ? 'text-fairy-400'
                    : 'text-caption hover:text-body',
                )}
              >
                <Icon
                  className={cn('h-5 w-5', isActive ? 'text-fairy-400' : 'text-caption')}
                  aria-hidden="true"
                />
                <span>{label}</span>
                {isActive && (
                  <span className="absolute bottom-0 h-0.5 w-8 rounded-t-full bg-fairy-500" aria-hidden="true" />
                )}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
