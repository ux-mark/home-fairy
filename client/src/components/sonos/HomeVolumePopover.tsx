import { useRef, useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Volume2, VolumeX, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { SonosVolumeControl } from './SonosVolumeControl'

interface HomeVolumePopoverProps {
  open: boolean
  onClose: () => void
}

export function HomeVolumePopover({ open, onClose }: HomeVolumePopoverProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const panelRef = useRef<HTMLDivElement>(null)

  // Now-playing query — only when popover is open
  const { data: nowPlaying = [], isLoading } = useQuery({
    queryKey: ['sonos', 'now-playing'],
    queryFn: api.sonos.getNowPlaying,
    enabled: open,
    refetchInterval: open ? 8_000 : false,
    staleTime: 4_000,
    retry: false,
  })

  // Optimistic local volume overrides: speakerName → volume
  // Only populated when user drags a slider; falls back to server data otherwise
  const [localVolumes, setLocalVolumes] = useState<Record<string, number>>({})

  // Set volume mutation for an individual speaker
  const setVolumeMutation = useMutation({
    mutationFn: ({ speaker, level }: { speaker: string; level: number }) =>
      api.sonos.setVolume(speaker, level),
    onError: (_err, { speaker }) => {
      const entry = nowPlaying.find(e => e.speakerName === speaker)
      toast({ message: `Couldn't set volume for ${entry?.roomName ?? speaker}`, type: 'error' })
      // Revert optimistic value
      setLocalVolumes(prev => {
        const next = { ...prev }
        delete next[speaker]
        return next
      })
    },
  })

  // Toggle mute on a single speaker
  const setMuteMutation = useMutation({
    mutationFn: ({ speaker, muted }: { speaker: string; muted: boolean }) =>
      api.sonos.setMute(speaker, muted),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sonos', 'now-playing'] })
      queryClient.invalidateQueries({ queryKey: ['sonos', 'mute-status'] })
    },
    onError: (_err, { speaker }) => {
      const entry = nowPlaying.find(e => e.speakerName === speaker)
      toast({ message: `Couldn't update mute for ${entry?.roomName ?? speaker}`, type: 'error' })
    },
  })

  // Master mute for all speakers
  const muteAllMutation = useMutation({
    mutationFn: (muted: boolean) => api.sonos.muteAll(muted),
    onSuccess: (_data, muted) => {
      queryClient.invalidateQueries({ queryKey: ['sonos', 'now-playing'] })
      queryClient.invalidateQueries({ queryKey: ['sonos', 'mute-status'] })
      toast({ message: muted ? 'All speakers muted' : 'All speakers unmuted' })
    },
    onError: () => {
      toast({ message: 'Failed to update speakers', type: 'error' })
    },
  })

  // Close on click outside
  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open, onClose])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  const activeSpeakers = nowPlaying.filter(e => !e.error && e.state)

  // Average volume across all active speakers for the master slider
  const masterVolume =
    activeSpeakers.length > 0
      ? Math.round(
          activeSpeakers.reduce(
            (sum, e) => sum + (localVolumes[e.speakerName] ?? e.state!.volume),
            0,
          ) / activeSpeakers.length,
        )
      : 50

  const allMuted = activeSpeakers.length > 0 && activeSpeakers.every(e => e.state?.mute)

  function handleMasterVolumeChange(level: number) {
    const updates: Record<string, number> = {}
    for (const entry of activeSpeakers) {
      updates[entry.speakerName] = level
    }
    setLocalVolumes(prev => ({ ...prev, ...updates }))
    for (const entry of activeSpeakers) {
      setVolumeMutation.mutate({ speaker: entry.speakerName, level })
    }
  }

  function handleVolumeChange(speaker: string, level: number) {
    setLocalVolumes(prev => ({ ...prev, [speaker]: level }))
    setVolumeMutation.mutate({ speaker, level })
  }

  return (
    <div
      ref={panelRef}
      className={cn(
        'absolute left-0 right-0 top-full z-30',
        'bg-[var(--bg-secondary)]',
        'border border-t-0 border-[var(--border-primary)]',
        'rounded-b-xl',
        'shadow-xl',
        'overflow-hidden',
      )}
      role="region"
      aria-label="Volume controls"
    >
      <div className="px-4 pt-4 pb-3">
        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-caption" aria-label="Loading speakers" />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && activeSpeakers.length === 0 && (
          <p className="py-2 text-sm text-caption">No active speakers found</p>
        )}

        {!isLoading && activeSpeakers.length > 0 && (
          <>
            {/* All Volume row */}
            <div className="mb-3 border-b border-[var(--border-secondary)] pb-3">
              <span className="mb-1 block text-xs font-semibold text-heading">All Volume</span>
              <div className="flex items-center gap-3">
                <SonosVolumeControl
                  value={masterVolume}
                  onChange={handleMasterVolumeChange}
                  label="All speakers volume"
                  className="flex-1"
                />
                <button
                  onClick={() => muteAllMutation.mutate(!allMuted)}
                  disabled={muteAllMutation.isPending}
                  aria-label={allMuted ? 'Unmute all speakers' : 'Mute all speakers'}
                  aria-pressed={allMuted}
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                    'disabled:opacity-50',
                    allMuted
                      ? 'bg-fairy-500/15 text-fairy-400 hover:bg-fairy-500/25'
                      : 'surface text-body hover:brightness-95 dark:hover:brightness-110',
                  )}
                >
                  {muteAllMutation.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                  ) : allMuted ? (
                    <VolumeX className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <Volume2 className="h-5 w-5" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {/* Per-speaker rows */}
            <ul className="space-y-3" role="list">
              {activeSpeakers.map(entry => {
                const currentVolume = localVolumes[entry.speakerName] ?? entry.state!.volume
                const isMuted = entry.state?.mute ?? false
                const isMutePending =
                  setMuteMutation.isPending &&
                  (setMuteMutation.variables as { speaker: string } | undefined)?.speaker ===
                    entry.speakerName

                return (
                  <li key={entry.speakerName}>
                    <span className="mb-1 block truncate text-xs font-medium text-heading">
                      {entry.roomName}
                    </span>
                    <div className="flex items-center gap-3">
                      <SonosVolumeControl
                        value={currentVolume}
                        onChange={level => handleVolumeChange(entry.speakerName, level)}
                        label={`${entry.roomName} volume`}
                        disabled={isMuted}
                        className="flex-1"
                      />
                      <button
                        onClick={() =>
                          setMuteMutation.mutate({ speaker: entry.speakerName, muted: !isMuted })
                        }
                        disabled={isMutePending}
                        aria-label={isMuted ? `Unmute ${entry.roomName}` : `Mute ${entry.roomName}`}
                        aria-pressed={isMuted}
                        className={cn(
                          'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors',
                          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                          'disabled:opacity-50',
                          isMuted
                            ? 'bg-fairy-500/15 text-fairy-400 hover:bg-fairy-500/25'
                            : 'surface text-body hover:brightness-95 dark:hover:brightness-110',
                        )}
                      >
                        {isMutePending ? (
                          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                        ) : isMuted ? (
                          <VolumeX className="h-5 w-5" aria-hidden="true" />
                        ) : (
                          <Volume2 className="h-5 w-5" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
