import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Music, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'
import { api, parseApiError, type SonosNowPlayingEntry, type SonosQueueItem } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { ArtworkImage } from './ArtworkImage'
import { FavouriteSelector } from './FavouriteSelector'
import { ActionPopover } from '@/components/ui/ActionPopover'
import { SpeakerCard } from './SpeakerCard'

interface HomeSpeakerPopoverProps {
  open: boolean
  onClose: () => void
  triggerRef?: React.RefObject<HTMLButtonElement | null>
  borderColor?: string
}

// ── Queue accordion (per-speaker, so each can lazy-load independently) ────────

interface QueueAccordionProps {
  speakerName: string
  roomName: string
  isExpanded: boolean
  onToggle: () => void
  onClose: () => void
}

function QueueAccordion({ speakerName, roomName, isExpanded, onToggle, onClose }: QueueAccordionProps) {
  const navigate = useNavigate()

  const { data: queue = [], isLoading } = useQuery({
    queryKey: ['sonos', 'queue', speakerName],
    queryFn: () => api.sonos.getQueue(speakerName),
    enabled: isExpanded,
    staleTime: 10_000,
    retry: false,
  })

  // Skip index 0 (current track), show next 5
  const upcoming = queue.slice(1, 6)

  return (
    <div className="border-t border-[var(--border-color)] mt-1 pt-1">
      <button
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-controls={`queue-accordion-${speakerName}`}
        className={cn(
          'flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[11px] font-medium text-caption transition-colors',
          'hover:bg-[var(--bg-tertiary)]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          'min-h-[44px]',
        )}
      >
        <span>Queue</span>
        {isExpanded ? (
          <ChevronUp className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        )}
      </button>

      {isExpanded && (
        <div id={`queue-accordion-${speakerName}`}>
          {isLoading ? (
            <div className="space-y-1 px-3 py-1" aria-label="Loading queue">
              {[0, 1, 2].map(i => (
                <div key={i} className="flex animate-pulse items-center gap-2">
                  <div className="h-10 w-10 shrink-0 rounded bg-[var(--bg-tertiary)]" />
                  <div className="flex-1 space-y-1">
                    <div className="h-3 w-3/4 rounded bg-[var(--bg-tertiary)]" />
                    <div className="h-2.5 w-1/2 rounded bg-[var(--bg-tertiary)]" />
                  </div>
                </div>
              ))}
            </div>
          ) : upcoming.length === 0 ? (
            <p className="px-3 py-2 text-xs text-caption">No upcoming tracks</p>
          ) : (
            <ul className="space-y-0.5 px-1" role="list" aria-label={`Upcoming tracks for ${roomName}`}>
              {upcoming.map((track: SonosQueueItem, i: number) => (
                <li key={`${track.uri}-${i}`} className="flex items-center gap-2 rounded-md px-2 py-1">
                  <ArtworkImage src={track.albumArtUri} size={40} rounded="rounded" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-body">{track.title}</p>
                    <p className="truncate text-[10px] text-caption">{track.artist}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <button
            onClick={() => {
              onClose()
              navigate(`/sonos/playing?speaker=${encodeURIComponent(speakerName)}`)
            }}
            className={cn(
              'mt-0.5 flex w-full items-center justify-center rounded-md px-3 py-2 text-xs font-medium text-fairy-400 transition-colors',
              'hover:bg-[var(--bg-tertiary)]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              'min-h-[44px]',
            )}
          >
            View full queue
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main popover ──────────────────────────────────────────────────────────────

export function HomeSpeakerPopover({ open, onClose, triggerRef, borderColor }: HomeSpeakerPopoverProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // Dialog state: which speaker is having music chosen for it
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null)
  const [selectedFavourite, setSelectedFavourite] = useState('')

  // Track expanded group accordions (keyed by coordinator speakerName)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  // Track expanded queue accordions (keyed by speakerName)
  const [expandedQueues, setExpandedQueues] = useState<Set<string>>(new Set())

  // Track which member is being removed
  const [removingMember, setRemovingMember] = useState<string | null>(null)

  // Now-playing query — only when popover is open
  const { data: nowPlaying = [], isLoading } = useQuery({
    queryKey: ['sonos', 'now-playing'],
    queryFn: api.sonos.getNowPlaying,
    enabled: open,
    refetchInterval: open ? 5_000 : false,
    staleTime: 4_000,
    retry: false,
  })

  // Favourites (stale for 5 min — same as SonosSpeakerCard)
  const { data: favourites = [] } = useQuery({
    queryKey: ['sonos', 'favourites'],
    queryFn: api.sonos.getFavourites,
    staleTime: 5 * 60 * 1000,
    retry: false,
    enabled: open,
  })

  // Play favourite mutation
  const playFavouriteMutation = useMutation({
    mutationFn: ({ speaker, name }: { speaker: string; name: string }) =>
      api.sonos.playFavourite(speaker, name),
    onSuccess: (_data, { name }) => {
      setActiveSpeaker(null)
      setSelectedFavourite('')
      queryClient.invalidateQueries({ queryKey: ['sonos', 'now-playing'] })
      queryClient.invalidateQueries({ queryKey: ['sonos', 'play-status'] })
      toast({ message: `Playing ${name}` })
    },
    onError: (err, { name }) => {
      const serverMsg = parseApiError(err)
      toast({ message: serverMsg ?? `Couldn't play ${name}`, type: 'error' })
    },
  })

  // Leave group mutation
  const leaveMutation = useMutation({
    mutationFn: (speakerName: string) => api.sonos.leaveGroup(speakerName),
    onSuccess: (_data, speakerName) => {
      setRemovingMember(null)
      queryClient.invalidateQueries({ queryKey: ['sonos', 'now-playing'] })
      queryClient.invalidateQueries({ queryKey: ['sonos', 'play-status'] })
      const entry = nowPlaying.find(e => e.speakerName === speakerName)
      toast({ message: `${entry?.roomName ?? speakerName} removed from group` })
    },
    onError: (_err, speakerName) => {
      setRemovingMember(null)
      const entry = nowPlaying.find(e => e.speakerName === speakerName)
      toast({ message: `Couldn't remove ${entry?.roomName ?? speakerName} from group`, type: 'error' })
    },
  })

  // Group entries: coordinators lead their groups; solo speakers are their own group
  const renderItems = useMemo(() => {
    if (nowPlaying.length === 0) return []

    const placed = new Set<string>()
    const items: Array<
      | { type: 'solo'; entry: SonosNowPlayingEntry }
      | { type: 'group'; coordinator: SonosNowPlayingEntry; members: SonosNowPlayingEntry[] }
    > = []

    for (const entry of nowPlaying) {
      if (placed.has(entry.speakerName)) continue
      const grp = entry.group
      if (grp && grp.members.length > 1 && grp.isCoordinator) {
        const memberEntries = grp.members
          .filter(m => m !== entry.speakerName)
          .map(memberName => nowPlaying.find(e => e.speakerName === memberName))
          .filter((e): e is SonosNowPlayingEntry => e !== undefined)
        items.push({ type: 'group', coordinator: entry, members: memberEntries })
        placed.add(entry.speakerName)
        memberEntries.forEach(m => placed.add(m.speakerName))
      } else if (!grp || grp.members.length <= 1) {
        items.push({ type: 'solo', entry })
        placed.add(entry.speakerName)
      } else {
        // Member of a group whose coordinator hasn't appeared yet
        const coordinatorPresent = nowPlaying.some(e => e.speakerName === grp.coordinator)
        if (!coordinatorPresent) {
          items.push({ type: 'solo', entry })
          placed.add(entry.speakerName)
        }
        // Otherwise skip — coordinator will place it
      }
    }

    return items
  }, [nowPlaying])

  if (!open) return null

  const activeSpeakerEntry = activeSpeaker
    ? nowPlaying.find(e => e.speakerName === activeSpeaker)
    : null

  function toggleGroupExpanded(coordinatorName: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(coordinatorName)) next.delete(coordinatorName)
      else next.add(coordinatorName)
      return next
    })
  }

  function toggleQueueExpanded(speakerName: string) {
    setExpandedQueues(prev => {
      const next = new Set(prev)
      if (next.has(speakerName)) next.delete(speakerName)
      else next.add(speakerName)
      return next
    })
  }

  function handleRemoveMember(speakerName: string) {
    setRemovingMember(speakerName)
    leaveMutation.mutate(speakerName)
  }

  // ── Choose Music dialog (for stopped speakers with no track) ────────────────
  function renderChooseMusicDialog(speakerName: string, roomName: string) {
    return (
      <Dialog.Root
        open={activeSpeaker === speakerName}
        onOpenChange={dialogOpen => {
          if (dialogOpen) {
            setActiveSpeaker(speakerName)
            setSelectedFavourite('')
          } else {
            setActiveSpeaker(null)
            setSelectedFavourite('')
          }
        }}
      >
        <Dialog.Trigger asChild>
          <button
            className={cn(
              'flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors',
              'surface text-body hover:brightness-95 dark:hover:brightness-110',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            )}
            aria-label={`Choose music for ${roomName}`}
          >
            <Music className="h-4 w-4 shrink-0" aria-hidden="true" />
            Choose Music
          </button>
        </Dialog.Trigger>

        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content
            className={cn(
              'fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl',
              'bg-[var(--bg-primary)] p-6 shadow-xl',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
              'focus:outline-none',
            )}
            aria-describedby={undefined}
          >
            <div className="mb-4 flex items-center justify-between">
              <Dialog.Title className="text-base font-semibold text-heading">
                Choose music for {roomName}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg text-caption transition-colors',
                    'hover:bg-[var(--bg-secondary)]',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                  )}
                  aria-label="Close"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </Dialog.Close>
            </div>

            <FavouriteSelector
              id={`home-fav-selector-${speakerName}`}
              favourites={favourites}
              value={selectedFavourite}
              onChange={setSelectedFavourite}
              includeContinue={false}
            />

            <div className="mt-4 flex gap-2">
              <Dialog.Close asChild>
                <button
                  className={cn(
                    'flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
                    'surface text-body hover:brightness-95 dark:hover:brightness-110',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                    'min-h-[44px]',
                  )}
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                onClick={() => {
                  if (selectedFavourite && activeSpeaker) {
                    playFavouriteMutation.mutate({
                      speaker: activeSpeaker,
                      name: selectedFavourite,
                    })
                  }
                }}
                disabled={!selectedFavourite || playFavouriteMutation.isPending}
                className={cn(
                  'flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors',
                  'bg-fairy-500 text-white hover:bg-fairy-600 active:bg-fairy-700',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                  'disabled:opacity-50 min-h-[44px]',
                )}
              >
                {playFavouriteMutation.isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Playing…
                  </span>
                ) : (
                  'Play'
                )}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    )
  }

  return (
    <ActionPopover
      open={open}
      onClose={onClose}
      triggerRef={triggerRef}
      ariaLabel="Speaker controls"
      borderColor={borderColor}
    >
      <div className="px-3 py-3">
        {/* Loading state */}
        {isLoading && (
          <div className="space-y-3" aria-label="Loading speakers">
            {[0, 1].map(i => (
              <div key={i} className="animate-pulse space-y-2 rounded-xl p-2">
                <div className="flex gap-3">
                  <div className="h-20 w-20 shrink-0 rounded-xl bg-[var(--bg-tertiary)]" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-3 w-1/3 rounded bg-[var(--bg-tertiary)]" />
                    <div className="h-4 w-3/4 rounded bg-[var(--bg-tertiary)]" />
                    <div className="h-3 w-1/2 rounded bg-[var(--bg-tertiary)]" />
                  </div>
                </div>
                <div className="h-10 w-full rounded-lg bg-[var(--bg-tertiary)]" />
              </div>
            ))}
          </div>
        )}

        {/* Empty / error state */}
        {!isLoading && nowPlaying.length === 0 && (
          <p className="py-2 text-sm text-caption">No speakers found</p>
        )}

        {/* Speaker rows */}
        {!isLoading && renderItems.length > 0 && (
          <ul className="space-y-2" role="list">
            {renderItems.map(item => {
              if (item.type === 'solo') {
                const entry = item.entry
                const isPlaying = entry.state?.playbackState === 'PLAYING'
                const isPaused = entry.state?.playbackState === 'PAUSED_PLAYBACK'
                const isStopped = !entry.state || entry.state.playbackState === 'STOPPED'
                const hasTrack =
                  entry.state &&
                  (entry.state.currentTrack.title || entry.state.currentTrack.stationName)
                const isTv = entry.state?.inputSource === 'tv'
                const isLineIn = entry.state?.inputSource === 'line-in'
                const isMediaStream = !isTv && !isLineIn
                const showQueue = isMediaStream && (isPlaying || isPaused) && !!hasTrack

                if ((isPlaying || isPaused) && hasTrack && entry.state) {
                  // Playing or paused with a track — delegate to SpeakerCard
                  return (
                    <li key={entry.speakerName}>
                      <SpeakerCard
                        type="solo"
                        roomName={entry.roomName}
                        speakerName={entry.speakerName}
                        state={entry.state}
                        group={entry.group ?? null}
                        allSpeakers={nowPlaying}
                        onRefresh={() => queryClient.invalidateQueries({ queryKey: ['sonos', 'now-playing'] })}
                        showVolume={false}
                        showQueue={false}
                      />
                      {showQueue && (
                        <QueueAccordion
                          speakerName={entry.speakerName}
                          roomName={entry.roomName}
                          isExpanded={expandedQueues.has(entry.speakerName)}
                          onToggle={() => toggleQueueExpanded(entry.speakerName)}
                          onClose={onClose}
                        />
                      )}
                    </li>
                  )
                }

                // Stopped / no track — compact row with Choose Music
                return (
                  <li
                    key={entry.speakerName}
                    className="flex items-center gap-3 rounded-lg p-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-heading">
                          {entry.roomName}
                        </span>
                        <span className="shrink-0 rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 text-[10px] font-medium text-caption">
                          Stopped
                        </span>
                      </div>
                    </div>
                    {isStopped && !hasTrack && renderChooseMusicDialog(entry.speakerName, entry.roomName)}
                  </li>
                )
              }

              // Grouped speaker row
              const { coordinator, members } = item
              const allMembers = [coordinator, ...members]
              const groupLabel = allMembers.map(e => e.roomName).join(' + ')
              const isPlaying = coordinator.state?.playbackState === 'PLAYING'
              const isPaused = coordinator.state?.playbackState === 'PAUSED_PLAYBACK'
              const isStopped = !coordinator.state || coordinator.state.playbackState === 'STOPPED'
              const hasTrack =
                coordinator.state &&
                (coordinator.state.currentTrack.title || coordinator.state.currentTrack.stationName)
              const isTv = coordinator.state?.inputSource === 'tv'
              const isLineIn = coordinator.state?.inputSource === 'line-in'
              const isMediaStream = !isTv && !isLineIn
              const showQueue = isMediaStream && (isPlaying || isPaused) && !!hasTrack
              const isExpanded = expandedGroups.has(coordinator.speakerName)

              return (
                <li key={coordinator.speakerName}>
                  {(isPlaying || isPaused) && hasTrack && coordinator.state ? (
                    // Playing/paused group — delegate to SpeakerCard
                    <>
                      <SpeakerCard
                        type="group"
                        coordinator={coordinator}
                        members={members}
                        allSpeakers={nowPlaying}
                        onRefresh={() => queryClient.invalidateQueries({ queryKey: ['sonos', 'now-playing'] })}
                        showVolume={false}
                        showQueue={false}
                      />
                      {showQueue && (
                        <QueueAccordion
                          speakerName={coordinator.speakerName}
                          roomName={coordinator.roomName}
                          isExpanded={expandedQueues.has(coordinator.speakerName)}
                          onToggle={() => toggleQueueExpanded(coordinator.speakerName)}
                          onClose={onClose}
                        />
                      )}
                    </>
                  ) : (
                    // Stopped group — compact row
                    <div className="flex items-center gap-3 rounded-lg p-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-heading">
                            {groupLabel}
                          </span>
                          <span className="shrink-0 rounded-full bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-[10px] font-medium text-caption">
                            {allMembers.length}
                          </span>
                          <span className="shrink-0 rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 text-[10px] font-medium text-caption">
                            Stopped
                          </span>
                        </div>
                      </div>
                      {isStopped && !hasTrack && renderChooseMusicDialog(coordinator.speakerName, groupLabel)}
                    </div>
                  )}

                  {/* Expandable member accordion */}
                  <div className="px-1 pb-1 pt-0.5">
                    <button
                      onClick={() => toggleGroupExpanded(coordinator.speakerName)}
                      aria-expanded={isExpanded}
                      aria-controls={`group-members-popover-${coordinator.speakerName}`}
                      className={cn(
                        'flex w-full items-center justify-between rounded-md px-2 py-1 text-[11px] font-medium text-caption transition-colors',
                        'hover:bg-[var(--bg-tertiary)]',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                        'min-h-[44px]',
                      )}
                    >
                      <span>Speakers in this group</span>
                      {isExpanded ? (
                        <ChevronUp className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="h-3 w-3" aria-hidden="true" />
                      )}
                    </button>

                    {isExpanded && (
                      <ul
                        id={`group-members-popover-${coordinator.speakerName}`}
                        className="mt-0.5 space-y-0.5"
                        aria-label={`Members of ${coordinator.roomName} group`}
                      >
                        {allMembers.map(member => (
                          <li
                            key={member.speakerName}
                            className="flex items-center justify-between gap-2 rounded-md px-2 py-1"
                          >
                            <span className="truncate text-xs text-body">{member.roomName}</span>
                            {member.speakerName !== coordinator.speakerName && (
                              <button
                                onClick={() => handleRemoveMember(member.speakerName)}
                                disabled={removingMember === member.speakerName}
                                aria-label={`Remove ${member.roomName} from group`}
                                className={cn(
                                  'flex h-8 items-center gap-1 rounded px-2 text-xs text-caption transition-colors',
                                  'hover:bg-red-500/15 hover:text-red-400',
                                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                                  'disabled:opacity-40',
                                )}
                              >
                                {removingMember === member.speakerName ? (
                                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                                ) : (
                                  <X className="h-3 w-3" aria-hidden="true" />
                                )}
                                Remove
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Active speaker label for screen readers */}
      {activeSpeakerEntry && (
        <span className="sr-only" aria-live="polite">
          Choosing music for {activeSpeakerEntry.roomName}
        </span>
      )}
    </ActionPopover>
  )
}
