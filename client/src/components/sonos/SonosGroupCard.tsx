import { useRef, useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import type { SonosPlaybackState, SonosNowPlayingEntry } from '@/lib/api'
import { SonosVolumeControl } from './SonosVolumeControl'
import { UnifiedPlaybackCard } from './UnifiedPlaybackCard'
import { GroupManager } from './GroupManager'

interface SonosGroupCardProps {
  coordinator: SonosNowPlayingEntry
  members: SonosNowPlayingEntry[]
  onRefresh: () => void
  allSpeakers: SonosNowPlayingEntry[]
  focusSpeaker?: string
}

export function SonosGroupCard({ coordinator, members, onRefresh, allSpeakers, focusSpeaker }: SonosGroupCardProps) {
  const { toast } = useToast()
  const allGroupNames = [coordinator.speakerName, ...members.map(m => m.speakerName)]
  const isFocused = focusSpeaker != null && allGroupNames.includes(focusSpeaker)
  const [groupManagerOpen, setGroupManagerOpen] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isFocused && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [isFocused])

  const coordinatorName = coordinator.speakerName
  const coordinatorRoom = coordinator.roomName
  const state: SonosPlaybackState | null = coordinator.state

  const volumeMutation = useMutation({
    mutationFn: (level: number) => api.sonos.setVolume(coordinatorName, level),
    onError: () => toast({ message: `Couldn't update group volume`, type: 'error' }),
  })

  const isPlaying = state?.playbackState === 'PLAYING'
  const isPaused = state?.playbackState === 'PAUSED_PLAYBACK'
  const isStopped = !state || state.playbackState === 'STOPPED'

  const allMembers = [coordinator, ...members]
  const groupLabel = allMembers.map(e => e.roomName).join(' + ')
  const currentMemberSpeakerNames = members.map(m => m.speakerName)

  // Build a SonosGroupInfo shape for UnifiedPlaybackCard
  const groupInfo = coordinator.group ?? {
    coordinator: coordinatorName,
    members: allGroupNames,
    isCoordinator: true,
  }

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

      {/* Unified playback card — card variant */}
      <UnifiedPlaybackCard
        speaker={coordinatorName}
        roomName={coordinatorRoom}
        state={state}
        group={groupInfo}
        allSpeakers={allSpeakers}
        onRefresh={onRefresh}
        variant="card"
        showVolume={false}
        showFullQueue={false}
        queueLimit={5}
        showGroupSpeakers={true}
      />

      {/* Volume control — kept separate */}
      <div className="mt-3">
        <p className="mb-1.5 text-xs font-medium text-caption">Volume</p>
        <SonosVolumeControl
          value={state?.volume ?? 0}
          onChange={level => volumeMutation.mutate(level)}
          label="Group volume"
        />
      </div>

      {/* Group manager */}
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
