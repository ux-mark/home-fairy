import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import type { SonosGroupInfo, SonosNowPlayingEntry } from '@/lib/api'
import { SonosVolumeControl } from './SonosVolumeControl'
import { VolumeGroupPopover } from './VolumeGroupPopover'

interface SpeakerVolumeControlProps {
  /** Speaker name used for the volume API call */
  speaker: string
  /** Display name (used in default label and error toast) */
  roomName: string
  /** Current volume 0–100 */
  volume: number
  /** Group info — when members > 1, renders the group popover variant */
  group?: SonosGroupInfo | null
  /** All speaker entries (needed for group popover member volumes) */
  allSpeakers?: SonosNowPlayingEntry[]
  /** Accessible label override (defaults to "{roomName} volume") */
  label?: string
  /** Error toast message override (defaults to "Couldn't update volume for {roomName}") */
  errorMessage?: string
  /** Disable the control */
  disabled?: boolean
}

/**
 * Unified volume control for speakers.
 *
 * - Solo speakers → plain SonosVolumeControl slider
 * - Grouped speakers → VolumeGroupPopover that opens on interaction,
 *   showing each member's volume with real-time proportional updates
 *
 * Manages its own mutation — parent doesn't need to handle volume state.
 */
export function SpeakerVolumeControl({
  speaker,
  roomName,
  volume,
  group,
  allSpeakers = [],
  label,
  errorMessage,
  disabled = false,
}: SpeakerVolumeControlProps) {
  const { toast } = useToast()

  const volumeMutation = useMutation({
    mutationFn: (level: number) => api.sonos.setVolume(speaker, level),
    onError: () =>
      toast({
        message: errorMessage ?? `Couldn't update volume for ${roomName}`,
        type: 'error',
      }),
  })

  const isGrouped = group != null && group.members.length > 1
  const resolvedLabel = label ?? `${roomName} volume`

  if (isGrouped) {
    return (
      <VolumeGroupPopover
        speaker={speaker}
        value={volume}
        onChange={level => volumeMutation.mutate(level)}
        group={group}
        allSpeakers={allSpeakers}
        label={resolvedLabel}
      />
    )
  }

  return (
    <SonosVolumeControl
      value={volume}
      onChange={level => volumeMutation.mutate(level)}
      label={resolvedLabel}
      disabled={disabled}
      loading={volumeMutation.isPending}
    />
  )
}
