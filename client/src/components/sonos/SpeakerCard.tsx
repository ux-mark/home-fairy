import { useRef, useEffect, useState } from 'react'
import { Link2, Radio, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SonosPlaybackState, SonosGroupInfo, SonosNowPlayingEntry } from '@/lib/api'
import { UnifiedPlaybackCard } from './UnifiedPlaybackCard'
import { GroupManager } from './GroupManager'

interface CommonProps {
  onRefresh: () => void
  allSpeakers: SonosNowPlayingEntry[]
  focusSpeaker?: string
  showVolume?: boolean
  showQueue?: boolean
}

interface SoloProps extends CommonProps {
  type: 'solo'
  roomName: string
  speakerName: string
  state: SonosPlaybackState | null
  error?: boolean
  group?: SonosGroupInfo | null
}

interface GroupProps extends CommonProps {
  type: 'group'
  coordinator: SonosNowPlayingEntry
  members: SonosNowPlayingEntry[]
}

export type SpeakerCardProps = SoloProps | GroupProps

// ── Solo variant ──────────────────────────────────────────────────────────────

function SoloSpeakerCard({
  roomName,
  speakerName,
  state,
  error,
  onRefresh,
  group,
  allSpeakers,
  focusSpeaker,
  showVolume = false,
  showQueue = true,
}: SoloProps) {
  const isFocused = focusSpeaker === speakerName
  const [groupManagerOpen, setGroupManagerOpen] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isFocused && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [isFocused])

  const isPlaying = state?.playbackState === 'PLAYING'
  const isPaused = state?.playbackState === 'PAUSED_PLAYBACK'
  const isStopped = !state || state.playbackState === 'STOPPED'
  const isGrouped = group && group.members.length > 1
  const groupedWithNames = isGrouped ? group.members.filter(m => m !== speakerName) : []
  const currentMemberSpeakerNames = group?.isCoordinator
    ? group.members.filter(m => m !== speakerName)
    : []

  return (
    <div ref={cardRef} className="card rounded-xl border p-4 transition-colors" style={{ borderColor: 'var(--border-primary)' }}>
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

      <UnifiedPlaybackCard
        speaker={speakerName}
        roomName={roomName}
        state={state}
        group={group}
        allSpeakers={allSpeakers}
        error={error}
        onRefresh={onRefresh}
        variant="card"
        showVolume={showVolume}
        showInlineQueue={showQueue}
        showFullQueue={false}
        queueLimit={5}
        showGroupSpeakers={true}
      />

      <GroupManager
        coordinatorSpeaker={speakerName}
        coordinatorRoom={roomName}
        currentMembers={currentMemberSpeakerNames}
        allSpeakers={allSpeakers}
        open={groupManagerOpen}
        onClose={() => setGroupManagerOpen(false)}
      />
    </div>
  )
}

// ── Group variant ─────────────────────────────────────────────────────────────

function GroupSpeakerCard({
  coordinator,
  members,
  onRefresh,
  allSpeakers,
  focusSpeaker,
  showVolume = false,
  showQueue = true,
}: GroupProps) {
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
  const allMembers = [coordinator, ...members]
  const groupLabel = allMembers.map(e => e.roomName).join(' + ')
  const currentMemberSpeakerNames = members.map(m => m.speakerName)

  const groupInfo = coordinator.group ?? {
    coordinator: coordinatorName,
    members: allGroupNames,
    isCoordinator: true,
  }

  const isPlaying = state?.playbackState === 'PLAYING'
  const isPaused = state?.playbackState === 'PAUSED_PLAYBACK'
  const isStopped = !state || state.playbackState === 'STOPPED'

  return (
    <div
      ref={cardRef}
      className="card rounded-xl border p-4 transition-colors"
      style={{ borderColor: 'var(--border-primary)' }}
      aria-label={`Speaker group: ${groupLabel}`}
    >
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

      <UnifiedPlaybackCard
        speaker={coordinatorName}
        roomName={coordinatorRoom}
        state={state}
        group={groupInfo}
        allSpeakers={allSpeakers}
        onRefresh={onRefresh}
        variant="card"
        showVolume={showVolume}
        showInlineQueue={showQueue}
        showFullQueue={false}
        queueLimit={5}
        showGroupSpeakers={true}
      />

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

// ── Public API ────────────────────────────────────────────────────────────────

export function SpeakerCard(props: SpeakerCardProps) {
  if (props.type === 'solo') {
    return <SoloSpeakerCard {...props} />
  }
  return <GroupSpeakerCard {...props} />
}
