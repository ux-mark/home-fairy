import { useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { ArrowLeft, Music2, Pause, Play } from 'lucide-react'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { useFirstSpeaker } from '@/hooks/useBrowseShared'
import { usePlaybackState } from '@/hooks/usePlaybackState'
import { cn } from '@/lib/utils'
import { ArtworkImage } from '../ArtworkImage'
import { AlbumPlaylistMenu } from '../AlbumPlaylistMenu'
import { ListSkeleton, ErrorState } from './BrowseShared'
import { NasTrackRow } from './NasTrackRow'

// ── NasAlbumDetail ────────────────────────────────────────────────────────────

export function NasAlbumDetail() {
  const { artist: artistParam, title: titleParam } = useParams<{ artist: string; title: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useToast()

  const speakerParam = searchParams.get('speaker')
  const firstSpeaker = useFirstSpeaker()
  const speaker = speakerParam ?? firstSpeaker

  const artist = artistParam ? decodeURIComponent(artistParam) : null
  const title = titleParam ? decodeURIComponent(titleParam) : null

  // objectId may be passed via location state (from NasArtistDetail) or reconstructed
  const stateObjectId = (location.state as { objectId?: string } | null)?.objectId
  const objectId = stateObjectId ?? (artist && title
    ? `A:ALBUMARTIST/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`
    : null)

  // Try to get album art from enriched NAS albums list
  const { data: albumsData } = useQuery({
    queryKey: ['nas-enriched-albums'],
    queryFn: api.sonos.getEnrichedNasAlbums,
    staleTime: 5 * 60_000,
  })
  const enrichedAlbum = (albumsData?.items ?? []).find(
    a => a.artist?.toLowerCase() === artist?.toLowerCase() && a.name?.toLowerCase() === title?.toLowerCase(),
  )
  const albumArtUri = enrichedAlbum?.albumArtUri ?? ''

  const { data: tracks, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sonos-library-album-tracks', objectId],
    queryFn: () => api.sonos.getAlbumTracks(objectId!),
    staleTime: 5 * 60_000,
    enabled: !!objectId,
  })

  const playAlbum = useMutation({
    mutationFn: () => api.sonos.playUri(speaker!, objectId!),
    onSuccess: () => toast({ message: `Playing "${title}"` }),
    onError: () => toast({ message: 'Failed to play album', type: 'error' }),
  })

  const pauseAlbum = useMutation({
    mutationFn: () => api.sonos.pause(speaker!),
    onError: () => toast({ message: 'Failed to pause', type: 'error' }),
  })

  const { isTrackPlaying: isTrackActive, isSelectedPlaying: isPlaying } = usePlaybackState()

  if (!artist || !title || !objectId) return null

  // Back goes to artist detail if came from there, else to browse
  const fromArtist = location.state != null && (location.state as { fromArtist?: boolean }).fromArtist
  const backUrl = fromArtist
    ? `/sonos/browse/nas/artist/${encodeURIComponent(artist)}${speakerParam ? `?speaker=${encodeURIComponent(speakerParam)}` : ''}`
    : `/sonos/browse?source=nas${speakerParam ? `&speaker=${encodeURIComponent(speakerParam)}` : ''}`

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(backUrl)}
          aria-label="Back"
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-secondary)]',
            'text-caption transition-colors hover:bg-[var(--bg-tertiary)] hover:text-body',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <ArtworkImage src={albumArtUri} size={44} fallback="disc" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold leading-snug text-heading">{title}</h2>
          <p className="text-xs text-caption">{artist}</p>
        </div>
        <AlbumPlaylistMenu
          uri={objectId}
          title={title}
          artUri={albumArtUri}
          source="nas"
          speaker={speaker}
        />
        <button
          type="button"
          disabled={!speaker || playAlbum.isPending || pauseAlbum.isPending}
          onClick={() => isPlaying ? pauseAlbum.mutate() : playAlbum.mutate()}
          aria-label={isPlaying ? `Pause ${title}` : `Play album ${title}`}
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fairy-500',
            'text-white transition-colors hover:bg-fairy-400',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            'disabled:opacity-40',
          )}
        >
          {isPlaying
            ? <Pause className="h-5 w-5" aria-hidden="true" />
            : <Play className="h-5 w-5" aria-hidden="true" />
          }
        </button>
      </div>

      {isLoading && <ListSkeleton />}

      {isError && (
        <ErrorState
          message={(error as Error).message ?? 'Failed to load tracks'}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && tracks && tracks.length > 0 && (
        <ul className="-mx-4">
          {tracks.map((track, i) => (
            <NasTrackRow
              key={track.uri + ':' + i}
              track={track}
              speaker={speaker}
              isActive={isTrackActive(track.uri, track.title)}
              isPlaying={isPlaying}
            />
          ))}
        </ul>
      )}

      {!isLoading && !isError && (!tracks || tracks.length === 0) && (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <Music2 className="h-10 w-10 text-caption/40" aria-hidden="true" />
          <p className="text-sm text-caption">No tracks found</p>
        </div>
      )}
    </div>
  )
}
