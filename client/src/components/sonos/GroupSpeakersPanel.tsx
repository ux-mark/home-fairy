import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Loader2, Speaker, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import type { SonosGroupInfo, SonosNowPlayingEntry } from '@/lib/api'

interface GroupSpeakersPanelProps {
  /** The coordinator's speaker name */
  coordinatorSpeaker: string
  group: SonosGroupInfo | null | undefined
  allSpeakers: SonosNowPlayingEntry[]
}

/**
 * Renders the grouped speakers panel as a collapsible accordion.
 *
 * Shows:
 * - Current group members with a remove button for non-coordinators
 * - Available (ungrouped) speakers with an "Add" button to join the group
 */
export function GroupSpeakersPanel({
  coordinatorSpeaker,
  group,
  allSpeakers,
}: GroupSpeakersPanelProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [expanded, setExpanded] = useState(false)

  const groupMembers = group?.members ?? [coordinatorSpeaker]
  const groupMemberSet = new Set(groupMembers)

  // Speakers not in this group and not already coordinated by a different group
  const availableSpeakers = allSpeakers.filter(
    e =>
      !groupMemberSet.has(e.speakerName) &&
      !(e.group && e.group.members.length > 1 && e.group.coordinator !== coordinatorSpeaker),
  )

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['sonos', 'now-playing'] })
    queryClient.invalidateQueries({ queryKey: ['sonos', 'zones'] })
  }

  const leaveMutation = useMutation({
    mutationFn: (speakerName: string) => api.sonos.leaveGroup(speakerName),
    onSuccess: (_data, speakerName) => {
      invalidate()
      const entry = allSpeakers.find(e => e.speakerName === speakerName)
      toast({ message: `${entry?.roomName ?? speakerName} removed from group` })
    },
    onError: (_err, speakerName) => {
      const entry = allSpeakers.find(e => e.speakerName === speakerName)
      toast({ message: `Couldn't remove ${entry?.roomName ?? speakerName}`, type: 'error' })
    },
  })

  const joinMutation = useMutation({
    mutationFn: (speakerName: string) => api.sonos.joinGroup(speakerName, coordinatorSpeaker),
    onSuccess: (_data, speakerName) => {
      invalidate()
      const entry = allSpeakers.find(e => e.speakerName === speakerName)
      toast({ message: `${entry?.roomName ?? speakerName} added to group` })
    },
    onError: (_err, speakerName) => {
      const entry = allSpeakers.find(e => e.speakerName === speakerName)
      toast({ message: `Couldn't add ${entry?.roomName ?? speakerName}`, type: 'error' })
    },
  })

  const pendingLeave = leaveMutation.isPending ? leaveMutation.variables : null
  const pendingJoin = joinMutation.isPending ? joinMutation.variables : null

  return (
    <div className="mt-2 border-t border-[var(--border-secondary)] pt-2">
      {/* Accordion toggle */}
      <button
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        aria-controls="speakers-panel"
        className={cn(
          'flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs font-medium text-caption transition-colors',
          'min-h-[44px]',
          'hover:bg-[var(--bg-secondary)]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
        )}
      >
        <span className="flex items-center gap-1.5">
          <Speaker className="h-3 w-3" aria-hidden="true" />
          Speakers{groupMembers.length > 1 ? ` (${groupMembers.length})` : ''}
        </span>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div id="speakers-panel">
          <ul className="space-y-0.5" aria-label="Speakers in this group">
            {groupMembers.map(speakerName => {
              const entry = allSpeakers.find(e => e.speakerName === speakerName)
              const roomName = entry?.roomName ?? speakerName
              const isCoordinator = speakerName === coordinatorSpeaker
              const isRemoving = pendingLeave === speakerName

              return (
                <li
                  key={speakerName}
                  className="flex items-center justify-between gap-2 rounded-lg px-2 py-1"
                >
                  <span className={cn('truncate text-xs', isCoordinator ? 'text-body font-medium' : 'text-caption')}>
                    {roomName}
                    {isCoordinator && (
                      <span className="ml-1.5 text-[10px] text-fairy-400">coordinator</span>
                    )}
                  </span>
                  {!isCoordinator && (
                    <button
                      onClick={() => leaveMutation.mutate(speakerName)}
                      disabled={isRemoving}
                      aria-label={`Remove ${roomName} from group`}
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors',
                        'text-red-400/60 hover:bg-red-500/15 hover:text-red-400',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                        'disabled:opacity-40',
                      )}
                    >
                      {isRemoving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>

          {availableSpeakers.length > 0 && (
            <>
              <p className="mb-1 mt-2.5 px-1 text-[11px] text-caption/60">Available to add</p>
              <ul className="space-y-0.5" aria-label="Available speakers">
                {availableSpeakers.map(entry => {
                  const isAdding = pendingJoin === entry.speakerName
                  return (
                    <li
                      key={entry.speakerName}
                      className="flex items-center justify-between gap-2 rounded-lg px-2 py-1"
                    >
                      <span className="truncate text-xs text-caption">{entry.roomName}</span>
                      <button
                        onClick={() => joinMutation.mutate(entry.speakerName)}
                        disabled={isAdding || joinMutation.isPending}
                        aria-label={`Add ${entry.roomName} to group`}
                        className={cn(
                          'flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors',
                          'bg-fairy-500/10 text-fairy-400 hover:bg-fairy-500/20',
                          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                          'disabled:opacity-40',
                        )}
                      >
                        {isAdding ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          'Add'
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}
