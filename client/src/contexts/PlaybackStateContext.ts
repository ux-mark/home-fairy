import { createContext, createElement, useEffect, useState, useMemo, useCallback, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { SonosNowPlayingEntry, SonosPlaybackState } from '@/lib/api'
import { getSocket } from '@/hooks/useSocket'

// ── URI normalisation ────────────────────────────────────────────────────────
// Sonos wraps Spotify URIs as "x-sonos-spotify:spotify:track:ABC?sid=…".
// Strip the wrapper and query params so both sides compare the core URI.
function normalizeUri(uri: string): string {
  let u = uri.split('?')[0]
  // Unwrap x-sonos-spotify: / x-sonos-http: / x-sonos-hls: prefixes
  const wrappedMatch = u.match(/^x-sonos-[^:]+:(.+)/)
  if (wrappedMatch) u = wrappedMatch[1]
  // Unwrap URL-encoded Spotify URIs (e.g. spotify%3atrack%3a...)
  if (u.includes('%3a') || u.includes('%3A')) {
    try { u = decodeURIComponent(u) } catch { /* keep as-is */ }
  }
  return u
}

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
    function handleQueueUpdate(data: { speaker?: string }) {
      if (data?.speaker) {
        queryClient.invalidateQueries({ queryKey: ['sonos', 'queue', data.speaker] })
      } else {
        queryClient.invalidateQueries({ queryKey: ['sonos', 'queue'] })
      }
    }
    socket.on('sonos:playback-update', handlePlaybackUpdate)
    socket.on('sonos:queue-update', handleQueueUpdate)
    return () => {
      socket.off('sonos:playback-update', handlePlaybackUpdate)
      socket.off('sonos:queue-update', handleQueueUpdate)
    }
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
      const trackUri = normalizeUri(selectedPlayback.currentTrack.uri ?? '')
      const normalised = normalizeUri(playlistUri)
      return trackUri.includes(normalised) || normalised.includes(trackUri)
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
