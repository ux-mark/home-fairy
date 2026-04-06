import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Disc3, Play } from 'lucide-react'
import { api } from '@/lib/api'
import type { SpotifyAlbum } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { useFirstSpeaker } from '@/hooks/useBrowseShared'
import { cn } from '@/lib/utils'
import { ArtworkImage } from '../ArtworkImage'
import { MusicListItem } from '../MusicListItem'
import { ListSkeleton, ErrorState } from './BrowseShared'

// ── ArtistAlbumRow ────────────────────────────────────────────────────────────

function ArtistAlbumRow({
  album,
  speaker,
  onSelectAlbum,
}: {
  album: SpotifyAlbum
  speaker: string | null
  onSelectAlbum: (album: SpotifyAlbum) => void
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const playNow = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, album.uri, 'now'),
    onSuccess: () => toast({ message: `Playing "${album.name}"` }),
    onError: () => toast({ message: 'Failed to play album', type: 'error' }),
  })

  const playNext = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, album.uri, 'next'),
    onSuccess: () => {
      toast({ message: `"${album.name}" will play next` })
      queryClient.invalidateQueries({ queryKey: ['sonos-queue', speaker] })
    },
    onError: () => toast({ message: 'Failed to play next', type: 'error' }),
  })

  const addToQueue = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, album.uri, 'queue'),
    onSuccess: () => {
      toast({ message: `Added "${album.name}" to queue` })
      queryClient.invalidateQueries({ queryKey: ['sonos-queue', speaker] })
    },
    onError: () => toast({ message: 'Failed to add to queue', type: 'error' }),
  })

  const albumType = album.album_type.charAt(0).toUpperCase() + album.album_type.slice(1)
  const year = album.release_date.slice(0, 4)
  const songCount = album.total_tracks
  const subtitle = `${albumType} · ${year} · ${songCount} ${songCount === 1 ? 'song' : 'songs'}`

  return (
    <MusicListItem
      artwork={{ images: album.images, size: 48 }}
      title={album.name}
      subtitle={subtitle}
      onTap={() => onSelectAlbum(album)}
      onPlay={() => playNow.mutate()}
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
          album_art_uri: album.images?.[0]?.url,
        },
      }}
    />
  )
}

// ── SpotifyArtistDetail ───────────────────────────────────────────────────────

export function SpotifyArtistDetail() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { toast } = useToast()

  const speakerParam = searchParams.get('speaker')
  const firstSpeaker = useFirstSpeaker()
  const speaker = speakerParam ?? firstSpeaker

  const backUrl = `/sonos/browse?source=spotify${speakerParam ? `&speaker=${encodeURIComponent(speakerParam)}` : ''}`

  // Load artist metadata from the artists list (cached)
  const { data: artistsData } = useQuery({
    queryKey: ['spotify-artists'],
    queryFn: () => api.spotify.getArtists(),
    staleTime: 5 * 60_000,
  })
  const artist = (artistsData?.items ?? []).find(a => a.id === id)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['spotify-artist-albums', id],
    queryFn: () => api.spotify.getArtistAlbums(id!),
    staleTime: 5 * 60_000,
    enabled: !!id,
  })

  const playArtist = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, artist!.uri, 'now'),
    onSuccess: () => toast({ message: `Playing ${artist?.name}` }),
    onError: () => toast({ message: 'Failed to play artist', type: 'error' }),
  })

  if (!id) return null

  const albums = data?.items ?? []

  function handleSelectAlbum(album: SpotifyAlbum) {
    const sp = speakerParam ? `?speaker=${encodeURIComponent(speakerParam)}` : ''
    navigate(
      `/sonos/browse/spotify/album/${encodeURIComponent(album.id)}${sp}`,
      { state: { fromArtist: true, artistId: id } },
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
        {artist && <ArtworkImage images={artist.images} size={44} rounded="rounded-full" />}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold leading-snug text-heading">
            {artist?.name ?? 'Artist'}
          </h2>
          {artist?.followers !== undefined && (
            <p className="truncate text-xs text-caption">
              {artist.followers.total.toLocaleString()} followers
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={!speaker || !artist || playArtist.isPending}
          onClick={() => playArtist.mutate()}
          aria-label={`Play ${artist?.name ?? 'artist'}`}
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fairy-500',
            'text-white transition-colors hover:bg-fairy-400',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            'disabled:opacity-40',
          )}
        >
          <Play className="h-5 w-5" aria-hidden="true" />
        </button>
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
            <ArtistAlbumRow key={album.id} album={album} speaker={speaker} onSelectAlbum={handleSelectAlbum} />
          ))}
        </ul>
      )}
    </div>
  )
}
