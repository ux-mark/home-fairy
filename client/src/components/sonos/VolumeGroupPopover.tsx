import { useState, useCallback, useRef, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as Popover from '@radix-ui/react-popover'
import { X } from 'lucide-react'
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
  /** Group info — popover only shows when grouped */
  group: SonosGroupInfo | null | undefined
  /** All speaker entries (used to look up room names and volumes) */
  allSpeakers: SonosNowPlayingEntry[]
  /** Accessible label for the main slider */
  label: string
}

/**
 * Volume control with group popover for the Playing page.
 *
 * When the user drags the main slider on a grouped speaker, a popover
 * appears below showing each group member's volume. The main slider
 * uses groupVolume so all speakers adjust proportionally. Member
 * sliders update in real-time during the drag.
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
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  // Only show group members in the popover
  const groupMembers = group?.members ?? []
  const isGrouped = groupMembers.length > 1

  // Build speaker list from group members only
  const speakerList: SonosNowPlayingEntry[] = []
  for (const name of groupMembers) {
    const entry = allSpeakers.find(e => e.speakerName === name)
    if (entry) speakerList.push(entry)
  }

  // Snapshot member volumes when the popover opens, so we can compute
  // relative offsets during drag
  const baseVolumes = useRef<Map<string, number>>(new Map())
  const baseMainVolume = useRef(value)

  // Delta-driven member volumes during main slider drag
  const [memberOverrides, setMemberOverrides] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    if (open) {
      // Capture snapshot on open
      const snap = new Map<string, number>()
      for (const entry of speakerList) {
        snap.set(entry.speakerName, entry.state?.volume ?? 0)
      }
      baseVolumes.current = snap
      baseMainVolume.current = value
      setMemberOverrides(new Map())
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleInteractionStart() {
    if (isGrouped && !open) {
      setOpen(true)
    }
  }

  // While dragging the main slider, update member displays proportionally
  function handleMainDrag(level: number) {
    const delta = level - baseMainVolume.current
    const overrides = new Map<string, number>()
    for (const [name, base] of baseVolumes.current) {
      overrides.set(name, Math.max(0, Math.min(100, base + delta)))
    }
    setMemberOverrides(overrides)
  }

  // On commit, use groupVolume API so Sonos adjusts all speakers
  const groupVolumeMutation = useMutation({
    mutationFn: (level: number) => api.sonos.setGroupVolume(speaker, level),
    onSuccess: () => {
      // Refetch now-playing after a short delay to get updated volumes
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['sonos', 'now-playing'] })
      }, 500)
    },
    onError: () => toast({ message: 'Could not update group volume', type: 'error' }),
  })

  function handleMainCommit(level: number) {
    if (isGrouped) {
      groupVolumeMutation.mutate(level)
    } else {
      onChange(level)
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <div>
          <SonosVolumeControl
            value={value}
            onChange={handleMainCommit}
            onDragChange={open ? handleMainDrag : undefined}
            label={label}
            onInteractionStart={handleInteractionStart}
            loading={groupVolumeMutation.isPending}
          />
        </div>
      </Popover.Anchor>

      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={8}
          onOpenAutoFocus={e => e.preventDefault()}
          onInteractOutside={() => setOpen(false)}
          className={cn(
            'z-50 w-[calc(100vw-2rem)] max-w-sm rounded-xl',
            'border border-[var(--border-primary)] bg-[var(--bg-secondary)] shadow-xl',
            'p-4',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
            'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
          )}
          aria-label="Speaker volumes"
        >
          {/* Header with close button */}
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-medium text-caption">Speaker volumes</p>
            <Popover.Close asChild>
              <button
                aria-label="Close speaker volumes"
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                  'text-caption hover:bg-[var(--bg-tertiary)] hover:text-body',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                )}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </Popover.Close>
          </div>
          <div className="flex flex-col gap-3">
            {speakerList.map(entry => {
              const serverVolume = entry.state?.volume ?? 0
              // Use drag override if available, otherwise server value
              const displayVolume = memberOverrides.get(entry.speakerName) ?? serverVolume
              return (
                <MemberVolumeSlider
                  key={entry.speakerName}
                  speakerName={entry.speakerName}
                  roomName={entry.roomName}
                  value={displayVolume}
                  toast={toast}
                />
              )
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

// ── Member volume slider ─────────────────────────────────────────────────────

function MemberVolumeSlider({
  speakerName,
  roomName,
  value,
  toast,
}: {
  speakerName: string
  roomName: string
  value: number
  toast: ReturnType<typeof import('@/hooks/useToast').useToast>['toast']
}) {
  const mutation = useMutation({
    mutationFn: (level: number) => api.sonos.setVolume(speakerName, level),
    onError: () => toast({ message: `Couldn't update ${roomName} volume`, type: 'error' }),
  })

  const handleChange = useCallback(
    (level: number) => {
      mutation.mutate(level)
    },
    [mutation],
  )

  return (
    <div>
      <p className="mb-1 text-xs text-caption">{roomName}</p>
      <SonosVolumeControl
        value={value}
        onChange={handleChange}
        label={`${roomName} volume`}
        loading={mutation.isPending}
      />
    </div>
  )
}
