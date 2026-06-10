/**
 * Unit tests for the shared source-URI classifier. Covers every URI shape the
 * queue and fairylist paths encounter: canonical Spotify, Sonos-encoded
 * Spotify (queue items), Spotify containers, NAS files, ContentDirectory
 * container ids, radio streams, and unknown shapes.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { classifySourceUri } from '../lib/source-uri.js'

describe('classifySourceUri', () => {
  test('canonical spotify track URI passes through', () => {
    const c = classifySourceUri('spotify:track:4iV5W9uYEdYUVa79Axb7Rh')
    assert.deepEqual(c, {
      kind: 'spotify',
      source: 'spotify',
      normalizedUri: 'spotify:track:4iV5W9uYEdYUVa79Axb7Rh',
    })
  })

  test('canonical spotify playlist/album/episode URIs pass through', () => {
    for (const uri of [
      'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M',
      'spotify:album:6dVIqQ8qmQ5GBnJ9shOYGE',
      'spotify:episode:512ojhOuo1ktJprKbVcKyQ',
    ]) {
      const c = classifySourceUri(uri)
      assert.equal(c.kind, 'spotify')
      assert.equal(c.source, 'spotify')
      assert.equal(c.normalizedUri, uri)
    }
  })

  test('x-sonos-spotify queue URI decodes to canonical track URI', () => {
    const c = classifySourceUri(
      'x-sonos-spotify:spotify%3atrack%3a2DqmN5X7K4RfH38An9lF2p?sid=12&flags=8232&sn=4',
    )
    assert.equal(c.kind, 'spotify')
    assert.equal(c.source, 'spotify')
    assert.equal(c.normalizedUri, 'spotify:track:2DqmN5X7K4RfH38An9lF2p')
  })

  test('x-sonos-spotify handles uppercase percent-encoding and non-track types', () => {
    const c = classifySourceUri('x-sonos-spotify:spotify%3Aepisode%3Aabc123?sid=12&flags=32&sn=1')
    assert.equal(c.kind, 'spotify')
    assert.equal(c.normalizedUri, 'spotify:episode:abc123')
  })

  test('x-sonos-spotify without query string still decodes', () => {
    const c = classifySourceUri('x-sonos-spotify:spotify%3atrack%3aabc')
    assert.equal(c.normalizedUri, 'spotify:track:abc')
  })

  test('malformed x-sonos-spotify (bad percent-encoding) falls back to unknown', () => {
    const c = classifySourceUri('x-sonos-spotify:%ZZbroken')
    assert.equal(c.kind, 'unknown')
    assert.equal(c.source, 'nas')
    assert.equal(c.normalizedUri, 'x-sonos-spotify:%ZZbroken')
  })

  test('x-rincon-cpcontainer with embedded spotify URI decodes', () => {
    const c = classifySourceUri('x-rincon-cpcontainer:0006206cspotify%3aplaylist%3aXYZ?sid=12')
    assert.equal(c.kind, 'spotify')
    assert.equal(c.normalizedUri, 'spotify:playlist:XYZ')
  })

  test('x-rincon-cpcontainer without spotify payload is unknown', () => {
    const c = classifySourceUri('x-rincon-cpcontainer:1006206csomethingelse')
    assert.equal(c.kind, 'unknown')
    assert.equal(c.source, 'nas')
  })

  test('NAS file URIs classify as nas-file', () => {
    for (const uri of [
      'x-file-cifs://nas/Music/Artist/Album/01%20Track.flac',
      'x-sonos-http:track.mp3?sid=204',
    ]) {
      const c = classifySourceUri(uri)
      assert.equal(c.kind, 'nas-file', uri)
      assert.equal(c.source, 'nas')
      assert.equal(c.normalizedUri, uri)
    }
  })

  test('ContentDirectory container ids classify as nas-container', () => {
    for (const uri of [
      'A:ALBUM/The%20Bends',
      'A:GENRE/Rock/Radiohead',
      'S://nas/Music/Playlists',
      'SQ:12',
      'x-rincon-playlist:RINCON_000111#A:ALBUM/X',
    ]) {
      const c = classifySourceUri(uri)
      assert.equal(c.kind, 'nas-container', uri)
      assert.equal(c.source, 'nas')
      assert.equal(c.normalizedUri, uri)
    }
  })

  test('radio stream URIs classify as radio', () => {
    for (const uri of [
      'x-sonosapi-stream:s12345?sid=254&flags=32',
      'x-sonosapi-radio:ST%3a1?sid=151',
      'x-rincon-mp3radio://stream.example.com/live',
      'aac://stream.example.com/live.aac',
      'http://stream.example.com/live.mp3',
      'https://stream.example.com/live.mp3',
      'x-sonosapi-hls:Api%3atune%3a1234?sid=37',
      'hls-radio:http://example.com/playlist.m3u8',
    ]) {
      const c = classifySourceUri(uri)
      assert.equal(c.kind, 'radio', uri)
      assert.equal(c.source, 'radio')
      assert.equal(c.normalizedUri, uri)
    }
  })

  test('unrecognised shapes are unknown with nas passthrough', () => {
    const c = classifySourceUri('weird-scheme://whatever')
    assert.equal(c.kind, 'unknown')
    assert.equal(c.source, 'nas')
    assert.equal(c.normalizedUri, 'weird-scheme://whatever')
  })
})
