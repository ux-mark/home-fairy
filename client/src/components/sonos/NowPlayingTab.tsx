import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ListMusic } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { NowPlayingFullView } from './NowPlayingFullView'
import { QueueView } from './QueueView'

/**
 * Top-level Now Playing tab for the Sonos page.
 *
 * - Polls all speaker states at 5-second intervals (shared query key pattern).
 * - Selects the first playing speaker by default; falls back to first configured speaker.
 * - Renders NowPlayingFullView for the selected speaker.
 */
export function NowPlayingTab() {
  const {
    data: nowPlaying,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['sonos', 'now-playing'],
    queryFn: api.sonos.getNowPlaying,
    refetchInterval: 5_000,
    staleTime: 4_000,
    retry: 1,
  })

  const allSpeakerNames = (nowPlaying ?? []).map(e => e.speakerName)

  // The user's explicit choice — undefined means "auto-select"
  const [userChoice, setUserChoice] = useState<string | undefined>(undefined)
  const [queueOpen, setQueueOpen] = useState(false)

  // Derive the selected speaker: prefer user choice (if still in list), else auto-select
  const autoSpeaker = (() => {
    if (!nowPlaying || nowPlaying.length === 0) return ''
    const playing = nowPlaying.find(e => e.state?.playbackState === 'PLAYING')
    return playing?.speakerName ?? nowPlaying[0].speakerName
  })()

  const selectedSpeaker =
    userChoice && allSpeakerNames.includes(userChoice) ? userChoice : autoSpeaker

  const speakerEntry = (nowPlaying ?? []).find(e => e.speakerName === selectedSpeaker)
  const speakerState = speakerEntry?.state ?? null
  const speakerError = speakerEntry?.error ?? false

  return (
    <div className="flex flex-col gap-4">
      <NowPlayingFullView
        speaker={selectedSpeaker}
        state={speakerState}
        allSpeakers={allSpeakerNames}
        selectedSpeaker={selectedSpeaker}
        onSpeakerChange={setUserChoice}
        loading={isLoading}
        error={isError || speakerError}
      />

      {/* View queue */}
      <button
        onClick={() => setQueueOpen(true)}
        className={cn(
          'flex w-full items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium',
          'border-[var(--border-primary)] text-slate-300',
          'hover:border-[var(--border-secondary)] hover:text-white transition-colors',
          'active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
        )}
        aria-label="View playback queue"
      >
        <ListMusic className="h-4 w-4" aria-hidden="true" />
        View queue
      </button>

      <QueueView
        speaker={selectedSpeaker}
        open={queueOpen}
        onClose={() => setQueueOpen(false)}
        currentTrackUri={speakerState?.currentTrack?.uri ?? null}
      />
    </div>
  )
}
