/**
 * Unit tests for the in-house Spotify → Sonos translation: queue-form URIs,
 * SA_RINCON DIDL-Lite metadata, and parsing the Spotify service id out of a
 * ListAvailableServices SOAP response. These shapes mirror what
 * node-sonos-http-api's spotify action produces — the SOAP play-next path
 * must stay byte-compatible with them.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildSpotifyQueueUri,
  buildSpotifyDidlMetadata,
  spotifyServiceTypeFromSid,
} from '../lib/spotify-didl.js'
import { parseSpotifyServiceId } from '../lib/sonos-client.js'

describe('spotifyServiceTypeFromSid', () => {
  test('matches the sonos-discovery derivation: (sid << 8) + 7', () => {
    assert.equal(spotifyServiceTypeFromSid(12), 3079)
    assert.equal(spotifyServiceTypeFromSid(9), 2311)
  })
})

describe('buildSpotifyQueueUri', () => {
  test('tracks become x-sonos-spotify queue URIs', () => {
    assert.equal(
      buildSpotifyQueueUri('spotify:track:2DqmN5X7K4RfH38An9lF2p', 12),
      'x-sonos-spotify:spotify%3Atrack%3A2DqmN5X7K4RfH38An9lF2p?sid=12&flags=32&sn=1',
    )
  })

  test('albums and playlists become cpcontainer ids with the 0006206c prefix', () => {
    assert.equal(
      buildSpotifyQueueUri('spotify:album:abc123', 12),
      'x-rincon-cpcontainer:0006206cspotify%3Aalbum%3Aabc123',
    )
    assert.equal(
      buildSpotifyQueueUri('spotify:playlist:xyz', 12),
      'x-rincon-cpcontainer:0006206cspotify%3Aplaylist%3Axyz',
    )
  })
})

describe('buildSpotifyDidlMetadata', () => {
  test('carries the encoded URI in the item id and the SA_RINCON token', () => {
    const metadata = buildSpotifyDidlMetadata('spotify:track:abc', 3079)
    assert.match(metadata, /<item id="00030020spotify%3Atrack%3Aabc" restricted="true">/)
    assert.match(metadata, /SA_RINCON3079_X_#Svc3079-0-Token/)
    assert.match(metadata, /object\.item\.audioItem\.musicTrack/)
    assert.match(metadata, /^<DIDL-Lite /)
  })
})

describe('parseSpotifyServiceId', () => {
  const envelope = (descriptorList: string): string =>
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>' +
    '<u:ListAvailableServicesResponse xmlns:u="urn:schemas-upnp-org:service:MusicServices:1">' +
    `<AvailableServiceDescriptorList>${descriptorList}</AvailableServiceDescriptorList>` +
    '</u:ListAvailableServicesResponse></s:Body></s:Envelope>'

  test('finds Spotify among other services in an entity-escaped descriptor list', () => {
    const escaped =
      '&lt;Services SchemaVersion=&quot;1&quot;&gt;' +
      '&lt;Service Id=&quot;254&quot; Name=&quot;TuneIn&quot; Version=&quot;1.1&quot; Capabilities=&quot;0&quot;&gt;&lt;/Service&gt;' +
      '&lt;Service Id=&quot;12&quot; Name=&quot;Spotify&quot; Version=&quot;1.1&quot; Capabilities=&quot;2871&quot;&gt;&lt;/Service&gt;' +
      '&lt;/Services&gt;'
    assert.equal(parseSpotifyServiceId(envelope(escaped)), 12)
  })

  test('returns null when Spotify is not registered', () => {
    const escaped =
      '&lt;Services&gt;&lt;Service Id=&quot;254&quot; Name=&quot;TuneIn&quot;&gt;&lt;/Service&gt;&lt;/Services&gt;'
    assert.equal(parseSpotifyServiceId(envelope(escaped)), null)
  })

  test('does not confuse a service whose name merely contains Spotify-adjacent text', () => {
    const escaped =
      '&lt;Services&gt;&lt;Service Id=&quot;77&quot; Name=&quot;Not Spotify At All&quot;&gt;&lt;/Service&gt;&lt;/Services&gt;'
    assert.equal(parseSpotifyServiceId(envelope(escaped)), null)
  })
})
