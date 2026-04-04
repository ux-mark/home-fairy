import { useState, useCallback, useRef, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Play, Pause, Music, Loader2, Link2, Radio, SkipBack, SkipForward, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import type { SonosPlaybackState, SonosGroupInfo, SonosNowPlayingEntry } from '@/lib/api'
import { SonosNowPlaying } from './SonosNowPlaying'
import { SonosVolumeControl } from './SonosVolumeControl'
import { InlineQueue } from './InlineQueue'
import { SpeakerMusicPicker } from './SpeakerMusicPicker'
import { GroupManager } from './GroupManager'

interface SonosSpeakerCardProps {
  roomName: string
  speakerName: string
  state: SonosPlaybackState | null
  error?: boolean
  onRefresh: () => void
  group?: SonosGroupInfo | null
  allSpeakers: SonosNowPlayingEntry[]
  focusSpeaker?: string
}

export function SonosSpeakerCard({
  roomName,
  speakerName,
  state,
  error,
  onRefresh,
  group,
  allSpeakers,
  focusSpeaker,
}: SonosSpeakerCardProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [musicDialogOpen, setMusicDialogOpen] = useState(false)
  const isFocused = focusSpeaker === speakerName
  const [queueExpanded, setQueueExpanded] = useState(isFocused)
  const [groupManagerOpen, setGroupManagerOpen] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isFocused && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [isFocused])

  const invalidateNowPlaying = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['sonos', 'now-playing'] })
  }, [queryClient])

  const playMutation = useMutation({
    mutationFn: () => api.sonos.play(speakerName),
    onSuccess: invalidateNowPlaying,
    onError: () => toast({ message: `Couldn't play ${roomName}`, type: 'error' }),
  })

  const pauseMutation = useMutation({
    mutationFn: () => api.sonos.pause(speakerName),
    onSuccess: invalidateNowPlaying,
    onError: () => toast({ message: `Couldn't pause ${roomName}`, type: 'error' }),
  })

  const nextMutation = useMutation({
    mutationFn: () => api.sonos.next(speakerName),
    onSuccess: invalidateNowPlaying,
    onError: () => toast({ message: `Couldn't skip track on ${roomName}`, type: 'error' }),
  })

  const previousMutation = useMutation({
    mutationFn: () => api.sonos.previous(speakerName),
    onSuccess: invalidateNowPlaying,
    onError: () => toast({ message: `Couldn't go back on ${roomName}`, type: 'error' }),
  })

  const volumeMutation = useMutation({
    mutationFn: (level: number) => api.sonos.setVolume(speakerName, level),
    onError: () => toast({ message: `Couldn't update volume for ${roomName}`, type: 'error' }),
  })

  function handleVolumeChange(level: number) {
    volumeMutation.mutate(level)
  }

  const isPlaying = state?.playbackState === 'PLAYING'
  const isPaused = state?.playbackState === 'PAUSED_PLAYBACK'
  const isStopped = !state || state.playbackState === 'STOPPED'
  const hasTrack = state && (state.currentTrack.title || state.currentTrack.stationName)

  const anyActionPending = playMutation.isPending || pauseMutation.isPending
  const isSkipDisabled = isStopped || state?.inputSource === 'tv' || state?.inputSource === 'line-in' || !!error
  const skipDisabledTitle = state?.inputSource === 'tv' || state?.inputSource === 'line-in'
    ? "Skip isn't available for this source"
    : undefined

  const isGrouped = group && group.members.length > 1
  const groupedWithNames = isGrouped
    ? group.members.filter(m => m !== speakerName)
    : []

  // Current members of this speaker's group (excluding coordinator/self)
  const currentGroupMembers = group?.isCoordinator
    ? group.members.filter(m => m !== speakerName)
    : []

  return (
    <div ref={cardRef} className="card rounded-xl border p-4 transition-colors" style={{ borderColor: 'var(--border-primary)' }}>
      {/* Header: room name + group button + playback badge */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-heading">{roomName}</h3>
            <button
              onClick={() => setGroupManagerOpen(true)}
              aria-label={`Manage group for ${roomName}`}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg text-caption transition-colors',
                'hover:bg-[var(--bg-secondary)]',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              )}
            >
              <Users className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {/* Group label */}
          {isGrouped && (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-caption">
              {group.isCoordinator ? (
                <Link2 className="h-3 w-3 shrink-0 text-fairy-400" aria-hidden="true" />
              ) : (
                <Radio className="h-3 w-3 shrink-0 text-fairy-400" aria-hidden="true" />
              )}
              {group.isCoordinator
                ? `Grouped with ${groupedWithNames.join(', ')}`
                : `Following ${group.coordinator}`}
            </p>
          )}
        </div>
        <span className={cn(
          'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
          isPlaying && 'bg-emerald-500/15 text-emerald-400',
          isPaused && 'bg-amber-500/15 text-amber-400',
          isStopped && 'bg-[var(--bg-tertiary)] text-caption',
        )}>
          {isPlaying ? 'Playing' : isPaused ? 'Paused' : 'Stopped'}
        </span>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          Could not reach this speaker.{' '}
          <button
            onClick={onRefresh}
            className="underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            Retry
          </button>
        </div>
      )}

      {/* Now playing (when track is known) */}
      {state && hasTrack && (
        <SonosNowPlaying state={state} className="mb-3" />
      )}

      {/* Idle state — no track */}
      {!error && (!state || !hasTrack) && (
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
          onClick={() => isPlaying ? pauseMutation.mutate() : playMutation.mutate()}
          disabled={anyActionPending || !!error}
          aria-label={isPlaying ? `Pause ${roomName}` : `Play ${roomName}`}
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
          {anyActionPending && (playMutation.isPending || pauseMutation.isPending) ? (
            <Loader2 className="h-5 w-5 animate-spin" />
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
          aria-label={`Change music on ${roomName}`}
        >
          <Music className="h-4 w-4 shrink-0" aria-hidden="true" />
          Change music
        </button>
      </div>

      {/* Volume control */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-caption">Volume</p>
        <SonosVolumeControl
          value={state?.volume ?? 0}
          onChange={handleVolumeChange}
          label={`${roomName} volume`}
          disabled={!!error}
        />
      </div>

      {/* Inline queue */}
      <InlineQueue
        speaker={speakerName}
        currentTrackUri={state?.currentTrack?.uri ?? null}
        expanded={queueExpanded}
        onToggle={() => setQueueExpanded(v => !v)}
      />

      {/* Music picker bottom sheet */}
      <SpeakerMusicPicker
        speakerName={speakerName}
        roomName={roomName}
        open={musicDialogOpen}
        onClose={() => setMusicDialogOpen(false)}
        isPlaying={isPlaying}
        isPaused={isPaused}
      />

      {/* Group manager bottom sheet */}
      <GroupManager
        coordinatorSpeaker={speakerName}
        coordinatorRoom={roomName}
        currentMembers={currentGroupMembers}
        allSpeakers={allSpeakers}
        open={groupManagerOpen}
        onClose={() => setGroupManagerOpen(false)}
      />
    </div>
  )
}
