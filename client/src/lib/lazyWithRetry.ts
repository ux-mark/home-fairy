import { lazy, type ComponentType } from 'react'

const RELOAD_FLAG = 'homefairy:chunk-reload'

function hasReloaded(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_FLAG) === '1'
  } catch {
    return false
  }
}

function markReloaded(): void {
  try {
    sessionStorage.setItem(RELOAD_FLAG, '1')
  } catch {
    // sessionStorage unavailable — fall through; we just won't de-dupe the reload.
  }
}

export function clearChunkReloadFlag(): void {
  try {
    sessionStorage.removeItem(RELOAD_FLAG)
  } catch {
    // ignore
  }
}

function isChunkLoadError(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | null | undefined
  const msg = `${e?.name ?? ''} ${e?.message ?? ''}`.toLowerCase()
  return (
    msg.includes('chunkloaderror') ||
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    msg.includes('error loading dynamically imported module')
  )
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Wraps `React.lazy` with two layers of recovery:
 *
 *   1. Transient network blips — retry the dynamic import up to `retries`
 *      times with a short backoff. Covers flaky Wi-Fi / cold cache cases.
 *
 *   2. Stale service-worker — after all retries fail, once per session,
 *      hard-reload the page with a cache-buster so the app picks up the
 *      current `index.html` and its new chunk hashes. This is the silent
 *      self-heal path for the "deployed a new version while the tab was
 *      open" problem that otherwise manifests as a blank page when a lazy
 *      route tries to import a chunk URL that no longer exists.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  importer: () => Promise<{ default: T }>,
  options: { retries?: number; backoffMs?: number } = {},
): ReturnType<typeof lazy<T>> {
  const { retries = 2, backoffMs = 400 } = options

  return lazy<T>(async () => {
    let lastError: unknown

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await importer()
      } catch (err) {
        lastError = err
        if (!isChunkLoadError(err)) break
        if (attempt < retries) {
          await delay(backoffMs * (attempt + 1))
        }
      }
    }

    // Retries exhausted (or the error wasn't recoverable). If it's a chunk
    // load error and we haven't already reloaded this session, self-heal
    // by reloading once with a cache-buster. We return a never-resolving
    // promise so Suspense keeps the fallback visible while the reload
    // takes effect.
    if (isChunkLoadError(lastError) && !hasReloaded()) {
      markReloaded()
      const url = new URL(window.location.href)
      url.searchParams.set('_r', String(Date.now()))
      window.location.replace(url.toString())
      return new Promise<{ default: T }>(() => {})
    }

    throw lastError as Error
  })
}
