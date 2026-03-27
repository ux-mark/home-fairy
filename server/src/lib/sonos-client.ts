import axios, { type AxiosInstance, AxiosError } from 'axios'

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
      return data
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
          return {
            title: String(obj.title ?? ''),
            uri: obj.uri ? String(obj.uri) : undefined,
            albumArtURI: (obj.albumArtUri ?? obj.albumArtURI) ? String(obj.albumArtUri ?? obj.albumArtURI) : undefined,
          }
        })
      }
      return []
    } catch (err) {
      this.handleError(err, 'getFavourites')
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

  async isAvailable(): Promise<boolean> {
    try {
      await this.getZones()
      return true
    } catch {
      return false
    }
  }
}

export const sonosClient = new SonosClient()
