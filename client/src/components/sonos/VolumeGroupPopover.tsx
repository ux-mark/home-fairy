import { useState, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import * as Popover from '@radix-ui/react-popover'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { SonosVolumeControl } from './SonosVolumeControl'
import type { SonosGroupInfo, SonosNowPlayingEntry } from '@/lib/api'

interface VolumeGroupPopoverProps {
  /** The primary speaker whose volume the main slider controls */
  speaker: string
  /** Current volume for the primary speaker */
  value: number
  /** Called on volume commit for the primary speaker */
  onChange: (level: number) => void
  /** Group info — if null/undefined only the main slider is shown without popover */
  group: SonosGroupInfo | null | undefined
  /** All speaker entries (used to look up room names and volumes) */
  allSpeakers: SonosNowPlayingEntry[]
  /** Accessible label for the main slider */
  label: string
}

/**
 * Volume control for the Playing page.
 *
 * - On mouse: behaves as a normal SonosVolumeControl slider.
 * - On touch (pointerType === 'touch'): opens a Radix Popover just below the
 *   slider, showing a volume control for each speaker in the group. The main
 *   slider gets an X button overlay while the popover is open.
 *
 * Per the spec the popover only appears when a group exists; a solo speaker
 * just shows the regular slider.
 */
export function VolumeGroupPopover({
  speaker,
  value,
  onChange,
  group,
  allSpeakers,
  label,
}: VolumeGroupPopoverProps) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)

  // Group members: coordinator + all members
  const groupMembers = group?.members ?? []
  const isGrouped = groupMembers.length > 1

  function handlePointerDown(e: React.PointerEvent) {
    if (e.pointerType === 'touch' && isGrouped) {
      setOpen(true)
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div onPointerDown={handlePointerDown}>
        {/* Main volume slider — X thumb overlay is managed inside SonosVolumeControl */}
        <SonosVolumeControl
          value={value}
          onChange={onChange}
          label={label}
          isPopoverOpen={open}
          onClosePopover={() => setOpen(false)}
        />
      </div>

      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={8}
          className={cn(
            'z-50 w-[calc(100vw-2rem)] max-w-sm rounded-xl',
            'border border-[var(--border-primary)] bg-[var(--bg-secondary)] shadow-xl',
            'p-4',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
            'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
          )}
          aria-label="Group speaker volumes"
        >
          <p className="mb-3 text-xs font-medium text-caption">Speaker volumes</p>
          <GroupMemberVolumes
            groupMembers={groupMembers}
            allSpeakers={allSpeakers}
            primarySpeaker={speaker}
            primaryValue={value}
            onPrimaryChange={onChange}
            toast={toast}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

// ── Group member volume sliders ───────────────────────────────────────────────

function GroupMemberVolumes({
  groupMembers,
  allSpeakers,
  primarySpeaker,
  primaryValue,
  onPrimaryChange,
  toast,
}: {
  groupMembers: string[]
  allSpeakers: SonosNowPlayingEntry[]
  primarySpeaker: string
  primaryValue: number
  onPrimaryChange: (level: number) => void
  toast: ReturnType<typeof import('@/hooks/useToast').useToast>['toast']
}) {
  return (
    <div className="flex flex-col gap-3">
      {groupMembers.map(speakerName => {
        const entry = allSpeakers.find(e => e.speakerName === speakerName)
        const roomName = entry?.roomName ?? speakerName
        const currentVolume = entry?.state?.volume ?? 0
        const isPrimary = speakerName === primarySpeaker

        return (
          <MemberVolumeSlider
            key={speakerName}
            speakerName={speakerName}
            roomName={roomName}
            value={isPrimary ? primaryValue : currentVolume}
            onChange={isPrimary ? onPrimaryChange : undefined}
            toast={toast}
          />
        )
      })}
    </div>
  )
}

function MemberVolumeSlider({
  speakerName,
  roomName,
  value,
  onChange,
  toast,
}: {
  speakerName: string
  roomName: string
  value: number
  onChange?: (level: number) => void
  toast: ReturnType<typeof import('@/hooks/useToast').useToast>['toast']
}) {
  const mutation = useMutation({
    mutationFn: (level: number) => api.sonos.setVolume(speakerName, level),
    onError: () => toast({ message: `Couldn't update ${roomName} volume`, type: 'error' }),
  })

  const handleChange = useCallback(
    (level: number) => {
      if (onChange) {
        onChange(level)
      } else {
        mutation.mutate(level)
      }
    },
    [onChange, mutation],
  )

  return (
    <div>
      <p className="mb-1 text-xs text-caption">{roomName}</p>
      <SonosVolumeControl
        value={value}
        onChange={handleChange}
        label={`${roomName} volume`}
      />
    </div>
  )
}
