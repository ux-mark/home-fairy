import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Users, X } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import type { SonosNowPlayingEntry } from '@/lib/api'

// ── Props ─────────────────────────────────────────────────────────────────────

export interface GroupManagerProps {
  coordinatorSpeaker: string
  coordinatorRoom: string
  currentMembers: string[]       // speaker names currently in the group (excluding coordinator)
  allSpeakers: SonosNowPlayingEntry[]
  open: boolean
  onClose: () => void
}

// ── GroupManager ──────────────────────────────────────────────────────────────

export function GroupManager({
  coordinatorSpeaker,
  coordinatorRoom,
  currentMembers,
  allSpeakers,
  open,
  onClose,
}: GroupManagerProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // Speakers other than the coordinator
  const otherSpeakers = allSpeakers.filter(e => e.speakerName !== coordinatorSpeaker)

  function invalidateQueries() {
    queryClient.invalidateQueries({ queryKey: ['sonos', 'now-playing'] })
    queryClient.invalidateQueries({ queryKey: ['sonos', 'zones'] })
  }

  const joinMutation = useMutation({
    mutationFn: (speaker: string) => api.sonos.joinGroup(speaker, coordinatorSpeaker),
    onSuccess: (_data, speaker) => {
      invalidateQueries()
      const entry = allSpeakers.find(e => e.speakerName === speaker)
      const roomName = entry?.roomName ?? speaker
      toast({ message: `${roomName} joined the group` })
    },
    onError: (_err, speaker) => {
      const entry = allSpeakers.find(e => e.speakerName === speaker)
      const roomName = entry?.roomName ?? speaker
      toast({ message: `Couldn't add ${roomName} to the group`, type: 'error' })
    },
  })

  const leaveMutation = useMutation({
    mutationFn: (speaker: string) => api.sonos.leaveGroup(speaker),
    onSuccess: (_data, speaker) => {
      invalidateQueries()
      const entry = allSpeakers.find(e => e.speakerName === speaker)
      const roomName = entry?.roomName ?? speaker
      toast({ message: `${roomName} removed from the group` })
    },
    onError: (_err, speaker) => {
      const entry = allSpeakers.find(e => e.speakerName === speaker)
      const roomName = entry?.roomName ?? speaker
      toast({ message: `Couldn't remove ${roomName} from the group`, type: 'error' })
    },
  })

  function handleToggle(speakerName: string, isCurrentlyInGroup: boolean) {
    if (isCurrentlyInGroup) {
      leaveMutation.mutate(speakerName)
    } else {
      joinMutation.mutate(speakerName)
    }
  }

  function isPending(speakerName: string): boolean {
    return (
      (joinMutation.isPending && joinMutation.variables === speakerName) ||
      (leaveMutation.isPending && leaveMutation.variables === speakerName)
    )
  }

  return (
    <Dialog.Root open={open} onOpenChange={val => { if (!val) onClose() }}>
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
          {/* Header */}
          <div className="mb-5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Users className="h-5 w-5 text-fairy-400" aria-hidden="true" />
              <Dialog.Title className="text-base font-semibold text-heading">
                Group {coordinatorRoom}
              </Dialog.Title>
            </div>
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

          {/* Description */}
          <p className="mb-4 text-sm text-caption">
            Select speakers to add to this group. Uncheck a speaker to remove it.
          </p>

          {otherSpeakers.length === 0 ? (
            <p className="py-6 text-center text-sm text-caption">No other speakers available.</p>
          ) : (
            <ul className="flex flex-col gap-2" aria-label="Available speakers">
              {otherSpeakers.map(entry => {
                const isInGroup = currentMembers.includes(entry.speakerName)
                const pending = isPending(entry.speakerName)
                const checkboxId = `group-speaker-${entry.speakerName}`

                return (
                  <li key={entry.speakerName}>
                    <label
                      htmlFor={checkboxId}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3 transition-colors',
                        'bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]',
                        'min-h-[56px]',
                      )}
                    >
                      <div className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                        {pending ? (
                          <Loader2 className="h-5 w-5 animate-spin text-fairy-400" aria-hidden="true" />
                        ) : (
                          <input
                            id={checkboxId}
                            type="checkbox"
                            checked={isInGroup}
                            onChange={() => handleToggle(entry.speakerName, isInGroup)}
                            disabled={pending}
                            className={cn(
                              'h-5 w-5 cursor-pointer rounded border-[var(--border-primary)] bg-[var(--bg-tertiary)]',
                              'accent-fairy-500',
                              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                            )}
                            aria-label={`${isInGroup ? 'Remove' : 'Add'} ${entry.roomName} ${isInGroup ? 'from' : 'to'} group`}
                          />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-heading">{entry.roomName}</p>
                        {entry.state && (
                          <p className="mt-0.5 truncate text-xs text-caption">
                            {entry.state.playbackState === 'PLAYING'
                              ? `Playing — ${entry.state.currentTrack.title || 'Unknown'}`
                              : entry.state.playbackState === 'PAUSED_PLAYBACK'
                              ? 'Paused'
                              : 'Stopped'}
                          </p>
                        )}
                      </div>

                      {isInGroup && !pending && (
                        <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                          In group
                        </span>
                      )}
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
