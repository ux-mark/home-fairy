// ── URI normalisation ────────────────────────────────────────────────────────
// Sonos wraps Spotify URIs as "x-sonos-spotify:spotify:track:ABC?sid=…".
// Strip the wrapper and query params so both sides compare the core URI.
export function normalizeUri(uri: string): string {
  let u = uri.split('?')[0]
  // Unwrap x-sonos-spotify: / x-sonos-http: / x-sonos-hls: prefixes
  const wrappedMatch = u.match(/^x-sonos-[^:]+:(.+)/)
  if (wrappedMatch) u = wrappedMatch[1]
  // Unwrap URL-encoded Spotify URIs (e.g. spotify%3atrack%3a...)
  if (u.includes('%3a') || u.includes('%3A')) {
    try { u = decodeURIComponent(u) } catch { /* keep as-is */ }
  }
  return u
}
