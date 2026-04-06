import { useRef, useEffect, useState } from 'react'
import { Link2, Radio, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SonosPlaybackState, SonosGroupInfo, SonosNowPlayingEntry } from '@/lib/api'
import { SonosVolumeControl } from './SonosVolumeControl'
import { UnifiedPlaybackCard } from './UnifiedPlaybackCard'
import { GroupManager } from './GroupManager'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/useToast'

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
  const { toast } = useToast()
  const isFocused = focusSpeaker === speakerName
  const [groupManagerOpen, setGroupManagerOpen] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isFocused && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [isFocused])

  const volumeMutation = useMutation({
    mutationFn: (level: number) => api.sonos.setVolume(speakerName, level),
    onError: () => toast({ message: `Couldn't update volume for ${roomName}`, type: 'error' }),
  })

  const isPlaying = state?.playbackState === 'PLAYING'
  const isPaused = state?.playbackState === 'PAUSED_PLAYBACK'
  const isStopped = !state || state.playbackState === 'STOPPED'

  const isGrouped = group && group.members.length > 1
  const groupedWithNames = isGrouped
    ? group.members.filter(m => m !== speakerName)
    : []

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

      {/* Unified playback card — card variant, no volume (handled below separately) */}
      <UnifiedPlaybackCard
        speaker={speakerName}
        roomName={roomName}
        state={state}
        group={group}
        allSpeakers={allSpeakers}
        error={error}
        onRefresh={onRefresh}
        variant="card"
        showVolume={false}
        showFullQueue={false}
        queueLimit={5}
        showGroupSpeakers={true}
      />

      {/* Volume control — kept separate per original design */}
      <div className="mt-3">
        <p className="mb-1.5 text-xs font-medium text-caption">Volume</p>
        <SonosVolumeControl
          value={state?.volume ?? 0}
          onChange={level => volumeMutation.mutate(level)}
          label={`${roomName} volume`}
          disabled={!!error}
          loading={volumeMutation.isPending}
        />
      </div>

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
