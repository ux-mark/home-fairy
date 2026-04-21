import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SkipBack, Play, Pause, SkipForward, Repeat1, Music, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { getSonosBrowseEntryPath } from '@/hooks/useSonosBrowseMemory'
import type { SonosPlaybackState } from '@/lib/api'

interface PlaybackControlsProps {
  speaker: string
  state: SonosPlaybackState
  /** Called after each successful mutation so the caller can refetch */
  onInvalidate: () => void
  /** Show the Change music button (default: true) */
  showChange?: boolean
}

/** Parse currentPlayMode into repeat-one flag. */
function parseRepeatOne(mode: string | undefined): boolean {
  if (!mode) return false
  const upper = mode.toUpperCase()
  return upper === 'REPEAT_ONE' || upper === 'SHUFFLE_REPEAT_ONE'
}

/**
 * Playback control row: skip-back | play/pause | skip-forward | repeat-one | change
 *
 * - Repeat button shows highlighted state with optimistic toggle.
 * - Skip/repeat disabled for TV and line-in sources.
 * - Change navigates to /sonos/browse.
 */
export function PlaybackControls({ speaker, state, onInvalidate, showChange = true }: PlaybackControlsProps) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const isPlaying = state.playbackState === 'PLAYING'
  const isLineSource = state.inputSource === 'tv' || state.inputSource === 'line-in'
  const serverRepeatOne = parseRepeatOne(state.currentPlayMode)

  // Optimistic local state for repeat-one
  const [repeatOneActive, setRepeatOneActive] = useState(serverRepeatOne)
  useEffect(() => { setRepeatOneActive(serverRepeatOne) }, [serverRepeatOne])

  const playMutation = useMutation({
    mutationFn: () => api.sonos.play(speaker),
    onSuccess: onInvalidate,
    onError: () => toast({ message: 'Could not resume playback', type: 'error' }),
  })

  const pauseMutation = useMutation({
    mutationFn: () => api.sonos.pause(speaker),
    onSuccess: onInvalidate,
    onError: () => toast({ message: 'Could not pause playback', type: 'error' }),
  })

  const prevMutation = useMutation({
    mutationFn: () => api.sonos.previous(speaker),
    onSuccess: onInvalidate,
    onError: () => toast({ message: 'Could not go to previous track', type: 'error' }),
  })

  const nextMutation = useMutation({
    mutationFn: () => api.sonos.next(speaker),
    onSuccess: onInvalidate,
    onError: () => toast({ message: 'Could not skip track', type: 'error' }),
  })

  const repeatOneMutation = useMutation({
    mutationFn: () =>
      repeatOneActive
        ? api.sonos.repeat(speaker, false, 'off')
        : api.sonos.repeat(speaker, true, 'one'),
    onMutate: () => {
      setRepeatOneActive(prev => !prev)
    },
    onSuccess: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['sonos', 'now-playing'] })
      }, 500)
      onInvalidate()
    },
    onError: () => {
      setRepeatOneActive(serverRepeatOne)
      toast({ message: 'Could not toggle repeat one', type: 'error' })
    },
  })

  const playPausePending = playMutation.isPending || pauseMutation.isPending

  return (
    <div
      className="flex items-center justify-between gap-1"
      role="group"
      aria-label="Playback controls"
    >
      {/* Skip back */}
      <button
        onClick={() => prevMutation.mutate()}
        disabled={isLineSource || prevMutation.isPending}
        aria-label="Previous track"
        className={cn(
          'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors',
          'surface',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          isLineSource || prevMutation.isPending
            ? 'cursor-not-allowed opacity-40 text-slate-500'
            : 'text-slate-400 hover:brightness-95 dark:hover:brightness-110',
        )}
      >
        {prevMutation.isPending ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        ) : (
          <SkipBack className="h-5 w-5" aria-hidden="true" />
        )}
      </button>

      {/* Play / Pause — large central button */}
      <button
        onClick={() => (isPlaying ? pauseMutation.mutate() : playMutation.mutate())}
        disabled={playPausePending}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        aria-pressed={isPlaying}
        className={cn(
          'flex h-14 w-14 items-center justify-center rounded-full transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          'disabled:opacity-50',
          isPlaying
            ? 'bg-fairy-500 text-white hover:bg-fairy-600 active:bg-fairy-700'
            : 'bg-fairy-500/15 text-fairy-400 hover:bg-fairy-500/25',
        )}
      >
        {playPausePending ? (
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
        ) : isPlaying ? (
          <Pause className="h-6 w-6" aria-hidden="true" />
        ) : (
          <Play className="h-6 w-6" aria-hidden="true" />
        )}
      </button>

      {/* Skip forward */}
      <button
        onClick={() => nextMutation.mutate()}
        disabled={isLineSource || nextMutation.isPending}
        aria-label="Next track"
        className={cn(
          'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors',
          'surface',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          isLineSource || nextMutation.isPending
            ? 'cursor-not-allowed opacity-40 text-slate-500'
            : 'text-slate-400 hover:brightness-95 dark:hover:brightness-110',
        )}
      >
        {nextMutation.isPending ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        ) : (
          <SkipForward className="h-5 w-5" aria-hidden="true" />
        )}
      </button>

      {/* Repeat one */}
      <button
        onClick={() => repeatOneMutation.mutate()}
        disabled={isLineSource || repeatOneMutation.isPending}
        aria-label={repeatOneActive ? 'Disable repeat one' : 'Repeat one track'}
        aria-pressed={repeatOneActive}
        className={cn(
          'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          isLineSource || repeatOneMutation.isPending
            ? 'cursor-not-allowed opacity-40 text-caption'
            : repeatOneActive
              ? 'bg-fairy-500/15 text-fairy-400'
              : 'text-caption hover:text-body',
        )}
      >
        {repeatOneMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Repeat1 className="h-5 w-5" aria-hidden="true" />
        )}
      </button>

      {/* Change music — navigates to Browse tab */}
      {showChange && (
        <button
          onClick={() => navigate(getSonosBrowseEntryPath(speaker), { replace: true })}
          className={cn(
            'flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors',
            'surface text-body hover:brightness-95 dark:hover:brightness-110',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
          aria-label="Change music"
        >
          <Music className="h-4 w-4 shrink-0" aria-hidden="true" />
          Change
        </button>
      )}
    </div>
  )
}
