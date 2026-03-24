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
  parent_room: string
  auto: boolean
  timer: number
  sensors: Sensor[]
  tags: string[]
  current_scene: string | null
  last_active: string | null
  temperature: number | null
  lux: number | null
}

export interface RoomDetail extends Room {
  lights: LightRoom[]
}

export interface Sensor {
  name: string
  priority_threshold: number
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
  auto_activate?: boolean     // false = manual only, true = motion-triggered + shown on room cards
  last_activated_at?: string | null
}

export interface SceneRoom {
  name: string
  priority: number
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
  id?: string
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
  room_name: string | null
  attributes: Record<string, unknown>
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
  triggers: ModeTrigger[]
  isSleepMode: boolean
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
  id: number
  label: string
  room_name: string | null
  power: number
  energy: number | null
  switch: 'on' | 'off'
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
    id: number; label: string; device_type: string
    power: number; energy: number | null; battery: number | null
  }>
  events24h: number
  hourlyPattern: Array<{ hour: number; count: number }>
  batteryDevices: Array<{
    id: number; label: string; battery: number; status: string
    drainPerDay: number | null; predictedDaysRemaining: number | null
  }>
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
  roomDevices: Array<{ id: number; label: string; device_type: string }>
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
  dailyCostEstimate: number | null
  energyRate: number
  dailyKwhHistory: Array<{ day: string; totalKwh: number }>
  peakHours: Array<{ hour: number; avgWatts: number }>
  deviceAnomalies: Array<{
    deviceId: number
    label: string
    currentWatts: number
    averageWatts: number
    percentAbove: number
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
  category: 'battery' | 'energy' | 'temperature' | 'device_error' | 'scene'
  title: string
  description: string
  deviceId: number | null
  deviceLabel: string | null
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
  lastEvent: string | null
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
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `API error: ${res.status}`)
  }
  return res.json()
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
  rooms: {
    getAll: () => fetchApi<Room[]>('/rooms'),
    get: (name: string) =>
      fetchApi<RoomDetail>('/rooms/' + encodeURIComponent(name)),
    create: (data: Partial<Room>) =>
      fetchApi<Room>('/rooms', { method: 'POST', body: JSON.stringify(data) }),
    update: (name: string, data: Partial<Room>) =>
      fetchApi<Room>('/rooms/' + encodeURIComponent(name), {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (name: string) =>
      fetchApi<unknown>('/rooms/' + encodeURIComponent(name), {
        method: 'DELETE',
      }),
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
    getCurrent: () => fetchApi<{ mode: string; all_modes?: string[] }>('/system/current'),
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
          created_at: string
        }[]
      >('/system/logs' + (qs ? '?' + qs : ''))
    },
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
    syncDevices: () => fetchApi<unknown>('/hubitat/devices/sync'),
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
  },
}
