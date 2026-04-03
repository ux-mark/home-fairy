import axios, { type AxiosInstance, AxiosError } from 'axios'
import { db } from '../db/index.js'

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID ?? ''
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET ?? ''
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI ?? 'http://localhost:3001/api/spotify/callback'
const TIMEOUT = 10000

const SPOTIFY_SCOPES = [
  'user-read-private',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
].join(' ')

export class SpotifyApiError extends Error {
  status: number | undefined
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'SpotifyApiError'
    this.status = status
  }
}

export interface SpotifyTokenRow {
  id: number
  access_token: string
  refresh_token: string
  expires_at: number
  scope: string | null
  created_at: string
  updated_at: string
}

export interface SpotifyImage {
  url: string
  height: number | null
  width: number | null
}

export interface SpotifyPlaylist {
  id: string
  name: string
  description: string | null
  public: boolean | null
  collaborative: boolean
  images: SpotifyImage[]
  tracks: { total: number; href: string }
  uri: string
  external_urls: { spotify: string }
  owner: { display_name: string; id: string }
}

export interface SpotifyTrack {
  id: string
  name: string
  duration_ms: number
  explicit: boolean
  uri: string
  external_urls: { spotify: string }
  artists: Array<{ id: string; name: string }>
  album: {
    id: string
    name: string
    images: SpotifyImage[]
    uri: string
  }
}

export interface SpotifyPlaylistTrackItem {
  added_at: string
  track: SpotifyTrack | null
}

export interface SpotifySearchResult {
  tracks?: {
    items: SpotifyTrack[]
    total: number
    next: string | null
    offset: number
    limit: number
  }
  playlists?: {
    items: SpotifyPlaylist[]
    total: number
    next: string | null
    offset: number
    limit: number
  }
  albums?: {
    items: Array<{
      id: string
      name: string
      images: SpotifyImage[]
      artists: Array<{ id: string; name: string }>
      uri: string
      external_urls: { spotify: string }
    }>
    total: number
    next: string | null
    offset: number
    limit: number
  }
}

class SpotifyClient {
  private api: AxiosInstance

  constructor() {
    this.api = axios.create({
      baseURL: 'https://api.spotify.com/v1',
      timeout: TIMEOUT,
    })
  }

  getAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID,
      response_type: 'code',
      redirect_uri: SPOTIFY_REDIRECT_URI,
      scope: SPOTIFY_SCOPES,
    })
    return `https://accounts.spotify.com/authorize?${params.toString()}`
  }

  async handleCallback(code: string): Promise<void> {
    const credentials = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')
    let data: {
      access_token: string
      refresh_token: string
      expires_in: number
      scope: string
    }
    try {
      const response = await axios.post<typeof data>(
        'https://accounts.spotify.com/api/token',
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: SPOTIFY_REDIRECT_URI,
        }),
        {
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: TIMEOUT,
        },
      )
      data = response.data
    } catch (err) {
      const status = err instanceof AxiosError ? err.response?.status : undefined
      throw new SpotifyApiError('Failed to exchange authorization code for tokens', status)
    }

    const expiresAt = Math.floor(Date.now() / 1000) + data.expires_in

    db.prepare(`
      DELETE FROM spotify_tokens
    `).run()

    db.prepare(`
      INSERT INTO spotify_tokens (id, access_token, refresh_token, expires_at, scope, updated_at)
      VALUES (1, ?, ?, ?, ?, datetime('now'))
    `).run(data.access_token, data.refresh_token, expiresAt, data.scope)
  }

  private async getAccessToken(): Promise<string> {
    const row = db.prepare('SELECT * FROM spotify_tokens WHERE id = 1').get() as SpotifyTokenRow | undefined
    if (!row) {
      throw new SpotifyApiError('Spotify not connected — no tokens found', 401)
    }

    const nowSecs = Math.floor(Date.now() / 1000)
    if (row.expires_at > nowSecs + 60) {
      return row.access_token
    }

    // Access token is expired or about to expire — refresh it
    const credentials = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')
    let refreshed: { access_token: string; expires_in: number; scope?: string }
    try {
      const response = await axios.post<typeof refreshed>(
        'https://accounts.spotify.com/api/token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: row.refresh_token,
        }),
        {
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: TIMEOUT,
        },
      )
      refreshed = response.data
    } catch (err) {
      const status = err instanceof AxiosError ? err.response?.status : undefined
      throw new SpotifyApiError('Failed to refresh Spotify access token', status)
    }

    const newExpiresAt = Math.floor(Date.now() / 1000) + refreshed.expires_in

    db.prepare(`
      UPDATE spotify_tokens
      SET access_token = ?, expires_at = ?, scope = COALESCE(?, scope), updated_at = datetime('now')
      WHERE id = 1
    `).run(refreshed.access_token, newExpiresAt, refreshed.scope ?? null)

    return refreshed.access_token
  }

  async getPlaylists(limit = 50, offset = 0): Promise<{ items: SpotifyPlaylist[]; total: number; next: string | null }> {
    const token = await this.getAccessToken()
    try {
      const response = await this.api.get<{ items: SpotifyPlaylist[]; total: number; next: string | null }>(
        '/me/playlists',
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { limit, offset },
        },
      )
      return response.data
    } catch (err) {
      const status = err instanceof AxiosError ? err.response?.status : undefined
      throw new SpotifyApiError('Failed to fetch Spotify playlists', status)
    }
  }

  async getPlaylistTracks(
    playlistId: string,
    limit = 100,
    offset = 0,
  ): Promise<{ items: SpotifyPlaylistTrackItem[]; total: number; next: string | null }> {
    const token = await this.getAccessToken()
    try {
      const response = await this.api.get<{ items: SpotifyPlaylistTrackItem[]; total: number; next: string | null }>(
        `/playlists/${playlistId}/tracks`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { limit, offset },
        },
      )
      return response.data
    } catch (err) {
      const status = err instanceof AxiosError ? err.response?.status : undefined
      throw new SpotifyApiError(`Failed to fetch tracks for playlist ${playlistId}`, status)
    }
  }

  async search(
    query: string,
    types: Array<'track' | 'playlist' | 'album'> = ['track', 'playlist'],
    limit = 20,
    offset = 0,
  ): Promise<SpotifySearchResult> {
    const token = await this.getAccessToken()
    try {
      const response = await this.api.get<SpotifySearchResult>('/search', {
        headers: { Authorization: `Bearer ${token}` },
        params: { q: query, type: types.join(','), limit, offset },
      })
      return response.data
    } catch (err) {
      const status = err instanceof AxiosError ? err.response?.status : undefined
      throw new SpotifyApiError('Failed to search Spotify', status)
    }
  }

  isConnected(): boolean {
    const row = db.prepare('SELECT refresh_token FROM spotify_tokens WHERE id = 1').get() as
      | Pick<SpotifyTokenRow, 'refresh_token'>
      | undefined
    return !!row?.refresh_token
  }

  async getStatus(): Promise<{ connected: boolean; display_name?: string }> {
    if (!this.isConnected()) {
      return { connected: false }
    }
    try {
      const token = await this.getAccessToken()
      const response = await this.api.get<{ display_name: string | null; id: string }>(
        '/me',
        { headers: { Authorization: `Bearer ${token}` } },
      )
      return {
        connected: true,
        display_name: response.data.display_name ?? response.data.id,
      }
    } catch {
      return { connected: true }
    }
  }

  disconnect(): void {
    db.prepare('DELETE FROM spotify_tokens').run()
  }
}

export const spotifyClient = new SpotifyClient()
