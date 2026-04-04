import axios, { type AxiosInstance } from 'axios'
import { db } from '../db/index.js'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ArtistCountryResult {
  spotify_artist_id: string
  artist_name: string
  country_code: string | null
  country_name: string | null
  sub_region: string | null
  image_url: string | null
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

// ── Country code → name mapping (full ISO 3166-1 alpha-2) ───────────────────

const COUNTRY_NAMES: Record<string, string> = {
  // Africa
  DZ: 'Algeria', AO: 'Angola', BJ: 'Benin', BW: 'Botswana', BF: 'Burkina Faso',
  BI: 'Burundi', CV: 'Cape Verde', CM: 'Cameroon', CF: 'Central African Republic',
  TD: 'Chad', KM: 'Comoros', CG: 'Congo', CD: 'DR Congo', CI: "Côte d'Ivoire",
  DJ: 'Djibouti', EG: 'Egypt', GQ: 'Equatorial Guinea', ER: 'Eritrea',
  SZ: 'Eswatini', ET: 'Ethiopia', GA: 'Gabon', GM: 'Gambia', GH: 'Ghana',
  GN: 'Guinea', GW: 'Guinea-Bissau', KE: 'Kenya', LS: 'Lesotho', LR: 'Liberia',
  LY: 'Libya', MG: 'Madagascar', MW: 'Malawi', ML: 'Mali', MR: 'Mauritania',
  MU: 'Mauritius', YT: 'Mayotte', MA: 'Morocco', MZ: 'Mozambique', NA: 'Namibia',
  NE: 'Niger', NG: 'Nigeria', RE: 'Réunion', RW: 'Rwanda', ST: 'São Tomé and Príncipe',
  SN: 'Senegal', SC: 'Seychelles', SL: 'Sierra Leone', SO: 'Somalia',
  ZA: 'South Africa', GS: 'South Georgia and the South Sandwich Islands',
  SS: 'South Sudan', SD: 'Sudan', TZ: 'Tanzania', TG: 'Togo', TN: 'Tunisia',
  UG: 'Uganda', EH: 'Western Sahara', ZM: 'Zambia', ZW: 'Zimbabwe',
  // Americas
  AI: 'Anguilla', AG: 'Antigua and Barbuda', AR: 'Argentina', AW: 'Aruba',
  BS: 'Bahamas', BB: 'Barbados', BZ: 'Belize', BM: 'Bermuda', BO: 'Bolivia',
  BQ: 'Bonaire, Sint Eustatius and Saba', BR: 'Brazil', VG: 'British Virgin Islands',
  CA: 'Canada', KY: 'Cayman Islands', CL: 'Chile', CO: 'Colombia', CR: 'Costa Rica',
  CU: 'Cuba', CW: 'Curaçao', DM: 'Dominica', DO: 'Dominican Republic',
  EC: 'Ecuador', SV: 'El Salvador', FK: 'Falkland Islands', GF: 'French Guiana',
  GD: 'Grenada', GP: 'Guadeloupe', GT: 'Guatemala', GY: 'Guyana', HT: 'Haiti',
  HN: 'Honduras', JM: 'Jamaica', MQ: 'Martinique', MX: 'Mexico', MS: 'Montserrat',
  NI: 'Nicaragua', PA: 'Panama', PY: 'Paraguay', PE: 'Peru', PR: 'Puerto Rico',
  BL: 'Saint Barthélemy', KN: 'Saint Kitts and Nevis', LC: 'Saint Lucia',
  MF: 'Saint Martin', PM: 'Saint Pierre and Miquelon', VC: 'Saint Vincent and the Grenadines',
  SX: 'Sint Maarten', SR: 'Suriname', TT: 'Trinidad and Tobago',
  TC: 'Turks and Caicos Islands', US: 'United States', UM: 'US Minor Outlying Islands',
  VI: 'US Virgin Islands', UY: 'Uruguay', VE: 'Venezuela',
  // Antarctica
  AQ: 'Antarctica', BV: 'Bouvet Island', TF: 'French Southern Territories',
  HM: 'Heard Island and McDonald Islands', SJ: 'Svalbard and Jan Mayen',
  // Asia
  AF: 'Afghanistan', AM: 'Armenia', AZ: 'Azerbaijan', BH: 'Bahrain',
  BD: 'Bangladesh', BT: 'Bhutan', IO: 'British Indian Ocean Territory', BN: 'Brunei',
  KH: 'Cambodia', CN: 'China', CX: 'Christmas Island', CC: 'Cocos (Keeling) Islands',
  GE: 'Georgia', HK: 'Hong Kong', IN: 'India', ID: 'Indonesia', IR: 'Iran',
  IQ: 'Iraq', IL: 'Israel', JP: 'Japan', JO: 'Jordan', KZ: 'Kazakhstan',
  KW: 'Kuwait', KG: 'Kyrgyzstan', LA: 'Laos', LB: 'Lebanon', MO: 'Macao',
  MY: 'Malaysia', MV: 'Maldives', MN: 'Mongolia', MM: 'Myanmar', NP: 'Nepal',
  KP: 'North Korea', OM: 'Oman', PK: 'Pakistan', PS: 'Palestine', PH: 'Philippines',
  QA: 'Qatar', SA: 'Saudi Arabia', SG: 'Singapore', KR: 'South Korea',
  LK: 'Sri Lanka', SY: 'Syria', TW: 'Taiwan', TJ: 'Tajikistan', TH: 'Thailand',
  TL: 'Timor-Leste', TR: 'Turkey', TM: 'Turkmenistan', AE: 'United Arab Emirates',
  UZ: 'Uzbekistan', VN: 'Vietnam', YE: 'Yemen',
  // Europe
  AX: 'Åland Islands', AL: 'Albania', AD: 'Andorra', AT: 'Austria', BY: 'Belarus',
  BE: 'Belgium', BA: 'Bosnia and Herzegovina', BG: 'Bulgaria', HR: 'Croatia',
  CY: 'Cyprus', CZ: 'Czech Republic', DK: 'Denmark', EE: 'Estonia', FO: 'Faroe Islands',
  FI: 'Finland', FR: 'France', DE: 'Germany', GI: 'Gibraltar', GR: 'Greece',
  GL: 'Greenland', GG: 'Guernsey', VA: 'Holy See', HU: 'Hungary', IS: 'Iceland',
  IE: 'Ireland', IM: 'Isle of Man', IT: 'Italy', JE: 'Jersey', XK: 'Kosovo',
  LV: 'Latvia', LI: 'Liechtenstein', LT: 'Lithuania', LU: 'Luxembourg',
  MT: 'Malta', MD: 'Moldova', MC: 'Monaco', ME: 'Montenegro', NL: 'Netherlands',
  MK: 'North Macedonia', NO: 'Norway', PL: 'Poland', PT: 'Portugal', RO: 'Romania',
  RU: 'Russia', SM: 'San Marino', RS: 'Serbia', SK: 'Slovakia', SI: 'Slovenia',
  ES: 'Spain', SE: 'Sweden', CH: 'Switzerland', UA: 'Ukraine', GB: 'United Kingdom',
  // Oceania
  AS: 'American Samoa', AU: 'Australia', CK: 'Cook Islands', FJ: 'Fiji',
  PF: 'French Polynesia', GU: 'Guam', KI: 'Kiribati', MH: 'Marshall Islands',
  FM: 'Micronesia', NR: 'Nauru', NC: 'New Caledonia', NZ: 'New Zealand',
  NU: 'Niue', NF: 'Norfolk Island', MP: 'Northern Mariana Islands', PW: 'Palau',
  PG: 'Papua New Guinea', PN: 'Pitcairn', WS: 'Samoa', SB: 'Solomon Islands',
  TK: 'Tokelau', TO: 'Tonga', TV: 'Tuvalu', VU: 'Vanuatu', WF: 'Wallis and Futuna',
}

function countryCodeToName(code: string): string {
  return COUNTRY_NAMES[code.toUpperCase()] ?? code.toUpperCase()
}

/** Returns true if `code` is a valid 2-letter ISO 3166-1 alpha-2 country code */
function isValidCountryCode(code: string | null | undefined): code is string {
  return typeof code === 'string' && code.length === 2 && code.toUpperCase() in COUNTRY_NAMES
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
        // Only accept results with a valid ISO country code — Wikidata P27/P495
        // can return sub-national entities (e.g. "England") without a P297 code
        const countryName = countryCode
          ? (b.countryLabel?.value ?? countryCodeToName(countryCode))
          : null
        const subRegion = b.regionLabel?.value ?? null

        results.set(sid, {
          spotify_artist_id: sid,
          artist_name: b.artistLabel?.value ?? '',
          country_code: countryCode,
          country_name: countryName,
          sub_region: subRegion,
          image_url: null,
          source: 'wikidata',
          musicbrainz_id: null,
          confidence: countryCode ? 'high' : 'low',
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

  /** Look up MusicBrainz artist to find Spotify URL relation */
  private async mbGetSpotifyId(mbid: string): Promise<string | null> {
    try {
      const data = await this.mbGet<{
        relations?: Array<{ type: string; url?: { resource: string } }>
      }>(`/artist/${mbid}`, { inc: 'url-rels' })

      for (const rel of data.relations ?? []) {
        const url = rel.url?.resource
        if (url?.includes('open.spotify.com/artist/')) {
          const match = url.match(/artist\/([a-zA-Z0-9]+)/)
          if (match) return match[1]
        }
      }
    } catch { /* artist not found or rate limit */ }
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

    // Only accept valid ISO 3166-1 alpha-2 codes — reject area names without codes
    // to avoid regions/cities leaking in as country names
    const upperCode = code?.toUpperCase() ?? null
    return {
      country_code: upperCode,
      country_name: upperCode ? countryCodeToName(upperCode) : null,
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
        image_url: null,
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
        image_url: null,
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
      image_url: null,
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
              image_url: null,
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
              image_url: null,
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
            image_url: null,
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
              image_url: null,
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
              image_url: null,
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

  // ── Image backfill ───────────────────────────────────────────────────────

  /** Backfill image_url for all artists missing images using Spotify batch API */
  async backfillImages(spotifyClient: { getArtistsByIds: (ids: string[]) => Promise<Array<{ id: string; images: Array<{ url: string }> }>> }): Promise<{ updated: number; total: number }> {
    // Get all Spotify-keyed artists without images
    const rows = db.prepare(
      "SELECT spotify_artist_id, artist_name FROM artist_countries WHERE image_url IS NULL AND spotify_artist_id NOT LIKE 'nas:%'",
    ).all() as Array<{ spotify_artist_id: string; artist_name: string }>

    if (rows.length === 0) return { updated: 0, total: 0 }

    const ids = rows.map(r => r.spotify_artist_id)
    const artists = await spotifyClient.getArtistsByIds(ids)

    const imageMap = new Map<string, string>()
    for (const a of artists) {
      const url = a.images?.[1]?.url ?? a.images?.[0]?.url
      if (url) imageMap.set(a.id, url)
    }

    let updated = 0
    const stmt = db.prepare('UPDATE artist_countries SET image_url = ?, updated_at = datetime(\'now\') WHERE spotify_artist_id = ?')
    for (const [id, url] of imageMap) {
      stmt.run(url, id)
      updated++
    }

    return { updated, total: rows.length }
  }

  /** Backfill images for NAS artists by looking up their Spotify IDs via MusicBrainz */
  async backfillNasImages(spotifyClient: { getArtistsByIds: (ids: string[]) => Promise<Array<{ id: string; images: Array<{ url: string }> }>> }): Promise<{ updated: number; total: number }> {
    // Get NAS artists without images that have a MusicBrainz ID
    const rows = db.prepare(
      "SELECT spotify_artist_id, artist_name, musicbrainz_id FROM artist_countries WHERE image_url IS NULL AND spotify_artist_id LIKE 'nas:%' AND musicbrainz_id IS NOT NULL",
    ).all() as Array<{ spotify_artist_id: string; artist_name: string; musicbrainz_id: string }>

    if (rows.length === 0) return { updated: 0, total: rows.length }

    // Phase 1: Discover Spotify IDs from MusicBrainz URL relations (rate limited)
    const spotifyIds = new Map<string, string>() // nas key -> spotify ID
    for (const row of rows) {
      const spotifyId = await this.mbGetSpotifyId(row.musicbrainz_id)
      if (spotifyId) {
        spotifyIds.set(row.spotify_artist_id, spotifyId)
      }
    }

    if (spotifyIds.size === 0) return { updated: 0, total: rows.length }

    // Phase 2: Batch fetch Spotify artist images
    const allSpotifyIds = Array.from(spotifyIds.values())
    const artists = await spotifyClient.getArtistsByIds(allSpotifyIds)

    const imageMap = new Map<string, string>()
    for (const a of artists) {
      const url = a.images?.[1]?.url ?? a.images?.[0]?.url
      if (url) imageMap.set(a.id, url)
    }

    // Phase 3: Update DB
    let updated = 0
    const stmt = db.prepare('UPDATE artist_countries SET image_url = ?, updated_at = datetime(\'now\') WHERE spotify_artist_id = ?')
    for (const [nasKey, spotifyId] of spotifyIds) {
      const url = imageMap.get(spotifyId)
      if (url) {
        stmt.run(url, nasKey)
        updated++
      }
    }

    return { updated, total: rows.length }
  }

  // ── DB persistence ───────────────────────────────────────────────────────

  private saveResult(result: ArtistCountryResult): void {
    db.prepare(`
      INSERT OR REPLACE INTO artist_countries
        (spotify_artist_id, artist_name, country_code, country_name, sub_region, image_url, source, musicbrainz_id, confidence, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      result.spotify_artist_id,
      result.artist_name,
      result.country_code,
      result.country_name,
      result.sub_region,
      result.image_url,
      result.source,
      result.musicbrainz_id,
      result.confidence,
    )
  }
}

export const musicBrainzClient = new MusicBrainzClient()
