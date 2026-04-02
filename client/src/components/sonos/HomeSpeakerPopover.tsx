import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Play, Pause, Music, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'
import { api, parseApiError, type SonosNowPlayingEntry } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { SonosNowPlaying } from './SonosNowPlaying'
import { FavouriteSelector } from './FavouriteSelector'
import { ActionPopover } from '@/components/ui/ActionPopover'

interface HomeSpeakerPopoverProps {
  open: boolean
  onClose: () => void
  triggerRef?: React.RefObject<HTMLButtonElement | null>
  borderColor?: string
}

export function HomeSpeakerPopover({ open, onClose, triggerRef, borderColor }: HomeSpeakerPopoverProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // Dialog state: which speaker is having music chosen for it
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null)
  const [selectedFavourite, setSelectedFavourite] = useState('')

  // Track expanded group accordions (keyed by coordinator speakerName)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

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

  // Play mutation
  const playMutation = useMutation({
    mutationFn: (speaker: string) => api.sonos.play(speaker),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sonos', 'now-playing'] })
      queryClient.invalidateQueries({ queryKey: ['sonos', 'play-status'] })
    },
    onError: (_err, speaker) => {
      const entry = nowPlaying.find(e => e.speakerName === speaker)
      toast({ message: `Couldn't play ${entry?.roomName ?? speaker}`, type: 'error' })
    },
  })

  // Pause mutation
  const pauseMutation = useMutation({
    mutationFn: (speaker: string) => api.sonos.pause(speaker),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sonos', 'now-playing'] })
      queryClient.invalidateQueries({ queryKey: ['sonos', 'play-status'] })
    },
    onError: (_err, speaker) => {
      const entry = nowPlaying.find(e => e.speakerName === speaker)
      toast({ message: `Couldn't pause ${entry?.roomName ?? speaker}`, type: 'error' })
    },
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
      if (next.has(coordinatorName)) {
        next.delete(coordinatorName)
      } else {
        next.add(coordinatorName)
      }
      return next
    })
  }

  function handleRemoveMember(speakerName: string) {
    setRemovingMember(speakerName)
    leaveMutation.mutate(speakerName)
  }

  // Shared: renders the play/pause or choose-music action button
  function renderActionButton(
    speakerName: string,
    roomName: string,
    isPlaying: boolean,
    isStopped: boolean,
    hasTrack: boolean,
  ) {
    const isActionPending =
      (playMutation.isPending && playMutation.variables === speakerName) ||
      (pauseMutation.isPending && pauseMutation.variables === speakerName)

    if (isStopped && !hasTrack) {
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
      <button
        onClick={() => {
          if (isPlaying) {
            pauseMutation.mutate(speakerName)
          } else {
            playMutation.mutate(speakerName)
          }
        }}
        disabled={isActionPending}
        aria-label={isPlaying ? `Pause ${roomName}` : `Play ${roomName}`}
        aria-pressed={isPlaying}
        className={cn(
          'flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          'disabled:opacity-50',
          isPlaying
            ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
            : 'surface text-body hover:brightness-95 dark:hover:brightness-110',
        )}
      >
        {isActionPending ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        ) : isPlaying ? (
          <Pause className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Play className="h-5 w-5" aria-hidden="true" />
        )}
      </button>
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
          <div className="space-y-2" aria-label="Loading speakers">
            {[0, 1].map(i => (
              <div
                key={i}
                className="flex animate-pulse items-center gap-3 rounded-lg p-2"
              >
                <div className="h-10 flex-1 rounded-lg bg-[var(--bg-tertiary)]" />
                <div className="h-10 w-10 rounded-lg bg-[var(--bg-tertiary)]" />
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
          <ul className="space-y-1" role="list">
            {renderItems.map(item => {
              if (item.type === 'solo') {
                const entry = item.entry
                const isPlaying = entry.state?.playbackState === 'PLAYING'
                const isPaused = entry.state?.playbackState === 'PAUSED_PLAYBACK'
                const isStopped = !entry.state || entry.state.playbackState === 'STOPPED'
                const hasTrack =
                  entry.state &&
                  (entry.state.currentTrack.title || entry.state.currentTrack.stationName)

                return (
                  <li
                    key={entry.speakerName}
                    className="flex items-center gap-3 rounded-lg p-2"
                  >
                    {/* Left: room info + now playing */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-heading">
                          {entry.roomName}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
                            isPlaying && 'bg-emerald-500/15 text-emerald-400',
                            isPaused && 'bg-amber-500/15 text-amber-400',
                            isStopped && 'bg-[var(--bg-tertiary)] text-caption',
                          )}
                        >
                          {isPlaying ? 'Playing' : isPaused ? 'Paused' : 'Stopped'}
                        </span>
                      </div>
                      {entry.state && hasTrack && (
                        <SonosNowPlaying state={entry.state} className="mt-1" />
                      )}
                    </div>

                    {/* Right: action button */}
                    {renderActionButton(
                      entry.speakerName,
                      entry.roomName,
                      isPlaying,
                      isStopped,
                      !!hasTrack,
                    )}
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
              const isExpanded = expandedGroups.has(coordinator.speakerName)

              return (
                <li key={coordinator.speakerName}>
                  {/* Main group row */}
                  <div className="flex items-center gap-3 rounded-lg p-2">
                    {/* Left: group info + now playing */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-heading">
                          {groupLabel}
                        </span>
                        <span className="shrink-0 rounded-full bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-[10px] font-medium text-caption">
                          {allMembers.length}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
                            isPlaying && 'bg-emerald-500/15 text-emerald-400',
                            isPaused && 'bg-amber-500/15 text-amber-400',
                            isStopped && 'bg-[var(--bg-tertiary)] text-caption',
                          )}
                        >
                          {isPlaying ? 'Playing' : isPaused ? 'Paused' : 'Stopped'}
                        </span>
                      </div>
                      {coordinator.state && hasTrack && (
                        <SonosNowPlaying state={coordinator.state} className="mt-1" />
                      )}
                    </div>

                    {/* Right: action button (targets coordinator) */}
                    {renderActionButton(
                      coordinator.speakerName,
                      groupLabel,
                      isPlaying,
                      isStopped,
                      !!hasTrack,
                    )}
                  </div>

                  {/* Expandable member accordion */}
                  <div className="px-2 pb-1">
                    <button
                      onClick={() => toggleGroupExpanded(coordinator.speakerName)}
                      aria-expanded={isExpanded}
                      aria-controls={`group-members-popover-${coordinator.speakerName}`}
                      className={cn(
                        'flex w-full items-center justify-between rounded-md px-2 py-1 text-[11px] font-medium text-caption transition-colors',
                        'hover:bg-[var(--bg-tertiary)]',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
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
                                  'flex h-6 w-6 shrink-0 items-center justify-center rounded text-caption transition-colors',
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
