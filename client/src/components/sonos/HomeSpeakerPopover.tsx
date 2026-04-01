import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Play, Pause, Music, Loader2 } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'
import { api, parseApiError } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { SonosNowPlaying } from './SonosNowPlaying'
import { FavouriteSelector } from './FavouriteSelector'

interface HomeSpeakerPopoverProps {
  open: boolean
  onClose: () => void
}

export function HomeSpeakerPopover({ open, onClose }: HomeSpeakerPopoverProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const panelRef = useRef<HTMLDivElement>(null)

  // Dialog state: which speaker is having music chosen for it
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null)
  const [selectedFavourite, setSelectedFavourite] = useState('')

  // Now-playing query — only when popover is open
  const { data: nowPlaying = [], isLoading } = useQuery({
    queryKey: ['sonos', 'now-playing'],
    queryFn: api.sonos.getNowPlaying,
    enabled: open,
    refetchInterval: open ? 5_000 : false,
    staleTime: 4_000,
    retry: false,
  })

  // Favourites (stale for 5 min — same as SonosSpeakerCard)
  const { data: favourites = [] } = useQuery({
    queryKey: ['sonos', 'favourites'],
    queryFn: api.sonos.getFavourites,
    staleTime: 5 * 60 * 1000,
    retry: false,
    enabled: open,
  })

  // Play mutation
  const playMutation = useMutation({
    mutationFn: (speaker: string) => api.sonos.play(speaker),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sonos', 'now-playing'] })
      queryClient.invalidateQueries({ queryKey: ['sonos', 'play-status'] })
    },
    onError: (_err, speaker) => {
      const entry = nowPlaying.find(e => e.speakerName === speaker)
      toast({ message: `Couldn't play ${entry?.roomName ?? speaker}`, type: 'error' })
    },
  })

  // Pause mutation
  const pauseMutation = useMutation({
    mutationFn: (speaker: string) => api.sonos.pause(speaker),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sonos', 'now-playing'] })
      queryClient.invalidateQueries({ queryKey: ['sonos', 'play-status'] })
    },
    onError: (_err, speaker) => {
      const entry = nowPlaying.find(e => e.speakerName === speaker)
      toast({ message: `Couldn't pause ${entry?.roomName ?? speaker}`, type: 'error' })
    },
  })

  // Play favourite mutation
  const playFavouriteMutation = useMutation({
    mutationFn: ({ speaker, name }: { speaker: string; name: string }) =>
      api.sonos.playFavourite(speaker, name),
    onSuccess: (_data, { name }) => {
      setActiveSpeaker(null)
      setSelectedFavourite('')
      queryClient.invalidateQueries({ queryKey: ['sonos', 'now-playing'] })
      queryClient.invalidateQueries({ queryKey: ['sonos', 'play-status'] })
      toast({ message: `Playing ${name}` })
    },
    onError: (err, { name }) => {
      const serverMsg = parseApiError(err)
      toast({ message: serverMsg ?? `Couldn't play ${name}`, type: 'error' })
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
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  const activeSpeakerEntry = activeSpeaker
    ? nowPlaying.find(e => e.speakerName === activeSpeaker)
    : null

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
      aria-label="Speaker controls"
    >
      <div className="px-3 py-3">
        {/* Loading state */}
        {isLoading && (
          <div className="space-y-2" aria-label="Loading speakers">
            {[0, 1].map(i => (
              <div
                key={i}
                className="flex animate-pulse items-center gap-3 rounded-lg p-2"
              >
                <div className="h-10 flex-1 rounded-lg bg-[var(--bg-tertiary)]" />
                <div className="h-10 w-10 rounded-lg bg-[var(--bg-tertiary)]" />
              </div>
            ))}
          </div>
        )}

        {/* Empty / error state */}
        {!isLoading && nowPlaying.length === 0 && (
          <p className="py-2 text-sm text-caption">No speakers found</p>
        )}

        {/* Speaker rows */}
        {!isLoading && nowPlaying.length > 0 && (
          <ul className="space-y-1" role="list">
            {nowPlaying.map(entry => {
              const isPlaying = entry.state?.playbackState === 'PLAYING'
              const isPaused = entry.state?.playbackState === 'PAUSED_PLAYBACK'
              const isStopped = !entry.state || entry.state.playbackState === 'STOPPED'
              const hasTrack =
                entry.state &&
                (entry.state.currentTrack.title || entry.state.currentTrack.stationName)

              const isActionPending =
                (playMutation.isPending && playMutation.variables === entry.speakerName) ||
                (pauseMutation.isPending && pauseMutation.variables === entry.speakerName)

              return (
                <li
                  key={entry.speakerName}
                  className="flex items-center gap-3 rounded-lg p-2"
                >
                  {/* Left: room info + now playing */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-heading">
                        {entry.roomName}
                      </span>
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
                    {entry.state && hasTrack && (
                      <SonosNowPlaying state={entry.state} className="mt-1" />
                    )}
                  </div>

                  {/* Right: action button */}
                  {isStopped && !hasTrack ? (
                    /* Choose Music button */
                    <Dialog.Root
                      open={activeSpeaker === entry.speakerName}
                      onOpenChange={dialogOpen => {
                        if (dialogOpen) {
                          setActiveSpeaker(entry.speakerName)
                          setSelectedFavourite('')
                        } else {
                          setActiveSpeaker(null)
                          setSelectedFavourite('')
                        }
                      }}
                    >
                      <Dialog.Trigger asChild>
                        <button
                          className={cn(
                            'flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors',
                            'surface text-body hover:brightness-95 dark:hover:brightness-110',
                            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                          )}
                          aria-label={`Choose music for ${entry.roomName}`}
                        >
                          <Music className="h-4 w-4 shrink-0" aria-hidden="true" />
                          Choose Music
                        </button>
                      </Dialog.Trigger>

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
                          <div className="mb-4 flex items-center justify-between">
                            <Dialog.Title className="text-base font-semibold text-heading">
                              Choose music for {entry.roomName}
                            </Dialog.Title>
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

                          <FavouriteSelector
                            id={`home-fav-selector-${entry.speakerName}`}
                            favourites={favourites}
                            value={selectedFavourite}
                            onChange={setSelectedFavourite}
                            includeContinue={false}
                          />

                          <div className="mt-4 flex gap-2">
                            <Dialog.Close asChild>
                              <button
                                className={cn(
                                  'flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
                                  'surface text-body hover:brightness-95 dark:hover:brightness-110',
                                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                                  'min-h-[44px]',
                                )}
                              >
                                Cancel
                              </button>
                            </Dialog.Close>
                            <button
                              onClick={() => {
                                if (selectedFavourite && activeSpeaker) {
                                  playFavouriteMutation.mutate({
                                    speaker: activeSpeaker,
                                    name: selectedFavourite,
                                  })
                                }
                              }}
                              disabled={
                                !selectedFavourite || playFavouriteMutation.isPending
                              }
                              className={cn(
                                'flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors',
                                'bg-fairy-500 text-white hover:bg-fairy-600 active:bg-fairy-700',
                                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                                'disabled:opacity-50 min-h-[44px]',
                              )}
                            >
                              {playFavouriteMutation.isPending ? (
                                <span className="flex items-center justify-center gap-2">
                                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                  Playing…
                                </span>
                              ) : (
                                'Play'
                              )}
                            </button>
                          </div>
                        </Dialog.Content>
                      </Dialog.Portal>
                    </Dialog.Root>
                  ) : (
                    /* Play / Pause toggle */
                    <button
                      onClick={() => {
                        if (isPlaying) {
                          pauseMutation.mutate(entry.speakerName)
                        } else {
                          playMutation.mutate(entry.speakerName)
                        }
                      }}
                      disabled={isActionPending || !!entry.error}
                      aria-label={isPlaying ? `Pause ${entry.roomName}` : `Play ${entry.roomName}`}
                      aria-pressed={isPlaying}
                      className={cn(
                        'flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg transition-colors',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                        'disabled:opacity-50',
                        isPlaying
                          ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                          : 'surface text-body hover:brightness-95 dark:hover:brightness-110',
                      )}
                    >
                      {isActionPending ? (
                        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                      ) : isPlaying ? (
                        <Pause className="h-5 w-5" aria-hidden="true" />
                      ) : (
                        <Play className="h-5 w-5" aria-hidden="true" />
                      )}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Active speaker label for screen readers */}
      {activeSpeakerEntry && (
        <span className="sr-only" aria-live="polite">
          Choosing music for {activeSpeakerEntry.roomName}
        </span>
      )}
    </div>
  )
}
