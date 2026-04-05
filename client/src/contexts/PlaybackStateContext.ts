import { createContext, createElement, useEffect, useState, useMemo, useCallback, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { SonosNowPlayingEntry, SonosPlaybackState } from '@/lib/api'
import { getSocket } from '@/hooks/useSocket'

// ── Types ────────────────────────────────────────────────────────────────────

export interface PlaybackStateContextValue {
  /** All speakers' now-playing state */
  allNowPlaying: SonosNowPlayingEntry[]
  /** The currently selected speaker name */
  selectedSpeaker: string | null
  /** Change the selected speaker (persisted to localStorage) */
  setSelectedSpeaker: (speaker: string) => void
  /** Playback state for the selected speaker */
  selectedPlayback: SonosPlaybackState | null
  /** True if the selected speaker is actively playing */
  isSelectedPlaying: boolean
  /** Check if a specific track is the current track on the selected speaker */
  isTrackPlaying: (uri: string | undefined, title: string) => boolean
  /** Check if a track is the current track (alias of isTrackPlaying) */
  isTrackActive: (uri: string | undefined, title: string) => boolean
  /** Check if a given album is currently playing on the selected speaker */
  isAlbumPlaying: (albumName: string) => boolean
  /** Check if a given playlist/item URI is currently playing */
  isPlaylistPlaying: (playlistUri: string) => boolean
  /** True while the initial now-playing query is loading */
  isLoading: boolean
}

// ── Context ──────────────────────────────────────────────────────────────────

export const PlaybackStateContext = createContext<PlaybackStateContextValue | null>(null)

const STORAGE_KEY = 'sonos:selected-speaker'

// ── Provider ─────────────────────────────────────────────────────────────────

export function PlaybackStateProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  // ── Polling query ─────────────────────────────────────────────────────────
  const { data: allNowPlaying = [], isLoading } = useQuery({
    queryKey: ['sonos', 'now-playing'],
    queryFn: api.sonos.getNowPlaying,
    refetchInterval: 5_000,
    staleTime: 4_000,
  })

  // ── Stored speaker preference (user's explicit choice) ───────────────────
  const [storedSpeaker, setStoredSpeaker] = useState<string | null>(() => {
    try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
  })

  // ── Effective selected speaker (derives from stored or auto-selects) ─────
  const selectedSpeaker = useMemo(() => {
    if (allNowPlaying.length === 0) return storedSpeaker
    const names = allNowPlaying.map(e => e.speakerName)
    // Keep stored preference if still valid
    if (storedSpeaker && names.includes(storedSpeaker)) return storedSpeaker
    // Auto-select: prefer a currently-playing speaker
    const playing = allNowPlaying.find(e => e.state?.playbackState === 'PLAYING')
    return playing?.speakerName ?? allNowPlaying[0]?.speakerName ?? storedSpeaker
  }, [storedSpeaker, allNowPlaying])

  const setSelectedSpeaker = useCallback((speaker: string) => {
    setStoredSpeaker(speaker)
    try { localStorage.setItem(STORAGE_KEY, speaker) } catch { /* ignore */ }
  }, [])

  // ── Socket invalidation ───────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket()
    function handlePlaybackUpdate() {
      queryClient.invalidateQueries({ queryKey: ['sonos', 'now-playing'] })
    }
    socket.on('sonos:playback-update', handlePlaybackUpdate)
    return () => { socket.off('sonos:playback-update', handlePlaybackUpdate) }
  }, [queryClient])

  // ── Derived state ─────────────────────────────────────────────────────────
  const selectedEntry = allNowPlaying.find(e => e.speakerName === selectedSpeaker) ?? null
  const selectedPlayback = selectedEntry?.state ?? null
  const isSelectedPlaying = selectedPlayback?.playbackState === 'PLAYING'

  // ── Helper functions ──────────────────────────────────────────────────────
  const isTrackPlaying = useCallback(
    (uri: string | undefined, title: string): boolean => {
      if (!selectedPlayback) return false
      const track = selectedPlayback.currentTrack
      if (uri && track.uri) {
        const normalizeUri = (u: string) => u.split('?')[0]
        if (normalizeUri(uri) === normalizeUri(track.uri)) return true
      }
      return track.title?.toLowerCase() === title?.toLowerCase()
    },
    [selectedPlayback],
  )

  const isTrackActive = isTrackPlaying

  const isAlbumPlaying = useCallback(
    (albumName: string): boolean => {
      if (!selectedPlayback) return false
      return selectedPlayback.currentTrack.album?.toLowerCase() === albumName?.toLowerCase()
    },
    [selectedPlayback],
  )

  const isPlaylistPlaying = useCallback(
    (playlistUri: string): boolean => {
      if (!selectedPlayback) return false
      const uri = selectedPlayback.currentTrack.uri ?? ''
      return uri.includes(playlistUri) || playlistUri.includes(uri.split('?')[0])
    },
    [selectedPlayback],
  )

  const value: PlaybackStateContextValue = {
    allNowPlaying,
    selectedSpeaker,
    setSelectedSpeaker,
    selectedPlayback,
    isSelectedPlaying,
    isTrackPlaying,
    isTrackActive,
    isAlbumPlaying,
    isPlaylistPlaying,
    isLoading,
  }

  return createElement(PlaybackStateContext.Provider, { value }, children)
}
