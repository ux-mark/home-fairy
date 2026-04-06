import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, HardDrive, RefreshCw } from 'lucide-react'
import { AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'
import type { SonosLibraryTrack, SonosSearchArtist, SonosSearchAlbum, SonosGenreAlbum } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { Skeleton } from '@/components/ui/Skeleton'
import { Accordion } from '@/components/ui/Accordion'
import { cn } from '@/lib/utils'
import { ArtworkImage } from '../ArtworkImage'
import { MusicListItem } from '../MusicListItem'
import { SourceBadge } from '../SourceBadge'

// ── Skeleton ──────────────────────────────────────────────────────────────────

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

// ── NasTrackRow ───────────────────────────────────────────────────────────────

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
      badge={<SourceBadge source="nas" />}
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

// ── NasSearchArtistRow ────────────────────────────────────────────────────────

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

// ── NasSearchAlbumRow ─────────────────────────────────────────────────────────

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
      badge={<SourceBadge source="nas" />}
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

// ── NasSearchSection ──────────────────────────────────────────────────────────

interface NasSearchSectionProps {
  query: string
  speaker: string | null
  onSelectArtist: (name: string) => void
  onSelectAlbum: (album: SonosGenreAlbum) => void
}

export function NasSearchSection({
  query,
  speaker,
  onSelectArtist,
  onSelectAlbum,
}: NasSearchSectionProps) {
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
