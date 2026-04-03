# Spotify -> Sonos Playback: Findings & Implementation

## Summary

Spotify playback through Sonos requires URI format translation. Raw Spotify URIs (`spotify:track:...`) cannot be passed directly to Sonos's `setAVTransportURI`, `addToQueue`, or `playNext` endpoints — Sonos requires a proprietary URI format. `node-sonos-http-api` handles this translation natively via its `/spotify/{action}/{uri}` endpoint.

## How It Works

`node-sonos-http-api` exposes a `spotify` action at `/{speaker}/spotify/{action}/{uri}`:

| Action | Behaviour |
|--------|-----------|
| `now`  | Inserts at queue position `trackNo + 1`, seeks to it, and plays |
| `next` | Inserts at queue position `trackNo + 1` without seeking |
| `queue` | Appends to the end of the queue |

### URI Translation

node-sonos-http-api translates Spotify URIs as follows:

| Spotify URI type | Sonos URI format |
|-----------------|-----------------|
| `spotify:track:<id>` | `x-sonos-spotify:spotify%3Atrack%3A<id>?sid=<serviceId>&flags=32&sn=1` |
| `spotify:playlist:<id>` | `x-rincon-cpcontainer:0006206cspotify%3Aplaylist%3A<id>` |
| `spotify:album:<id>` | `x-rincon-cpcontainer:0006206cspotify%3Aalbum%3A<id>` |

The service ID (`sid`) is looked up dynamically from the Sonos system via `player.system.getServiceId('Spotify')`.

DIDL-Lite metadata is also generated using `SA_RINCON{serviceType}_X_#Svc{serviceType}-0-Token`.

## Requirements

- **Spotify Premium** is required for Spotify Connect playback through Sonos.
- The user's Spotify account must be **linked in the Sonos app** (Settings > Services & Voice > Music & Content > Spotify).
- The Sonos system must have a valid Spotify service ID registered (auto-detected from the linked account).

## What Does NOT Work

- Passing raw `spotify:track:...` URIs to `setAVTransportURI` — Sonos rejects them.
- Passing raw URIs to generic `addtoqueue`/`playnext` endpoints — same issue.
- Sonos Favourites-based Spotify playback uses a different metadata path (already handled by `playFavourite`).

## Implementation

### Server

- `sonosClient.playSpotifyUri(speaker, uri, action)` in `sonos-client.ts`:
  Calls `/{speaker}/spotify/{action}/{encodedUri}` on node-sonos-http-api.

- `POST /sonos/play-spotify/:speaker` in `sonos.ts`:
  Accepts `{ uri: string, action?: 'now' | 'queue' | 'next' }`, validates URI prefix, calls `playSpotifyUri`.

- `POST /sonos/test-spotify-playback/:speaker` (dev only, `NODE_ENV !== 'production'`):
  Diagnostic endpoint — plays a URI, waits 2s, returns playback state to confirm success/failure.

### Client

- `api.sonos.playSpotify(speaker, uri, action?)` in `client/src/lib/api.ts`:
  Posts to `/sonos/play-spotify/:speaker`.

- `SpotifyBrowseView.tsx` -> `SpotifyTrackRow`:
  Uses `api.sonos.playSpotify(speaker, track.uri, 'queue')` and `api.sonos.playSpotify(speaker, track.uri, 'next')` instead of the generic `addToQueue`/`playNext` endpoints.

## Testing

### Manual test via curl (dev only)

```bash
# Test track playback
curl -X POST http://localhost:3001/api/sonos/test-spotify-playback/Living%20Room \
  -H 'Content-Type: application/json' \
  -d '{"uri":"spotify:track:4iV5W9uYEdYUVa79Axb7Rh"}'

# Expected: { "played": true, "playbackState": "PLAYING", "currentTrack": {...} }

# Test playlist
curl -X POST http://localhost:3001/api/sonos/play-spotify/Living%20Room \
  -H 'Content-Type: application/json' \
  -d '{"uri":"spotify:playlist:37i9dQZF1DXcBWIGoYBM5M","action":"now"}'
```

### UI testing

1. Navigate to Sonos > Browse > Spotify tab
2. Browse to a playlist, tap the "Play Next" button on a track
3. Verify the track appears in the Sonos queue and begins playback
4. Tap the "Add to Queue" button on another track
5. Verify it appends to the queue without interrupting current playback

## Limitations

- Spotify Connect device targeting is not needed — playback goes through the Sonos SMAPI integration, not the Spotify Connect API.
- Token expiry: if the Spotify account is unlinked in the Sonos app, node-sonos-http-api will fail to resolve the service ID. The error will surface as a 502 from `/api/sonos/play-spotify/:speaker`.
- node-sonos-http-api must be running at `SONOS_API_URL` (default: `http://localhost:3003`).
