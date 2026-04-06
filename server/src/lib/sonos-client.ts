import axios, { type AxiosInstance, AxiosError } from 'axios'
import { readFileSync, statSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const SONOS_API_URL = process.env.SONOS_API_URL || 'http://localhost:3003'
const TIMEOUT = 5000

export class SonosApiError extends Error {
  status: number | undefined
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'SonosApiError'
    this.status = status
  }
}

export interface SonosTrack {
  artist: string
  title: string
  album: string
  albumArtUri: string
  type: string
  stationName?: string
  uri?: string
}

export interface SonosPlaybackState {
  playbackState: 'PLAYING' | 'PAUSED_PLAYBACK' | 'STOPPED' | 'TRANSITIONING'
  currentTrack: SonosTrack
  volume: number
  mute: boolean
  trackNo: number
  elapsedTime: number
  elapsedTimeFormatted: string
  duration?: number
  durationFormatted?: string
  currentPlayMode?: string
  inputSource?: 'tv' | 'line-in' | null
}

/** Normalize raw Sonos state to handle TV/line-in input sources.
 *  TV input (x-sonos-htastream:) reports PAUSED_PLAYBACK even when active —
 *  override to PLAYING and clean up the track metadata.
 */
function normalizeState(state: SonosPlaybackState): SonosPlaybackState {
  const uri = state.currentTrack.uri ?? ''
  if (uri.startsWith('x-sonos-htastream:')) {
    return {
      ...state,
      playbackState: 'PLAYING',
      inputSource: 'tv',
      currentTrack: {
        ...state.currentTrack,
        title: 'TV',
        artist: '',
        album: '',
        albumArtUri: '',
        stationName: undefined,
      },
    }
  }
  if (uri.startsWith('x-rincon-stream:')) {
    return {
      ...state,
      playbackState: 'PLAYING',
      inputSource: 'line-in',
      currentTrack: {
        ...state.currentTrack,
        title: state.currentTrack.title || 'Line In',
        album: '',
        albumArtUri: '',
      },
    }
  }
  return {
    ...state,
    inputSource: null,
    duration: state.duration,
    durationFormatted: state.durationFormatted,
    currentPlayMode: state.currentPlayMode,
  }
}

export interface SonosMember {
  roomName: string
  uuid: string
}

export interface SonosZone {
  coordinator: {
    roomName: string
    state: SonosPlaybackState
    uuid: string
  }
  members: SonosMember[]
}

export interface SonosFavourite {
  title: string
  uri?: string
  albumArtURI?: string
  contentClass?: string
}

export interface SonosQueueItem {
  title: string
  artist: string
  album: string
  albumArtUri: string
  uri: string
}

export interface SonosLibraryArtist {
  name: string
  trackCount: number
  albumCount: number
}

export interface SonosLibraryAlbum {
  name: string
  artist: string
  trackCount: number
}

export interface SonosLibraryTrack {
  title: string
  artist: string
  album: string
  albumArtUri: string
  uri: string
}

export interface SonosSearchArtist {
  name: string
  trackCount: number
  albumArtUri: string | undefined
}

export interface SonosSearchAlbum {
  name: string
  artist: string
  trackCount: number
  albumArtUri: string | undefined
}

export interface SonosLibrarySearchResult {
  artists: SonosSearchArtist[]
  albums: SonosSearchAlbum[]
  tracks: SonosLibraryTrack[]
}

export interface SonosGenre {
  title: string
  artistCount: number
}

export interface SonosGenreAlbum {
  name: string
  artist: string
  albumArtUri: string
  objectId: string
}

export interface SonosRadioStation {
  title: string
  uri: string
  albumArtUri?: string
}

interface NasLibraryTrack {
  title: string
  artist: string
  album: string
  uri: string
}

class SonosClient {
  private api: AxiosInstance

  constructor() {
    this.api = axios.create({
      baseURL: SONOS_API_URL,
      timeout: TIMEOUT,
    })
  }

  private handleError(err: unknown, operation: string): never {
    if (err instanceof AxiosError) {
      throw new SonosApiError(
        `Sonos API ${operation} failed: ${err.message}`,
        err.response?.status,
      )
    }
    throw new SonosApiError(`Sonos API ${operation} failed: ${String(err)}`)
  }

  async getZones(): Promise<SonosZone[]> {
    try {
      const { data } = await this.api.get<SonosZone[]>('/zones')
      return data
    } catch (err) {
      this.handleError(err, 'getZones')
    }
  }

  async getState(speaker: string): Promise<SonosPlaybackState> {
    try {
      const { data } = await this.api.get<SonosPlaybackState>(`/${encodeURIComponent(speaker)}/state`)
      return normalizeState(data)
    } catch (err) {
      this.handleError(err, `getState(${speaker})`)
    }
  }

  async joinGroup(speaker: string, target: string): Promise<void> {
    try {
      await this.api.get(`/${encodeURIComponent(speaker)}/join/${encodeURIComponent(target)}`)
    } catch (err) {
      this.handleError(err, `joinGroup(${speaker}, ${target})`)
    }
  }

  async leaveGroup(speaker: string): Promise<void> {
    try {
      await this.api.get(`/${encodeURIComponent(speaker)}/leave`)
    } catch (err) {
      this.handleError(err, `leaveGroup(${speaker})`)
    }
  }

  async play(speaker: string): Promise<void> {
    try {
      await this.api.get(`/${encodeURIComponent(speaker)}/play`)
    } catch (err) {
      this.handleError(err, `play(${speaker})`)
    }
  }

  async pause(speaker: string): Promise<void> {
    try {
      await this.api.get(`/${encodeURIComponent(speaker)}/pause`)
    } catch (err) {
      this.handleError(err, `pause(${speaker})`)
    }
  }

  async stop(speaker: string): Promise<void> {
    try {
      await this.api.get(`/${encodeURIComponent(speaker)}/stop`)
    } catch (err) {
      this.handleError(err, `stop(${speaker})`)
    }
  }

  async next(speaker: string): Promise<void> {
    try {
      await this.api.get(`/${encodeURIComponent(speaker)}/next`)
    } catch (err) {
      this.handleError(err, `next(${speaker})`)
    }
  }

  async previous(speaker: string): Promise<void> {
    try {
      await this.api.get(`/${encodeURIComponent(speaker)}/previous`)
    } catch (err) {
      this.handleError(err, `previous(${speaker})`)
    }
  }

  async shuffle(speaker: string, enabled: boolean): Promise<void> {
    try {
      await this.api.get(`/${encodeURIComponent(speaker)}/shuffle/${enabled ? 'on' : 'off'}`)
    } catch (err) {
      this.handleError(err, `shuffle(${speaker}, ${enabled})`)
    }
  }

  async repeat(speaker: string, enabled: boolean): Promise<void> {
    try {
      await this.api.get(`/${encodeURIComponent(speaker)}/repeat/${enabled ? 'on' : 'off'}`)
    } catch (err) {
      this.handleError(err, `repeat(${speaker}, ${enabled})`)
    }
  }

  async repeatOne(speaker: string): Promise<void> {
    try {
      await this.api.get(`/${encodeURIComponent(speaker)}/repeat/one`)
    } catch (err) {
      this.handleError(err, `repeatOne(${speaker})`)
    }
  }

  async seek(speaker: string, seconds: number): Promise<void> {
    try {
      await this.api.get(`/${encodeURIComponent(speaker)}/seek/${seconds}`)
    } catch (err) {
      this.handleError(err, `seek(${speaker}, ${seconds})`)
    }
  }

  async getFavourites(): Promise<SonosFavourite[]> {
    try {
      // Use any available speaker to get favourites (they're account-wide)
      const zones = await this.getZones()
      if (zones.length === 0) return []
      const speaker = zones[0].coordinator.roomName
      const { data } = await this.api.get(`/${encodeURIComponent(speaker)}/favorites/detailed`)
      // API returns an array of objects or strings
      if (Array.isArray(data)) {
        return data.map((item: unknown) => {
          if (typeof item === 'string') return { title: item }
          const obj = item as Record<string, unknown>
          // Extract upnp:class from metadata XML for content type classification
          let contentClass: string | undefined
          if (typeof obj.metadata === 'string') {
            const classMatch = obj.metadata.match(/<upnp:class>([^<]+)<\/upnp:class>/)
            if (classMatch) contentClass = classMatch[1]
          }
          return {
            title: String(obj.title ?? ''),
            uri: obj.uri ? String(obj.uri) : undefined,
            albumArtURI: (obj.albumArtUri ?? obj.albumArtURI) ? String(obj.albumArtUri ?? obj.albumArtURI) : undefined,
            contentClass,
          }
        })
      }
      return []
    } catch (err) {
      this.handleError(err, 'getFavourites')
    }
  }

  async setAVTransportURI(speaker: string, uri: string): Promise<void> {
    try {
      await this.api.get(`/${encodeURIComponent(speaker)}/setavtransporturi/${encodeURIComponent(uri)}`)
    } catch (err) {
      this.handleError(err, `setAVTransportURI(${speaker})`)
    }
  }

  async playFavourite(speaker: string, name: string): Promise<void> {
    try {
      await this.api.get(`/${encodeURIComponent(speaker)}/favorite/${encodeURIComponent(name)}`)
    } catch (err) {
      this.handleError(err, `playFavourite(${speaker}, ${name})`)
    }
  }

  async setVolume(speaker: string, level: number): Promise<void> {
    try {
      await this.api.get(`/${encodeURIComponent(speaker)}/volume/${level}`)
    } catch (err) {
      this.handleError(err, `setVolume(${speaker}, ${level})`)
    }
  }

  async setGroupVolume(speaker: string, level: number): Promise<void> {
    try {
      await this.api.get(`/${encodeURIComponent(speaker)}/groupVolume/${level}`)
    } catch (err) {
      this.handleError(err, `setGroupVolume(${speaker}, ${level})`)
    }
  }

  async mute(speaker: string): Promise<void> {
    try {
      await this.api.get(`/${encodeURIComponent(speaker)}/mute`)
    } catch (err) {
      this.handleError(err, `mute(${speaker})`)
    }
  }

  async unmute(speaker: string): Promise<void> {
    try {
      await this.api.get(`/${encodeURIComponent(speaker)}/unmute`)
    } catch (err) {
      this.handleError(err, `unmute(${speaker})`)
    }
  }

  async groupMute(speaker: string): Promise<void> {
    try {
      await this.api.get(`/${encodeURIComponent(speaker)}/groupMute`)
    } catch (err) {
      this.handleError(err, `groupMute(${speaker})`)
    }
  }

  async groupUnmute(speaker: string): Promise<void> {
    try {
      await this.api.get(`/${encodeURIComponent(speaker)}/groupUnmute`)
    } catch (err) {
      this.handleError(err, `groupUnmute(${speaker})`)
    }
  }

  async getUserServices(): Promise<string[]> {
    try {
      // Get all known Sonos services (id → name mapping)
      const { data: allServices } = await this.api.get('/services/all')
      if (!allServices || typeof allServices !== 'object' || allServices.status) return []

      const idToName = new Map<number, string>()
      for (const [name, info] of Object.entries(allServices as Record<string, { id: number }>)) {
        idToName.set(info.id, name)
      }

      // Get user's favourites to find which services they actually use
      const favourites = await this.getFavourites()
      const serviceNames = new Set<string>()

      for (const fav of favourites) {
        if (!fav.uri) continue
        const sidMatch = fav.uri.match(/sid=(\d+)/)
        if (sidMatch) {
          const sid = Number(sidMatch[1])
          const name = idToName.get(sid)
          if (name) serviceNames.add(name)
        }
        if (fav.uri.startsWith('x-sonos-htastream:')) {
          serviceNames.add('TV')
        }
      }

      return Array.from(serviceNames).sort()
    } catch (err) {
      this.handleError(err, 'getUserServices')
    }
  }

  async getQueue(speaker: string): Promise<SonosQueueItem[]> {
    try {
      const { data } = await this.api.get<SonosQueueItem[]>(`/${encodeURIComponent(speaker)}/queue`)
      return Array.isArray(data) ? data : []
    } catch (err) {
      this.handleError(err, `getQueue(${speaker})`)
    }
  }

  async addToQueue(speaker: string, uri: string): Promise<void> {
    try {
      await this.api.get(`/${encodeURIComponent(speaker)}/addtoqueue/${encodeURIComponent(uri)}`)
    } catch (err) {
      this.handleError(err, `addToQueue(${speaker})`)
    }
  }

  async playNext(speaker: string, uri: string): Promise<void> {
    try {
      await this.api.get(`/${encodeURIComponent(speaker)}/playnext/${encodeURIComponent(uri)}`)
    } catch (err) {
      this.handleError(err, `playNext(${speaker})`)
    }
  }

  async clearQueue(speaker: string): Promise<void> {
    try {
      await this.api.get(`/${encodeURIComponent(speaker)}/clearqueue`)
    } catch (err) {
      this.handleError(err, `clearQueue(${speaker})`)
    }
  }

  async removeFromQueue(speaker: string, index: number): Promise<void> {
    try {
      await this.api.get(`/${encodeURIComponent(speaker)}/removetrack/${index}`)
    } catch (err) {
      this.handleError(err, `removeFromQueue(${speaker}, ${index})`)
    }
  }

  async reorderQueue(speaker: string, from: number, to: number): Promise<void> {
    try {
      await this.api.get(`/${encodeURIComponent(speaker)}/reorder/${from}/${to}`)
    } catch (err) {
      this.handleError(err, `reorderQueue(${speaker}, ${from}, ${to})`)
    }
  }

  // ── UPnP SOAP queue management (bypasses node-sonos-http-api for reliability) ─

  /**
   * Add a track to the queue using UPnP SOAP directly.
   * Bypasses node-sonos-http-api which mangles URIs containing special characters.
   */
  async addToQueueSOAP(speakerIp: string, uri: string): Promise<void> {
    // Escape XML special characters in the URI
    const xmlUri = uri
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')

    const body = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:AddURIToQueue xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
      <InstanceID>0</InstanceID>
      <EnqueuedURI>${xmlUri}</EnqueuedURI>
      <EnqueuedURIMetaData></EnqueuedURIMetaData>
      <DesiredFirstTrackNumberEnqueued>0</DesiredFirstTrackNumberEnqueued>
      <EnqueueAsNext>0</EnqueueAsNext>
    </u:AddURIToQueue>
  </s:Body>
</s:Envelope>`
    await axios.post(
      `http://${speakerIp}:1400/MediaRenderer/AVTransport/Control`,
      body,
      {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': '"urn:schemas-upnp-org:service:AVTransport:1#AddURIToQueue"',
        },
        timeout: 10_000,
      },
    )
  }

  /**
   * Insert a track as the next track using UPnP SOAP directly.
   * Bypasses node-sonos-http-api which mangles URIs containing special characters.
   */
  async playNextSOAP(speakerIp: string, uri: string): Promise<void> {
    // Escape XML special characters in the URI
    const xmlUri = uri
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')

    const body = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:AddURIToQueue xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
      <InstanceID>0</InstanceID>
      <EnqueuedURI>${xmlUri}</EnqueuedURI>
      <EnqueuedURIMetaData></EnqueuedURIMetaData>
      <DesiredFirstTrackNumberEnqueued>0</DesiredFirstTrackNumberEnqueued>
      <EnqueueAsNext>1</EnqueueAsNext>
    </u:AddURIToQueue>
  </s:Body>
</s:Envelope>`
    await axios.post(
      `http://${speakerIp}:1400/MediaRenderer/AVTransport/Control`,
      body,
      {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': '"urn:schemas-upnp-org:service:AVTransport:1#AddURIToQueue"',
        },
        timeout: 10_000,
      },
    )
  }

  /**
   * Resolve a speaker room name to its IP and UUID via node-sonos-http-api zones.
   */
  async getSpeakerInfoByName(speakerName: string): Promise<{ ip: string; uuid: string } | null> {
    try {
      const { data } = await this.api.get('/zones')
      for (const zone of data as Array<Record<string, unknown>>) {
        for (const member of (zone.members ?? []) as Array<Record<string, unknown>>) {
          if (member.roomName === speakerName) {
            const uuid = member.uuid as string | undefined
            // Try to get IP from album art URI
            const state = member.state as Record<string, unknown> | undefined
            const ct = state?.currentTrack as Record<string, unknown> | undefined
            const absUri = ct?.absoluteAlbumArtUri
            if (typeof absUri === 'string' && uuid) {
              const match = absUri.match(/https?:\/\/([\d.]+)/)
              if (match) return { ip: match[1], uuid }
            }
            // Fallback: use any known speaker IP
            if (uuid) {
              const ip = await this.getSpeakerIp()
              if (ip) return { ip, uuid }
            }
          }
        }
      }
    } catch { /* fall through */ }
    return null
  }

  // Backwards-compat wrapper
  async getSpeakerIpByName(speakerName: string): Promise<string | null> {
    const info = await this.getSpeakerInfoByName(speakerName)
    return info?.ip ?? null
  }

  /**
   * Switch the speaker to play from its queue starting at track 1.
   * Uses SOAP to set transport to x-rincon-queue:{UUID}#0, seek to track 1, then play.
   */
  async playQueueFromStart(speakerIp: string, speakerUuid: string): Promise<void> {
    const avTransport = `http://${speakerIp}:1400/MediaRenderer/AVTransport/Control`
    const headers = {
      'Content-Type': 'text/xml; charset=utf-8',
    }

    // 1. Set transport to the queue
    await axios.post(avTransport, `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:SetAVTransportURI xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
      <InstanceID>0</InstanceID>
      <CurrentURI>x-rincon-queue:${speakerUuid}#0</CurrentURI>
      <CurrentURIMetaData></CurrentURIMetaData>
    </u:SetAVTransportURI>
  </s:Body>
</s:Envelope>`, { headers: { ...headers, SOAPAction: '"urn:schemas-upnp-org:service:AVTransport:1#SetAVTransportURI"' }, timeout: 10_000 })

    // 2. Seek to track 1
    await axios.post(avTransport, `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:Seek xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
      <InstanceID>0</InstanceID>
      <Unit>TRACK_NR</Unit>
      <Target>1</Target>
    </u:Seek>
  </s:Body>
</s:Envelope>`, { headers: { ...headers, SOAPAction: '"urn:schemas-upnp-org:service:AVTransport:1#Seek"' }, timeout: 10_000 })

    // 3. Play
    await axios.post(avTransport, `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:Play xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
      <InstanceID>0</InstanceID>
      <Speed>1</Speed>
    </u:Play>
  </s:Body>
</s:Envelope>`, { headers: { ...headers, SOAPAction: '"urn:schemas-upnp-org:service:AVTransport:1#Play"' }, timeout: 10_000 })
  }

  // ── Sonos UPnP browse (genre browsing) ─────────────────────────────────────

  private speakerIpCache: string | null = null

  private async getSpeakerIp(): Promise<string | null> {
    if (this.speakerIpCache) return this.speakerIpCache
    try {
      const { data } = await this.api.get('/zones')
      // Extract IP from absoluteAlbumArtUri in any zone's coordinator state
      for (const zone of data as Array<Record<string, unknown>>) {
        const coord = zone.coordinator as Record<string, unknown> | undefined
        const state = coord?.state as Record<string, unknown> | undefined
        const ct = state?.currentTrack as Record<string, unknown> | undefined
        const absUri = ct?.absoluteAlbumArtUri
        if (typeof absUri === 'string') {
          const match = absUri.match(/https?:\/\/([\d.]+)/)
          if (match) {
            this.speakerIpCache = match[1]
            return match[1]
          }
        }
      }
      // Fallback: try each speaker's state endpoint for album art URIs
      for (const zone of data as Array<Record<string, unknown>>) {
        const coord = zone.coordinator as Record<string, unknown> | undefined
        const room = coord?.roomName as string | undefined
        if (!room) continue
        try {
          const { data: stateData } = await this.api.get(`/${encodeURIComponent(room)}/state`)
          const absUri = (stateData as Record<string, unknown>)?.currentTrack
          const uri = (absUri as Record<string, unknown>)?.absoluteAlbumArtUri
          if (typeof uri === 'string') {
            const match = uri.match(/https?:\/\/([\d.]+)/)
            if (match) {
              this.speakerIpCache = match[1]
              return match[1]
            }
          }
        } catch { /* try next speaker */ }
      }
    } catch { /* fall through */ }
    return null
  }

  private xmlEscape(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
  }

  private async browseUPnP(speakerIp: string, objectId: string, start = 0, count = 200): Promise<string> {
    const body = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
      <ObjectID>${this.xmlEscape(objectId)}</ObjectID>
      <BrowseFlag>BrowseDirectChildren</BrowseFlag>
      <Filter>*</Filter>
      <StartingIndex>${start}</StartingIndex>
      <RequestedCount>${count}</RequestedCount>
      <SortCriteria></SortCriteria>
    </u:Browse>
  </s:Body>
</s:Envelope>`
    const { data } = await axios.post(
      `http://${speakerIp}:1400/MediaServer/ContentDirectory/Control`,
      body,
      {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': '"urn:schemas-upnp-org:service:ContentDirectory:1#Browse"',
        },
        timeout: 10_000,
      },
    )
    return typeof data === 'string' ? data : String(data)
  }

  private decodeXmlEntities(s: string): string {
    return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  }

  async getGenres(): Promise<SonosGenre[]> {
    const ip = await this.getSpeakerIp()
    if (!ip) return []
    try {
      const xml = await this.browseUPnP(ip, 'A:GENRE')
      const decoded = this.decodeXmlEntities(xml)
      const titles = [...decoded.matchAll(/<dc:title>([^<]+)<\/dc:title>/g)].map(m => m[1])
      const counts = [...decoded.matchAll(/<childCount>(\d+)<\/childCount>/g)].map(m => Number(m[1]))
      return titles.map((title, i) => ({
        title: this.decodeXmlEntities(title),
        artistCount: counts[i] ?? 0,
      }))
    } catch {
      return []
    }
  }

  async getGenreAlbums(genre: string): Promise<SonosGenreAlbum[]> {
    const ip = await this.getSpeakerIp()
    if (!ip) return []
    try {
      // First get all artists in this genre
      const artistXml = await this.browseUPnP(ip, `A:GENRE/${genre}`)
      const decoded = this.decodeXmlEntities(artistXml)
      const artistNames = [...decoded.matchAll(/<dc:title>([^<]+)<\/dc:title>/g)]
        .map(m => this.decodeXmlEntities(m[1]))
        .filter(n => n !== 'All')

      // Then browse each artist to get their albums (with art)
      const albums: SonosGenreAlbum[] = []
      for (const artist of artistNames) {
        try {
          const albumXml = await this.browseUPnP(ip, `A:GENRE/${genre}/${artist}`)
          const albumDecoded = this.decodeXmlEntities(albumXml)
          // Parse containers (albums)
          const containers = [...albumDecoded.matchAll(/<container[^>]*id="([^"]*)"[^>]*>(.*?)<\/container>/gs)]
          for (const [, id, content] of containers) {
            const title = content.match(/<dc:title>([^<]+)<\/dc:title>/)
            const art = content.match(/<upnp:albumArtURI>([^<]+)<\/upnp:albumArtURI>/)
            const name = title ? this.decodeXmlEntities(title[1]) : ''
            if (name === 'All') continue
            const artUri = art ? this.decodeXmlEntities(art[1]) : ''
            // Convert relative art URI to absolute using speaker IP
            const absoluteArt = artUri.startsWith('/') ? `http://${ip}:1400${artUri}` : artUri
            albums.push({
              name,
              artist,
              albumArtUri: absoluteArt,
              objectId: this.decodeXmlEntities(id),
            })
          }
        } catch { /* skip artist on error */ }
      }
      // Merge albums that appear under multiple artists (compilations)
      const albumMap = new Map<string, SonosGenreAlbum>()
      const artistsByAlbum = new Map<string, Set<string>>()
      for (const album of albums) {
        const existing = albumMap.get(album.name)
        if (existing) {
          artistsByAlbum.get(album.name)!.add(album.artist)
        } else {
          albumMap.set(album.name, album)
          artistsByAlbum.set(album.name, new Set([album.artist]))
        }
      }
      // Mark multi-artist albums as "Various Artists"
      return Array.from(albumMap.values()).map(album => {
        const artists = artistsByAlbum.get(album.name)!
        return {
          ...album,
          artist: artists.size > 1 ? 'Various Artists' : album.artist,
        }
      })
    } catch {
      return []
    }
  }

  async getGenreAlbumTracks(objectId: string): Promise<SonosLibraryTrack[]> {
    const ip = await this.getSpeakerIp()
    if (!ip) return []
    try {
      const xml = await this.browseUPnP(ip, objectId, 0, 500)
      const decoded = this.decodeXmlEntities(xml)
      const items = [...decoded.matchAll(/<item[^>]*>(.*?)<\/item>/gs)]
      return items.map(([, content]) => {
        const title = content.match(/<dc:title>([^<]+)<\/dc:title>/)
        const creator = content.match(/<dc:creator>([^<]+)<\/dc:creator>/)
        const album = content.match(/<upnp:album>([^<]+)<\/upnp:album>/)
        const art = content.match(/<upnp:albumArtURI>([^<]+)<\/upnp:albumArtURI>/)
        const uri = content.match(/<res[^>]*>([^<]+)<\/res>/)
        const artUri = art ? this.decodeXmlEntities(art[1]) : ''
        const absoluteArt = artUri.startsWith('/') ? `http://${ip}:1400${artUri}` : artUri
        return {
          title: title ? this.decodeXmlEntities(title[1]) : '',
          artist: creator ? this.decodeXmlEntities(creator[1]) : '',
          album: album ? this.decodeXmlEntities(album[1]) : '',
          albumArtUri: absoluteArt,
          uri: uri ? this.decodeXmlEntities(uri[1]) : '',
        }
      })
    } catch (err) {
      console.error('[browseAlbumTracks] UPnP browse failed for objectId:', objectId, err)
      return []
    }
  }

  // ── UPnP album/artist browsing (with artwork) ──────────────────────────────

  private parseContainers(xml: string, ip: string): Array<{ title: string; artist: string; albumArtUri: string; objectId: string }> {
    const decoded = this.decodeXmlEntities(xml)
    const containers = [...decoded.matchAll(/<container[^>]*id="([^"]*)"[^>]*>(.*?)<\/container>/gs)]
    return containers.map(([, id, content]) => {
      const title = content.match(/<dc:title>([^<]+)<\/dc:title>/)
      const creator = content.match(/<dc:creator>([^<]+)<\/dc:creator>/)
      const art = content.match(/<upnp:albumArtURI>([^<]+)<\/upnp:albumArtURI>/)
      const name = title ? this.decodeXmlEntities(title[1]) : ''
      const artUri = art ? this.decodeXmlEntities(art[1]) : ''
      const absoluteArt = artUri.startsWith('/') ? `http://${ip}:1400${artUri}` : artUri
      return {
        title: name,
        artist: creator ? this.decodeXmlEntities(creator[1]) : '',
        albumArtUri: absoluteArt,
        objectId: this.decodeXmlEntities(id),
      }
    }).filter(c => c.title !== 'All')
  }

  async browseAlbumsWithArt(): Promise<SonosGenreAlbum[]> {
    const ip = await this.getSpeakerIp()
    if (!ip) return []
    try {
      // Browse all albums — paginate in batches of 200
      const allAlbums: SonosGenreAlbum[] = []
      let start = 0
      const batchSize = 200
      while (true) {
        const xml = await this.browseUPnP(ip, 'A:ALBUM', start, batchSize)
        const decoded = this.decodeXmlEntities(xml)
        const totalMatch = decoded.match(/<TotalMatches>(\d+)<\/TotalMatches>/)
        const total = totalMatch ? Number(totalMatch[1]) : 0
        const containers = this.parseContainers(xml, ip)
        for (const c of containers) {
          allAlbums.push({
            name: c.title,
            artist: c.artist,
            albumArtUri: c.albumArtUri,
            objectId: c.objectId,
          })
        }
        start += batchSize
        if (start >= total || containers.length === 0) break
      }
      // Populate album art cache for use by getArtistTracks etc.
      for (const a of allAlbums) {
        if (a.albumArtUri) {
          this.albumArtCache.set(`${a.artist}\0${a.name}`, a.albumArtUri)
        }
      }
      return allAlbums
    } catch {
      return []
    }
  }

  /** Ensure album art cache is populated (lazy — runs once on first lookup) */
  private albumArtCacheReady: Promise<void> | null = null
  private ensureAlbumArtCache(): Promise<void> {
    if (this.albumArtCache.size > 0) return Promise.resolve()
    if (!this.albumArtCacheReady) {
      this.albumArtCacheReady = this.browseAlbumsWithArt().then(() => { this.albumArtCacheReady = null })
    }
    return this.albumArtCacheReady
  }

  /** Look up cached album art URI by artist + album name */
  private lookupAlbumArt(artist: string, album: string): string {
    return this.albumArtCache.get(`${artist}\0${album}`) ?? ''
  }

  async browseAlbumTracks(objectId: string): Promise<SonosLibraryTrack[]> {
    // Reuse getGenreAlbumTracks — same UPnP browse logic
    return this.getGenreAlbumTracks(objectId)
  }

  // ── NAS library browsing (reads node-sonos-http-api cache directly) ────────

  private libraryCache: NasLibraryTrack[] | null = null
  private libraryCacheMtime: number = 0
  /** artist+album → albumArtUri lookup, populated by browseAlbumsWithArt */
  private albumArtCache = new Map<string, string>()

  private readLibraryCache(): NasLibraryTrack[] {
    const cachePath = join(homedir(), 'node-sonos-http-api', 'cache', 'library.json')
    try {
      const stat = statSync(cachePath)
      if (this.libraryCache && stat.mtimeMs === this.libraryCacheMtime) {
        return this.libraryCache
      }
      const raw = JSON.parse(readFileSync(cachePath, 'utf-8'))
      const items = raw?.tracks?.items ?? []
      this.libraryCache = items.map((t: Record<string, unknown>) => ({
        title: String(t.trackName ?? ''),
        artist: String(t.artistName ?? ''),
        album: String(t.albumName ?? ''),
        uri: String(t.uri ?? ''),
      }))
      this.libraryCacheMtime = stat.mtimeMs
      return this.libraryCache!
    } catch {
      return []
    }
  }

  async ensureLibraryLoaded(): Promise<boolean> {
    const tracks = this.readLibraryCache()
    if (tracks.length > 0) return true
    // Trigger node-sonos-http-api to index the library
    try {
      const zones = await this.getZones()
      if (zones.length === 0) return false
      const speaker = zones[0].coordinator.roomName
      await this.api.get(`/${encodeURIComponent(speaker)}/musicsearch/library/load`, { timeout: 120_000 })
      return this.readLibraryCache().length > 0
    } catch {
      return false
    }
  }

  getLibraryArtists(): SonosLibraryArtist[] {
    const tracks = this.readLibraryCache()
    const artistMap = new Map<string, { albums: Set<string>; count: number }>()
    for (const t of tracks) {
      if (!t.artist) continue
      const entry = artistMap.get(t.artist)
      if (entry) {
        entry.count++
        if (t.album) entry.albums.add(t.album)
      } else {
        artistMap.set(t.artist, { albums: new Set(t.album ? [t.album] : []), count: 1 })
      }
    }
    return Array.from(artistMap.entries())
      .map(([name, { albums, count }]) => ({ name, trackCount: count, albumCount: albums.size }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  getLibraryAlbums(): SonosLibraryAlbum[] {
    const tracks = this.readLibraryCache()
    const albumMap = new Map<string, { artist: string; count: number }>()
    for (const t of tracks) {
      if (!t.album) continue
      const key = `${t.artist}\0${t.album}`
      const entry = albumMap.get(key)
      if (entry) { entry.count++ }
      else { albumMap.set(key, { artist: t.artist, count: 1 }) }
    }
    return Array.from(albumMap.entries())
      .map(([key, { artist, count }]) => ({ name: key.split('\0')[1], artist, trackCount: count }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  async getArtistTracks(artist: string): Promise<SonosLibraryTrack[]> {
    await this.ensureAlbumArtCache()
    return this.readLibraryCache()
      .filter(t => t.artist === artist)
      .map(t => ({ ...t, albumArtUri: this.lookupAlbumArt(t.artist, t.album) }))
  }

  async getAlbumTracks(artist: string, album: string): Promise<SonosLibraryTrack[]> {
    await this.ensureAlbumArtCache()
    return this.readLibraryCache()
      .filter(t => t.artist === artist && t.album === album)
      .map(t => ({ ...t, albumArtUri: this.lookupAlbumArt(t.artist, t.album) }))
  }

  async searchLibrary(query: string): Promise<SonosLibrarySearchResult> {
    await this.ensureAlbumArtCache()
    const tracks = this.readLibraryCache()
    const q = query.toLowerCase()
    const matching = tracks
      .filter(t => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q) || t.album.toLowerCase().includes(q))

    // Build deduplicated artists from matching tracks
    const artistMap = new Map<string, { trackCount: number; albumArtUri: string | undefined }>()
    for (const t of matching) {
      if (!t.artist) continue
      const existing = artistMap.get(t.artist)
      if (existing) {
        existing.trackCount++
      } else {
        artistMap.set(t.artist, {
          trackCount: 1,
          albumArtUri: this.lookupAlbumArt(t.artist, t.album),
        })
      }
    }
    const artists: SonosSearchArtist[] = Array.from(artistMap.entries())
      .map(([name, { trackCount, albumArtUri }]) => ({ name, trackCount, albumArtUri }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 20)

    // Build deduplicated albums from matching tracks
    const albumMap = new Map<string, { artist: string; trackCount: number; albumArtUri: string | undefined }>()
    for (const t of matching) {
      if (!t.album) continue
      const key = `${t.artist}\0${t.album}`
      const existing = albumMap.get(key)
      if (existing) {
        existing.trackCount++
      } else {
        albumMap.set(key, {
          artist: t.artist,
          trackCount: 1,
          albumArtUri: this.lookupAlbumArt(t.artist, t.album),
        })
      }
    }
    const albums: SonosSearchAlbum[] = Array.from(albumMap.entries())
      .map(([key, { artist, trackCount, albumArtUri }]) => ({
        name: key.split('\0')[1],
        artist,
        trackCount,
        albumArtUri,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 20)

    const matchingTracks = matching
      .slice(0, 50)
      .map(t => ({ ...t, albumArtUri: this.lookupAlbumArt(t.artist, t.album) }))

    return { artists, albums, tracks: matchingTracks }
  }

  async getAllLibraryTracks(): Promise<SonosLibraryTrack[]> {
    await this.ensureAlbumArtCache()
    return this.readLibraryCache()
      .map(t => ({ ...t, albumArtUri: this.lookupAlbumArt(t.artist, t.album) }))
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
  }

  async getRadioStations(): Promise<SonosRadioStation[]> {
    // Derive radio stations from Sonos favourites — the /radios endpoint
    // doesn't exist in all node-sonos-http-api versions
    const favourites = await this.getFavourites()
    return favourites
      .filter(f => f.contentClass === 'object.item.audioItem.audioBroadcast')
      .map(f => ({
        title: f.title,
        uri: f.uri ?? '',
        albumArtUri: f.albumArtURI,
      }))
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.getZones()
      return true
    } catch {
      return false
    }
  }

  async testSpotifyPlayback(speaker: string, uri: string): Promise<{
    played: boolean
    playbackState: string
    currentTrack: SonosTrack
    error?: string
  }> {
    try {
      // Use node-sonos-http-api's native spotify action for validated playback
      await this.api.get(`/${encodeURIComponent(speaker)}/spotify/now/${encodeURIComponent(uri)}`)
      // Wait 2 seconds for Sonos to begin playback
      await new Promise(resolve => setTimeout(resolve, 2000))
      const state = await this.getState(speaker)
      return {
        played: state.playbackState === 'PLAYING',
        playbackState: state.playbackState,
        currentTrack: state.currentTrack,
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      return {
        played: false,
        playbackState: 'STOPPED',
        currentTrack: { artist: '', title: '', album: '', albumArtUri: '', type: 'track' },
        error,
      }
    }
  }

  async playSpotifyUri(speaker: string, spotifyUri: string, action: 'now' | 'queue' | 'next' = 'now'): Promise<void> {
    try {
      await this.api.get(`/${encodeURIComponent(speaker)}/spotify/${action}/${spotifyUri}`)
    } catch (err) {
      this.handleError(err, `playSpotifyUri(${speaker}, ${spotifyUri}, ${action})`)
    }
  }
}

export const sonosClient = new SonosClient()
