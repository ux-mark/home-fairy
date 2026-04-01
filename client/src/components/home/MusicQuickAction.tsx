import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Volume2, VolumeX, Speaker, Play, Pause, Loader2, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { Skeleton } from '@/components/ui/Skeleton'
import { HomeSpeakerPopover } from '@/components/sonos/HomeSpeakerPopover'
import { HomeVolumePopover } from '@/components/sonos/HomeVolumePopover'

export function MusicQuickAction() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [volumePopoverOpen, setVolumePopoverOpen] = useState(false)
  const playButtonRef = useRef<HTMLButtonElement>(null)

  const { data: muteStatus, isLoading: muteLoading } = useQuery({
    queryKey: ['sonos', 'mute-status'],
    queryFn: api.sonos.getMuteStatus,
    staleTime: 10_000,
    retry: false,
  })

  const { data: playStatus } = useQuery({
    queryKey: ['sonos', 'play-status'],
    queryFn: api.sonos.getPlayStatus,
    staleTime: 5_000,
    retry: false,
    enabled: !!muteStatus && muteStatus.totalSpeakers > 0,
  })

  const playAllMutation = useMutation({
    mutationFn: (playing: boolean) => playing ? api.sonos.playAll() : api.sonos.pauseAll(),
    onSuccess: (_data, playing) => {
      queryClient.invalidateQueries({ queryKey: ['sonos', 'play-status'] })
      toast({ message: playing ? 'Speakers playing' : 'Speakers paused' })
    },
    onError: () => {
      toast({ message: 'Failed to update speakers', type: 'error' })
    },
  })

  if (muteLoading) {
    return (
      <section className="mb-6" aria-label="Music controls">
        <Skeleton className="h-14 w-full rounded-xl" />
      </section>
    )
  }

  // Don't render if no speakers are configured
  if (!muteStatus || muteStatus.totalSpeakers === 0) return null

  const isMuted = muteStatus.allMuted
  const isPlaying = playStatus?.anyPlaying ?? false

  return (
    <section className="mb-6" aria-label="Music controls">
      <div className="relative">
        <div className="grid grid-cols-3 gap-2">
          {/* Speakers — navigates to /sonos */}
          <button
            onClick={() => { setPopoverOpen(false); setVolumePopoverOpen(false); navigate('/sonos') }}
            className={cn(
              'flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-xs font-medium transition-all',
              'surface text-body hover:brightness-95 dark:hover:brightness-110 active:scale-[0.97]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            )}
            aria-label="Open Sonos speakers"
          >
            <Speaker className="h-5 w-5 text-fairy-400" aria-hidden="true" />
            <span>Speakers</span>
          </button>

          {/* Play / Pause all — opens popover when multiple speakers */}
          <button
            ref={playButtonRef}
            onClick={() => {
              if (muteStatus && muteStatus.totalSpeakers > 1) {
                setVolumePopoverOpen(false)
                setPopoverOpen(o => !o)
              } else {
                playAllMutation.mutate(!isPlaying)
              }
            }}
            disabled={playAllMutation.isPending}
            aria-label={
              muteStatus && muteStatus.totalSpeakers > 1
                ? popoverOpen
                  ? 'Close speaker controls'
                  : 'Open speaker controls'
                : isPlaying
                  ? 'Pause all speakers'
                  : 'Play all speakers'
            }
            aria-pressed={muteStatus && muteStatus.totalSpeakers > 1 ? popoverOpen : isPlaying}
            className={cn(
              'flex min-h-[52px] items-center justify-center px-2 py-2 transition-all',
              'active:scale-[0.97]',
              'focus-visible:outline-2 focus-visible:outline-offset-2',
              'disabled:opacity-50',
              popoverOpen ? 'rounded-t-xl rounded-b-none' : 'rounded-xl',
              isPlaying
                ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 focus-visible:outline-emerald-500'
                : popoverOpen
                  ? 'bg-[var(--bg-tertiary)] text-fairy-400 focus-visible:outline-fairy-500'
                  : 'surface text-body hover:brightness-95 dark:hover:brightness-110 focus-visible:outline-fairy-500',
            )}
          >
            {playAllMutation.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : popoverOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : isPlaying ? (
              <Pause className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Play className="h-5 w-5" aria-hidden="true" />
            )}
          </button>

          {/* Volume — opens volume popover */}
          <button
            onClick={() => {
              setPopoverOpen(false)
              setVolumePopoverOpen(o => !o)
            }}
            aria-label={volumePopoverOpen ? 'Close volume controls' : 'Open volume controls'}
            aria-pressed={volumePopoverOpen}
            className={cn(
              'flex min-h-[52px] items-center justify-center px-2 py-2 transition-all',
              'active:scale-[0.97]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              volumePopoverOpen ? 'rounded-t-xl rounded-b-none' : 'rounded-xl',
              isMuted
                ? 'bg-fairy-500/15 text-fairy-400 hover:bg-fairy-500/25'
                : volumePopoverOpen
                  ? 'bg-[var(--bg-tertiary)] text-fairy-400'
                  : 'surface text-body hover:brightness-95 dark:hover:brightness-110',
            )}
          >
            {volumePopoverOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : isMuted ? (
              <VolumeX className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Volume2 className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
        <HomeSpeakerPopover open={popoverOpen} onClose={() => setPopoverOpen(false)} triggerRef={playButtonRef} />
        <HomeVolumePopover open={volumePopoverOpen} onClose={() => setVolumePopoverOpen(false)} />
      </div>
    </section>
  )
}
