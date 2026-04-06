import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Disc3 } from 'lucide-react'
import { api } from '@/lib/api'
import type { SonosLibraryTrack } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { useFirstSpeaker } from '@/hooks/useBrowseShared'
import { cn } from '@/lib/utils'
import { MusicListItem } from '../MusicListItem'
import { ListSkeleton, ErrorState } from './BrowseShared'

// ── Album derived from NAS tracks ─────────────────────────────────────────────

interface NasAlbumEntry {
  albumName: string
  tracks: SonosLibraryTrack[]
  objectId: string
  albumArtUri: string
}

// ── ArtistAlbumRow ────────────────────────────────────────────────────────────

function ArtistAlbumRow({
  album,
  speaker,
  artistName,
  onSelectAlbum,
}: {
  album: NasAlbumEntry
  speaker: string | null
  artistName: string
  onSelectAlbum: (album: NasAlbumEntry) => void
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const playNow = useMutation({
    mutationFn: () => api.sonos.playUri(speaker!, album.objectId),
    onSuccess: () => toast({ message: `Playing "${album.albumName}"` }),
    onError: () => toast({ message: 'Failed to play album', type: 'error' }),
  })

  const playNext = useMutation({
    mutationFn: () => api.sonos.playAlbumNext(speaker!, album.objectId, 'nas'),
    onSuccess: () => {
      toast({ message: `"${album.albumName}" will play next` })
      queryClient.invalidateQueries({ queryKey: ['sonos-queue', speaker] })
    },
    onError: () => toast({ message: 'Failed to play next', type: 'error' }),
  })

  const addToQueue = useMutation({
    mutationFn: () => api.sonos.addAlbumToQueue(speaker!, album.objectId, 'nas'),
    onSuccess: () => {
      toast({ message: `Added "${album.albumName}" to queue` })
      queryClient.invalidateQueries({ queryKey: ['sonos-queue', speaker] })
    },
    onError: () => toast({ message: 'Failed to add to queue', type: 'error' }),
  })

  const trackCount = album.tracks.length
  const subtitle = `${artistName} · ${trackCount} ${trackCount === 1 ? 'song' : 'songs'}`

  return (
    <MusicListItem
      artwork={{ src: album.albumArtUri || undefined, size: 48, fallback: 'disc' }}
      title={album.albumName}
      subtitle={subtitle}
      onTap={() => onSelectAlbum(album)}
      onPlay={() => playNow.mutate()}
      playPending={playNow.isPending}
      disabled={!speaker}
      menuProps={{
        label: album.albumName,
        onPlayNext: () => playNext.mutate(),
        onAddToQueue: () => addToQueue.mutate(),
        fairylistTrack: {
          source: 'nas',
          source_uri: album.objectId,
          title: album.albumName,
          artist: artistName,
          album_art_uri: album.albumArtUri || undefined,
        },
      }}
    />
  )
}

// ── NasArtistDetail ───────────────────────────────────────────────────────────

export function NasArtistDetail() {
  const { name } = useParams<{ name: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const speakerParam = searchParams.get('speaker')
  const firstSpeaker = useFirstSpeaker()
  const speaker = speakerParam ?? firstSpeaker

  const artist = name ? decodeURIComponent(name) : null

  const backUrl = `/sonos/browse?source=nas${speakerParam ? `&speaker=${encodeURIComponent(speakerParam)}` : ''}`

  const { data: tracks, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sonos-library-artist-tracks', artist],
    queryFn: () => api.sonos.getArtistTracks(artist!),
    staleTime: 5 * 60_000,
    enabled: !!artist,
  })

  // Load enriched albums for artwork lookup
  const { data: albumsData } = useQuery({
    queryKey: ['nas-enriched-albums'],
    queryFn: api.sonos.getEnrichedNasAlbums,
    staleTime: 5 * 60_000,
  })

  // Group tracks by album, building NasAlbumEntry with artwork
  const albums: NasAlbumEntry[] = []
  if (tracks) {
    const albumMap = new Map<string, SonosLibraryTrack[]>()
    for (const t of tracks) {
      const key = t.album || 'Unknown Album'
      const list = albumMap.get(key) ?? []
      list.push(t)
      albumMap.set(key, list)
    }
    for (const [albumName, albumTracks] of albumMap.entries()) {
      const objectId = `A:ALBUMARTIST/${encodeURIComponent(artist!)}/${encodeURIComponent(albumName)}`
      const enriched = (albumsData?.items ?? []).find(
        a => a.artist?.toLowerCase() === artist?.toLowerCase() && a.name?.toLowerCase() === albumName.toLowerCase(),
      )
      albums.push({
        albumName,
        tracks: albumTracks,
        objectId,
        albumArtUri: enriched?.albumArtUri ?? albumTracks[0]?.albumArtUri ?? '',
      })
    }
  }

  if (!artist) return null

  function handleSelectAlbum(album: NasAlbumEntry) {
    const sp = speakerParam ? `?speaker=${encodeURIComponent(speakerParam)}` : ''
    navigate(
      `/sonos/browse/nas/album/${encodeURIComponent(artist!)}/${encodeURIComponent(album.albumName)}${sp}`,
      { state: { objectId: album.objectId, fromArtist: true } },
    )
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(backUrl)}
          aria-label="Back to artists"
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-secondary)]',
            'text-caption transition-colors hover:bg-[var(--bg-tertiary)] hover:text-body',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <h2 className="truncate text-lg font-semibold text-heading">{artist}</h2>
      </div>

      {isLoading && <ListSkeleton />}

      {isError && (
        <ErrorState
          message={(error as Error).message ?? 'Failed to load albums'}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && albums.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <Disc3 className="h-10 w-10 text-caption/40" aria-hidden="true" />
          <p className="text-sm text-caption">No albums found</p>
        </div>
      )}

      {albums.length > 0 && (
        <ul className="-mx-4">
          {albums.map(album => (
            <ArtistAlbumRow
              key={album.albumName}
              album={album}
              speaker={speaker}
              artistName={artist}
              onSelectAlbum={handleSelectAlbum}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
