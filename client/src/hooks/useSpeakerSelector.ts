import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { usePlaybackState } from '@/hooks/usePlaybackState'

// ── Types ────────────────────────────────────────────────────────────────────

export type SpeakerStatus = 'playing' | 'idle' | 'grouped'

export interface SpeakerSelectorItem {
  speakerName: string
  roomName: string
  roomIcon: string | null
  status: SpeakerStatus
  currentTrackTitle: string | null
  groupedWith: string | null
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useSpeakerSelector() {
  const { allNowPlaying, selectedSpeaker, setSelectedSpeaker, isLoading: playbackLoading } = usePlaybackState()

  const { data: speakersWithRooms = [], isLoading: speakersLoading } = useQuery({
    queryKey: ['sonos', 'speakers-with-rooms'],
    queryFn: api.sonos.getSpeakersWithRooms,
    staleTime: 60_000,
  })

  const speakers: SpeakerSelectorItem[] = speakersWithRooms.map(s => {
    const nowPlayingEntry = allNowPlaying.find(
      e => e.speakerName === s.speaker_name || e.roomName === s.room_name,
    )
    const playbackState = nowPlayingEntry?.state

    let status: SpeakerStatus = 'idle'
    let currentTrackTitle: string | null = null
    let groupedWith: string | null = null

    if (playbackState) {
      if (playbackState.playbackState === 'PLAYING') {
        status = 'playing'
        currentTrackTitle = playbackState.currentTrack?.title ?? null
      }
    }

    if (nowPlayingEntry?.group) {
      const { coordinator, members, isCoordinator } = nowPlayingEntry.group
      if (!isCoordinator && members.length > 0) {
        status = 'grouped'
        groupedWith = coordinator
      } else if (isCoordinator && members.length > 1) {
        // Show as playing/idle but note the group
        const otherMembers = members.filter(m => m !== s.speaker_name && m !== s.room_name)
        if (otherMembers.length > 0) {
          groupedWith = otherMembers[0]
        }
      }
    }

    return {
      speakerName: s.speaker_name,
      roomName: s.room_name,
      roomIcon: s.room_icon,
      status,
      currentTrackTitle,
      groupedWith,
    }
  })

  return {
    speakers,
    selectedSpeaker,
    setSelectedSpeaker,
    isLoading: playbackLoading || speakersLoading,
  }
}
