import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { api, type SonosNowPlayingEntry } from '@/lib/api'
import { ActionPopover } from '@/components/ui/ActionPopover'
import { SpeakerCard } from './SpeakerCard'

interface HomeSpeakerPopoverProps {
  open: boolean
  onClose: () => void
  triggerRef?: React.RefObject<HTMLButtonElement | null>
  borderColor?: string
}

// ── Main popover ──────────────────────────────────────────────────────────────

export function HomeSpeakerPopover({ open, onClose, triggerRef, borderColor }: HomeSpeakerPopoverProps) {
  const queryClient = useQueryClient()

  // Now-playing query — only when popover is open
  const { data: nowPlaying = [], isLoading } = useQuery({
    queryKey: ['sonos', 'now-playing'],
    queryFn: api.sonos.getNowPlaying,
    enabled: open,
    refetchInterval: open ? 5_000 : false,
    staleTime: 4_000,
    retry: false,
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
                return (
                  <li key={entry.speakerName}>
                    <SpeakerCard
                      type="solo"
                      roomName={entry.roomName}
                      speakerName={entry.speakerName}
                      state={entry.state ?? null}
                      group={entry.group ?? null}
                      allSpeakers={nowPlaying}
                      onRefresh={() => queryClient.invalidateQueries({ queryKey: ['sonos', 'now-playing'] })}
                      showVolume={false}
                      showQueue={false}
                    />
                  </li>
                )
              }

              // Grouped speaker row
              const { coordinator, members } = item

              return (
                <li key={coordinator.speakerName}>
                  <SpeakerCard
                    type="group"
                    coordinator={coordinator}
                    members={members}
                    allSpeakers={nowPlaying}
                    onRefresh={() => queryClient.invalidateQueries({ queryKey: ['sonos', 'now-playing'] })}
                    showVolume={false}
                    showQueue={false}
                  />
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </ActionPopover>
  )
}
