/**
 * Builders for the Sonos-proprietary queue URI and DIDL-Lite metadata that
 * AddURIToQueue requires for Spotify content. Mirrors the translation
 * node-sonos-http-api performs in its spotify action (documented in
 * .specs/SPOTIFY_SONOS_PLAYBACK.md) so this server can issue the SOAP call
 * itself: the speaker then resolves the insert position, instead of the
 * HTTP API passing an explicit position computed from possibly-stale cached
 * playback state.
 */

export interface SpotifyServiceInfo {
  /** Music-service id assigned by this Sonos household (the sid query param). */
  sid: number
  /** SA_RINCON token component — (sid << 8) + 7, same derivation as sonos-discovery. */
  serviceType: number
}

export function spotifyServiceTypeFromSid(sid: number): number {
  return (sid << 8) + 7
}

/**
 * Translate a canonical Spotify URI into the queue form Sonos accepts.
 * Tracks become x-sonos-spotify URIs; albums/playlists/artist radio become
 * cpcontainer ids with the 0006206c object-id prefix.
 */
export function buildSpotifyQueueUri(spotifyUri: string, sid: number): string {
  const encoded = encodeURIComponent(spotifyUri)
  if (spotifyUri.startsWith('spotify:track:')) {
    return `x-sonos-spotify:${encoded}?sid=${sid}&flags=32&sn=1`
  }
  return `x-rincon-cpcontainer:0006206c${encoded}`
}

/**
 * DIDL-Lite metadata whose SA_RINCON desc token authorises the speaker to
 * resolve the URI against the household's linked Spotify account. Without
 * it, AddURIToQueue rejects music-service URIs.
 */
export function buildSpotifyDidlMetadata(spotifyUri: string, serviceType: number): string {
  const encoded = encodeURIComponent(spotifyUri)
  return (
    '<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" ' +
    'xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">' +
    `<item id="00030020${encoded}" restricted="true">` +
    '<upnp:class>object.item.audioItem.musicTrack</upnp:class>' +
    '<desc id="cdudn" nameSpace="urn:schemas-rinconnetworks-com:metadata-1-0/">' +
    `SA_RINCON${serviceType}_X_#Svc${serviceType}-0-Token` +
    '</desc></item></DIDL-Lite>'
  )
}
