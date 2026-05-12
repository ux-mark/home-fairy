/**
 * server-url — discover the LAN base URL that other devices on the same
 * network can use to reach this server. The Hubitat hub (and anything else
 * we ask the user to point at us) needs a routable address, not `localhost`.
 *
 * Selection:
 *   1. If FAIRY_PUBLIC_HOST is set, use it verbatim as the host.
 *   2. Else scan `os.networkInterfaces()` for the first IPv4 entry that is
 *      non-loopback, non-internal, and sits in a private RFC-1918 range
 *      (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16).
 *   3. Otherwise return null — the caller surfaces the override hint.
 *
 * Port comes from `process.env.PORT ?? '3001'`, matching `index.ts`.
 *
 * The picker is factored out from the OS call so tests can drive it with a
 * synthetic interface map.
 */
import os from 'node:os'

export interface NetworkInterfaceAddress {
  address: string
  family: 'IPv4' | 'IPv6' | number
  internal: boolean
}

type InterfaceMap = NodeJS.Dict<NetworkInterfaceAddress[] | os.NetworkInterfaceInfo[]>

/**
 * Pure picker: given the same shape `os.networkInterfaces()` returns plus
 * the env vars, work out the base URL string (or null). No OS calls — keep
 * this deterministic for tests.
 */
export function pickLanBaseUrl(
  interfaces: InterfaceMap,
  env: { FAIRY_PUBLIC_HOST?: string; PORT?: string },
): string | null {
  const port = env.PORT && env.PORT !== '' ? env.PORT : '3001'

  const override = env.FAIRY_PUBLIC_HOST
  if (override && override !== '') {
    return `http://${override}:${port}`
  }

  for (const entries of Object.values(interfaces)) {
    if (!entries) continue
    for (const entry of entries as NetworkInterfaceAddress[]) {
      // Node types `family` as `'IPv4' | 'IPv6'` on Node 18+; some legacy
      // shapes use the numeric `4`/`6`. Accept both.
      const family = entry.family
      const isV4 = family === 'IPv4' || (family as unknown) === 4
      if (!isV4) continue
      if (entry.internal) continue
      if (!isPrivateIPv4(entry.address)) continue
      return `http://${entry.address}:${port}`
    }
  }

  return null
}

/**
 * Returns the server's LAN base URL (e.g. "http://192.168.10.201:3001")
 * usable by other devices on the same network. Picks the first private-range
 * IPv4 on a non-loopback, non-internal interface. Returns null if none found.
 *
 * Override with FAIRY_PUBLIC_HOST env var (e.g. "192.168.10.201" or
 * "home.local") if auto-detection picks the wrong interface.
 */
export function getServerLanBaseUrl(): string | null {
  return pickLanBaseUrl(os.networkInterfaces(), {
    FAIRY_PUBLIC_HOST: process.env.FAIRY_PUBLIC_HOST,
    PORT: process.env.PORT,
  })
}

function isPrivateIPv4(address: string): boolean {
  const parts = address.split('.').map((p) => Number(p))
  if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p) || p < 0 || p > 255)) {
    return false
  }
  const [a, b] = parts as [number, number, number, number]
  // 10.0.0.0/8
  if (a === 10) return true
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true
  return false
}
