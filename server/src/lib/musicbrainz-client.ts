import axios, { type AxiosInstance } from 'axios'
import { db } from '../db/index.js'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ArtistCountryResult {
  spotify_artist_id: string
  artist_name: string
  country_code: string | null
  country_name: string | null
  sub_region: string | null
  source: 'wikidata' | 'musicbrainz' | 'manual'
  musicbrainz_id: string | null
  confidence: 'high' | 'medium' | 'low'
}

export interface ArtistCountryRow extends ArtistCountryResult {
  resolved_at: string
  updated_at: string
}

export interface EnrichmentProgress {
  total: number
  processed: number
  resolved: number
  failed: number
  status: 'idle' | 'running' | 'complete' | 'error'
  started_at?: string
  error?: string
}

// ── Wikidata SPARQL helpers ──────────────────────────────────────────────────

const WIKIDATA_ENDPOINT = 'https://query.wikidata.org/sparql'

function buildWikidataSparql(spotifyIds: string[]): string {
  const values = spotifyIds.map(id => `"${id}"`).join(' ')
  return `
SELECT ?spotifyId ?countryLabel ?countryCode ?regionLabel ?artistLabel WHERE {
  VALUES ?spotifyId { ${values} }
  ?artist wdt:P1902 ?spotifyId .
  { ?artist wdt:P27 ?country } UNION { ?artist wdt:P495 ?country }
  OPTIONAL { ?country wdt:P297 ?countryCode }
  OPTIONAL { ?artist wdt:P131 ?region }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}`.trim()
}

interface WikidataBinding {
  spotifyId: { value: string }
  countryLabel?: { value: string }
  countryCode?: { value: string }
  regionLabel?: { value: string }
  artistLabel?: { value: string }
}

// ── MusicBrainz helpers ──────────────────────────────────────────────────────

const MB_BASE = 'https://musicbrainz.org/ws/2'
const MB_USER_AGENT = 'HomeFairy/1.0 (home.thefairies.ie)'

interface MbArtist {
  id: string
  name: string
  country?: string
  area?: { name: string; 'iso-3166-1-codes'?: string[] }
  'begin-area'?: { name: string }
}

interface MbUrlRelation {
  'relation-list'?: Array<{
    relations: Array<{
      type: string
      artist?: MbArtist
    }>
  }>
}

// ── Country code → name mapping (common codes) ──────────────────────────────

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States', GB: 'United Kingdom', CA: 'Canada', AU: 'Australia',
  DE: 'Germany', FR: 'France', JP: 'Japan', KR: 'South Korea', SE: 'Sweden',
  NO: 'Norway', DK: 'Denmark', FI: 'Finland', IE: 'Ireland', NL: 'Netherlands',
  BE: 'Belgium', AT: 'Austria', CH: 'Switzerland', IT: 'Italy', ES: 'Spain',
  PT: 'Portugal', BR: 'Brazil', MX: 'Mexico', AR: 'Argentina', CO: 'Colombia',
  CL: 'Chile', NZ: 'New Zealand', ZA: 'South Africa', NG: 'Nigeria',
  GH: 'Ghana', KE: 'Kenya', IN: 'India', CN: 'China', TW: 'Taiwan',
  HK: 'Hong Kong', SG: 'Singapore', TH: 'Thailand', PH: 'Philippines',
  ID: 'Indonesia', MY: 'Malaysia', VN: 'Vietnam', RU: 'Russia', UA: 'Ukraine',
  PL: 'Poland', CZ: 'Czech Republic', RO: 'Romania', HU: 'Hungary',
  HR: 'Croatia', RS: 'Serbia', BG: 'Bulgaria', GR: 'Greece', TR: 'Turkey',
  IL: 'Israel', EG: 'Egypt', MA: 'Morocco', JM: 'Jamaica', TT: 'Trinidad and Tobago',
  BB: 'Barbados', CU: 'Cuba', PR: 'Puerto Rico', IS: 'Iceland', LU: 'Luxembourg',
  LT: 'Lithuania', LV: 'Latvia', EE: 'Estonia', SI: 'Slovenia', SK: 'Slovakia',
  MT: 'Malta', CY: 'Cyprus',
}

function countryCodeToName(code: string): string {
  return COUNTRY_NAMES[code.toUpperCase()] ?? code.toUpperCase()
}

// ── Client ───────────────────────────────────────────────────────────────────

class MusicBrainzClient {
  private wikidataApi: AxiosInstance
  private mbApi: AxiosInstance
  private progress: EnrichmentProgress = { total: 0, processed: 0, resolved: 0, failed: 0, status: 'idle' }
  private nasProgress: EnrichmentProgress = { total: 0, processed: 0, resolved: 0, failed: 0, status: 'idle' }
  private cancelled = false
  private mbLastRequest = 0

  constructor() {
    this.wikidataApi = axios.create({
      baseURL: WIKIDATA_ENDPOINT,
      timeout: 30000,
      headers: { Accept: 'application/sparql-results+json' },
    })

    this.mbApi = axios.create({
      baseURL: MB_BASE,
      timeout: 15000,
      headers: {
        'User-Agent': MB_USER_AGENT,
        Accept: 'application/json',
      },
    })
  }

  getProgress(): EnrichmentProgress {
    return { ...this.progress }
  }

  cancel(): void {
    this.cancelled = true
  }

  // Rate-limited MusicBrainz request (1 per second)
  private async mbGet<T>(url: string, params?: Record<string, string>): Promise<T> {
    const now = Date.now()
    const elapsed = now - this.mbLastRequest
    if (elapsed < 1100) {
      await new Promise(resolve => setTimeout(resolve, 1100 - elapsed))
    }
    this.mbLastRequest = Date.now()
    const response = await this.mbApi.get<T>(url, { params: { ...params, fmt: 'json' } })
    return response.data
  }

  // ── Wikidata batch lookup ────────────────────────────────────────────────

  private async wikidataBatch(spotifyIds: string[]): Promise<Map<string, ArtistCountryResult>> {
    const results = new Map<string, ArtistCountryResult>()
    if (spotifyIds.length === 0) return results

    try {
      const query = buildWikidataSparql(spotifyIds)
      const response = await this.wikidataApi.get<{
        results: { bindings: WikidataBinding[] }
      }>('', { params: { query } })

      const bindings = response.data?.results?.bindings ?? []

      for (const b of bindings) {
        const sid = b.spotifyId.value
        // Skip if we already have a result for this artist (first match wins)
        if (results.has(sid)) continue

        const countryCode = b.countryCode?.value?.toUpperCase() ?? null
        const countryName = b.countryLabel?.value ?? (countryCode ? countryCodeToName(countryCode) : null)
        const subRegion = b.regionLabel?.value ?? null

        results.set(sid, {
          spotify_artist_id: sid,
          artist_name: b.artistLabel?.value ?? '',
          country_code: countryCode,
          country_name: countryName,
          sub_region: subRegion,
          source: 'wikidata',
          musicbrainz_id: null,
          confidence: 'high',
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[MusicBrainz] Wikidata SPARQL batch failed:', msg)
    }

    return results
  }

  // ── MusicBrainz single-artist lookup ─────────────────────────────────────

  private async mbLookupBySpotifyUrl(spotifyId: string): Promise<MbArtist | null> {
    try {
      const spotifyUrl = `https://open.spotify.com/artist/${spotifyId}`
      const data = await this.mbGet<{ relations?: Array<{ type: string; target: string; artist?: MbArtist }> } | MbUrlRelation>(
        '/url',
        { resource: spotifyUrl, inc: 'artist-rels' },
      )

      // The response shape varies; try to find an artist relation
      const relations = (data as MbUrlRelation)['relation-list']?.[0]?.relations
        ?? (data as { relations?: Array<{ type: string; artist?: MbArtist }> }).relations
        ?? []

      for (const rel of relations) {
        if (rel.artist) return rel.artist
      }
    } catch {
      // 404 or network error — artist not linked in MusicBrainz
    }
    return null
  }

  private async mbSearchByName(name: string): Promise<MbArtist | null> {
    try {
      const data = await this.mbGet<{ artists?: MbArtist[] }>(
        '/artist',
        { query: `artist:"${name.replace(/"/g, '\\"')}"`, limit: '3' },
      )
      // Return the best match (first result)
      return data.artists?.[0] ?? null
    } catch {
      // Search failed
    }
    return null
  }

  private extractCountryFromMbArtist(artist: MbArtist): {
    country_code: string | null
    country_name: string | null
    sub_region: string | null
  } {
    const code = artist.country
      ?? artist.area?.['iso-3166-1-codes']?.[0]
      ?? null

    return {
      country_code: code?.toUpperCase() ?? null,
      country_name: code ? countryCodeToName(code) : (artist.area?.name ?? null),
      sub_region: artist['begin-area']?.name ?? null,
    }
  }

  // ── Single artist lookup ─────────────────────────────────────────────────

  async lookupArtist(spotifyId: string, name: string): Promise<ArtistCountryResult> {
    // Try Wikidata first (single ID batch)
    const wdResults = await this.wikidataBatch([spotifyId])
    if (wdResults.has(spotifyId)) {
      const result = wdResults.get(spotifyId)!
      if (!result.artist_name) result.artist_name = name
      this.saveResult(result)
      return result
    }

    // Try MusicBrainz URL relation
    const mbArtist = await this.mbLookupBySpotifyUrl(spotifyId)
    if (mbArtist) {
      const country = this.extractCountryFromMbArtist(mbArtist)
      const result: ArtistCountryResult = {
        spotify_artist_id: spotifyId,
        artist_name: name,
        ...country,
        source: 'musicbrainz',
        musicbrainz_id: mbArtist.id,
        confidence: 'high',
      }
      this.saveResult(result)
      return result
    }

    // Try MusicBrainz name search (lower confidence)
    const mbSearch = await this.mbSearchByName(name)
    if (mbSearch) {
      const country = this.extractCountryFromMbArtist(mbSearch)
      const result: ArtistCountryResult = {
        spotify_artist_id: spotifyId,
        artist_name: name,
        ...country,
        source: 'musicbrainz',
        musicbrainz_id: mbSearch.id,
        confidence: 'medium',
      }
      this.saveResult(result)
      return result
    }

    // Not found anywhere — save as null so we don't re-query
    const result: ArtistCountryResult = {
      spotify_artist_id: spotifyId,
      artist_name: name,
      country_code: null,
      country_name: null,
      sub_region: null,
      source: 'musicbrainz',
      musicbrainz_id: null,
      confidence: 'low',
    }
    this.saveResult(result)
    return result
  }

  // ── Batch enrichment ─────────────────────────────────────────────────────

  async enrichArtists(artists: Array<{ id: string; name: string }>): Promise<ArtistCountryResult[]> {
    if (this.progress.status === 'running') {
      throw new Error('Enrichment already in progress')
    }

    this.cancelled = false
    const results: ArtistCountryResult[] = []

    // Filter out already-cached artists
    const uncached = artists.filter(a => {
      const row = db.prepare('SELECT spotify_artist_id FROM artist_countries WHERE spotify_artist_id = ?').get(a.id)
      return !row
    })

    this.progress = {
      total: uncached.length,
      processed: 0,
      resolved: 0,
      failed: 0,
      status: 'running',
      started_at: new Date().toISOString(),
    }

    if (uncached.length === 0) {
      this.progress.status = 'complete'
      return results
    }

    try {
      // Phase 1: Wikidata batch (groups of 50)
      const wdBatchSize = 50
      const unresolvedAfterWd: Array<{ id: string; name: string }> = []

      for (let i = 0; i < uncached.length; i += wdBatchSize) {
        if (this.cancelled) break
        const batch = uncached.slice(i, i + wdBatchSize)
        const ids = batch.map(a => a.id)

        const wdResults = await this.wikidataBatch(ids)

        for (const a of batch) {
          if (wdResults.has(a.id)) {
            const result = wdResults.get(a.id)!
            if (!result.artist_name) result.artist_name = a.name
            this.saveResult(result)
            results.push(result)
            this.progress.resolved++
          } else {
            unresolvedAfterWd.push(a)
          }
          this.progress.processed++
        }
      }

      // Phase 2: MusicBrainz fallback (1 request/sec)
      for (const a of unresolvedAfterWd) {
        if (this.cancelled) break

        try {
          // Try URL relation first
          const mbArtist = await this.mbLookupBySpotifyUrl(a.id)
          if (mbArtist) {
            const country = this.extractCountryFromMbArtist(mbArtist)
            const result: ArtistCountryResult = {
              spotify_artist_id: a.id,
              artist_name: a.name,
              ...country,
              source: 'musicbrainz',
              musicbrainz_id: mbArtist.id,
              confidence: 'high',
            }
            this.saveResult(result)
            results.push(result)
            if (result.country_code) this.progress.resolved++
            continue
          }

          // Try name search
          const mbSearch = await this.mbSearchByName(a.name)
          if (mbSearch) {
            const country = this.extractCountryFromMbArtist(mbSearch)
            const result: ArtistCountryResult = {
              spotify_artist_id: a.id,
              artist_name: a.name,
              ...country,
              source: 'musicbrainz',
              musicbrainz_id: mbSearch.id,
              confidence: 'medium',
            }
            this.saveResult(result)
            results.push(result)
            if (result.country_code) this.progress.resolved++
            continue
          }

          // Not found — save null result
          const result: ArtistCountryResult = {
            spotify_artist_id: a.id,
            artist_name: a.name,
            country_code: null,
            country_name: null,
            sub_region: null,
            source: 'musicbrainz',
            musicbrainz_id: null,
            confidence: 'low',
          }
          this.saveResult(result)
          results.push(result)
          this.progress.failed++
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error(`[MusicBrainz] Failed to enrich artist ${a.name}:`, msg)
          this.progress.failed++
        }
      }

      this.progress.status = this.cancelled ? 'idle' : 'complete'
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[MusicBrainz] Enrichment failed:', msg)
      this.progress.status = 'error'
      this.progress.error = msg
    }

    return results
  }

  // ── NAS enrichment (name-only, no Spotify ID) ────────────────────────────

  getNasProgress(): EnrichmentProgress {
    return { ...this.nasProgress }
  }

  async enrichNasArtists(artistNames: string[]): Promise<ArtistCountryResult[]> {
    if (this.nasProgress.status === 'running') {
      throw new Error('NAS enrichment already in progress')
    }
    // Block if Spotify enrichment is running (shared MusicBrainz rate limit)
    if (this.progress.status === 'running') {
      throw new Error('Spotify enrichment is running — wait for it to finish')
    }

    this.cancelled = false
    const results: ArtistCountryResult[] = []

    // For NAS artists, first check if the name matches an existing entry (Spotify or prior NAS)
    const uncached = artistNames.filter(name => {
      const row = db.prepare(
        'SELECT spotify_artist_id FROM artist_countries WHERE artist_name = ? COLLATE NOCASE',
      ).get(name)
      if (row) return false
      // Also check NAS-keyed entry
      const nasRow = db.prepare(
        'SELECT spotify_artist_id FROM artist_countries WHERE spotify_artist_id = ?',
      ).get(`nas:${name}`)
      return !nasRow
    })

    this.nasProgress = {
      total: uncached.length,
      processed: 0,
      resolved: 0,
      failed: 0,
      status: 'running',
      started_at: new Date().toISOString(),
    }

    if (uncached.length === 0) {
      this.nasProgress.status = 'complete'
      return results
    }

    try {
      // NAS uses MusicBrainz name search only (1 req/sec rate limit)
      // Wikidata doesn't have a reliable name-only batch search for artists
      for (const name of uncached) {
        if (this.cancelled) break

        try {
          const mbArtist = await this.mbSearchByName(name)
          if (mbArtist) {
            const country = this.extractCountryFromMbArtist(mbArtist)
            const result: ArtistCountryResult = {
              spotify_artist_id: `nas:${name}`,
              artist_name: name,
              ...country,
              source: 'musicbrainz',
              musicbrainz_id: mbArtist.id,
              confidence: 'medium',
            }
            this.saveResult(result)
            results.push(result)
            if (result.country_code) this.nasProgress.resolved++
          } else {
            // Not found — save null
            const result: ArtistCountryResult = {
              spotify_artist_id: `nas:${name}`,
              artist_name: name,
              country_code: null,
              country_name: null,
              sub_region: null,
              source: 'musicbrainz',
              musicbrainz_id: null,
              confidence: 'low',
            }
            this.saveResult(result)
            results.push(result)
            this.nasProgress.failed++
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error(`[MusicBrainz] Failed to enrich NAS artist ${name}:`, msg)
          this.nasProgress.failed++
        }

        this.nasProgress.processed++
      }

      this.nasProgress.status = this.cancelled ? 'idle' : 'complete'
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[MusicBrainz] NAS enrichment failed:', msg)
      this.nasProgress.status = 'error'
      this.nasProgress.error = msg
    }

    return results
  }

  // ── DB persistence ───────────────────────────────────────────────────────

  private saveResult(result: ArtistCountryResult): void {
    db.prepare(`
      INSERT OR REPLACE INTO artist_countries
        (spotify_artist_id, artist_name, country_code, country_name, sub_region, source, musicbrainz_id, confidence, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      result.spotify_artist_id,
      result.artist_name,
      result.country_code,
      result.country_name,
      result.sub_region,
      result.source,
      result.musicbrainz_id,
      result.confidence,
    )
  }
}

export const musicBrainzClient = new MusicBrainzClient()
