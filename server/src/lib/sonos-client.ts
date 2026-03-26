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
      const { data } = await this.api.get(`/${encodeURIComponent(speaker)}/favorites`)
      // API returns an array of objects or strings
      if (Array.isArray(data)) {
        return data.map((item: unknown) =>
          typeof item === 'string' ? { title: item } : (item as SonosFavourite),
        )
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
