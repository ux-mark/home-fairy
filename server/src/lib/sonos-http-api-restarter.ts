/**
 * Restart node-sonos-http-api via PM2 when SpeakerRegistry sees a speaker's
 * IP change.
 *
 * Why this exists: node-sonos-http-api (and its underlying sonos-discovery
 * library) cache each player's `baseUrl` at construction time and never
 * refresh it. When a speaker rejoins the network on a new lease — typical
 * for the Sonos Roam, which drops Wi-Fi when sleeping — every subscription
 * gets stuck against the old IP, producing a steady stream of
 * `resubscribing to sid ... failed: ECONNREFUSED` warnings and breaking
 * state / group queries for that speaker until the process restarts.
 *
 * Rate-limited so flapping speakers can't kick off a restart loop (each
 * restart itself drops Sonos control for ~2-3 seconds).
 *
 * Test seam: the `_test` export lets unit tests reset the cooldown and stub
 * the exec call. Production callers use `requestSonosHttpApiRestart`.
 */

import { exec } from 'node:child_process'

const COOLDOWN_MS = 10 * 60 * 1000

type ExecLike = (cmd: string, cb: (err: Error | null, stdout: string, stderr: string) => void) => void

let lastRestartAt = 0
let execImpl: ExecLike = exec as unknown as ExecLike

export function requestSonosHttpApiRestart(reason: string): boolean {
  const now = Date.now()
  const sinceLast = now - lastRestartAt
  if (sinceLast < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - sinceLast) / 1000)
    console.log(`[SonosHttpApiRestart] suppressed (${reason}) — cooldown active, ${wait}s remaining`)
    return false
  }
  lastRestartAt = now
  console.log(`[SonosHttpApiRestart] requesting pm2 restart sonos-http-api — ${reason}`)
  execImpl('pm2 restart sonos-http-api', (err, _stdout, stderr) => {
    if (err) {
      console.warn(`[SonosHttpApiRestart] pm2 restart failed: ${err.message}`)
      if (stderr) console.warn(`[SonosHttpApiRestart] stderr: ${stderr.trim()}`)
      return
    }
    console.log('[SonosHttpApiRestart] pm2 restart completed')
  })
  return true
}

export const _test = {
  reset(): void { lastRestartAt = 0 },
  setExec(fn: ExecLike): void { execImpl = fn },
  restoreExec(): void { execImpl = exec as unknown as ExecLike },
  get lastRestartAt(): number { return lastRestartAt },
  get cooldownMs(): number { return COOLDOWN_MS },
}
