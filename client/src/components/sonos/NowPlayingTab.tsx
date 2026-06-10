import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Headphones } from 'lucide-react'
import { api } from '@/lib/api'
import { Skeleton } from '@/components/ui/Skeleton'
import { SpeakerCard } from './SpeakerCard'
import { updateSpeakerActivity, sortSpeakersByActivity } from '@/lib/sortSpeakersByActivity'

/**
 * Multi-speaker Now Playing tab.
 *
 * Groups are rendered as SpeakerCard type='group' (coordinator + members).
 * Solo speakers are rendered as SpeakerCard type='solo'.
 * Non-coordinator group members are excluded from the solo list.
 */
export function NowPlayingTab({ focusSpeaker }: { focusSpeaker?: string }) {
  const [, setSearchParams] = useSearchParams()

  // Clear the speaker query param after mount so the URL stays clean
  useEffect(() => {
    if (focusSpeaker) {
      setSearchParams(prev => {
        prev.delete('speaker')
        return prev
      }, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const {
    data: nowPlaying,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['sonos', 'now-playing'],
    queryFn: api.sonos.getNowPlaying,
    // Shares PlaybackStateProvider's cache entry — socket invalidation plus
    // its 30 s safety-net poll keep it fresh; no extra interval here.
    staleTime: 25_000,
    retry: 1,
  })

  // Update activity timestamps whenever now-playing refreshes
  useEffect(() => {
    if (nowPlaying && nowPlaying.length > 0) updateSpeakerActivity(nowPlaying)
  }, [nowPlaying])

  // Loading state — show 2 skeleton cards
  if (isLoading) {
    return (
      <div className="flex flex-col gap-4" role="status" aria-label="Loading speakers">
        {[0, 1].map(i => (
          <div
            key={i}
            className="rounded-xl border p-4"
            style={{ borderColor: 'var(--border-primary)' }}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-1/3 rounded" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            <div className="mb-3 flex items-center gap-3">
              <Skeleton className="h-12 w-12 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-2/3 rounded" />
                <Skeleton className="h-3 w-1/2 rounded" />
              </div>
            </div>
            <div className="mb-3 flex items-center gap-2">
              <Skeleton className="h-11 w-11 rounded-lg" />
              <Skeleton className="h-11 w-11 rounded-lg" />
              <Skeleton className="h-11 w-11 rounded-lg" />
              <Skeleton className="h-11 flex-1 rounded-lg" />
            </div>
            <Skeleton className="h-8 w-full rounded-lg" />
          </div>
        ))}
      </div>
    )
  }

  // Error state
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center px-4">
        <AlertTriangle className="h-10 w-10 text-red-400" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-heading">Could not load speakers</p>
          <p className="mt-1 text-xs text-caption">Check your network and try again.</p>
        </div>
        <button
          onClick={() => refetch()}
          className="rounded-lg border border-[var(--border-primary)] px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 min-h-[44px]"
        >
          Retry
        </button>
      </div>
    )
  }

  // Empty state
  if (!nowPlaying || nowPlaying.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center px-4">
        <Headphones className="h-10 w-10 text-caption/40" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-heading">No speakers configured</p>
          <p className="mt-1 text-xs text-caption">
            Add Sonos speakers in Settings to get started.
          </p>
        </div>
      </div>
    )
  }

  // Build a unified ordered list: sort all entries by activity, then render
  // coordinators as group cards (absorbing their members) and solo speakers
  // as solo cards. Non-coordinator group members are skipped (absorbed).
  const sorted = sortSpeakersByActivity(nowPlaying)
  const absorbedMembers = new Set(
    nowPlaying
      .filter(e => e.group && !e.group.isCoordinator)
      .map(e => e.speakerName),
  )

  function handleRefresh() {
    refetch()
  }

  return (
    <div className="flex flex-col gap-4">
      {sorted.map(entry => {
        // Skip non-coordinator group members — absorbed into their coordinator card
        if (absorbedMembers.has(entry.speakerName)) return null

        const isGroupCoordinator = entry.group?.isCoordinator && (entry.group.members.length > 1)

        if (isGroupCoordinator) {
          const memberSpeakerNames = entry.group!.members.filter(m => m !== entry.speakerName)
          const memberEntries = nowPlaying.filter(e => memberSpeakerNames.includes(e.speakerName))
          return (
            <SpeakerCard
              key={entry.speakerName}
              type="group"
              coordinator={entry}
              members={memberEntries}
              onRefresh={handleRefresh}
              allSpeakers={nowPlaying}
              focusSpeaker={focusSpeaker}
              showVolume={true}
              showQueue={true}
              showFullQueue={true}
            />
          )
        }

        return (
          <SpeakerCard
            key={entry.speakerName}
            type="solo"
            roomName={entry.roomName}
            speakerName={entry.speakerName}
            state={entry.state}
            error={entry.error}
            group={entry.group}
            onRefresh={handleRefresh}
            allSpeakers={nowPlaying}
            focusSpeaker={focusSpeaker}
            showVolume={true}
            showQueue={true}
            showFullQueue={true}
          />
        )
      })}
    </div>
  )
}
