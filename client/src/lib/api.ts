// ── Types ────────────────────────────────────────────────────────────────────

export interface Light {
  id: string
  uuid: string
  label: string
  connected: boolean
  power: 'on' | 'off'
  brightness: number
  color: { hue: number; saturation: number; kelvin: number }
  group: { id: string; name: string }
  location: { id: string; name: string }
  product: {
    name: string
    capabilities: {
      has_color: boolean
      has_variable_color_temp: boolean
      min_kelvin: number
      max_kelvin: number
    }
  }
}

export interface LightState {
  power?: 'on' | 'off'
  color?: string
  brightness?: number
  duration?: number
}

export interface Room {
  name: string
  display_order: number
  parent_room: string | null
  promoted: boolean
  auto: boolean
  timer: number
  sensors: Sensor[]
  tags: string[]
  current_scene: string | null
  last_active: string | null
  temperature: number | null
  lux: number | null
  sonos_follow_me: boolean
  sonos_auto_start: boolean
  icon: string | null
  created_by?: string | null
  updated_by?: string | null
  created_by_name?: string | null
  updated_by_name?: string | null
}

export interface RoomDetail extends Room {
  lights: LightRoom[]
}

export interface Sensor {
  name: string
  id?: string  // device_id from device_rooms (numeric hub device ID as string)
}

export interface Scene {
  name: string
  icon: string
  rooms: SceneRoom[]
  modes: string[]
  commands: SceneCommand[]
  tags: string[]
  active_from?: string | null // "MM-DD" format
  active_to?: string | null   // "MM-DD" format
  last_activated_at?: string | null
  last_activated_by?: string | null
  last_activated_by_name?: string | null
  sort_order?: number
  created_by?: string | null
  updated_by?: string | null
  created_by_name?: string | null
  updated_by_name?: string | null
}

export interface SceneRoom {
  name: string
}

export type LightEffect = 'breathe' | 'pulse' | 'move'

export interface EffectParams {
  color?: string
  from_color?: string
  period?: number
  cycles?: number
  persist?: boolean
  power_on?: boolean
  peak?: number
  direction?: string
  speed?: number
}

export interface RateLimitStatus {
  remaining: number | null
  resetAt: number | null
}

export interface BatchState {
  selector: string
  power?: 'on' | 'off'
  color?: string
  brightness?: number
  duration?: number
}

export interface SceneCommand {
  type:
    | 'lifx_light'
    | 'lifx_off'
    | 'hubitat_device'
    | 'kasa_device'
    | 'all_off'
    | 'scene_timer'
    | 'mode_update'
    | 'lifx_effect'
    | 'twinkly'
    | 'fairy_device'
    | 'fairy_scene'
  name: string
  light_id?: string
  selector?: string
  color?: string
  brightness?: number
  power?: 'on' | 'off'
  duration?: number
  command?: string
  device_id?: number | string
  value?: string | number
  effect?: LightEffect
  effect_params?: EffectParams
}

export interface LightRoom {
  id: number
  light_id: string
  light_label: string
  light_selector: string
  room_name: string
  has_color: boolean
  min_kelvin: number
  max_kelvin: number
  active?: boolean
}

export interface LightAssignment {
  id: string
  label: string
  has_color: boolean
  min_kelvin: number
  max_kelvin: number
}

export interface HubDevice {
  id: number
  label: string
  device_name: string
  device_type: string
  capabilities: string[]
  attributes: Record<string, unknown>
  active?: boolean
}

export interface KasaEmeterData {
  power: number
  voltage: number
  current: number
  total: number
  today?: number
}

export interface KasaDevice {
  id: string
  label: string
  device_type: 'plug' | 'strip' | 'outlet' | 'switch' | 'dimmer'
  model: string | null
  parent_id: string | null
  ip_address: string | null
  has_emeter: boolean
  firmware: string | null
  hardware: string | null
  rssi: number | null
  is_online: boolean
  attributes: {
    switch?: string
    brightness?: number
    power?: number
    voltage?: number
    current?: number
    energy?: number
    runtime_today?: number
    runtime_month?: number
  }
  children?: KasaDevice[]
  last_seen: string | null
  active?: boolean
}

export interface KasaDailyStats {
  year: number
  month: number
  data: Record<number, number>
}

export interface KasaMonthlyStats {
  year: number
  data: Record<number, number>
}

export interface KasaHealth {
  status: string
  device_count: number
  online_count: number
}

export interface DeviceRoomAssignment {
  id: number
  device_id: string
  device_label: string
  device_type: string
  room_name: string
  config: Record<string, unknown>
}

export interface LifxScene {
  uuid: string
  name: string
  states: unknown[]
  created_at: number
  updated_at: number
}

export interface SunScheduleEntry {
  sunPhase: string
  mode: string
  time: string
  isPast: boolean
}

export interface ModeTrigger {
  id: number
  type: 'sun' | 'time'
  sunEvent?: string
  time?: string
  days?: number[]
  priority: number
  enabled: boolean
}

export interface ModeWithTriggers {
  name: string
  icon: string | null
  triggers: ModeTrigger[]
  isSleepMode: boolean
  created_by?: string | null
  updated_by?: string | null
  created_by_name?: string | null
  updated_by_name?: string | null
}

export interface ModeDependencies {
  scenes: { name: string; icon: string }[]
  isCurrentMode: boolean
  isWakeMode: boolean
  isSleepMode: boolean
  triggerCount: number
}

export interface SubwayArrival {
  routeId: string
  direction: 'N' | 'S'
  arrivalTime: number
  minutesAway: number
  stopId: string
}

export interface MtaStatus {
  status: 'green' | 'orange' | 'red' | 'none'
  message: string
  nextArrival: SubwayArrival | null
  catchableTrain: SubwayArrival | null
  leaveInMinutes: number | null
  arrivals: SubwayArrival[]
}

export interface MtaStop {
  stopId: string
  name: string
  lines: string[]
  feedGroup: string
  borough: string
}

export interface ConfiguredStop {
  stopId: string
  name: string
  direction: 'N' | 'S'
  routes: string[]
  feedGroup: string
  walkTime: number
  enabled: boolean
}

export interface MtaIndicatorConfig {
  enabled: boolean
  lightId: string
  lightLabel: string
  sensorName: string
}

export interface WeatherIndicatorConfig {
  enabled: boolean
  lightId: string
  lightLabel: string
  intervalMinutes: number
  mode: 'always' | 'sensor'
  sensorName?: string
  brightness: number
}

export interface WeatherColorEntry {
  color: string
  name: string
  hex: string
  description: string
}

export interface DeviceUsage {
  lightId: string
  room: string | null
  scenes: { name: string; icon: string }[]
  indicatorRole: 'subway' | 'weather' | null
}

export interface NightStatus {
  active: boolean
  lockedRooms: string[]
  wakeMode: string
}

export interface HushingStatus {
  active: boolean
  sceneName: string | null
}

// ── Dashboard types ──────────────────────────────────────────────────────────

export interface BatteryDevice {
  id: number
  label: string
  device_type: string
  battery: number | null
  status: 'ok' | 'low' | 'critical'
  updated_at: string
}

export interface PowerDevice {
  id: string | number
  label: string
  room_name: string | null
  power: number
  energy: number | null
  switch: 'on' | 'off'
  source: 'hub' | 'kasa'
}

export interface DashboardSummary {
  mode: string
  allModes: string[]
  rooms: Array<{
    name: string
    temperature: number | null
    lux: number | null
    current_scene: string | null
    last_active: string | null
    auto: number
  }>
  battery: BatteryDevice[]
  power: PowerDevice[]
  sunSchedule: SunScheduleEntry[]
  sunPhase: string
  sunTimes: Record<string, string>
  weather: {
    temp: number
    description: string
    icon: string
    humidity: number
    wind_speed: number
  } | null
  nightStatus: NightStatus
  currencySymbol: string
  insights: InsightsData | null
}

export interface ActivityInsights {
  roomRanking: Array<{ room: string; events24h: number; peakHours: string }>
  dailyTrend: Array<{ day: string; totalEvents: number }>
  hourlyPattern: Array<{ hour: number; avgEvents: number }>
  hourlyByRoom: Array<{ room: string; data: Array<{ hour: number; avgEvents: number }> }>
  dailyByRoom: Array<{ room: string; data: Array<{ day: string; totalEvents: number }> }>
  roomIcons: Record<string, string | null>
  mostActiveRoom: { room: string; events24h: number } | null
  quietestRoom: { room: string; events24h: number } | null
}

export interface RoomIntelligenceData {
  temperature: number | null
  lux: number | null
  lastActive: string | null
  temperatureHistory: Array<{ value: number; recorded_at: string }>
  totalWatts: number
  devices: Array<{
    id: string; label: string; device_type: string; source: 'hub' | 'kasa'
    power: number; energy: number | null; battery: number | null
  }>
  events24h: number
  hourlyPattern: Array<{ hour: number; count: number }>
  batteryDevices: Array<{
    id: number; label: string; battery: number; status: string
    drainPerDay: number | null; predictedDaysRemaining: number | null
  }>
  dailyCost: number | null
  monthToDateCost: number | null
  dailyOverUnderPercent: number | null
}

export interface DeviceInsightsData {
  insights: {
    power: {
      currentWatts: number
      averageWatts7d: number | null
      overUnderPercent: number | null
      percentOfTotal: number
      dailyCostImpact: number | null
      currencySymbol: string
    } | null
    battery: {
      currentLevel: number
      drainPerDay: number | null
      predictedDaysRemaining: number | null
    } | null
    temperature: {
      currentTemp: number
      avgTemp30d: number | null
    } | null
  }
  roomDevices: Array<{ id: string; label: string; device_type: string; source: 'hub' | 'kasa' }>
  currencySymbol: string
}

export interface InsightsData {
  energy: EnergyInsights | null
  temperature: TemperatureInsights | null
  lux: LuxInsights | null
  battery: BatteryInsights | null
  activity: ActivityInsights | null
  attention: AttentionItem[]
}

export interface EnergyInsights {
  totalWatts: number
  averageWattsThisHour: number | null
  overUnderPercent: number | null
  /** @deprecated Use projectedDailyCost. Kept for backwards compatibility. */
  dailyCostEstimate: number | null
  projectedDailyCost: number | null
  actualDailyCost: number | null
  monthToDateCost: number | null
  lastMonthCost: number | null
  monthOverMonthPercent: number | null
  dailyOverUnderPercent: number | null
  deviceCostRanking: Array<{
    deviceId: string
    label: string
    monthlyKwh: number
    monthlyCost: number
    dailyAvgCost: number
  }>
  roomCostRanking: Array<{
    roomName: string
    dailyCost: number
    monthToDateCost: number
    deviceCount: number
  }>
  energyRate: number
  dailyKwhHistory: Array<{ day: string; totalKwh: number }>
  peakHours: Array<{ hour: number; avgWatts: number }>
  deviceAnomalies: Array<{
    deviceId: number | string
    label: string
    currentWatts: number
    averageWatts: number
    percentAbove: number
    source?: 'hub' | 'kasa'
  }>
}

export interface TemperatureInsights {
  houseAvgTemp: number
  houseAvgTemp30d: number | null
  overUnderTemp: number | null
  trend: 'warming' | 'cooling' | 'stable'
  roomOutliers: Array<{ room: string; temp: number; deviation: number }>
  indoorOutdoorDelta: number | null
}

export interface LuxInsights {
  houseAvgLux: number
  houseAvgLuxThisHour: number | null
  overUnderLuxPercent: number | null
  brightnessLevel: 'dark' | 'dim' | 'moderate' | 'bright' | 'very bright'
  roomRanking: Array<{ room: string; lux: number }>
}

export interface BatteryInsights {
  fleetHealth: { healthy: number; low: number; critical: number; total: number }
  deviceDrainRates: Array<{
    deviceId: number
    label: string
    drainPerDay: number | null
    predictedDaysRemaining: number | null
    isAnomalous: boolean
  }>
  worstDevice: { label: string; predictedDaysRemaining: number | null } | null
}

export interface AttentionItem {
  id: string
  severity: 'critical' | 'warning' | 'info'
  category: 'battery' | 'energy' | 'temperature' | 'device_error' | 'scene' | 'device_unreachable' | 'device_online'
  title: string
  description: string
  deviceId: number | string | null
  deviceLabel: string | null
  deviceSource?: 'hub' | 'kasa' | 'lifx' | null
  action?: 'deactivate' | 'reactivate'
  deviceType?: string | null
}

export interface DeactivatedDevice {
  deviceType: 'hub' | 'kasa' | 'lifx'
  deviceId: string
  deviceLabel: string
  roomName: string | null
  deactivatedAt: string
  deactivatedReason: string
  lastFailureReason: string | null
}

export interface DeviceHealth {
  deviceType: string
  deviceId: string
  consecutiveFailures: number
  unreachableSince: string | null
  lastSuccess: string | null
  lastFailure: string | null
  lastFailureReason: string | null
  deactivatedAt: string | null
  deactivatedReason: string | null
}

export interface AppNotification {
  id: number
  severity: 'info' | 'warning' | 'critical'
  category: string
  title: string
  message: string
  source_type: string | null
  source_id: string | null
  source_label: string | null
  dedup_key: string | null
  occurrence_count: number
  first_occurred_at: string
  last_occurred_at: string
  read: number
  dismissed: number
  created_at: string
}

export interface HistoryPoint {
  value: number
  min?: number
  max?: number
  recorded_at: string
}

export interface HistoryResponse {
  data: HistoryPoint[]
  count: number
  period: string
}

export interface DashboardStats {
  totalRows: number
  oldestRecord: string | null
  sources: Array<{ source: string; count: number }>
  dbSizeBytes: number
  dbSizeMB: number
}

export interface DeviceContext {
  rooms: Array<{ room_name: string; config: Record<string, unknown> }>
  scenes: string[]
  updatedAt: string | null
  historySources: Array<{ source: string; count: number }>
}

export interface CombinedMtaStatus {
  overallStatus: 'green' | 'orange' | 'red' | 'none'
  overallMessage: string
  stops: Array<{
    config: ConfiguredStop
    status: 'green' | 'orange' | 'red' | 'none'
    message: string
    nextArrival: SubwayArrival | null
    catchableTrain: SubwayArrival | null
    leaveInMinutes: number | null
    arrivals: SubwayArrival[]
  }>
}

// ── Fetch wrapper ────────────────────────────────────────────────────────────

const API_BASE = '/api'

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      credentials: 'include',
      ...options,
      signal: options?.signal ?? controller.signal,
    })
    if (res.status === 401) {
      throw new Error('Unauthorized')
    }
    if (!res.ok) {
      let message = `API error: ${res.status}`
      try {
        const body = await res.json()
        if (body?.error) message = body.error
      } catch {
        const text = await res.text().catch(() => '')
        if (text && !text.startsWith('<!')) message = text
      }
      throw new Error(message)
    }
    if (res.status === 204 || res.headers.get('content-length') === '0') {
      return undefined as T
    }
    return res.json()
  } finally {
    clearTimeout(timeoutId)
  }
}

/** Extract the `error` field from a server JSON error body, if available. */
export function parseApiError(err: unknown): string | null {
  try {
    const msg = err instanceof Error ? err.message : String(err)
    const parsed = JSON.parse(msg) as unknown
    if (parsed && typeof parsed === 'object' && 'error' in parsed && typeof (parsed as Record<string, unknown>).error === 'string') {
      return (parsed as { error: string }).error
    }
  } catch {
    // not JSON — ignore
  }
  return null
}

// ── Sonos types ─────────────────────────────────────────────────────────────

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

export interface SonosGroupInfo {
  coordinator: string
  members: string[]
  isCoordinator: boolean
}

export interface SonosNowPlayingEntry {
  roomName: string
  speakerName: string
  state: SonosPlaybackState | null
  error?: boolean
  group?: SonosGroupInfo | null
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

export interface SonosLibraryStatus {
  available: boolean
  artistCount: number
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

export interface NasEnrichedAlbum extends SonosGenreAlbum {
  artist_country: {
    country_code: string | null
    country_name: string | null
    sub_region: string | null
    confidence: string | null
    image_url?: string | null
  } | null
}

export interface NasEnrichedArtist extends SonosLibraryArtist {
  country_code: string | null
  country_name: string | null
  sub_region: string | null
  confidence: string | null
  image_url?: string | null
}

export interface SonosRadioStation {
  title: string
  uri: string
  albumArtUri?: string
}

export interface SonosLibraryTrack {
  title: string
  artist: string
  album: string
  albumArtUri: string | undefined
  uri: string
  duration_ms?: number
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

export interface SonosQueueItem {
  title: string
  artist: string
  album: string
  albumArtUri: string
  uri: string
  /** Track duration in seconds — may be absent if not returned by Sonos API */
  duration?: number
}

export interface SonosSpeakerMapping {
  id: number
  room_name: string
  speaker_name: string
  favourite: string | null
  default_volume: number
  created_at: string
}

export interface SonosSpeakerWithRoom extends SonosSpeakerMapping {
  room_icon: string | null
}

export interface AutoPlayRule {
  id: number
  room_name: string | null
  mode_name: string
  favourite_name: string
  trigger_type: 'mode_change' | 'if_not_playing' | 'if_source_not'
  trigger_value: string | null
  enabled: number
  max_plays: number | null
  podcast_feed_url: string | null
  nas_uri: string | null
  spotify_uri: string | null
}

export interface FollowMeStatus {
  enabled: boolean
  activeRooms: string[]
  anchorRoom: string | null
}

// ── Spotify types ────────────────────────────────────────────────────────────

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

export interface SpotifyPinnedPlaylist {
  id: number
  playlist_id: string
  uri: string
  name: string
  image_url: string | null
  owner_display_name: string | null
  owner_id: string | null
  track_total: number | null
  is_editorial: boolean
  sort_order: number
  created_at: string
}

export interface SpotifyPlaylistMetadata {
  playlist_id: string
  uri: string
  name: string
  image_url: string | null
  owner_display_name: string | null
  owner_id: string | null
  track_total: number | null
  is_editorial: boolean
  via: 'api' | 'og'
}

export interface UserFavourite {
  id: number
  user_id: string
  source: 'sonos' | 'spotify' | 'nas' | 'radio'
  source_uri: string
  title: string
  artist?: string | null
  album_art_uri: string | null
  sort_order: number
  created_at: string
}

export interface AddFavouriteInput {
  source: 'sonos' | 'spotify' | 'nas' | 'radio'
  source_uri: string
  title: string
  artist?: string
  album_art_uri?: string
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

export interface SpotifyStatus {
  connected: boolean
  configured: boolean
  display_name?: string
  needs_reauth?: boolean
}

export interface Fairylist {
  id: number
  name: string
  created_by: string
  created_at: string
  item_count: number
}

export interface FairylistItem {
  id: number
  fairylist_id: number
  source: 'sonos' | 'spotify' | 'nas' | 'radio'
  source_uri: string
  title: string
  artist: string | null
  album_art_uri: string | null
  sort_order: number
  added_by: string
  added_at: string
}

export interface AddFairylistItemInput {
  source: 'sonos' | 'spotify' | 'nas' | 'radio'
  source_uri: string
  title: string
  artist?: string
  album_art_uri?: string
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
    items: Array<{
      id: string
      name: string
      images: SpotifyImage[]
      genres: string[]
      uri: string
      external_urls: { spotify: string }
    }>
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
  images: Array<{ url: string; height: number | null; width: number | null }>
  genres: string[]
  uri: string
  external_urls: { spotify: string }
  followers?: { total: number }
  popularity?: number
}

// ── Artist country enrichment types ──────────────────────────────────────────

export interface ArtistCountry {
  spotify_artist_id: string
  artist_name: string
  country_code: string | null
  country_name: string | null
  sub_region: string | null
  image_url?: string | null
  source: 'wikidata' | 'musicbrainz' | 'manual'
  musicbrainz_id: string | null
  confidence: 'high' | 'medium' | 'low' | null
  resolved_at?: string
  updated_at?: string
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

export interface EnrichedAlbumItem {
  added_at: string
  album: SpotifyAlbum
  artist_countries: Array<{
    artist_id: string
    artist_name: string
    country_code: string | null
    country_name: string | null
    sub_region: string | null
    confidence: string | null
    image_url?: string | null
  }>
}

// ── User action types ────────────────────────────────────────────────────────

export interface UserAction {
  id: number
  user_id: string
  user_name: string
  action: string
  entity_type: string
  entity_id: string
  details?: Record<string, unknown> | null
  created_at: string
}

// ── Access link types ────────────────────────────────────────────────────────

export interface AccessLink {
  id: string
  token: string
  label: string
  mode: 'guest' | 'resident'
  expires_at: string | null
  max_uses: number
  use_count: number
  guest_session_duration: number | null
  created_at: string
  revoked_at: string | null
  status: 'active' | 'expired' | 'revoked' | 'consumed'
}

interface CreateAccessLinkInput {
  label: string
  mode: 'guest' | 'resident'
  expiresAt?: string
  maxUses?: number
  guestSessionDuration?: number
}

interface AccessLinkCreated extends AccessLink {
  url: string
}

interface AccessLinkVerifyResult {
  valid: boolean
  mode?: 'guest' | 'resident'
  label?: string
  reason?: string
}

interface AccessLinkRedeemResult {
  success: boolean
  mode: 'guest' | 'resident'
  redirect: string
  error?: string
}

export interface DeviceLink {
  id: number
  sourceType: string
  sourceId: string
  targetType: string
  targetId: string
  linkType: string
  target?: {
    label: string
    isOnline: boolean
    power: number | null
    todayWh: number | null
    todayCost: number | null
    monthWh: number | null
    monthlyCost: number | null
    currencySymbol: string
  } | null
}

// ── API client ───────────────────────────────────────────────────────────────

export const api = {
  lifx: {
    getLights: () => fetchApi<Light[]>('/lifx/lights'),
    setState: (selector: string, state: LightState) =>
      fetchApi<unknown>(
        '/lifx/lights/' + encodeURIComponent(selector) + '/state',
        { method: 'PUT', body: JSON.stringify(state) },
      ),
    toggle: (selector: string) =>
      fetchApi<unknown>(
        '/lifx/lights/' + encodeURIComponent(selector) + '/toggle',
        { method: 'POST' },
      ),
    identify: (selector: string) =>
      fetchApi<unknown>(
        '/lifx/lights/' + encodeURIComponent(selector) + '/identify',
        { method: 'POST' },
      ),
    getScenes: () => fetchApi<LifxScene[]>('/lifx/scenes'),
    setStates: (states: BatchState[], defaults?: object) =>
      fetchApi<unknown>('/lifx/lights/states', {
        method: 'PUT',
        body: JSON.stringify({ states, defaults }),
      }),
    runEffect: (selector: string, effect: LightEffect, params: EffectParams) =>
      fetchApi<unknown>(
        '/lifx/lights/' + encodeURIComponent(selector) + '/effects/' + effect,
        { method: 'POST', body: JSON.stringify(params) },
      ),
    stopEffects: (selector: string) =>
      fetchApi<unknown>(
        '/lifx/lights/' + encodeURIComponent(selector) + '/effects/off',
        { method: 'POST' },
      ),
    getRateLimit: () => fetchApi<RateLimitStatus>('/lifx/rate-limit'),
    getUsage: (lightId: string) =>
      fetchApi<DeviceUsage>('/lifx/lights/' + encodeURIComponent(lightId) + '/usage'),
  },
  roomDefaultScenes: {
    getAll: () => fetchApi<Record<string, Record<string, string>>>('/rooms/default-scenes'),
    getForRoom: (name: string) =>
      fetchApi<Record<string, string>>('/rooms/' + encodeURIComponent(name) + '/default-scenes'),
    set: (roomName: string, mode: string, scene: string | null) =>
      fetchApi<Record<string, string>>('/rooms/' + encodeURIComponent(roomName) + '/default-scene', {
        method: 'PUT',
        body: JSON.stringify({ mode, scene }),
      }),
  },
  rooms: {
    getAll: () => fetchApi<Room[]>('/rooms'),
    get: (name: string) =>
      fetchApi<RoomDetail>('/rooms/' + encodeURIComponent(name)),
    create: (data: Partial<Omit<Room, 'sensors'>>) =>
      fetchApi<Room>('/rooms', { method: 'POST', body: JSON.stringify(data) }),
    update: (name: string, data: Partial<Omit<Room, 'sensors'>>) =>
      fetchApi<Room>('/rooms/' + encodeURIComponent(name), {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (name: string) =>
      fetchApi<unknown>('/rooms/' + encodeURIComponent(name), {
        method: 'DELETE',
      }),
    reorder: (items: Array<{name: string; display_order: number}>) =>
      fetchApi<Room[]>('/rooms/reorder', { method: 'PUT', body: JSON.stringify(items) }),
  },
  scenes: {
    getAll: () => fetchApi<Scene[]>('/scenes'),
    get: (name: string) =>
      fetchApi<Scene>('/scenes/' + encodeURIComponent(name)),
    create: (data: Partial<Scene>) =>
      fetchApi<Scene>('/scenes', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (name: string, data: Partial<Scene>) =>
      fetchApi<Scene>('/scenes/' + encodeURIComponent(name), {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (name: string) =>
      fetchApi<unknown>('/scenes/' + encodeURIComponent(name), {
        method: 'DELETE',
      }),
    activate: (name: string) =>
      fetchApi<unknown>(
        '/scenes/' + encodeURIComponent(name) + '/activate',
        { method: 'POST' },
      ),
    deactivate: (name: string) =>
      fetchApi<unknown>(
        '/scenes/' + encodeURIComponent(name) + '/deactivate',
        { method: 'POST' },
      ),
    reorder: (scenes: string[]) =>
      fetchApi<Scene[]>('/scenes/reorder', {
        method: 'PUT',
        body: JSON.stringify({ scenes }),
      }),
    getActivity: (name: string, limit = 20) =>
      fetchApi<UserAction[]>('/scenes/' + encodeURIComponent(name) + '/activity?limit=' + limit),
  },
  userActions: {
    get: (params?: { entity_type?: string; entity_id?: string; user_id?: string; limit?: number }) => {
      const q = new URLSearchParams()
      if (params?.entity_type) q.set('entity_type', params.entity_type)
      if (params?.entity_id) q.set('entity_id', params.entity_id)
      if (params?.user_id) q.set('user_id', params.user_id)
      if (params?.limit) q.set('limit', String(params.limit))
      return fetchApi<UserAction[]>('/user-actions?' + q.toString())
    },
  },
  lights: {
    getRoomAssignments: () => fetchApi<LightRoom[]>('/lights/rooms'),
    getForRoom: (room: string) =>
      fetchApi<LightRoom[]>('/lights/rooms/' + encodeURIComponent(room)),
    saveForRoom: (room_name: string, lights: LightAssignment[]) =>
      fetchApi<unknown>('/lights/rooms', {
        method: 'POST',
        body: JSON.stringify({ room_name, lights }),
      }),
    removeFromRoom: (room: string) =>
      fetchApi<unknown>('/lights/rooms/' + encodeURIComponent(room), {
        method: 'DELETE',
      }),
  },
  system: {
    getCurrent: () => fetchApi<{ mode: string; all_modes?: string[]; mode_icons?: Record<string, string | null> }>('/system/current'),
    getPreferences: () => fetchApi<Record<string, string>>('/system/preferences'),
    setPreference: (key: string, value: string) =>
      fetchApi<unknown>('/system/preferences', {
        method: 'PUT',
        body: JSON.stringify({ key, value }),
      }),
    setMode: (mode: string) =>
      fetchApi<unknown>('/system/mode', {
        method: 'PUT',
        body: JSON.stringify({ mode }),
      }),
    health: () =>
      fetchApi<{ status: string; uptime: number; db: string; timestamp: string }>(
        '/system/health',
      ),
    getWeather: () =>
      fetchApi<{
        temp: number
        description: string
        icon: string
        humidity: number
        wind_speed: number
      }>('/system/weather'),
    getSunTimes: () => fetchApi<Record<string, string>>('/system/sun'),
    getSunSchedule: () => fetchApi<SunScheduleEntry[]>('/system/sun-schedule'),
    getModes: () => fetchApi<ModeWithTriggers[]>('/system/modes'),
    addMode: (mode: string) =>
      fetchApi<string[]>('/system/modes', {
        method: 'POST',
        body: JSON.stringify({ mode }),
      }),
    reorderModes: (modes: string[]) =>
      fetchApi<{ modes: string[] }>('/system/modes/reorder', {
        method: 'PUT',
        body: JSON.stringify({ modes }),
      }),
    renameMode: (oldName: string, newName: string) =>
      fetchApi<{ name: string; updatedScenes: number }>(
        '/system/modes/' + encodeURIComponent(oldName),
        { method: 'PUT', body: JSON.stringify({ name: newName }) },
      ),
    deleteMode: (mode: string) =>
      fetchApi<{ modes: string[]; affectedScenes: number }>(
        '/system/modes/' + encodeURIComponent(mode),
        { method: 'DELETE' },
      ),
    getModeDependencies: (mode: string) =>
      fetchApi<ModeDependencies>(
        '/system/modes/' + encodeURIComponent(mode) + '/dependencies',
      ),
    addTrigger: (mode: string, trigger: { type: 'sun' | 'time'; sunEvent?: string; time?: string; days?: number[]; priority?: number }) =>
      fetchApi<ModeTrigger>(
        '/system/modes/' + encodeURIComponent(mode) + '/triggers',
        { method: 'POST', body: JSON.stringify(trigger) },
      ),
    updateTrigger: (mode: string, triggerId: number, data: Partial<{ type: 'sun' | 'time'; sunEvent?: string; time?: string; days?: number[]; priority?: number; enabled?: boolean }>) =>
      fetchApi<ModeTrigger>(
        '/system/modes/' + encodeURIComponent(mode) + '/triggers/' + triggerId,
        { method: 'PUT', body: JSON.stringify(data) },
      ),
    deleteTrigger: (mode: string, triggerId: number) =>
      fetchApi<{ success: boolean }>(
        '/system/modes/' + encodeURIComponent(mode) + '/triggers/' + triggerId,
        { method: 'DELETE' },
      ),
    getTimers: () =>
      fetchApi<
        {
          id: string
          sceneName: string
          targetScene: string
          durationMs: number
          startedAt: number
        }[]
      >('/system/timers'),
    cancelTimer: (id: string) =>
      fetchApi<unknown>('/system/timers/cancel/' + encodeURIComponent(id), {
        method: 'POST',
      }),
    cancelAllTimers: () =>
      fetchApi<unknown>('/system/timers/cancel-all', { method: 'POST' }),
    allOff: () => fetchApi<{ success: boolean; actions: string[] }>('/system/all-off', { method: 'POST' }),
    nighttime: () => fetchApi<{ success: boolean; mode: string; excludeRooms: string[]; actions: string[] }>('/system/nighttime', { method: 'POST' }),
    guestNight: () => fetchApi<{ success: boolean; mode: string; excludeRooms: string[]; actions: string[] }>('/system/guest-night', { method: 'POST' }),
    getNightStatus: () => fetchApi<NightStatus>('/system/night/status'),
    unlockNight: () => fetchApi<{ success: boolean }>('/system/night/unlock', { method: 'POST' }),
    activateHushing: () => fetchApi<{ success: boolean; sceneName: string }>('/system/hushing', { method: 'POST' }),
    deactivateHushing: () => fetchApi<{ success: boolean }>('/system/hushing/deactivate', { method: 'POST' }),
    getHushingStatus: () => fetchApi<HushingStatus>('/system/hushing/status'),
    setHushingScene: (scene: string | null) => fetchApi<{ sceneName: string | null }>('/system/hushing/scene', { method: 'PUT', body: JSON.stringify({ scene }) }),
    getMtaStatus: (station?: string, direction?: string, routes?: string) =>
      fetchApi<MtaStatus>(`/system/mta/status?station=${station || '120'}&direction=${direction || 'S'}${routes ? '&routes=' + routes : ''}`),
    getMtaArrivals: (station?: string, direction?: string, routes?: string) =>
      fetchApi<SubwayArrival[]>(`/system/mta/arrivals?station=${station || '120'}&direction=${direction || 'both'}${routes ? '&routes=' + routes : ''}`),
    getMtaStops: (query?: string) =>
      fetchApi<MtaStop[]>('/system/mta/stops' + (query ? '?q=' + encodeURIComponent(query) : '')),
    getMtaConfigured: () =>
      fetchApi<ConfiguredStop[]>('/system/mta/configured'),
    saveMtaConfigured: (stops: ConfiguredStop[]) =>
      fetchApi<unknown>('/system/preferences', {
        method: 'PUT',
        body: JSON.stringify({ key: 'mta_stops', value: JSON.stringify(stops) }),
      }),
    getCombinedMtaStatus: () =>
      fetchApi<CombinedMtaStatus>('/system/mta/combined-status'),
    getMtaIndicator: () =>
      fetchApi<MtaIndicatorConfig>('/system/mta/indicator'),
    saveMtaIndicator: (config: MtaIndicatorConfig) =>
      fetchApi<MtaIndicatorConfig>('/system/mta/indicator', { method: 'PUT', body: JSON.stringify(config) }),
    testMtaIndicator: () =>
      fetchApi<{ status: string; color: string; windowMinutes: number }>('/system/mta/indicator/test', { method: 'POST' }),
    getWeatherIndicator: () =>
      fetchApi<WeatherIndicatorConfig>('/system/weather/indicator'),
    saveWeatherIndicator: (config: WeatherIndicatorConfig) =>
      fetchApi<WeatherIndicatorConfig>('/system/weather/indicator', { method: 'PUT', body: JSON.stringify(config) }),
    testWeatherIndicator: () =>
      fetchApi<{ condition: string; color: string }>('/system/weather/indicator/test', { method: 'POST' }),
    getWeatherColors: () =>
      fetchApi<Record<string, WeatherColorEntry>>('/system/weather/colors'),
    previewWeatherColor: (color: string, brightness?: number) =>
      fetchApi<{ success: boolean }>('/system/weather/preview', { method: 'POST', body: JSON.stringify({ color, brightness }) }),
    getWeatherCustomColors: () =>
      fetchApi<Record<string, { color: string; hex: string }>>('/system/weather/custom-colors'),
    saveWeatherCustomColor: (condition: string, color: string, hex: string) =>
      fetchApi<Record<string, { color: string; hex: string }>>('/system/weather/custom-colors', { method: 'PUT', body: JSON.stringify({ condition, color, hex }) }),
    resetWeatherCustomColors: () =>
      fetchApi<{ success: boolean }>('/system/weather/custom-colors', { method: 'DELETE' }),
    notifications: {
      getAll: (params?: { limit?: number; unreadOnly?: boolean; category?: string }) => {
        const qs = new URLSearchParams()
        if (params?.limit) qs.set('limit', String(params.limit))
        if (params?.unreadOnly) qs.set('unread_only', 'true')
        if (params?.category) qs.set('category', params.category)
        const q = qs.toString()
        return fetchApi<AppNotification[]>('/system/notifications' + (q ? '?' + q : ''))
      },
      getUnreadCount: () => fetchApi<{ count: number }>('/system/notifications/count'),
      markRead: (id: number) =>
        fetchApi<{ success: boolean }>('/system/notifications/' + id + '/read', { method: 'PATCH' }),
      markAllRead: () =>
        fetchApi<{ success: boolean }>('/system/notifications/read-all', { method: 'POST' }),
      dismiss: (id: number) =>
        fetchApi<{ success: boolean }>('/system/notifications/' + id + '/dismiss', { method: 'POST' }),
      dismissAll: () =>
        fetchApi<{ success: boolean }>('/system/notifications/dismiss-all', { method: 'POST' }),
    },
    getLogs: (limit?: number, category?: string) => {
      const params = new URLSearchParams()
      if (limit) params.set('limit', String(limit))
      if (category) params.set('category', category)
      const qs = params.toString()
      return fetchApi<
        {
          id: number
          parent_id: number | null
          seq: number
          message: string
          debug: string | null
          category: string | null
          user_id: string | null
          user_name: string | null
          created_at: string
        }[]
      >('/system/logs' + (qs ? '?' + qs : ''))
    },
    getActivity: (limit?: number, before?: number, category?: string, room?: string) => {
      const params = new URLSearchParams()
      if (limit) params.set('limit', String(limit))
      if (before) params.set('before', String(before))
      if (category) params.set('category', category)
      if (room) params.set('room', room)
      const qs = params.toString()
      return fetchApi<
        {
          id: number
          message: string
          type: string
          room: string | null
          user: string | null
          isFairyQueen: boolean
          timestamp: string
          category: string | null
          childCount: number
          children: {
            id: number
            message: string
            debug: string | null
            category: string | null
            created_at: string
          }[]
        }[]
      >('/system/activity' + (qs ? '?' + qs : ''))
    },
  },
  devices: {
    getDeactivated: () => fetchApi<DeactivatedDevice[]>('/system/devices/deactivated'),
    getHealth: (type: string, id: string) =>
      fetchApi<DeviceHealth | null>('/system/devices/' + encodeURIComponent(type) + '/' + encodeURIComponent(id) + '/health'),
    deactivate: (type: string, id: string) =>
      fetchApi<{ success: boolean }>('/system/devices/' + encodeURIComponent(type) + '/' + encodeURIComponent(id) + '/deactivate', { method: 'POST' }),
    reactivate: (type: string, id: string) =>
      fetchApi<{ success: boolean }>('/system/devices/' + encodeURIComponent(type) + '/' + encodeURIComponent(id) + '/reactivate', { method: 'POST' }),
    checkConnectivity: (type: string, id: string) =>
      fetchApi<{ success: boolean; online: boolean; message: string }>('/system/devices/' + encodeURIComponent(type) + '/' + encodeURIComponent(id) + '/check', { method: 'POST' }),
  },
  dashboard: {
    getSummary: () => fetchApi<DashboardSummary>('/dashboard/summary'),
    getHistory: (source: string, sourceId: string, period?: string) =>
      fetchApi<HistoryResponse>(
        '/dashboard/history/' +
          encodeURIComponent(source) +
          '/' +
          encodeURIComponent(sourceId) +
          (period ? '?period=' + period : ''),
      ),
    getStats: () => fetchApi<DashboardStats>('/dashboard/stats'),
    deleteHistory: (options: { all?: boolean; olderThan?: string; source?: string }) =>
      fetchApi<{ deleted: number }>('/dashboard/history', {
        method: 'DELETE',
        body: JSON.stringify(options),
      }),
    getDeviceContext: (deviceId: string) =>
      fetchApi<DeviceContext>('/dashboard/device/' + encodeURIComponent(deviceId) + '/context'),
    getDeviceInsights: (deviceId: string) =>
      fetchApi<DeviceInsightsData>('/dashboard/device/' + encodeURIComponent(deviceId) + '/insights'),
    getRoomInsights: (roomName: string) =>
      fetchApi<RoomIntelligenceData>('/dashboard/room/' + encodeURIComponent(roomName)),
  },
  hubitat: {
    getDevices: () => fetchApi<HubDevice[]>('/hubitat/devices'),
    syncDevices: () => fetchApi<unknown>('/hubitat/devices/sync', { method: 'POST' }),
    getDeviceRooms: () => fetchApi<DeviceRoomAssignment[]>('/hubitat/device-rooms'),
    getDevicesForRoom: (room: string) =>
      fetchApi<DeviceRoomAssignment[]>(
        '/hubitat/device-rooms/' + encodeURIComponent(room),
      ),
    assignDevice: (data: {
      device_id: string
      device_label: string
      device_type: string
      room_name: string
      config?: Record<string, unknown>
    }) =>
      fetchApi<unknown>('/hubitat/device-rooms', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    sendCommand: (deviceId: string, command: string, value?: string | number) =>
      fetchApi<unknown>(`/hubitat/devices/${encodeURIComponent(deviceId)}/command`, {
        method: 'POST',
        body: JSON.stringify({ command, value }),
      }),
    unassignDevice: (deviceId: string, roomName: string) =>
      fetchApi<unknown>(
        '/hubitat/device-rooms/' +
          encodeURIComponent(deviceId) +
          '/' +
          encodeURIComponent(roomName),
        { method: 'DELETE' },
      ),
    updateDeviceConfig: (deviceId: string, roomName: string, config: Record<string, unknown>) =>
      fetchApi<DeviceRoomAssignment>(
        '/hubitat/device-rooms/' +
          encodeURIComponent(deviceId) +
          '/' +
          encodeURIComponent(roomName) +
          '/config',
        { method: 'PATCH', body: JSON.stringify({ config }) },
      ),
    updateDeviceLevelConfig: (deviceId: string, config: Record<string, unknown>) =>
      fetchApi<{ id: number; config: Record<string, unknown> }>(
        '/hubitat/devices/' + encodeURIComponent(deviceId) + '/config',
        { method: 'PATCH', body: JSON.stringify({ config }) },
      ),
  },
  kasa: {
    getDevices: () => fetchApi<KasaDevice[]>('/kasa/devices'),
    getDevice: (id: string) => fetchApi<KasaDevice>('/kasa/devices/' + encodeURIComponent(id)),
    sendCommand: (id: string, command: string, value?: number) =>
      fetchApi<{ success: boolean }>('/kasa/devices/' + encodeURIComponent(id) + '/command', {
        method: 'POST',
        body: JSON.stringify({ command, value }),
      }),
    discover: () => fetchApi<{ discovered: number; total: number }>('/kasa/discover', { method: 'POST' }),
    getDailyStats: (id: string, year?: number, month?: number) => {
      const params = new URLSearchParams()
      if (year) params.set('year', String(year))
      if (month) params.set('month', String(month))
      const qs = params.toString()
      return fetchApi<KasaDailyStats>('/kasa/devices/' + encodeURIComponent(id) + '/energy/daily' + (qs ? '?' + qs : ''))
    },
    getMonthlyStats: (id: string, year?: number) => {
      const params = new URLSearchParams()
      if (year) params.set('year', String(year))
      const qs = params.toString()
      return fetchApi<KasaMonthlyStats>('/kasa/devices/' + encodeURIComponent(id) + '/energy/monthly' + (qs ? '?' + qs : ''))
    },
    renameDevice: (id: string, label: string) =>
      fetchApi<KasaDevice>('/kasa/devices/' + encodeURIComponent(id) + '/label', {
        method: 'POST',
        body: JSON.stringify({ label }),
      }),
    updateConfig: (id: string, config: Record<string, unknown>) =>
      fetchApi<KasaDevice>('/kasa/devices/' + encodeURIComponent(id) + '/config', {
        method: 'PATCH',
        body: JSON.stringify({ config }),
      }),
    health: () => fetchApi<KasaHealth>('/kasa/health'),
  },

  sonos: {
    getZones: () => fetchApi<SonosZone[]>('/sonos/zones'),
    getState: (speaker: string) => fetchApi<SonosPlaybackState>('/sonos/state/' + encodeURIComponent(speaker)),
    getFavourites: () => fetchApi<SonosFavourite[]>('/sonos/favourites'),
    getServices: () => fetchApi<string[]>('/sonos/services'),
    getFollowMeStatus: () => fetchApi<FollowMeStatus>('/sonos/follow-me/status'),
    toggleFollowMe: (enabled: boolean) =>
      fetchApi<{ enabled: boolean }>('/sonos/follow-me/toggle', {
        method: 'POST',
        body: JSON.stringify({ enabled }),
      }),
    getSpeakers: () => fetchApi<SonosSpeakerMapping[]>('/sonos/speakers'),
    getSpeakersWithRooms: () => fetchApi<SonosSpeakerWithRoom[]>('/sonos/speakers-with-rooms'),
    setSpeaker: (data: { room_name: string; speaker_name: string; favourite?: string | null; default_volume?: number }) =>
      fetchApi<SonosSpeakerMapping>('/sonos/speakers', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateSpeaker: (room: string, data: { favourite?: string | null; default_volume?: number }) =>
      fetchApi<SonosSpeakerMapping>('/sonos/speakers/' + encodeURIComponent(room), {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    removeSpeaker: (room: string) =>
      fetchApi<{ deleted: boolean }>('/sonos/speakers/' + encodeURIComponent(room), { method: 'DELETE' }),
    getAutoPlayRules: () => fetchApi<AutoPlayRule[]>('/sonos/auto-play'),
    createAutoPlayRule: (data: Omit<AutoPlayRule, 'id'>) =>
      fetchApi<AutoPlayRule>('/sonos/auto-play', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateAutoPlayRule: (id: number, data: Partial<AutoPlayRule>) =>
      fetchApi<AutoPlayRule>('/sonos/auto-play/' + id, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    deleteAutoPlayRule: (id: number) =>
      fetchApi<{ deleted: boolean }>('/sonos/auto-play/' + id, { method: 'DELETE' }),
    resolvePodcast: (favouriteName: string) =>
      fetchApi<{ isPodcast: boolean; feedUrl: string | null }>('/sonos/auto-play/resolve-podcast', {
        method: 'POST',
        body: JSON.stringify({ favourite_name: favouriteName }),
      }),
    play: (speaker: string) =>
      fetchApi<{ speaker: string; action: string }>('/sonos/play/' + encodeURIComponent(speaker), {
        method: 'POST',
      }),
    pause: (speaker: string) =>
      fetchApi<{ speaker: string; action: string }>('/sonos/pause/' + encodeURIComponent(speaker), {
        method: 'POST',
      }),
    next: (speaker: string) =>
      fetchApi<{ speaker: string; action: string }>('/sonos/next/' + encodeURIComponent(speaker), {
        method: 'POST',
      }),
    previous: (speaker: string) =>
      fetchApi<{ speaker: string; action: string }>('/sonos/previous/' + encodeURIComponent(speaker), {
        method: 'POST',
      }),
    joinGroup: (speaker: string, target: string) =>
      fetchApi<{ speaker: string; target: string; action: string }>(
        '/sonos/group/' + encodeURIComponent(speaker) + '/join/' + encodeURIComponent(target),
        { method: 'POST' },
      ),
    leaveGroup: (speaker: string) =>
      fetchApi<{ speaker: string; action: string }>(
        '/sonos/group/' + encodeURIComponent(speaker) + '/leave',
        { method: 'POST' },
      ),
    playFavourite: (speaker: string, name: string) =>
      fetchApi<{ speaker: string; favourite: string }>('/sonos/play-favourite/' + encodeURIComponent(speaker), {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    playAll: () =>
      fetchApi<{ action: string; affectedSpeakers: number }>('/sonos/play-all', { method: 'POST' }),
    pauseAll: () =>
      fetchApi<{ action: string; affectedSpeakers: number }>('/sonos/pause-all', { method: 'POST' }),
    getNowPlaying: () => fetchApi<SonosNowPlayingEntry[]>('/sonos/now-playing'),
    setVolume: (speaker: string, level: number) =>
      fetchApi<{ speaker: string; volume: number }>('/sonos/volume/' + encodeURIComponent(speaker), {
        method: 'PUT',
        body: JSON.stringify({ level }),
      }),
    setGroupVolume: (speaker: string, level: number) =>
      fetchApi<{ speaker: string; groupVolume: number }>('/sonos/group-volume/' + encodeURIComponent(speaker), {
        method: 'PUT',
        body: JSON.stringify({ level }),
      }),
    setMute: (speaker: string, muted: boolean) =>
      fetchApi<{ speaker: string; muted: boolean }>('/sonos/mute/' + encodeURIComponent(speaker), {
        method: 'PUT',
        body: JSON.stringify({ muted }),
      }),
    muteAll: (muted: boolean) =>
      fetchApi<{ muted: boolean; affectedSpeakers: number }>('/sonos/mute-all', {
        method: 'PUT',
        body: JSON.stringify({ muted }),
      }),
    getMuteStatus: () =>
      fetchApi<{ allMuted: boolean; mutedCount: number; totalSpeakers: number }>('/sonos/mute-status'),
    getPlayStatus: () =>
      fetchApi<{ anyPlaying: boolean; allPlaying: boolean; playingCount: number; totalSpeakers: number }>('/sonos/play-status'),
    health: () => fetchApi<{ available: boolean }>('/sonos/health'),
    getLibraryGenres: () =>
      fetchApi<SonosGenre[]>('/sonos/library/genres'),
    getGenreAlbums: (genre: string) =>
      fetchApi<SonosGenreAlbum[]>('/sonos/library/genre/' + encodeURIComponent(genre)),
    getGenreAlbumTracks: (objectId: string) =>
      fetchApi<SonosLibraryTrack[]>('/sonos/library/genre-album-tracks?objectId=' + encodeURIComponent(objectId)),
    getLibraryStatus: () =>
      fetchApi<SonosLibraryStatus>('/sonos/library/status'),
    reloadLibrary: () =>
      fetchApi<{ loaded: boolean }>('/sonos/library/reload', { method: 'POST' }),
    getLibraryArtists: () =>
      fetchApi<SonosLibraryArtist[]>('/sonos/library/artists'),
    getLibraryAlbums: () =>
      fetchApi<SonosGenreAlbum[]>('/sonos/library/albums'),
    getArtistTracks: (name: string) =>
      fetchApi<SonosLibraryTrack[]>('/sonos/library/artist/' + encodeURIComponent(name)),
    getAlbumTracks: (objectId: string) =>
      fetchApi<SonosLibraryTrack[]>('/sonos/library/album-tracks?objectId=' + encodeURIComponent(objectId)),
    getLibrarySongs: () =>
      fetchApi<SonosLibraryTrack[]>('/sonos/library/songs'),
    searchLibrary: (query: string) =>
      fetchApi<SonosLibrarySearchResult>('/sonos/library/search?q=' + encodeURIComponent(query)),
    // NAS artist country enrichment
    enrichNasArtists: () =>
      fetchApi<{ status: string; total: number }>('/sonos/library/enrich-artists', { method: 'POST' }),
    getNasEnrichmentStatus: () =>
      fetchApi<EnrichmentProgress>('/sonos/library/enrichment-status'),
    cancelNasEnrichment: () =>
      fetchApi<{ ok: boolean }>('/sonos/library/enrich-artists/cancel', { method: 'POST' }),
    getEnrichedNasAlbums: () =>
      fetchApi<{ items: NasEnrichedAlbum[]; total: number; cached_artists: number; uncached_artists: number }>('/sonos/library/albums/enriched'),
    getEnrichedNasArtists: () =>
      fetchApi<{ items: NasEnrichedArtist[]; total: number }>('/sonos/library/artists/enriched'),
    getRadioStations: () =>
      fetchApi<SonosRadioStation[]>('/sonos/radio/stations'),
    getQueue: (speaker: string) =>
      fetchApi<SonosQueueItem[]>(`/sonos/queue/${encodeURIComponent(speaker)}`),
    addToQueue: (speaker: string, uri: string) =>
      fetchApi<void>(`/sonos/queue/${encodeURIComponent(speaker)}/add`, {
        method: 'POST',
        body: JSON.stringify({ uri }),
      }),
    playNext: (speaker: string, uri: string) =>
      fetchApi<void>(`/sonos/queue/${encodeURIComponent(speaker)}/playnext`, {
        method: 'POST',
        body: JSON.stringify({ uri }),
      }),
    removeFromQueue: (speaker: string, index: number) =>
      fetchApi<void>(`/sonos/queue/${encodeURIComponent(speaker)}/remove/${index}`, {
        method: 'DELETE',
      }),
    reorderQueue: (speaker: string, from: number, to: number) =>
      fetchApi<void>(`/sonos/queue/${encodeURIComponent(speaker)}/reorder`, {
        method: 'POST',
        body: JSON.stringify({ from, to }),
      }),
    clearQueue: (speaker: string) =>
      fetchApi<void>(`/sonos/queue/${encodeURIComponent(speaker)}/clear`, {
        method: 'DELETE',
      }),
    restoreQueue: (speaker: string, uris: string[]) =>
      fetchApi<{ added: number; failedCount: number }>(
        `/sonos/queue/${encodeURIComponent(speaker)}/restore`,
        {
          method: 'POST',
          body: JSON.stringify({ uris }),
        },
      ),
    seekToTrack: (speaker: string, trackNumber: number) =>
      fetchApi<void>(`/sonos/queue/${encodeURIComponent(speaker)}/seek/${trackNumber}`, {
        method: 'POST',
      }),
    saveQueueAsFairylist: (speaker: string, fairylistId: number) =>
      fetchApi<void>(`/sonos/queue/${encodeURIComponent(speaker)}/save-as-fairylist`, {
        method: 'POST',
        body: JSON.stringify({ fairylistId }),
      }),
    playUri: (speaker: string, uri: string) =>
      fetchApi<{ speaker: string; uri: string }>(
        `/sonos/play-uri/${encodeURIComponent(speaker)}`,
        {
          method: 'PUT',
          body: JSON.stringify({ uri }),
        },
      ),
    playSpotify: (speaker: string, uri: string, action?: 'now' | 'queue' | 'next') =>
      fetchApi<{ speaker: string; uri: string; action: string }>(
        `/sonos/play-spotify/${encodeURIComponent(speaker)}`,
        {
          method: 'POST',
          body: JSON.stringify({ uri, action }),
        },
      ),
    shuffle: (speaker: string, enabled: boolean) =>
      fetchApi<void>(`/sonos/shuffle/${encodeURIComponent(speaker)}`, {
        method: 'POST',
        body: JSON.stringify({ enabled }),
      }),
    repeat: (speaker: string, enabled: boolean, mode?: 'off' | 'all' | 'one') =>
      fetchApi<void>(`/sonos/repeat/${encodeURIComponent(speaker)}`, {
        method: 'POST',
        body: JSON.stringify({ enabled, ...(mode ? { mode } : {}) }),
      }),
    seek: (speaker: string, seconds: number) =>
      fetchApi<void>(`/sonos/seek/${encodeURIComponent(speaker)}`, {
        method: 'POST',
        body: JSON.stringify({ seconds }),
      }),
    addAlbumToQueue: (speaker: string, uri: string, source: 'spotify' | 'nas') =>
      fetchApi<{ speaker: string; action: string }>(
        `/sonos/queue/${encodeURIComponent(speaker)}/add-album`,
        {
          method: 'POST',
          body: JSON.stringify({ uri, source }),
        },
      ),
    playAlbumNext: (speaker: string, uri: string, source: 'spotify' | 'nas') =>
      fetchApi<{ speaker: string; action: string }>(
        `/sonos/queue/${encodeURIComponent(speaker)}/playnext-album`,
        {
          method: 'POST',
          body: JSON.stringify({ uri, source }),
        },
      ),
  },

  deviceLinks: {
    list: () => fetchApi<DeviceLink[]>('/device-links'),
    getForDevice: (type: string, id: string) =>
      fetchApi<DeviceLink[]>(`/device-links/${encodeURIComponent(type)}/${encodeURIComponent(id)}`),
    create: (data: {
      source_type: string
      source_id: string
      target_type: string
      target_id: string
      link_type?: string
    }) =>
      fetchApi<DeviceLink>('/device-links', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    delete: (id: number) =>
      fetchApi<{ deleted: boolean }>(`/device-links/${id}`, { method: 'DELETE' }),
  },

  spotify: {
    getStatus: () => fetchApi<SpotifyStatus>('/spotify/status'),
    disconnect: () => fetchApi<{ ok: boolean }>('/spotify/disconnect', { method: 'POST' }),
    getPlaylists: (limit?: number, offset?: number) => {
      const params = new URLSearchParams()
      if (limit !== undefined) params.set('limit', String(limit))
      if (offset !== undefined) params.set('offset', String(offset))
      const qs = params.toString()
      return fetchApi<{ items: SpotifyPlaylist[]; total: number; next: string | null }>(
        '/spotify/playlists' + (qs ? '?' + qs : ''),
      )
    },
    getPlaylistTracks: (id: string, limit?: number, offset?: number) => {
      const params = new URLSearchParams()
      if (limit !== undefined) params.set('limit', String(limit))
      if (offset !== undefined) params.set('offset', String(offset))
      const qs = params.toString()
      return fetchApi<{ items: SpotifyPlaylistTrackItem[]; total: number; next: string | null }>(
        '/spotify/playlists/' + encodeURIComponent(id) + '/tracks' + (qs ? '?' + qs : ''),
      )
    },
    getPlaylistMetadata: (id: string) =>
      fetchApi<SpotifyPlaylistMetadata>(
        '/spotify/playlists/' + encodeURIComponent(id) + '/metadata',
      ),
    getPinnedPlaylists: () => fetchApi<SpotifyPinnedPlaylist[]>('/spotify/pinned'),
    pinPlaylist: (input: string) =>
      fetchApi<SpotifyPinnedPlaylist>('/spotify/pinned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      }),
    unpinPlaylist: (playlistId: string) =>
      fetchApi<void>('/spotify/pinned/' + encodeURIComponent(playlistId), {
        method: 'DELETE',
      }),
    search: (q: string, types?: string[], limit?: number, offset?: number) => {
      const params = new URLSearchParams()
      params.set('q', q)
      if (types?.length) params.set('types', types.join(','))
      if (limit !== undefined) params.set('limit', String(limit))
      if (offset !== undefined) params.set('offset', String(offset))
      return fetchApi<SpotifySearchResult>('/spotify/search?' + params.toString())
    },
    getSavedAlbums: (limit?: number, offset?: number) => {
      const params = new URLSearchParams()
      if (limit !== undefined) params.set('limit', String(limit))
      if (offset !== undefined) params.set('offset', String(offset))
      const qs = params.toString()
      return fetchApi<{ items: Array<{ added_at: string; album: SpotifyAlbum }>; total: number; next: string | null }>(
        '/spotify/albums' + (qs ? '?' + qs : ''),
      )
    },
    getAlbumTracks: (id: string, limit?: number, offset?: number) => {
      const params = new URLSearchParams()
      if (limit !== undefined) params.set('limit', String(limit))
      if (offset !== undefined) params.set('offset', String(offset))
      const qs = params.toString()
      return fetchApi<{ items: SpotifyAlbumTrack[]; total: number; next: string | null }>(
        '/spotify/albums/' + encodeURIComponent(id) + '/tracks' + (qs ? '?' + qs : ''),
      )
    },
    getSavedShows: (limit?: number, offset?: number) => {
      const params = new URLSearchParams()
      if (limit !== undefined) params.set('limit', String(limit))
      if (offset !== undefined) params.set('offset', String(offset))
      const qs = params.toString()
      return fetchApi<{ items: Array<{ added_at: string; show: SpotifyShow }>; total: number; next: string | null }>(
        '/spotify/shows' + (qs ? '?' + qs : ''),
      )
    },
    getShowEpisodes: (id: string, limit?: number, offset?: number) => {
      const params = new URLSearchParams()
      if (limit !== undefined) params.set('limit', String(limit))
      if (offset !== undefined) params.set('offset', String(offset))
      const qs = params.toString()
      return fetchApi<{ items: SpotifyEpisode[]; total: number; next: string | null }>(
        '/spotify/shows/' + encodeURIComponent(id) + '/episodes' + (qs ? '?' + qs : ''),
      )
    },
    getSavedTracks: (limit?: number, offset?: number) => {
      const params = new URLSearchParams()
      if (limit !== undefined) params.set('limit', String(limit))
      if (offset !== undefined) params.set('offset', String(offset))
      const qs = params.toString()
      return fetchApi<{ items: Array<{ added_at: string; track: SpotifyTrack }>; total: number; next: string | null }>(
        '/spotify/tracks' + (qs ? '?' + qs : ''),
      )
    },
    getArtists: (limit?: number, offset?: number) => {
      const params = new URLSearchParams()
      if (limit !== undefined) params.set('limit', String(limit))
      if (offset !== undefined) params.set('offset', String(offset))
      const qs = params.toString()
      return fetchApi<{ items: SpotifyArtist[]; total: number; scope_warning?: string }>(
        '/spotify/artists' + (qs ? '?' + qs : ''),
      )
    },
    getArtist: (id: string) =>
      fetchApi<SpotifyArtist>('/spotify/artists/' + encodeURIComponent(id)),
    getArtistAlbums: (id: string, limit?: number, offset?: number) => {
      const params = new URLSearchParams()
      if (limit !== undefined) params.set('limit', String(limit))
      if (offset !== undefined) params.set('offset', String(offset))
      const qs = params.toString()
      return fetchApi<{ items: SpotifyAlbum[]; total: number; next: string | null }>(
        '/spotify/artists/' + encodeURIComponent(id) + '/albums' + (qs ? '?' + qs : ''),
      )
    },
    // Artist country enrichment
    enrichArtists: (artistIds?: Array<{ id: string; name: string }>) =>
      fetchApi<{ status: string; total: number }>('/spotify/enrich-artists', {
        method: 'POST',
        body: JSON.stringify(artistIds ? { artist_ids: artistIds } : {}),
      }),
    getEnrichmentStatus: () =>
      fetchApi<EnrichmentProgress>('/spotify/enrichment-status'),
    cancelEnrichment: () =>
      fetchApi<{ ok: boolean }>('/spotify/enrich-artists/cancel', { method: 'POST' }),
    backfillImages: () =>
      fetchApi<{ spotify: { updated: number; total: number }; nas: { updated: number; total: number }; total_updated: number }>('/spotify/backfill-images', {
        method: 'POST',
      }),
    getArtistCountries: () =>
      fetchApi<{ items: ArtistCountry[]; total: number }>('/spotify/artist-countries'),
    getArtistCountry: (id: string) =>
      fetchApi<ArtistCountry>('/spotify/artist-countries/' + encodeURIComponent(id)),
    updateArtistCountry: (id: string, data: { country_code: string; country_name: string; sub_region?: string; artist_name?: string }) =>
      fetchApi<ArtistCountry>('/spotify/artist-countries/' + encodeURIComponent(id), {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    getEnrichedAlbums: (limit?: number, offset?: number) => {
      const params = new URLSearchParams()
      if (limit !== undefined) params.set('limit', String(limit))
      if (offset !== undefined) params.set('offset', String(offset))
      const qs = params.toString()
      return fetchApi<{ items: EnrichedAlbumItem[]; total: number; next: string | null; cached_artists: number; uncached_artists: number }>(
        '/spotify/albums/enriched' + (qs ? '?' + qs : ''),
      )
    },
    addToPlaylist: (playlistId: string, uri: string) =>
      fetchApi<unknown>('/spotify/playlists/' + playlistId + '/tracks', { method: 'POST', body: JSON.stringify({ uri }) }),
    createPlaylist: (name: string) =>
      fetchApi<{ id: string; name: string; tracks: { total: number } }>('/spotify/playlists', { method: 'POST', body: JSON.stringify({ name }) }),
  },

  fairylists: {
    list: () => fetchApi<Fairylist[]>('/fairylists'),
    get: (id: number) => fetchApi<{ fairylist: Fairylist; items: FairylistItem[] }>('/fairylists/' + id),
    create: (name: string) => fetchApi<Fairylist>('/fairylists', { method: 'POST', body: JSON.stringify({ name }) }),
    rename: (id: number, name: string) => fetchApi<Fairylist>('/fairylists/' + id, { method: 'PUT', body: JSON.stringify({ name }) }),
    remove: (id: number) => fetchApi<unknown>('/fairylists/' + id, { method: 'DELETE' }),
    addItem: (id: number, data: AddFairylistItemInput) => fetchApi<FairylistItem>('/fairylists/' + id + '/items', { method: 'POST', body: JSON.stringify(data) }),
    removeItem: (fairylistId: number, itemId: number) => fetchApi<unknown>('/fairylists/' + fairylistId + '/items/' + itemId, { method: 'DELETE' }),
    reorder: (id: number, ids: number[]) => fetchApi<unknown>('/fairylists/' + id + '/items/reorder', { method: 'PUT', body: JSON.stringify({ ids }) }),
    play: (id: number, speaker: string) => fetchApi<unknown>('/fairylists/' + id + '/play/' + encodeURIComponent(speaker), { method: 'POST' }),
  },

  favourites: {
    list: () => fetchApi<UserFavourite[]>('/favourites'),
    add: (data: AddFavouriteInput) =>
      fetchApi<UserFavourite>('/favourites', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    remove: (id: number) =>
      fetchApi<void>(`/favourites/${id}`, { method: 'DELETE' }),
    reorder: (ids: number[]) =>
      fetchApi<{ success: boolean }>('/favourites/reorder', {
        method: 'PUT',
        body: JSON.stringify({ ids }),
      }),
  },

  accessLinks: {
    list: () => fetchApi<AccessLink[]>('/access-links'),
    create: (data: CreateAccessLinkInput) =>
      fetchApi<AccessLinkCreated>('/access-links', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    revoke: (id: string) =>
      fetchApi<void>(`/access-links/${id}`, { method: 'DELETE' }),
    verify: (token: string) =>
      fetchApi<AccessLinkVerifyResult>(`/invite/${token}/verify`),
    redeem: (token: string, body?: { name: string; email: string; password: string }) =>
      fetchApi<AccessLinkRedeemResult>(`/invite/${token}/redeem`, {
        method: 'POST',
        body: JSON.stringify(body ?? {}),
      }),
  },

}
