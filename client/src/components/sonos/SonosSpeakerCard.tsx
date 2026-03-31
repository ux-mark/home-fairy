import { useState, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Play, Pause, Square, Music, Loader2, X, Link2, Radio } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { useQuery } from '@tanstack/react-query'
import type { SonosPlaybackState, SonosGroupInfo } from '@/lib/api'
import { SonosNowPlaying } from './SonosNowPlaying'
import { SonosVolumeControl } from './SonosVolumeControl'
import { FavouriteSelector } from './FavouriteSelector'

interface SonosSpeakerCardProps {
  roomName: string
  speakerName: string
  state: SonosPlaybackState | null
  error?: boolean
  onRefresh: () => void
  group?: SonosGroupInfo | null
}

export function SonosSpeakerCard({
  roomName,
  speakerName,
  state,
  error,
  onRefresh,
  group,
}: SonosSpeakerCardProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [musicDialogOpen, setMusicDialogOpen] = useState(false)
  const [selectedFavourite, setSelectedFavourite] = useState('')

  const { data: favourites = [] } = useQuery({
    queryKey: ['sonos', 'favourites'],
    queryFn: api.sonos.getFavourites,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  // Local optimistic volume
  const [localVolume, setLocalVolume] = useState<number | null>(null)
  const displayVolume = localVolume ?? state?.volume ?? 0

  const invalidateNowPlaying = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['sonos', 'now-playing'] })
  }, [queryClient])

  const playMutation = useMutation({
    mutationFn: () => api.sonos.play(speakerName),
    onSuccess: invalidateNowPlaying,
    onError: () => toast({ message: `Couldn't play ${roomName}`, type: 'error' }),
  })

  const pauseMutation = useMutation({
    mutationFn: () => api.sonos.pause(speakerName),
    onSuccess: invalidateNowPlaying,
    onError: () => toast({ message: `Couldn't pause ${roomName}`, type: 'error' }),
  })

  const stopMutation = useMutation({
    mutationFn: () => api.sonos.stop(speakerName),
    onSuccess: invalidateNowPlaying,
    onError: () => toast({ message: `Couldn't stop ${roomName}`, type: 'error' }),
  })

  const volumeMutation = useMutation({
    mutationFn: (level: number) => api.sonos.setVolume(speakerName, level),
    onError: () => {
      setLocalVolume(null)
      toast({ message: `Couldn't update volume for ${roomName}`, type: 'error' })
    },
  })

  const playFavouriteMutation = useMutation({
    mutationFn: (name: string) => api.sonos.playFavourite(speakerName, name),
    onSuccess: (_data, name) => {
      setMusicDialogOpen(false)
      setSelectedFavourite('')
      invalidateNowPlaying()
      toast({ message: `Playing ${name} on ${roomName}` })
    },
    onError: (_err, name) => toast({ message: `Couldn't play ${name} on ${roomName}`, type: 'error' }),
  })

  function handleVolumeChange(level: number) {
    setLocalVolume(level)
    volumeMutation.mutate(level)
  }

  function handlePlayFavourite() {
    if (selectedFavourite && selectedFavourite !== '__continue__') {
      playFavouriteMutation.mutate(selectedFavourite)
    }
  }

  const isPlaying = state?.playbackState === 'PLAYING'
  const isPaused = state?.playbackState === 'PAUSED_PLAYBACK'
  const isStopped = !state || state.playbackState === 'STOPPED'
  const hasTrack = state && (state.currentTrack.title || state.currentTrack.stationName)

  const anyActionPending = playMutation.isPending || pauseMutation.isPending || stopMutation.isPending

  const isGrouped = group && group.members.length > 1
  const groupedWithNames = isGrouped
    ? group.members.filter(m => m !== speakerName)
    : []

  return (
    <div className="card rounded-xl border p-4 transition-colors" style={{ borderColor: 'var(--border-primary)' }}>
      {/* Header: room name + playback badge */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-heading">{roomName}</h3>
          {/* Group label */}
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

      {/* Error state */}
      {error && (
        <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          Could not reach this speaker.{' '}
          <button
            onClick={onRefresh}
            className="underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            Retry
          </button>
        </div>
      )}

      {/* Now playing (when track is known) */}
      {state && hasTrack && (
        <SonosNowPlaying state={state} className="mb-3" />
      )}

      {/* Idle state — no track */}
      {!error && (!state || !hasTrack) && (
        <p className="mb-3 text-sm text-caption">Nothing playing</p>
      )}

      {/* Playback controls */}
      <div className="mb-3 flex items-center gap-2">
        {/* Play / Pause toggle */}
        <button
          onClick={() => isPlaying ? pauseMutation.mutate() : playMutation.mutate()}
          disabled={anyActionPending || !!error}
          aria-label={isPlaying ? `Pause ${roomName}` : `Play ${roomName}`}
          aria-pressed={isPlaying}
          className={cn(
            'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            'disabled:opacity-50',
            isPlaying
              ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
              : 'surface text-body hover:brightness-95 dark:hover:brightness-110',
          )}
        >
          {anyActionPending && (playMutation.isPending || pauseMutation.isPending) ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : isPlaying ? (
            <Pause className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Play className="h-5 w-5" aria-hidden="true" />
          )}
        </button>

        {/* Stop — only show when playing or paused */}
        {(isPlaying || isPaused) && (
          <button
            onClick={() => stopMutation.mutate()}
            disabled={anyActionPending || !!error}
            aria-label={`Stop ${roomName}`}
            className={cn(
              'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors',
              'surface text-body hover:brightness-95 dark:hover:brightness-110',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              'disabled:opacity-50',
            )}
          >
            {stopMutation.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Square className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        )}

        {/* Change music */}
        <Dialog.Root open={musicDialogOpen} onOpenChange={setMusicDialogOpen}>
          <Dialog.Trigger asChild>
            <button
              className={cn(
                'flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors',
                'surface text-body hover:brightness-95 dark:hover:brightness-110',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              )}
              aria-label={`Change music on ${roomName}`}
            >
              <Music className="h-4 w-4 shrink-0" aria-hidden="true" />
              Change music
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
                  Choose music for {roomName}
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
                id={`fav-selector-${speakerName}`}
                favourites={favourites}
                value={selectedFavourite}
                onChange={setSelectedFavourite}
                includeContinue={isPlaying || isPaused}
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
                  onClick={handlePlayFavourite}
                  disabled={!selectedFavourite || selectedFavourite === '__continue__' || playFavouriteMutation.isPending}
                  className={cn(
                    'flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors',
                    'bg-fairy-500 text-white hover:bg-fairy-600 active:bg-fairy-700',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                    'disabled:opacity-50 min-h-[44px]',
                  )}
                >
                  {playFavouriteMutation.isPending ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
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
      </div>

      {/* Volume control */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-caption">Volume</p>
        <SonosVolumeControl
          value={displayVolume}
          onChange={handleVolumeChange}
          isPending={volumeMutation.isPending}
          label={`${roomName} volume`}
          disabled={!!error}
        />
      </div>
    </div>
  )
}
