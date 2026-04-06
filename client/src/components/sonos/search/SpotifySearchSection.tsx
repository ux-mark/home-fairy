import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { AlertTriangle, ChevronRight, Music2, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import type { SpotifyTrack, SpotifyAlbum, SpotifyArtist, SpotifyPlaylist } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { Skeleton } from '@/components/ui/Skeleton'
import { Accordion } from '@/components/ui/Accordion'
import { cn } from '@/lib/utils'
import { ArtworkImage } from '../ArtworkImage'
import { MusicListItem } from '../MusicListItem'

// ── Skeleton / Error ──────────────────────────────────────────────────────────

function SectionSkeleton() {
  return (
    <ul aria-busy="true">
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-2.5">
          <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-3/4 rounded" />
            <Skeleton className="h-3 w-1/2 rounded" />
          </div>
        </li>
      ))}
    </ul>
  )
}

function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-2 text-amber-400">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="text-xs text-caption">{message}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className={cn(
          'flex shrink-0 items-center gap-1 rounded-lg bg-[var(--bg-secondary)] px-3 py-2 text-xs font-medium text-body',
          'transition-colors hover:bg-[var(--bg-tertiary)]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          'min-h-[36px]',
        )}
      >
        <RefreshCw className="h-3 w-3" aria-hidden="true" />
        Retry
      </button>
    </div>
  )
}

// ── SpotifyTrackRow ───────────────────────────────────────────────────────────

function SpotifyTrackRow({
  track,
  speaker,
  onSelectAlbum,
}: {
  track: SpotifyTrack
  speaker: string | null
  onSelectAlbum: (album: SpotifyAlbum) => void
}) {
  const { toast } = useToast()

  const playNow = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, track.uri, 'now'),
    onSuccess: () => toast({ message: `Playing "${track.name}"` }),
    onError: () => toast({ message: 'Failed to play track', type: 'error' }),
  })

  const playNext = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, track.uri, 'next'),
    onSuccess: () => toast({ message: `"${track.name}" will play next` }),
    onError: () => toast({ message: 'Failed to play next', type: 'error' }),
  })

  const addToQueue = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, track.uri, 'queue'),
    onSuccess: () => toast({ message: `Added "${track.name}" to queue` }),
    onError: () => toast({ message: 'Failed to add to queue', type: 'error' }),
  })

  const artistNames = track.artists.map(a => a.name).join(', ')
  const artUri = track.album.images?.[0]?.url

  const albumForNav: SpotifyAlbum = {
    id: track.album.id,
    name: track.album.name,
    images: track.album.images,
    artists: track.artists,
    uri: track.album.uri,
    external_urls: { spotify: '' },
    release_date: '',
    total_tracks: 0,
    album_type: 'album',
  }

  return (
    <MusicListItem
      artwork={{ src: artUri, fallback: 'disc' }}
      title={track.name}
      subtitle={[artistNames, track.album.name].filter(Boolean).join(' · ')}
      onTap={() => onSelectAlbum(albumForNav)}
      onPlay={() => playNow.mutate()}
      playDisabled={!speaker}
      playPending={playNow.isPending}
      disabled={!speaker}
      menuProps={{
        label: track.name,
        onPlayNext: () => playNext.mutate(),
        onAddToQueue: () => addToQueue.mutate(),
        fairylistTrack: {
          source: 'spotify',
          source_uri: track.uri,
          title: track.name,
          artist: artistNames,
          album_art_uri: artUri,
        },
        spotifyTrack: { trackUri: track.uri, trackName: track.name },
      }}
    />
  )
}

// ── SpotifyAlbumRow ───────────────────────────────────────────────────────────

function SpotifyAlbumRow({
  album,
  speaker,
  onSelect,
}: {
  album: SpotifyAlbum
  speaker: string | null
  onSelect: (album: SpotifyAlbum) => void
}) {
  const { toast } = useToast()

  const playNow = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, album.uri, 'now'),
    onSuccess: () => toast({ message: `Playing "${album.name}"` }),
    onError: () => toast({ message: 'Failed to play album', type: 'error' }),
  })

  const playNext = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, album.uri, 'next'),
    onSuccess: () => toast({ message: `"${album.name}" will play next` }),
    onError: () => toast({ message: 'Failed to play next', type: 'error' }),
  })

  const addToQueue = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, album.uri, 'queue'),
    onSuccess: () => toast({ message: `Added "${album.name}" to queue` }),
    onError: () => toast({ message: 'Failed to add to queue', type: 'error' }),
  })

  return (
    <MusicListItem
      artwork={{ src: album.images?.[0]?.url, fallback: 'disc' }}
      title={album.name}
      subtitle={album.artists.map(a => a.name).join(', ')}
      onTap={() => onSelect(album)}
      onPlay={() => playNow.mutate()}
      playDisabled={!speaker}
      playPending={playNow.isPending}
      disabled={!speaker}
      menuProps={{
        label: album.name,
        onPlayNext: () => playNext.mutate(),
        onAddToQueue: () => addToQueue.mutate(),
        fairylistTrack: {
          source: 'spotify',
          source_uri: album.uri,
          title: album.name,
          artist: album.artists.map(a => a.name).join(', '),
          album_art_uri: album.images?.[0]?.url,
        },
      }}
    />
  )
}

// ── SpotifyArtistRow ──────────────────────────────────────────────────────────

function SpotifyArtistRow({
  artist,
  onSelect,
}: {
  artist: SpotifyArtist
  onSelect: (artist: SpotifyArtist) => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(artist)}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-2.5 text-left',
          'transition-colors hover:bg-[var(--bg-secondary)]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          'min-h-[44px]',
        )}
      >
        <ArtworkImage src={artist.images?.[0]?.url} size={40} rounded="rounded-full" fallback="user" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-heading">{artist.name}</p>
          {artist.genres?.length > 0 && (
            <p className="truncate text-xs text-caption">{artist.genres.slice(0, 2).join(', ')}</p>
          )}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-caption/40" aria-hidden="true" />
      </button>
    </li>
  )
}

// ── SpotifyPlaylistRow ────────────────────────────────────────────────────────

function SpotifyPlaylistRow({
  playlist,
  speaker,
  onSelect,
}: {
  playlist: SpotifyPlaylist
  speaker: string | null
  onSelect: (playlist: SpotifyPlaylist) => void
}) {
  const { toast } = useToast()

  const playNow = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, playlist.uri, 'now'),
    onSuccess: () => toast({ message: `Playing "${playlist.name}"` }),
    onError: () => toast({ message: 'Failed to play playlist', type: 'error' }),
  })

  const playNext = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, playlist.uri, 'next'),
    onSuccess: () => toast({ message: `"${playlist.name}" will play next` }),
    onError: () => toast({ message: 'Failed to play next', type: 'error' }),
  })

  const addToQueue = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, playlist.uri, 'queue'),
    onSuccess: () => toast({ message: `Added "${playlist.name}" to queue` }),
    onError: () => toast({ message: 'Failed to add to queue', type: 'error' }),
  })

  return (
    <MusicListItem
      artwork={{ src: playlist.images?.[0]?.url, fallback: 'disc' }}
      title={playlist.name}
      subtitle={`${playlist.tracks.total} tracks`}
      onTap={() => onSelect(playlist)}
      onPlay={() => playNow.mutate()}
      playDisabled={!speaker}
      playPending={playNow.isPending}
      disabled={!speaker}
      menuProps={{
        label: playlist.name,
        onPlayNext: () => playNext.mutate(),
        onAddToQueue: () => addToQueue.mutate(),
        fairylistTrack: {
          source: 'spotify',
          source_uri: playlist.uri,
          title: playlist.name,
          album_art_uri: playlist.images?.[0]?.url,
        },
      }}
    />
  )
}

// ── SpotifySearchSection ──────────────────────────────────────────────────────

interface SpotifySearchSectionProps {
  query: string
  speaker: string | null
  onSelectAlbum: (album: SpotifyAlbum) => void
  onSelectArtist: (artist: SpotifyArtist) => void
  onSelectPlaylist: (playlist: SpotifyPlaylist) => void
}

export function SpotifySearchSection({
  query,
  speaker,
  onSelectAlbum,
  onSelectArtist,
  onSelectPlaylist,
}: SpotifySearchSectionProps) {
  const [spotifyOpen, setSpotifyOpen] = useState(true)

  const {
    data: statusData,
    isError: statusIsError,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: ['spotify-status'],
    queryFn: api.spotify.getStatus,
    staleTime: 30_000,
    retry: 1,
  })

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['spotify-search', query],
    queryFn: () => api.spotify.search(query, ['track', 'album', 'artist', 'playlist']),
    staleTime: 60_000,
    enabled: query.length > 0 && !!statusData?.connected,
  })

  const trackItems = (data?.tracks?.items ?? []).filter((t): t is SpotifyTrack => t !== null)
  const artistItems = (data?.artists?.items ?? []).filter(Boolean) as SpotifyArtist[]
  const albumItems = (data?.albums?.items ?? []).filter(Boolean) as SpotifyAlbum[]
  const playlistItems = (data?.playlists?.items ?? []).filter(Boolean) as SpotifyPlaylist[]
  const totalCount = trackItems.length + artistItems.length + albumItems.length + playlistItems.length

  return (
    <Accordion
      id="unified-spotify"
      title={
        <span className="inline-flex items-center gap-1.5">
          <Music2 className="h-3.5 w-3.5 text-caption/70" aria-hidden="true" />
          Spotify
        </span>
      }
      open={spotifyOpen}
      onToggle={() => setSpotifyOpen(v => !v)}
      count={isLoading ? undefined : totalCount}
      card={false}
    >
      {statusIsError && (
        <SectionError
          message="Spotify unavailable — check your internet connection"
          onRetry={() => refetchStatus()}
        />
      )}
      {!statusIsError && !statusData?.connected && (
        <p className="py-3 text-xs text-caption">
          Connect Spotify in Settings to see results here
        </p>
      )}
      {!statusIsError && statusData?.connected && isLoading && <SectionSkeleton />}
      {!statusIsError && statusData?.connected && isError && (
        <SectionError
          message={(error as Error).message ?? 'Failed to search Spotify'}
          onRetry={() => refetch()}
        />
      )}
      {!statusIsError && statusData?.connected && !isLoading && !isError && totalCount === 0 && (
        <p className="py-3 text-xs text-caption">No Spotify results for &ldquo;{query}&rdquo;</p>
      )}
      {totalCount > 0 && (
        <div className="-mx-4">
          {artistItems.length > 0 && (
            <ul>
              {artistItems.map(artist => (
                <SpotifyArtistRow key={artist.id} artist={artist} onSelect={onSelectArtist} />
              ))}
            </ul>
          )}
          {albumItems.length > 0 && (
            <ul>
              {albumItems.map(album => (
                <SpotifyAlbumRow key={album.id} album={album} speaker={speaker} onSelect={onSelectAlbum} />
              ))}
            </ul>
          )}
          {playlistItems.length > 0 && (
            <ul>
              {playlistItems.map(playlist => (
                <SpotifyPlaylistRow key={playlist.id} playlist={playlist} speaker={speaker} onSelect={onSelectPlaylist} />
              ))}
            </ul>
          )}
          {trackItems.length > 0 && (
            <ul>
              {trackItems.map((track, i) => (
                <SpotifyTrackRow key={track.id + ':' + i} track={track} speaker={speaker} onSelectAlbum={onSelectAlbum} />
              ))}
            </ul>
          )}
        </div>
      )}
    </Accordion>
  )
}
