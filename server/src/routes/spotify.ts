import { Router, type Request, type Response } from 'express'
import { spotifyClient, SpotifyApiError, type SpotifyArtist } from '../lib/spotify-client.js'
import { requireAuth } from '../middleware/requireAuth.js'

const router = Router()

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

function handleError(res: Response, err: unknown): void {
  if (err instanceof SpotifyApiError) {
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500
    res.status(status).json({ error: err.message })
    return
  }
  const msg = err instanceof Error ? err.message : String(err)
  res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
}

// GET /spotify/auth — initiate OAuth flow (no auth required, this starts the login)
router.get('/auth', (_req: Request, res: Response) => {
  if (!spotifyClient.isConfigured()) {
    res.status(400).json({ error: 'Spotify is not configured. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to .env' })
    return
  }
  try {
    const authUrl = spotifyClient.getAuthUrl()
    res.redirect(authUrl)
  } catch (err) {
    handleError(res, err)
  }
})

// GET /spotify/callback — handle OAuth redirect (no auth required, called by Spotify)
router.get('/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined
  if (!code) {
    res.status(400).json({ error: 'Missing authorization code' })
    return
  }
  try {
    await spotifyClient.handleCallback(code)
    // Redirect to frontend settings page after successful OAuth
    res.redirect('/settings?spotify=connected')
  } catch (err) {
    handleError(res, err)
  }
})

// GET /spotify/status — check if Spotify is connected (requires auth)
router.get('/status', requireAuth, async (_req: Request, res: Response) => {
  try {
    const status = await spotifyClient.getStatus()
    res.json(status)
  } catch (err) {
    handleError(res, err)
  }
})

// POST /spotify/disconnect — remove stored tokens (requires auth)
router.post('/disconnect', requireAuth, (_req: Request, res: Response) => {
  try {
    spotifyClient.disconnect()
    res.json({ ok: true })
  } catch (err) {
    handleError(res, err)
  }
})

// GET /spotify/playlists — fetch user's playlists (requires auth + Spotify connected)
router.get('/playlists', requireAuth, async (req: Request, res: Response) => {
  if (!spotifyClient.isConnected()) {
    res.status(401).json({ error: 'Spotify not connected' })
    return
  }
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const result = await spotifyClient.getPlaylists(limit, offset)
    res.json(result)
  } catch (err) {
    handleError(res, err)
  }
})

// GET /spotify/playlists/:id/tracks — fetch tracks in a playlist (requires auth + connected)
router.get('/playlists/:id/tracks', requireAuth, async (req: Request, res: Response) => {
  if (!spotifyClient.isConnected()) {
    res.status(401).json({ error: 'Spotify not connected' })
    return
  }
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 100
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const result = await spotifyClient.getPlaylistTracks(String(req.params.id), limit, offset)
    res.json(result)
  } catch (err) {
    handleError(res, err)
  }
})

// GET /spotify/albums — fetch user's saved albums (requires auth + connected)
router.get('/albums', requireAuth, async (req: Request, res: Response) => {
  if (!spotifyClient.isConnected()) {
    res.status(401).json({ error: 'Spotify not connected' })
    return
  }
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const result = await spotifyClient.getSavedAlbums(limit, offset)
    res.json(result)
  } catch (err) {
    handleError(res, err)
  }
})

// GET /spotify/albums/:id/tracks — fetch tracks in an album (requires auth + connected)
router.get('/albums/:id/tracks', requireAuth, async (req: Request, res: Response) => {
  if (!spotifyClient.isConnected()) {
    res.status(401).json({ error: 'Spotify not connected' })
    return
  }
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const result = await spotifyClient.getAlbumTracks(String(req.params.id), limit, offset)
    res.json(result)
  } catch (err) {
    handleError(res, err)
  }
})

// GET /spotify/shows — fetch user's saved podcasts (requires auth + connected)
router.get('/shows', requireAuth, async (req: Request, res: Response) => {
  if (!spotifyClient.isConnected()) {
    res.status(401).json({ error: 'Spotify not connected' })
    return
  }
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const result = await spotifyClient.getSavedShows(limit, offset)
    res.json(result)
  } catch (err) {
    handleError(res, err)
  }
})

// GET /spotify/shows/:id/episodes — fetch episodes of a show (requires auth + connected)
router.get('/shows/:id/episodes', requireAuth, async (req: Request, res: Response) => {
  if (!spotifyClient.isConnected()) {
    res.status(401).json({ error: 'Spotify not connected' })
    return
  }
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const result = await spotifyClient.getShowEpisodes(String(req.params.id), limit, offset)
    res.json(result)
  } catch (err) {
    handleError(res, err)
  }
})

// GET /spotify/tracks — fetch user's saved/liked tracks (requires auth + connected)
router.get('/tracks', requireAuth, async (req: Request, res: Response) => {
  if (!spotifyClient.isConnected()) {
    res.status(401).json({ error: 'Spotify not connected' })
    return
  }
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const result = await spotifyClient.getSavedTracks(limit, offset)
    res.json(result)
  } catch (err) {
    handleError(res, err)
  }
})

// GET /spotify/search?q= — search Spotify catalogue (requires auth + connected)
router.get('/search', requireAuth, async (req: Request, res: Response) => {
  const q = req.query.q as string | undefined
  if (!q) {
    res.status(400).json({ error: 'Missing required query parameter: q' })
    return
  }
  if (!spotifyClient.isConnected()) {
    res.status(401).json({ error: 'Spotify not connected' })
    return
  }
  try {
    const rawTypes = req.query.types as string | undefined
    const types = rawTypes
      ? (rawTypes.split(',').filter(t => ['track', 'playlist', 'album'].includes(t)) as Array<'track' | 'playlist' | 'album'>)
      : undefined
    const limit = req.query.limit ? Number(req.query.limit) : 20
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const result = await spotifyClient.search(q, types, limit, offset)
    res.json(result)
  } catch (err) {
    handleError(res, err)
  }
})

// GET /spotify/artists — fetch followed + top artists merged (requires auth + connected)
router.get('/artists', requireAuth, async (req: Request, res: Response) => {
  if (!spotifyClient.isConnected()) {
    res.status(401).json({ error: 'Spotify not connected' })
    return
  }
  const artists: SpotifyArtist[] = []
  const seenIds = new Set<string>()
  let scope_warning: string | undefined

  try {
    const followed = await spotifyClient.getFollowedArtists(50)
    for (const a of followed.artists.items) {
      if (!seenIds.has(a.id)) {
        seenIds.add(a.id)
        artists.push(a)
      }
    }
  } catch (err) {
    if (err instanceof SpotifyApiError && err.status === 403) {
      scope_warning = 'Followed artists unavailable — re-authenticate Spotify to grant the user-follow-read scope.'
    } else {
      // Non-scope error: propagate
      handleError(res, err)
      return
    }
  }

  try {
    const top = await spotifyClient.getTopArtists(50)
    for (const a of top.items) {
      if (!seenIds.has(a.id)) {
        seenIds.add(a.id)
        artists.push(a)
      }
    }
  } catch (err) {
    if (err instanceof SpotifyApiError && err.status === 403) {
      const topWarning = 'Top artists unavailable — re-authenticate Spotify to grant the user-top-read scope.'
      scope_warning = scope_warning ? `${scope_warning} ${topWarning}` : topWarning
    } else {
      handleError(res, err)
      return
    }
  }

  artists.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

  const result: { items: SpotifyArtist[]; total: number; scope_warning?: string } = {
    items: artists,
    total: artists.length,
  }
  if (scope_warning) result.scope_warning = scope_warning
  res.json(result)
})

// GET /spotify/artists/:id/albums — fetch albums for an artist (requires auth + connected)
router.get('/artists/:id/albums', requireAuth, async (req: Request, res: Response) => {
  if (!spotifyClient.isConnected()) {
    res.status(401).json({ error: 'Spotify not connected' })
    return
  }
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const result = await spotifyClient.getArtistAlbums(String(req.params.id), limit, offset)
    res.json(result)
  } catch (err) {
    handleError(res, err)
  }
})

export default router
