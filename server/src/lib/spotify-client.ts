import axios, { type AxiosInstance, AxiosError } from 'axios'
import { db } from '../db/index.js'
import { getSpotify } from './settings-store.js'

const TIMEOUT = 10000
const DEFAULT_REDIRECT_URI = 'http://localhost:3001/api/spotify/callback'

interface SpotifyCreds {
  clientId: string
  clientSecret: string
  redirectUri: string
}

function readCreds(): SpotifyCreds {
  const s = getSpotify()
  return {
    clientId: s.clientId ?? '',
    clientSecret: s.clientSecret ?? '',
    redirectUri: s.redirectUri ?? DEFAULT_REDIRECT_URI,
  }
}

const SPOTIFY_SCOPES = [
  'user-read-private',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-follow-read',
  'user-top-read',
  'playlist-modify-public',
  'playlist-modify-private',
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
  artists?: {
    items: SpotifyArtist[]
    total: number
    next: string | null
    offset: number
    limit: number
  }
}

export interface SpotifyAlbum {
  id: string
  name: string
  images: SpotifyImage[]
  artists: Array<{ id: string; name: string }>
  uri: string
  external_urls: { spotify: string }
  release_date: string
  total_tracks: number
  album_type: string
}

export interface SpotifyAlbumTrack {
  id: string
  name: string
  duration_ms: number
  explicit: boolean
  uri: string
  track_number: number
  artists: Array<{ id: string; name: string }>
}

export interface SpotifyShow {
  id: string
  name: string
  description: string
  images: SpotifyImage[]
  publisher: string
  uri: string
  external_urls: { spotify: string }
  total_episodes: number
}

export interface SpotifyEpisode {
  id: string
  name: string
  description: string
  duration_ms: number
  images: SpotifyImage[]
  uri: string
  release_date: string
  explicit: boolean
}

export interface SpotifyArtist {
  id: string
  name: string
  images: SpotifyImage[]
  genres: string[]
  uri: string
  external_urls: { spotify: string }
  followers?: { total: number }
  popularity?: number
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
    const { clientId, redirectUri } = readCreds()
    if (!clientId) {
      throw new SpotifyApiError('Spotify client ID not configured — set it in Settings', 503)
    }
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: SPOTIFY_SCOPES,
    })
    return `https://accounts.spotify.com/authorize?${params.toString()}`
  }

  async handleCallback(code: string): Promise<void> {
    const { clientId, clientSecret, redirectUri } = readCreds()
    if (!clientId || !clientSecret) {
      throw new SpotifyApiError('Spotify credentials not configured — set them in Settings', 503)
    }
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
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
          redirect_uri: redirectUri,
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
    const { clientId, clientSecret } = readCreds()
    if (!clientId || !clientSecret) {
      throw new SpotifyApiError('Spotify credentials not configured — set them in Settings', 503)
    }
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
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

  async getPlaylist(playlistId: string): Promise<SpotifyPlaylist> {
    const token = await this.getAccessToken()
    try {
      const response = await this.api.get<SpotifyPlaylist>(
        `/playlists/${playlistId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      return response.data
    } catch (err) {
      const status = err instanceof AxiosError ? err.response?.status : undefined
      throw new SpotifyApiError(`Failed to fetch playlist ${playlistId}`, status)
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
    types: Array<'track' | 'playlist' | 'album' | 'artist'> = ['track', 'playlist', 'artist'],
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

  async searchArtist(name: string): Promise<SpotifyArtist | null> {
    const token = await this.getAccessToken()
    try {
      const response = await this.api.get<{ artists?: { items: SpotifyArtist[] } }>('/search', {
        headers: { Authorization: `Bearer ${token}` },
        params: { q: `artist:"${name}"`, type: 'artist', limit: 1 },
      })
      return response.data.artists?.items?.[0] ?? null
    } catch {
      return null
    }
  }

  async getSavedAlbums(limit = 50, offset = 0): Promise<{ items: Array<{ added_at: string; album: SpotifyAlbum }>; total: number; next: string | null }> {
    const token = await this.getAccessToken()
    try {
      const response = await this.api.get<{ items: Array<{ added_at: string; album: SpotifyAlbum }>; total: number; next: string | null }>(
        '/me/albums',
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { limit, offset },
        },
      )
      return response.data
    } catch (err) {
      const status = err instanceof AxiosError ? err.response?.status : undefined
      throw new SpotifyApiError('Failed to fetch saved albums', status)
    }
  }

  async getAlbumTracks(albumId: string, limit = 50, offset = 0): Promise<{ items: SpotifyAlbumTrack[]; total: number; next: string | null }> {
    const token = await this.getAccessToken()
    try {
      const response = await this.api.get<{ items: SpotifyAlbumTrack[]; total: number; next: string | null }>(
        `/albums/${albumId}/tracks`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { limit, offset },
        },
      )
      return response.data
    } catch (err) {
      const status = err instanceof AxiosError ? err.response?.status : undefined
      throw new SpotifyApiError(`Failed to fetch tracks for album ${albumId}`, status)
    }
  }

  async getSavedShows(limit = 50, offset = 0): Promise<{ items: Array<{ added_at: string; show: SpotifyShow }>; total: number; next: string | null }> {
    const token = await this.getAccessToken()
    try {
      const response = await this.api.get<{ items: Array<{ added_at: string; show: SpotifyShow }>; total: number; next: string | null }>(
        '/me/shows',
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { limit, offset },
        },
      )
      return response.data
    } catch (err) {
      const status = err instanceof AxiosError ? err.response?.status : undefined
      throw new SpotifyApiError('Failed to fetch saved shows', status)
    }
  }

  async getShowEpisodes(showId: string, limit = 50, offset = 0): Promise<{ items: SpotifyEpisode[]; total: number; next: string | null }> {
    const token = await this.getAccessToken()
    try {
      const response = await this.api.get<{ items: SpotifyEpisode[]; total: number; next: string | null }>(
        `/shows/${showId}/episodes`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { limit, offset },
        },
      )
      return response.data
    } catch (err) {
      const status = err instanceof AxiosError ? err.response?.status : undefined
      throw new SpotifyApiError(`Failed to fetch episodes for show ${showId}`, status)
    }
  }

  async getSavedTracks(limit = 50, offset = 0): Promise<{ items: Array<{ added_at: string; track: SpotifyTrack }>; total: number; next: string | null }> {
    const token = await this.getAccessToken()
    try {
      const response = await this.api.get<{ items: Array<{ added_at: string; track: SpotifyTrack }>; total: number; next: string | null }>(
        '/me/tracks',
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { limit, offset },
        },
      )
      return response.data
    } catch (err) {
      const status = err instanceof AxiosError ? err.response?.status : undefined
      throw new SpotifyApiError('Failed to fetch saved tracks', status)
    }
  }

  async getFollowedArtists(limit = 50, after?: string): Promise<{
    artists: { items: SpotifyArtist[]; total: number; cursors: { after: string | null } }
  }> {
    const token = await this.getAccessToken()
    try {
      const params: Record<string, string | number> = { type: 'artist', limit }
      if (after) params.after = after
      const response = await this.api.get<{
        artists: { items: SpotifyArtist[]; total: number; cursors: { after: string | null } }
      }>('/me/following', {
        headers: { Authorization: `Bearer ${token}` },
        params,
      })
      return response.data
    } catch (err) {
      const status = err instanceof AxiosError ? err.response?.status : undefined
      throw new SpotifyApiError('Failed to fetch followed artists', status)
    }
  }

  async getTopArtists(limit = 50, offset = 0, time_range = 'medium_term'): Promise<{
    items: SpotifyArtist[]; total: number; next: string | null
  }> {
    const token = await this.getAccessToken()
    try {
      const response = await this.api.get<{ items: SpotifyArtist[]; total: number; next: string | null }>(
        '/me/top/artists',
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { limit, offset, time_range },
        },
      )
      return response.data
    } catch (err) {
      const status = err instanceof AxiosError ? err.response?.status : undefined
      throw new SpotifyApiError('Failed to fetch top artists', status)
    }
  }

  async getArtistAlbums(artistId: string, limit = 50, offset = 0, include_groups = 'album,single'): Promise<{
    items: SpotifyAlbum[]; total: number; next: string | null
  }> {
    const token = await this.getAccessToken()
    try {
      const response = await this.api.get<{ items: SpotifyAlbum[]; total: number; next: string | null }>(
        `/artists/${artistId}/albums`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { limit, offset, include_groups },
        },
      )
      return response.data
    } catch (err) {
      const status = err instanceof AxiosError ? err.response?.status : undefined
      throw new SpotifyApiError(`Failed to fetch albums for artist ${artistId}`, status)
    }
  }

  async getArtist(id: string): Promise<SpotifyArtist> {
    const token = await this.getAccessToken()
    try {
      const response = await this.api.get<SpotifyArtist>(
        `/artists/${encodeURIComponent(id)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      return response.data
    } catch (err) {
      const status = err instanceof AxiosError ? err.response?.status : undefined
      throw new SpotifyApiError(`Failed to fetch artist ${id}`, status)
    }
  }

  async getArtistsByIds(ids: string[]): Promise<SpotifyArtist[]> {
    if (ids.length === 0) return []
    const token = await this.getAccessToken()
    const results: SpotifyArtist[] = []
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50)
      try {
        const response = await this.api.get<{ artists: (SpotifyArtist | null)[] }>(
          '/artists',
          {
            headers: { Authorization: `Bearer ${token}` },
            params: { ids: batch.join(',') },
          },
        )
        results.push(...response.data.artists.filter((a): a is SpotifyArtist => a !== null))
      } catch (err) {
        const status = err instanceof AxiosError ? err.response?.status : undefined
        throw new SpotifyApiError('Failed to fetch artists by IDs', status)
      }
    }
    return results
  }

  async addTrackToPlaylist(playlistId: string, trackUri: string): Promise<void> {
    const token = await this.getAccessToken()
    try {
      await this.api.post(
        `/playlists/${playlistId}/tracks`,
        { uris: [trackUri] },
        { headers: { Authorization: `Bearer ${token}` } },
      )
    } catch (err) {
      const status = err instanceof AxiosError ? err.response?.status : undefined
      throw new SpotifyApiError(`Failed to add track to playlist ${playlistId}`, status)
    }
  }

  async createPlaylist(name: string): Promise<{ id: string; name: string; tracks: { total: number } }> {
    const token = await this.getAccessToken()
    try {
      // Get user ID first
      const me = await this.api.get<{ id: string }>(
        '/me',
        { headers: { Authorization: `Bearer ${token}` } },
      )
      const response = await this.api.post<{ id: string; name: string; tracks: { total: number } }>(
        `/users/${me.data.id}/playlists`,
        { name, public: false },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      return response.data
    } catch (err) {
      const status = err instanceof AxiosError ? err.response?.status : undefined
      throw new SpotifyApiError('Failed to create playlist', status)
    }
  }

  hasWriteScope(): boolean {
    const row = db.prepare('SELECT scope FROM spotify_tokens WHERE id = 1').get() as
      | Pick<SpotifyTokenRow, 'scope'>
      | undefined
    if (!row?.scope) return false
    return row.scope.includes('playlist-modify-public')
  }

  isConfigured(): boolean {
    const { clientId, clientSecret } = readCreds()
    return !!(clientId && clientSecret)
  }

  isConnected(): boolean {
    const row = db.prepare('SELECT refresh_token FROM spotify_tokens WHERE id = 1').get() as
      | Pick<SpotifyTokenRow, 'refresh_token'>
      | undefined
    return !!row?.refresh_token
  }

  async getStatus(): Promise<{ connected: boolean; configured: boolean; display_name?: string }> {
    if (!this.isConfigured()) {
      return { connected: false, configured: false }
    }
    if (!this.isConnected()) {
      return { connected: false, configured: true }
    }
    try {
      const token = await this.getAccessToken()
      const response = await this.api.get<{ display_name: string | null; id: string }>(
        '/me',
        { headers: { Authorization: `Bearer ${token}` } },
      )
      return {
        connected: true,
        configured: true,
        display_name: response.data.display_name ?? response.data.id,
      }
    } catch {
      return { connected: true, configured: true }
    }
  }

  disconnect(): void {
    db.prepare('DELETE FROM spotify_tokens').run()
  }
}

export const spotifyClient = new SpotifyClient()

export interface SpotifyPublicPlaylistMeta {
  name: string
  description: string | null
  image_url: string | null
  owner_display_name: string | null
  track_total: number | null
}

/**
 * Fetch public playlist metadata by scraping the open.spotify.com share page.
 * Used as a fallback when the Web API refuses (e.g. Spotify-owned editorial playlists
 * blocked for third-party apps since Nov 2024).
 */
export async function fetchPublicPlaylistMetadata(
  playlistId: string,
): Promise<SpotifyPublicPlaylistMeta | null> {
  try {
    const response = await axios.get<string>(
      `https://open.spotify.com/playlist/${playlistId}`,
      {
        timeout: TIMEOUT,
        responseType: 'text',
        headers: {
          // Spotify serves the JS-only Web Player shell (no OG tags) to most
          // browser-looking UAs. Identifying as a link-preview bot gets the
          // lightweight metadata shell with the Open Graph tags we need.
          'User-Agent': 'facebookexternalhit/1.1',
          Accept: 'text/html',
        },
        maxRedirects: 5,
      },
    )
    const html = response.data
    const pickMeta = (property: string): string | null => {
      const re = new RegExp(
        `<meta\\s+property="${property}"\\s+content="([^"]*)"`,
        'i',
      )
      const m = html.match(re)
      if (!m) return null
      // Decode a few common HTML entities.
      return m[1]
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
    }

    const title = pickMeta('og:title')
    if (!title) return null
    const description = pickMeta('og:description')
    const image = pickMeta('og:image')

    // og:description is like: "Playlist · Spotify · 30 items" or "Playlist · Marc · 123 items"
    let ownerName: string | null = null
    let trackTotal: number | null = null
    if (description) {
      const parts = description.split('·').map(s => s.trim())
      // parts[0] is the type (Playlist), parts[1] is owner, parts[2] is "N items"
      if (parts.length >= 2) ownerName = parts[1] || null
      if (parts.length >= 3) {
        const m = parts[2].match(/(\d[\d,]*)/)
        if (m) trackTotal = Number(m[1].replace(/,/g, ''))
      }
    }

    return {
      name: title,
      description,
      image_url: image,
      owner_display_name: ownerName,
      track_total: trackTotal,
    }
  } catch {
    return null
  }
}

/** Parse a Spotify playlist URL, URI, or bare ID into a playlist ID. */
export function parsePlaylistInput(input: string): string | null {
  if (!input) return null
  const trimmed = input.trim()
  // bare id (22 chars base62)
  if (/^[A-Za-z0-9]{22}$/.test(trimmed)) return trimmed
  // spotify:playlist:<id>
  const uriMatch = trimmed.match(/^spotify:playlist:([A-Za-z0-9]{22})$/)
  if (uriMatch) return uriMatch[1]
  // https://open.spotify.com/playlist/<id>?...
  const urlMatch = trimmed.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?playlist\/([A-Za-z0-9]{22})/)
  if (urlMatch) return urlMatch[1]
  return null
}
