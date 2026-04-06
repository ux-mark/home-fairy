import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ChevronRight, Disc3 } from 'lucide-react'
import { api } from '@/lib/api'
import type { SonosLibraryTrack } from '@/lib/api'
import { useFirstSpeaker } from '@/hooks/useBrowseShared'
import { usePlaybackState } from '@/hooks/usePlaybackState'
import { cn } from '@/lib/utils'
import { ListSkeleton, ErrorState } from './BrowseShared'
import { NasTrackRow } from './NasTrackRow'

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

  const { isTrackPlaying: isTrackActive, isSelectedPlaying: isPlaying } = usePlaybackState()

  // Group tracks by album
  const albums = new Map<string, SonosLibraryTrack[]>()
  if (tracks) {
    for (const t of tracks) {
      const key = t.album || 'Unknown Album'
      const list = albums.get(key) ?? []
      list.push(t)
      albums.set(key, list)
    }
  }

  if (!artist) return null

  function handleSelectAlbum(albumName: string) {
    const objectId = `A:ALBUMARTIST/${encodeURIComponent(artist!)}/${encodeURIComponent(albumName)}`
    const sp = speakerParam ? `?speaker=${encodeURIComponent(speakerParam)}` : ''
    navigate(
      `/sonos/browse/nas/album/${encodeURIComponent(artist!)}/${encodeURIComponent(albumName)}${sp}`,
      { state: { objectId, fromArtist: true } },
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
          message={(error as Error).message ?? 'Failed to load tracks'}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && albums.size > 0 && (
        <div className="-mx-4">
          {Array.from(albums.entries()).map(([albumName, albumTracks]) => (
            <section key={albumName} aria-label={albumName}>
              <button
                type="button"
                onClick={() => handleSelectAlbum(albumName)}
                className={cn(
                  'flex w-full items-center gap-2 px-4 pb-1 pt-4 text-left',
                  'transition-colors hover:bg-[var(--bg-secondary)]',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                )}
              >
                <Disc3 className="h-3.5 w-3.5 text-fairy-400" aria-hidden="true" />
                <h3 className="text-xs font-semibold text-fairy-400">{albumName}</h3>
                <span className="text-xs text-caption">· {albumTracks.length} tracks</span>
                <ChevronRight className="ml-auto h-3 w-3 text-caption/40" aria-hidden="true" />
              </button>
              <ul>
                {albumTracks.slice(0, 5).map((track, i) => (
                  <NasTrackRow
                    key={track.uri + ':' + i}
                    track={track}
                    speaker={speaker}
                    isActive={isTrackActive(track.uri, track.title)}
                    isPlaying={isTrackActive(track.uri, track.title) && isPlaying}
                  />
                ))}
                {albumTracks.length > 5 && (
                  <li className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => handleSelectAlbum(albumName)}
                      className="text-xs font-medium text-fairy-400 hover:text-fairy-300"
                    >
                      Show all {albumTracks.length} tracks
                    </button>
                  </li>
                )}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
