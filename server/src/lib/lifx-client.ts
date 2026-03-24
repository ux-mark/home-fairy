import axios, { AxiosResponse } from 'axios'

const lifxApi = axios.create({
  baseURL: 'https://api.lifx.com/v1',
  timeout: 10000,
  headers: { Authorization: `Bearer ${process.env.LIFX_TOKEN}` },
})

// ── Rate limit tracking ───────────────────────────────────────────────────────

interface RateLimitStatus {
  remaining: number | null
  resetAt: number | null // unix timestamp in seconds
}

const rateLimit: RateLimitStatus = {
  remaining: null,
  resetAt: null,
}

function trackRateLimit(res: AxiosResponse): void {
  const remaining = res.headers['x-ratelimit-remaining']
  const reset = res.headers['x-ratelimit-reset']
  if (remaining !== undefined) rateLimit.remaining = Number(remaining)
  if (reset !== undefined) rateLimit.resetAt = Number(reset)
}

export function getRateLimitStatus(): RateLimitStatus {
  return { ...rateLimit }
}

// ── Retry-on-429 wrapper ──────────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<AxiosResponse<T>>): Promise<AxiosResponse<T>> {
  try {
    const res = await fn()
    trackRateLimit(res)
    return res
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 429) {
      trackRateLimit(err.response)
      const resetAt = Number(err.response.headers['x-ratelimit-reset'] ?? 0)
      const now = Math.floor(Date.now() / 1000)
      const waitMs = Math.max((resetAt - now) * 1000, 1000)
      await new Promise((resolve) => setTimeout(resolve, waitMs))
      const retryRes = await fn()
      trackRateLimit(retryRes)
      return retryRes
    }
    throw err
  }
}

// ── State types ───────────────────────────────────────────────────────────────

export interface SetStatesResultItem {
  id: string
  status: 'ok' | 'timed_out' | 'offline'
  label: string
}

export interface SetStatesOperationResult {
  operation?: Record<string, unknown>
  results?: SetStatesResultItem[]
}

export interface SetStatesResponse {
  results: SetStatesOperationResult[]
}

export interface BatchState {
  selector: string
  power?: string
  color?: string
  brightness?: number
  duration?: number
}

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

// ── Client ────────────────────────────────────────────────────────────────────

export const lifxClient = {
  listAll: () =>
    withRetry(() => lifxApi.get('/lights/all')).then((r) => r.data),

  listBySelector: (sel: string) =>
    withRetry(() => lifxApi.get(`/lights/${sel}`)).then((r) => r.data),

  setState: (sel: string, state: object) =>
    withRetry(() => lifxApi.put(`/lights/${sel}/state`, state)).then((r) => r.data),

  toggle: (sel: string, duration = 1) =>
    withRetry(() => lifxApi.post(`/lights/${sel}/toggle`, { duration })).then((r) => r.data),

  identify: (sel: string) =>
    withRetry(() =>
      lifxApi.post(`/lights/${sel}/effects/breathe`, {
        color: 'cyan',
        period: 1,
        cycles: 3,
        power_on: true,
      }),
    ).then((r) => r.data),

  listScenes: () =>
    withRetry(() => lifxApi.get('/scenes')).then((r) => r.data),

  activateScene: (uuid: string, duration = 1) =>
    withRetry(() =>
      lifxApi.put(`/scenes/scene_id:${uuid}/activate`, { duration }),
    ).then((r) => r.data),

  // ── Batch setState (up to 50 lights in one call) ──────────────────────────

  setStates: (
    states: BatchState[],
    defaults?: object,
  ) =>
    withRetry(() =>
      lifxApi.put('/lights/states', { states, defaults }),
    ).then((r) => r.data as SetStatesResponse),

  // ── Effects ───────────────────────────────────────────────────────────────

  breathe: (sel: string, params: EffectParams) =>
    withRetry(() =>
      lifxApi.post(`/lights/${sel}/effects/breathe`, params),
    ).then((r) => r.data),

  pulse: (sel: string, params: EffectParams) =>
    withRetry(() =>
      lifxApi.post(`/lights/${sel}/effects/pulse`, params),
    ).then((r) => r.data),

  move: (sel: string, params: EffectParams) =>
    withRetry(() =>
      lifxApi.post(`/lights/${sel}/effects/move`, params),
    ).then((r) => r.data),

  effectsOff: (sel: string) =>
    withRetry(() =>
      lifxApi.post(`/lights/${sel}/effects/off`),
    ).then((r) => r.data),
}
