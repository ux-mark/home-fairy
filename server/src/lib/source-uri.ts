/**
 * Shared classifier for the URI shapes that flow through queue and fairylist
 * actions. Sonos reports Spotify queue items as
 * `x-sonos-spotify:spotify%3atrack%3a…?sid=12&flags=8232&sn=4` — those must be
 * normalised back to canonical `spotify:…` URIs before they can be re-queued
 * (node-sonos-http-api's spotify action builds the SA_RINCON DIDL metadata
 * that AddURIToQueue requires for music-service URIs). NAS tracks and
 * ContentDirectory container ids go through the direct SOAP path instead.
 */

export type SourceUriKind = 'spotify' | 'nas-file' | 'nas-container' | 'radio' | 'unknown'

export interface ClassifiedSourceUri {
  kind: SourceUriKind
  source: 'spotify' | 'nas' | 'radio'
  normalizedUri: string
}

const NAS_FILE_PREFIXES = ['x-file-cifs://', 'x-sonos-http:']
const NAS_CONTAINER_PREFIXES = ['A:', 'S:', 'SQ:', 'x-rincon-playlist:']
const RADIO_PREFIXES = [
  'x-sonosapi-stream:',
  'x-sonosapi-radio:',
  'x-sonosapi-hls:',
  'x-rincon-mp3radio:',
  'aac://',
  'hls-radio:',
  'http://',
  'https://',
]

/** Decode the spotify%3a… path segment of a Sonos-encoded URI, dropping any query string. */
function decodeSpotifySegment(encoded: string): string | null {
  const path = encoded.split('?')[0]
  try {
    const decoded = decodeURIComponent(path)
    return decoded.startsWith('spotify:') ? decoded : null
  } catch {
    return null
  }
}

export function classifySourceUri(uri: string): ClassifiedSourceUri {
  if (uri.startsWith('spotify:')) {
    return { kind: 'spotify', source: 'spotify', normalizedUri: uri }
  }

  // x-sonos-spotify:spotify%3atrack%3a<id>?sid=… — any spotify type (track/album/playlist/episode)
  if (uri.startsWith('x-sonos-spotify:')) {
    const decoded = decodeSpotifySegment(uri.slice('x-sonos-spotify:'.length))
    if (decoded) return { kind: 'spotify', source: 'spotify', normalizedUri: decoded }
    return { kind: 'unknown', source: 'nas', normalizedUri: uri }
  }

  // x-rincon-cpcontainer:0006206cspotify%3aalbum%3a<id> — Spotify album/playlist containers
  if (uri.startsWith('x-rincon-cpcontainer:')) {
    const rest = uri.slice('x-rincon-cpcontainer:'.length)
    // Strip the leading hex object-id prefix (e.g. 0006206c) before the encoded URI
    const decoded = decodeSpotifySegment(rest.replace(/^[0-9a-f]{8}/i, ''))
    if (decoded) return { kind: 'spotify', source: 'spotify', normalizedUri: decoded }
    return { kind: 'unknown', source: 'nas', normalizedUri: uri }
  }

  if (RADIO_PREFIXES.some(p => uri.startsWith(p))) {
    return { kind: 'radio', source: 'radio', normalizedUri: uri }
  }

  if (NAS_FILE_PREFIXES.some(p => uri.startsWith(p))) {
    return { kind: 'nas-file', source: 'nas', normalizedUri: uri }
  }

  if (NAS_CONTAINER_PREFIXES.some(p => uri.startsWith(p))) {
    return { kind: 'nas-container', source: 'nas', normalizedUri: uri }
  }

  // Unknown shape — passed through the SOAP queue path as-is, but flagged so
  // callers can decide whether to surface it.
  return { kind: 'unknown', source: 'nas', normalizedUri: uri }
}
