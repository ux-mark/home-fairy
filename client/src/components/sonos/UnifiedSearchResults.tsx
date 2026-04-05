import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ChevronRight,
  HardDrive,
  Music2,
  Radio,
  RefreshCw,
} from 'lucide-react'
import { api } from '@/lib/api'
import type {
  SonosLibraryTrack,
  SonosSearchArtist,
  SonosSearchAlbum,
  SonosGenreAlbum,
  SonosRadioStation,
  SpotifyTrack,
  SpotifyAlbum,
  SpotifyArtist,
  SpotifyPlaylist,
} from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { Skeleton } from '@/components/ui/Skeleton'
import { Accordion } from '@/components/ui/Accordion'
import { cn } from '@/lib/utils'
import { ArtworkImage } from './ArtworkImage'
import { MusicListItem } from './MusicListItem'

// ── Helpers ──────────────────────────────────────────────────────────────────

function useFirstSpeaker() {
  const { data: zones } = useQuery({
    queryKey: ['sonos-zones'],
    queryFn: api.sonos.getZones,
    staleTime: 30_000,
  })
  return zones?.[0]?.members?.[0]?.roomName ?? zones?.[0]?.coordinator?.roomName ?? null
}

function useDebounce<T>(value: T, delay: number): T {
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

// ── Skeleton ─────────────────────────────────────────────────────────────────

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

// ── Section error ─────────────────────────────────────────────────────────────

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

// ── NAS track row ─────────────────────────────────────────────────────────────

function NasTrackRow({
  track,
  speaker,
  onSelectArtist,
}: {
  track: SonosLibraryTrack
  speaker: string | null
  onSelectArtist: (name: string) => void
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const playNow = useMutation({
    mutationFn: () => api.sonos.playUri(speaker!, track.uri),
    onSuccess: () => toast({ message: `Playing "${track.title}"` }),
    onError: () => toast({ message: 'Failed to play track', type: 'error' }),
  })

  const addToQueue = useMutation({
    mutationFn: () => api.sonos.addToQueue(speaker!, track.uri),
    onSuccess: () => {
      toast({ message: `Added "${track.title}" to queue` })
      queryClient.invalidateQueries({ queryKey: ['sonos-queue', speaker] })
    },
    onError: () => toast({ message: 'Failed to add to queue', type: 'error' }),
  })

  const playNext = useMutation({
    mutationFn: () => api.sonos.playNext(speaker!, track.uri),
    onSuccess: () => {
      toast({ message: `"${track.title}" will play next` })
      queryClient.invalidateQueries({ queryKey: ['sonos-queue', speaker] })
    },
    onError: () => toast({ message: 'Failed to play next', type: 'error' }),
  })

  const addToFavourites = useMutation({
    mutationFn: () => api.favourites.add({
      source: 'nas',
      source_uri: track.uri,
      title: track.title || 'Unknown track',
      album_art_uri: track.albumArtUri,
    }),
    onSuccess: () => toast({ message: `Added "${track.title}" to favourites` }),
    onError: () => toast({ message: 'Failed to add to favourites', type: 'error' }),
  })

  return (
    <MusicListItem
      artwork={{ src: track.albumArtUri, fallback: 'disc' }}
      title={track.title || 'Unknown track'}
      subtitle={[track.artist, track.album].filter(Boolean).join(' · ')}
      onTap={() => track.artist && onSelectArtist(track.artist)}
      onPlay={() => playNow.mutate()}
      playDisabled={!speaker}
      playPending={playNow.isPending}
      disabled={!speaker}
      menuProps={{
        label: track.title || 'Unknown track',
        onPlayNext: () => playNext.mutate(),
        onAddToQueue: () => addToQueue.mutate(),
        onAddToFavourites: () => addToFavourites.mutate(),
        fairylistTrack: {
          source: 'nas',
          source_uri: track.uri,
          title: track.title || 'Unknown track',
          artist: track.artist,
          album_art_uri: track.albumArtUri,
        },
      }}
    />
  )
}

// ── Spotify track row ─────────────────────────────────────────────────────────

function SpotifyTrackRow({
  track,
  speaker,
  onSelectAlbum,
}: {
  track: SpotifyTrack
  speaker: string | null
  onSelectAlbum: (album: SpotifyAlbum) => void
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const playNow = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, track.uri, 'now'),
    onSuccess: () => toast({ message: `Playing "${track.name}"` }),
    onError: () => toast({ message: 'Failed to play track', type: 'error' }),
  })

  const addToQueue = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, track.uri, 'queue'),
    onSuccess: () => {
      toast({ message: `Added "${track.name}" to queue` })
      queryClient.invalidateQueries({ queryKey: ['sonos-queue', speaker] })
    },
    onError: () => toast({ message: 'Failed to add to queue', type: 'error' }),
  })

  const playNext = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, track.uri, 'next'),
    onSuccess: () => {
      toast({ message: `"${track.name}" will play next` })
      queryClient.invalidateQueries({ queryKey: ['sonos-queue', speaker] })
    },
    onError: () => toast({ message: 'Failed to play next', type: 'error' }),
  })

  const addToFavourites = useMutation({
    mutationFn: () => api.favourites.add({
      source: 'spotify',
      source_uri: track.uri,
      title: track.name,
      album_art_uri: track.album.images?.[0]?.url,
    }),
    onSuccess: () => toast({ message: `Added "${track.name}" to favourites` }),
    onError: () => toast({ message: 'Failed to add to favourites', type: 'error' }),
  })

  const artistNames = track.artists.map(a => a.name).join(', ')
  const artUri = track.album.images?.[0]?.url

  // Build a SpotifyAlbum from the track's album data for navigation
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
        onAddToFavourites: () => addToFavourites.mutate(),
        fairylistTrack: {
          source: 'spotify',
          source_uri: track.uri,
          title: track.name,
          artist: track.artists.map(a => a.name).join(', '),
          album_art_uri: track.album.images?.[0]?.url,
        },
        spotifyTrack: { trackUri: track.uri, trackName: track.name },
      }}
    />
  )
}

// ── Spotify album row ─────────────────────────────────────────────────────────

function SpotifyAlbumRow({
  album,
  speaker,
  onSelect,
}: {
  album: Pick<SpotifyAlbum, 'id' | 'name' | 'images' | 'artists' | 'uri' | 'external_urls'>
  speaker: string | null
  onSelect: (album: SpotifyAlbum) => void
}) {
  const { toast } = useToast()

  const playNow = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, album.uri, 'now'),
    onSuccess: () => toast({ message: `Playing "${album.name}"` }),
    onError: () => toast({ message: 'Failed to play album', type: 'error' }),
  })

  return (
    <MusicListItem
      artwork={{ src: album.images?.[0]?.url, fallback: 'disc' }}
      title={album.name}
      subtitle={album.artists.map(a => a.name).join(', ')}
      onTap={() => onSelect({
        ...album,
        release_date: (album as SpotifyAlbum).release_date ?? '',
        total_tracks: (album as SpotifyAlbum).total_tracks ?? 0,
        album_type: (album as SpotifyAlbum).album_type ?? 'album',
      })}
      onPlay={() => playNow.mutate()}
      playDisabled={!speaker}
      playPending={playNow.isPending}
      disabled={!speaker}
      menuProps={{
        label: album.name,
        onPlayNext: () => {},
        onAddToQueue: () => {},
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

// ── Spotify artist row ────────────────────────────────────────────────────────

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

// ── Spotify playlist row ──────────────────────────────────────────────────────

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
        onPlayNext: () => {},
        onAddToQueue: () => {},
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

// ── Radio station row ─────────────────────────────────────────────────────────

function RadioStationRow({
  station,
  speaker,
}: {
  station: SonosRadioStation
  speaker: string | null
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const play = useMutation({
    mutationFn: () => api.sonos.playFavourite(speaker!, station.title),
    onSuccess: () => toast({ message: `Playing ${station.title}` }),
    onError: () => toast({ message: `Failed to play ${station.title}`, type: 'error' }),
  })

  const playNext = useMutation({
    mutationFn: () => api.sonos.playNext(speaker!, station.uri),
    onSuccess: () => {
      toast({ message: `${station.title} will play next` })
      queryClient.invalidateQueries({ queryKey: ['sonos-queue', speaker] })
    },
    onError: () => toast({ message: `Failed to queue ${station.title}`, type: 'error' }),
  })

  const addToQueue = useMutation({
    mutationFn: () => api.sonos.addToQueue(speaker!, station.uri),
    onSuccess: () => {
      toast({ message: `Added "${station.title}" to queue` })
      queryClient.invalidateQueries({ queryKey: ['sonos-queue', speaker] })
    },
    onError: () => toast({ message: 'Failed to add to queue', type: 'error' }),
  })

  const addToFavourites = useMutation({
    mutationFn: () => api.favourites.add({
      source: 'radio',
      source_uri: station.uri,
      title: station.title,
      album_art_uri: station.albumArtUri,
    }),
    onSuccess: () => toast({ message: `Added "${station.title}" to favourites` }),
    onError: () => toast({ message: 'Failed to add to favourites', type: 'error' }),
  })

  return (
    <MusicListItem
      artwork={{ src: station.albumArtUri, fallback: 'disc' }}
      title={station.title}
      subtitle=""
      onTap={() => play.mutate()}
      onPlay={() => play.mutate()}
      playDisabled={!speaker}
      playPending={play.isPending}
      disabled={!speaker}
      menuProps={{
        label: station.title,
        onPlayNext: () => playNext.mutate(),
        onAddToQueue: () => addToQueue.mutate(),
        onAddToFavourites: () => addToFavourites.mutate(),
        fairylistTrack: {
          source: 'radio',
          source_uri: station.uri,
          title: station.title,
          album_art_uri: station.albumArtUri,
        },
      }}
    />
  )
}

// ── NAS search artist row ─────────────────────────────────────────────────────

function NasSearchArtistRow({
  artist,
  onSelect,
}: {
  artist: SonosSearchArtist
  onSelect: (name: string) => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(artist.name)}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-2.5 text-left',
          'transition-colors hover:bg-[var(--bg-secondary)]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          'min-h-[44px]',
        )}
      >
        <ArtworkImage src={artist.albumArtUri} size={40} rounded="rounded-full" fallback="user" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-heading">{artist.name}</p>
          <p className="text-xs text-caption">
            {artist.trackCount} {artist.trackCount === 1 ? 'track' : 'tracks'}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-caption/40" aria-hidden="true" />
      </button>
    </li>
  )
}

// ── NAS search album row ──────────────────────────────────────────────────────

function NasSearchAlbumRow({
  album,
  speaker,
  onSelect,
}: {
  album: SonosSearchAlbum
  speaker: string | null
  onSelect: (album: SonosGenreAlbum) => void
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const objectId = `A:ALBUMARTIST/${encodeURIComponent(album.artist)}/${encodeURIComponent(album.name)}`
  const albumArtUri = album.albumArtUri ?? ''

  const playNow = useMutation({
    mutationFn: () => api.sonos.playUri(speaker!, objectId),
    onSuccess: () => toast({ message: `Playing "${album.name}"` }),
    onError: () => toast({ message: 'Failed to play album', type: 'error' }),
  })

  const playNext = useMutation({
    mutationFn: () => api.sonos.playAlbumNext(speaker!, objectId, 'nas'),
    onSuccess: () => {
      toast({ message: `"${album.name}" will play next` })
      queryClient.invalidateQueries({ queryKey: ['sonos-queue', speaker] })
    },
    onError: () => toast({ message: 'Failed to play next', type: 'error' }),
  })

  const addToQueue = useMutation({
    mutationFn: () => api.sonos.addAlbumToQueue(speaker!, objectId, 'nas'),
    onSuccess: () => {
      toast({ message: `Added "${album.name}" to queue` })
      queryClient.invalidateQueries({ queryKey: ['sonos-queue', speaker] })
    },
    onError: () => toast({ message: 'Failed to add to queue', type: 'error' }),
  })

  const subtitle = album.trackCount
    ? `${album.artist} · ${album.trackCount} ${album.trackCount === 1 ? 'song' : 'songs'}`
    : album.artist

  return (
    <MusicListItem
      artwork={{ src: albumArtUri, size: 40, fallback: 'disc' }}
      title={album.name}
      subtitle={subtitle}
      onTap={() => onSelect({ name: album.name, artist: album.artist, albumArtUri, objectId })}
      onPlay={() => playNow.mutate()}
      playDisabled={!speaker}
      playPending={playNow.isPending}
      disabled={!speaker}
      menuProps={{
        label: album.name,
        onPlayNext: () => playNext.mutate(),
        onAddToQueue: () => addToQueue.mutate(),
        fairylistTrack: {
          source: 'nas',
          source_uri: objectId,
          title: album.name,
          artist: album.artist,
          album_art_uri: albumArtUri,
        },
      }}
    />
  )
}

// ── NAS section ───────────────────────────────────────────────────────────────

function NasSection({
  query,
  speaker,
  onSelectArtist,
  onSelectAlbum,
}: {
  query: string
  speaker: string | null
  onSelectArtist: (name: string) => void
  onSelectAlbum: (album: SonosGenreAlbum) => void
}) {
  const [nasOpen, setNasOpen] = useState(true)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sonos-library-search', query],
    queryFn: () => api.sonos.searchLibrary(query),
    staleTime: 60_000,
    enabled: query.length > 0,
  })

  const artists = data?.artists ?? []
  const albums = data?.albums ?? []
  const tracks = data?.tracks ?? []
  const totalCount = artists.length + albums.length + tracks.length

  return (
    <Accordion
      id="unified-nas"
      title={
        <span className="inline-flex items-center gap-1.5">
          <HardDrive className="h-3.5 w-3.5 text-caption/70" aria-hidden="true" />
          NAS Library
        </span>
      }
      open={nasOpen}
      onToggle={() => setNasOpen(v => !v)}
      count={isLoading ? undefined : totalCount}
      card={false}
    >
      {isLoading && <SectionSkeleton />}
      {isError && (
        <SectionError
          message={(error as Error).message ?? 'Failed to search NAS library'}
          onRetry={() => refetch()}
        />
      )}
      {!isLoading && !isError && totalCount === 0 && (
        <p className="py-3 text-xs text-caption">No NAS results for &ldquo;{query}&rdquo;</p>
      )}
      {!isLoading && !isError && totalCount > 0 && (
        <div className="-mx-4">
          {artists.length > 0 && (
            <ul>
              {artists.map(artist => (
                <NasSearchArtistRow key={artist.name} artist={artist} onSelect={onSelectArtist} />
              ))}
            </ul>
          )}
          {albums.length > 0 && (
            <ul>
              {albums.map((album, i) => (
                <NasSearchAlbumRow key={album.name + ':' + album.artist + ':' + i} album={album} speaker={speaker} onSelect={onSelectAlbum} />
              ))}
            </ul>
          )}
          {tracks.length > 0 && (
            <ul>
              {tracks.map((track, i) => (
                <NasTrackRow key={track.uri + ':' + i} track={track} speaker={speaker} onSelectArtist={onSelectArtist} />
              ))}
            </ul>
          )}
        </div>
      )}
    </Accordion>
  )
}

// ── Spotify section ───────────────────────────────────────────────────────────

function SpotifySection({
  query,
  speaker,
  onSelectAlbum,
  onSelectArtist,
  onSelectPlaylist,
}: {
  query: string
  speaker: string | null
  onSelectAlbum: (album: SpotifyAlbum) => void
  onSelectArtist: (artist: SpotifyArtist) => void
  onSelectPlaylist: (playlist: SpotifyPlaylist) => void
}) {
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

// ── Radio section ─────────────────────────────────────────────────────────────

function RadioSection({ query, speaker }: { query: string; speaker: string | null }) {
  const [radioOpen, setRadioOpen] = useState(true)

  const { data: stations, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sonos-radio-stations'],
    queryFn: api.sonos.getRadioStations,
    staleTime: 5 * 60_000,
  })

  const filtered = stations
    ? stations.filter(s => s.title.toLowerCase().includes(query.toLowerCase()))
    : []

  return (
    <Accordion
      id="unified-radio"
      title={
        <span className="inline-flex items-center gap-1.5">
          <Radio className="h-3.5 w-3.5 text-caption/70" aria-hidden="true" />
          Radio
        </span>
      }
      open={radioOpen}
      onToggle={() => setRadioOpen(v => !v)}
      count={isLoading ? undefined : filtered.length}
      card={false}
    >
      {isLoading && <SectionSkeleton />}
      {isError && (
        <SectionError
          message={(error as Error).message ?? 'Failed to load radio stations'}
          onRetry={() => refetch()}
        />
      )}
      {!isLoading && !isError && filtered.length === 0 && (
        <p className="py-3 text-xs text-caption">No radio stations match &ldquo;{query}&rdquo;</p>
      )}
      {filtered.length > 0 && (
        <ul className="-mx-4">
          {filtered.map((station, i) => (
            <RadioStationRow key={station.uri + ':' + i} station={station} speaker={speaker} />
          ))}
        </ul>
      )}
    </Accordion>
  )
}

// ── UnifiedSearchResults ──────────────────────────────────────────────────────

interface UnifiedSearchResultsProps {
  searchQuery: string
  targetSpeaker?: string | null
  onSelectNasArtist?: (name: string) => void
  onSelectNasAlbum?: (album: SonosGenreAlbum) => void
  onSelectSpotifyAlbum?: (album: SpotifyAlbum) => void
  onSelectSpotifyArtist?: (artist: SpotifyArtist) => void
  onSelectSpotifyPlaylist?: (playlist: SpotifyPlaylist) => void
}

export function UnifiedSearchResults({
  searchQuery,
  targetSpeaker,
  onSelectNasArtist,
  onSelectNasAlbum,
  onSelectSpotifyAlbum,
  onSelectSpotifyArtist,
  onSelectSpotifyPlaylist,
}: UnifiedSearchResultsProps) {
  const firstSpeaker = useFirstSpeaker()
  const speaker = targetSpeaker ?? firstSpeaker
  const debouncedQuery = useDebounce(searchQuery.trim(), 300)

  if (!debouncedQuery) return null

  const noop = () => {}

  return (
    <div className="flex flex-col gap-2">
      <NasSection
        query={debouncedQuery}
        speaker={speaker}
        onSelectArtist={onSelectNasArtist ?? noop}
        onSelectAlbum={onSelectNasAlbum ?? noop}
      />
      <SpotifySection
        query={debouncedQuery}
        speaker={speaker}
        onSelectAlbum={onSelectSpotifyAlbum ?? noop}
        onSelectArtist={onSelectSpotifyArtist ?? noop}
        onSelectPlaylist={onSelectSpotifyPlaylist ?? noop}
      />
      <RadioSection query={debouncedQuery} speaker={speaker} />
    </div>
  )
}
