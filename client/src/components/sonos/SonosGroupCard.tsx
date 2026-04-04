import { useState, useCallback, useRef, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Play, Pause, Music, Loader2, X, ChevronDown, ChevronUp, SkipBack, SkipForward, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import type { SonosPlaybackState, SonosNowPlayingEntry } from '@/lib/api'
import { SonosNowPlaying } from './SonosNowPlaying'
import { SonosVolumeControl } from './SonosVolumeControl'
import { InlineQueue } from './InlineQueue'
import { SpeakerMusicPicker } from './SpeakerMusicPicker'
import { GroupManager } from './GroupManager'

interface SonosGroupCardProps {
  coordinator: SonosNowPlayingEntry
  members: SonosNowPlayingEntry[]
  onRefresh: () => void
  allSpeakers: SonosNowPlayingEntry[]
  focusSpeaker?: string
}

function MemberRow({
  entry,
  coordinatorName,
  onRemove,
  isRemoving,
}: {
  entry: SonosNowPlayingEntry
  coordinatorName: string
  onRemove: (speakerName: string) => void
  isRemoving: boolean
}) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5">
      <span className="truncate text-sm text-body">{entry.roomName}</span>
      {entry.speakerName !== coordinatorName && (
        <button
          onClick={() => onRemove(entry.speakerName)}
          disabled={isRemoving}
          aria-label={`Remove ${entry.roomName} from group`}
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-caption transition-colors',
            'hover:bg-red-500/15 hover:text-red-400',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            'disabled:opacity-40',
          )}
        >
          {isRemoving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
      )}
    </li>
  )
}

export function SonosGroupCard({ coordinator, members, onRefresh, allSpeakers, focusSpeaker }: SonosGroupCardProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [musicDialogOpen, setMusicDialogOpen] = useState(false)
  const [membersExpanded, setMembersExpanded] = useState(false)
  const allGroupNames = [coordinator.speakerName, ...members.map(m => m.speakerName)]
  const isFocused = focusSpeaker != null && allGroupNames.includes(focusSpeaker)
  const [queueExpanded, setQueueExpanded] = useState(isFocused)
  const [groupManagerOpen, setGroupManagerOpen] = useState(false)
  const [removingMember, setRemovingMember] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isFocused && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [isFocused])

  const coordinatorName = coordinator.speakerName
  const coordinatorRoom = coordinator.roomName
  const state: SonosPlaybackState | null = coordinator.state

  const invalidateQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['sonos', 'now-playing'] })
    queryClient.invalidateQueries({ queryKey: ['sonos', 'zones'] })
  }, [queryClient])

  const playMutation = useMutation({
    mutationFn: () => api.sonos.play(coordinatorName),
    onSuccess: invalidateQueries,
    onError: () => toast({ message: `Couldn't play group`, type: 'error' }),
  })

  const pauseMutation = useMutation({
    mutationFn: () => api.sonos.pause(coordinatorName),
    onSuccess: invalidateQueries,
    onError: () => toast({ message: `Couldn't pause group`, type: 'error' }),
  })

  const nextMutation = useMutation({
    mutationFn: () => api.sonos.next(coordinatorName),
    onSuccess: invalidateQueries,
    onError: () => toast({ message: `Couldn't skip track`, type: 'error' }),
  })

  const previousMutation = useMutation({
    mutationFn: () => api.sonos.previous(coordinatorName),
    onSuccess: invalidateQueries,
    onError: () => toast({ message: `Couldn't go back`, type: 'error' }),
  })

  const volumeMutation = useMutation({
    mutationFn: (level: number) => api.sonos.setVolume(coordinatorName, level),
    onError: () => toast({ message: `Couldn't update group volume`, type: 'error' }),
  })

  const leaveMutation = useMutation({
    mutationFn: (speakerName: string) => api.sonos.leaveGroup(speakerName),
    onSuccess: (_data, speakerName) => {
      setRemovingMember(null)
      invalidateQueries()
      onRefresh()
      const entry = members.find(m => m.speakerName === speakerName)
      const roomName = entry?.roomName ?? speakerName
      toast({ message: `${roomName} removed from group` })
    },
    onError: (_err, speakerName) => {
      setRemovingMember(null)
      const entry = members.find(m => m.speakerName === speakerName)
      const roomName = entry?.roomName ?? speakerName
      toast({ message: `Couldn't remove ${roomName} from group`, type: 'error' })
    },
  })

  function handleVolumeChange(level: number) {
    volumeMutation.mutate(level)
  }

  function handleRemoveMember(speakerName: string) {
    setRemovingMember(speakerName)
    leaveMutation.mutate(speakerName)
  }

  const isPlaying = state?.playbackState === 'PLAYING'
  const isPaused = state?.playbackState === 'PAUSED_PLAYBACK'
  const isStopped = !state || state.playbackState === 'STOPPED'
  const hasTrack = state && (state.currentTrack.title || state.currentTrack.stationName)

  const anyActionPending = playMutation.isPending || pauseMutation.isPending
  const isSkipDisabled = isStopped || state?.inputSource === 'tv' || state?.inputSource === 'line-in'
  const skipDisabledTitle = state?.inputSource === 'tv' || state?.inputSource === 'line-in'
    ? "Skip isn't available for this source"
    : undefined

  // All members including coordinator, for display
  const allMembers = [coordinator, ...members]
  const groupLabel = allMembers.map(e => e.roomName).join(' + ')

  // Current non-coordinator member speaker names for GroupManager
  const currentMemberSpeakerNames = members.map(m => m.speakerName)

  return (
    <div
      ref={cardRef}
      className="card rounded-xl border p-4 transition-colors"
      style={{ borderColor: 'var(--border-primary)' }}
      aria-label={`Speaker group: ${groupLabel}`}
    >
      {/* Header: group name + group button + playback badge */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-heading">{groupLabel}</h3>
            <button
              onClick={() => setGroupManagerOpen(true)}
              aria-label={`Manage speakers in ${coordinatorRoom} group`}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg text-caption transition-colors',
                'hover:bg-[var(--bg-secondary)]',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              )}
            >
              <Users className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-0.5 text-[11px] text-caption">
            {allMembers.length} speakers
          </p>
        </div>
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

      {/* Now playing */}
      {state && hasTrack && <SonosNowPlaying state={state} className="mb-3" />}
      {(!state || !hasTrack) && (
        <p className="mb-3 text-sm text-caption">Nothing playing</p>
      )}

      {/* Playback controls */}
      <div className="mb-3 flex items-center gap-2">
        {/* Skip back */}
        <button
          onClick={() => previousMutation.mutate()}
          disabled={isSkipDisabled || previousMutation.isPending}
          aria-label="Previous track"
          title={skipDisabledTitle}
          className={cn(
            'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            'surface',
            isSkipDisabled || previousMutation.isPending
              ? 'text-slate-500 opacity-40 cursor-not-allowed'
              : 'text-slate-400 hover:brightness-95 dark:hover:brightness-110',
          )}
        >
          <SkipBack className="h-5 w-5" aria-hidden="true" />
        </button>

        {/* Play / Pause toggle */}
        <button
          onClick={() => (isPlaying ? pauseMutation.mutate() : playMutation.mutate())}
          disabled={anyActionPending}
          aria-label={isPlaying ? `Pause group` : `Play group`}
          aria-pressed={isPlaying}
          className={cn(
            'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            'disabled:opacity-50',
            isPlaying
              ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
              : 'surface text-body hover:brightness-95 dark:hover:brightness-110',
          )}
        >
          {anyActionPending ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : isPlaying ? (
            <Pause className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Play className="h-5 w-5" aria-hidden="true" />
          )}
        </button>

        {/* Skip forward */}
        <button
          onClick={() => nextMutation.mutate()}
          disabled={isSkipDisabled || nextMutation.isPending}
          aria-label="Next track"
          title={skipDisabledTitle}
          className={cn(
            'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            'surface',
            isSkipDisabled || nextMutation.isPending
              ? 'text-slate-500 opacity-40 cursor-not-allowed'
              : 'text-slate-400 hover:brightness-95 dark:hover:brightness-110',
          )}
        >
          <SkipForward className="h-5 w-5" aria-hidden="true" />
        </button>

        {/* Change music */}
        <button
          onClick={() => setMusicDialogOpen(true)}
          className={cn(
            'flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors',
            'surface text-body hover:brightness-95 dark:hover:brightness-110',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
          aria-label={`Change music for group`}
        >
          <Music className="h-4 w-4 shrink-0" aria-hidden="true" />
          Change music
        </button>
      </div>

      {/* Volume control */}
      <div className="mb-3">
        <p className="mb-1.5 text-xs font-medium text-caption">Volume</p>
        <SonosVolumeControl
          value={state?.volume ?? 0}
          onChange={handleVolumeChange}
          label={`Group volume`}
        />
      </div>

      {/* Member list — expandable */}
      <div>
        <button
          onClick={() => setMembersExpanded(prev => !prev)}
          aria-expanded={membersExpanded}
          aria-controls={`group-members-${coordinatorName}`}
          className={cn(
            'flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs font-medium text-caption transition-colors',
            'min-h-[44px]',
            'hover:bg-[var(--bg-secondary)]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
        >
          <span>Speakers in this group</span>
          {membersExpanded ? (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>

        {membersExpanded && (
          <ul
            id={`group-members-${coordinatorName}`}
            className="mt-1 space-y-0.5"
            aria-label={`Members of ${coordinatorRoom} group`}
          >
            {allMembers.map(entry => (
              <MemberRow
                key={entry.speakerName}
                entry={entry}
                coordinatorName={coordinatorName}
                onRemove={handleRemoveMember}
                isRemoving={removingMember === entry.speakerName}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Inline queue */}
      <InlineQueue
        speaker={coordinatorName}
        currentTrackUri={state?.currentTrack?.uri ?? null}
        expanded={queueExpanded}
        onToggle={() => setQueueExpanded(v => !v)}
      />

      {/* Music picker bottom sheet */}
      <SpeakerMusicPicker
        speakerName={coordinatorName}
        roomName={coordinatorRoom}
        open={musicDialogOpen}
        onClose={() => setMusicDialogOpen(false)}
        isPlaying={isPlaying}
        isPaused={isPaused}
      />

      {/* Group manager bottom sheet */}
      <GroupManager
        coordinatorSpeaker={coordinatorName}
        coordinatorRoom={coordinatorRoom}
        currentMembers={currentMemberSpeakerNames}
        allSpeakers={allSpeakers}
        open={groupManagerOpen}
        onClose={() => setGroupManagerOpen(false)}
      />
    </div>
  )
}
