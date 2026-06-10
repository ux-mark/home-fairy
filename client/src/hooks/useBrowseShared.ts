import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

// ── useFirstSpeaker ───────────────────────────────────────────────────────────
// Returns the first currently-playing speaker, falling back to zone order.

export function useFirstSpeaker(): string | null {
  const { data: zones } = useQuery({
    queryKey: ['sonos-zones'],
    queryFn: api.sonos.getZones,
    staleTime: 30_000,
  })

  // Shares the cache entry owned by PlaybackStateProvider — the socket's
  // sonos:playback-update invalidation plus its 30 s safety-net poll keep it
  // fresh. A second 5 s interval here just multiplied the polling rate.
  const { data: nowPlaying } = useQuery({
    queryKey: ['sonos', 'now-playing'],
    queryFn: api.sonos.getNowPlaying,
    staleTime: 25_000,
  })

  if (!zones || zones.length === 0) return null

  // Prefer the first currently-playing speaker
  if (nowPlaying && nowPlaying.length > 0) {
    const playing = nowPlaying.find(e => e.state?.playbackState === 'PLAYING')
    if (playing) return playing.speakerName ?? playing.roomName ?? null
  }

  // Fall back to zone order
  return zones[0]?.members?.[0]?.roomName ?? zones[0]?.coordinator?.roomName ?? null
}

// ── useDebounce ───────────────────────────────────────────────────────────────

export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDebounced(value), delay)
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [value, delay])

  return debounced
}

// ── useNowPlayingTrack ────────────────────────────────────────────────────────

export function useNowPlayingTrack(speaker: string | null) {
  // Same shared cache entry as PlaybackStateProvider; socket-invalidated.
  const { data: nowPlaying } = useQuery({
    queryKey: ['sonos', 'now-playing'],
    queryFn: api.sonos.getNowPlaying,
    staleTime: 25_000,
    enabled: !!speaker,
  })
  if (!speaker || !nowPlaying) return null
  const entry = nowPlaying.find(e => e.speakerName === speaker || e.roomName === speaker)
  return entry?.state ?? null
}
