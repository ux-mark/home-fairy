import { sonosClient } from './sonos-client.js'
import { withSpeakerByRoom } from './speaker-registry.js'
import { classifySourceUri } from './source-uri.js'
import { buildSpotifyQueueUri, buildSpotifyDidlMetadata } from './spotify-didl.js'

export type QueueMode = 'append' | 'next'

/**
 * Insert a Spotify URI immediately after the current track.
 *
 * Deliberately bypasses node-sonos-http-api's spotify 'next' action: that
 * action passes an explicit insert position computed from cached event state
 * (coordinator.state.trackNo + 1), which goes stale — on 2026-06-10 a
 * grouped speaker rejected 4 of 8 fairylist inserts with UPnP 500s until the
 * cache caught up. Here the server builds the SA_RINCON DIDL metadata itself
 * and sends EnqueueAsNext=1 with DesiredFirstTrackNumberEnqueued=0, so the
 * speaker resolves the position; withSpeakerByRoom already resolves group
 * members to their coordinator's IP.
 *
 * Falls back to the HTTP API action only when the Spotify service-id lookup
 * fails (e.g. account unlinked) — never worse than the old behaviour.
 */
export async function playSpotifyNext(speaker: string, spotifyUri: string): Promise<void> {
  const queuedViaSOAP = await withSpeakerByRoom(speaker, async ({ ip }) => {
    let service
    try {
      service = await sonosClient.getSpotifyService(ip)
    } catch (err) {
      console.warn(`[sonos-queue] Spotify service lookup failed (${err instanceof Error ? err.message : err}); falling back to HTTP API play-next`)
      return false
    }
    await sonosClient.playNextSOAP(
      ip,
      buildSpotifyQueueUri(spotifyUri, service.sid),
      buildSpotifyDidlMetadata(spotifyUri, service.serviceType),
    )
    return true
  })
  if (!queuedViaSOAP) {
    await sonosClient.playSpotifyUri(speaker, spotifyUri, 'next')
  }
}

export interface QueueItemOutcome {
  /** Number of tracks actually queued (containers expand to many). */
  queued: number
  /** Set when the item could not be queued; human-readable reason. */
  skippedReason?: string
}

/**
 * Queue a single URI on a speaker, dispatching on source:
 * - Spotify URIs (canonical or Sonos-encoded): 'append' goes through
 *   node-sonos-http-api's spotify action (it passes no queue position — safe);
 *   'next' goes through playSpotifyNext above, which builds the SA_RINCON
 *   DIDL metadata in-house and lets the speaker resolve the insert position.
 * - NAS container ids (A:…, SQ:…) are expanded to their tracks and queued via
 *   SOAP. In 'next' mode the tracks are inserted in reverse so they land in
 *   album order right after the current track.
 * - Radio streams can't live in the queue — skipped with a reason.
 * - NAS files (and unknown shapes) go through the direct SOAP path.
 *
 * Callers queueing a LIST of items with mode 'next' must iterate the list in
 * reverse: every 'next' insert lands immediately after the current track, so
 * reversed insertion preserves list order.
 */
export async function queueItemOnSpeaker(
  speaker: string,
  uri: string,
  mode: QueueMode,
): Promise<QueueItemOutcome> {
  const { kind, normalizedUri } = classifySourceUri(uri)

  if (kind === 'radio') {
    return { queued: 0, skippedReason: "Radio stations can't be added to the queue" }
  }

  if (kind === 'spotify') {
    if (mode === 'next') await playSpotifyNext(speaker, normalizedUri)
    else await sonosClient.playSpotifyUri(speaker, normalizedUri, 'queue')
    return { queued: 1 }
  }

  if (kind === 'nas-container') {
    const tracks = await sonosClient.getGenreAlbumTracks(normalizedUri)
    if (tracks.length === 0) {
      return { queued: 0, skippedReason: 'No tracks found in this container' }
    }
    const ordered = mode === 'next' ? [...tracks].reverse() : tracks
    let queued = 0
    await withSpeakerByRoom(speaker, async ({ ip }) => {
      for (const track of ordered) {
        try {
          if (mode === 'next') await sonosClient.playNextSOAP(ip, track.uri)
          else await sonosClient.addToQueueSOAP(ip, track.uri)
          queued++
        } catch (err) {
          console.error(`[sonos-queue] container track "${track.title}" failed: ${err instanceof Error ? err.message : err}`)
        }
      }
    })
    if (queued === 0) return { queued: 0, skippedReason: 'Could not queue any tracks from this container' }
    return { queued }
  }

  // nas-file / unknown — direct SOAP
  await withSpeakerByRoom(speaker, ({ ip }) =>
    mode === 'next' ? sonosClient.playNextSOAP(ip, normalizedUri) : sonosClient.addToQueueSOAP(ip, normalizedUri),
  )
  return { queued: 1 }
}
