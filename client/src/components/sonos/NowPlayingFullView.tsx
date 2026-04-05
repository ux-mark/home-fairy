import { AlertTriangle } from 'lucide-react'
import type { SonosPlaybackState, SonosNowPlayingEntry } from '@/lib/api'
import { UnifiedPlaybackCard } from './UnifiedPlaybackCard'
import { SpeakerSelector } from './SpeakerSelector'

interface NowPlayingFullViewProps {
  speaker: string
  state: SonosPlaybackState | null
  allSpeakers: string[]
  selectedSpeaker: string
  onSpeakerChange: (name: string) => void
  loading: boolean
  error: boolean
  /** All speaker entries — needed for group volume popover */
  allSpeakerEntries?: SonosNowPlayingEntry[]
}

/**
 * Full-screen now-playing view for a single speaker.
 * Delegates rendering to UnifiedPlaybackCard (variant='full').
 * Keeps the SpeakerSelector for switching between speakers.
 */
export function NowPlayingFullView({
  speaker,
  state,
  allSpeakers,
  selectedSpeaker,
  onSpeakerChange,
  loading,
  error,
  allSpeakerEntries = [],
}: NowPlayingFullViewProps) {
  // Find group info from allSpeakerEntries for the selected speaker
  const speakerEntry = allSpeakerEntries.find(e => e.speakerName === speaker)
  const group = speakerEntry?.group ?? null

  // Error state — still show speaker selector
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <AlertTriangle className="h-10 w-10 text-red-400" aria-hidden="true" />
        <div>
          <h2 className="text-base font-semibold text-heading">Cannot reach this speaker</h2>
          <p className="mt-1 max-w-xs text-sm text-caption">
            Check that your Sonos system is powered on and reachable.
          </p>
        </div>
        {allSpeakers.length > 1 && (
          <SpeakerSelector
            speakers={allSpeakers.map(n => ({ name: n }))}
            selectedSpeaker={selectedSpeaker}
            onSpeakerChange={onSpeakerChange}
            className="w-full max-w-xs"
          />
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Unified playback card — full variant with volume + full queue */}
      <UnifiedPlaybackCard
        speaker={speaker}
        roomName={selectedSpeaker}
        state={state}
        group={group}
        allSpeakers={allSpeakerEntries}
        loading={loading}
        onRefresh={() => {}}
        variant="full"
        showVolume={true}
        showFullQueue={true}
        showGroupSpeakers={true}
      />

      {/* Speaker selector */}
      {!loading && allSpeakers.length > 1 && (
        <div>
          <p className="mb-2 text-xs font-medium text-caption">Speaker</p>
          <SpeakerSelector
            speakers={allSpeakers.map(n => ({ name: n }))}
            selectedSpeaker={selectedSpeaker}
            onSpeakerChange={onSpeakerChange}
          />
        </div>
      )}
    </div>
  )
}
