/**
 * Auto-detect location, timezone, and locale from the browser.
 *
 * Timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) and locale
 * (`navigator.language`) always work, no permission needed. Coordinates use
 * `navigator.geolocation.getCurrentPosition`, which needs a secure context
 * (https/localhost) and explicit user permission.
 *
 * Pure function — sets nothing, mutates nothing, just returns what it found
 * plus a human-readable status message the caller can drop into the UI.
 */

export type AutoDetectStatus =
  | 'ok' // all four filled
  | 'partial-no-secure-context'
  | 'partial-permission-denied'
  | 'partial-unavailable'
  | 'partial-no-api'
  | 'failed' // nothing filled

export type AutoDetectResult = {
  timezone: string | null
  locale: string | null
  latitude: number | null
  longitude: number | null
  status: AutoDetectStatus
  message: string
}

const GEO_TIMEOUT_MS = 10_000
const GEO_MAX_AGE_MS = 60_000

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

function detectTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return tz || null
  } catch {
    return null
  }
}

function detectLocale(): string | null {
  try {
    return navigator.language || null
  } catch {
    return null
  }
}

function partialMessage(suffix: string): string {
  return `Filled timezone and language. ${suffix}`
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: GEO_TIMEOUT_MS,
      maximumAge: GEO_MAX_AGE_MS,
    })
  })
}

export async function autoDetectLocation(): Promise<AutoDetectResult> {
  const timezone = detectTimezone()
  const locale = detectLocale()
  const baseFilled = timezone !== null || locale !== null

  // Up-front: no Geolocation API at all (very old browser, headless runner).
  if (typeof navigator === 'undefined' || !('geolocation' in navigator) || !navigator.geolocation) {
    if (!baseFilled) {
      return {
        timezone, locale, latitude: null, longitude: null,
        status: 'failed',
        message: "Couldn't auto-detect. Please enter values manually.",
      }
    }
    return {
      timezone, locale, latitude: null, longitude: null,
      status: 'partial-no-api',
      message: partialMessage("This browser doesn't support coordinate auto-detection."),
    }
  }

  // Up-front: insecure origin — Safari/Chrome both block geolocation on http://.
  // Distinguish from "permission denied" so the user can act on it.
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return {
      timezone, locale, latitude: null, longitude: null,
      status: 'partial-no-secure-context',
      message: partialMessage(
        'Browser geolocation is blocked on insecure (HTTP) origins — visit via https:// to detect coordinates, or enter them manually below.',
      ),
    }
  }

  try {
    const position = await getPosition()
    return {
      timezone,
      locale,
      latitude: round4(position.coords.latitude),
      longitude: round4(position.coords.longitude),
      status: 'ok',
      message: "Filled all four fields. Review and Save when you're happy.",
    }
  } catch (err) {
    // GeolocationPositionError uses numeric codes: 1=denied, 2=unavailable, 3=timeout.
    const code = (err as GeolocationPositionError | undefined)?.code
    if (code === 1) {
      return {
        timezone, locale, latitude: null, longitude: null,
        status: 'partial-permission-denied',
        message: partialMessage('Geolocation was blocked — you can still enter coordinates manually.'),
      }
    }
    // Treat both POSITION_UNAVAILABLE (2) and TIMEOUT (3) — and any synchronous
    // throw that didn't surface a code — as "unavailable".
    return {
      timezone, locale, latitude: null, longitude: null,
      status: 'partial-unavailable',
      message: partialMessage("Couldn't get coordinates — try again or enter manually."),
    }
  }
}
