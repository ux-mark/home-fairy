/**
 * SpeakerRegistry — authoritative source for Sonos speaker (room → IP) lookups.
 *
 * The registry holds a Map<UUID, SpeakerInfo> populated by directly querying each
 * Sonos speaker's `xml/device_description.xml` (port 1400). The IP returned by
 * each speaker is by definition the IP that speaker is bound to right now, so
 * this survives DHCP lease changes.
 *
 * Why not parse `absoluteAlbumArtUri` from node-sonos-http-api's /zones?
 *   - It can return stale IPs that worked when the album art URL was first built
 *     but no longer resolve after DHCP rotation.
 *   - When a speaker plays as part of a group, its absoluteAlbumArtUri can
 *     report the *group coordinator's* IP, not its own. This was the cause of
 *     the speaker-IP corruption bug fixed in PR #188.
 *
 * Discovery strategies (tried in order):
 *   1. SSDP M-SEARCH on 239.255.255.250:1900 — single multicast packet, parse
 *      LOCATION headers, fetch device_description.xml from each responder.
 *      This is what the Sonos mobile app uses.
 *   2. Subnet scan fallback — if SSDP returns nothing in DISCOVERY_TIMEOUT_MS
 *      (some Docker/LXC bridges block multicast), enumerate the host's primary
 *      /24 and HEAD-probe :1400 in parallel. Slower but works on isolated bridges.
 *
 * Refresh policy:
 *   - On startup (non-blocking, retried with backoff)
 *   - Every REFRESH_INTERVAL_MS thereafter
 *   - On demand when a lookup misses or a SOAP call to a cached IP fails
 */

import dgram from 'dgram'
import { networkInterfaces } from 'os'
import axios from 'axios'

const SONOS_HTTP_API_URL = process.env.SONOS_API_URL || 'http://localhost:3003'

export interface SpeakerInfo {
  uuid: string         // RINCON_xxxxxxxxxxxxx01400
  ip: string           // 192.168.x.y
  room: string         // raw roomName from device_description.xml
  model: string        // e.g. "Sonos Beam"
  lastSeen: number     // ms since epoch
}

const SSDP_HOST = '239.255.255.250'
const SSDP_PORT = 1900
const SSDP_ST = 'urn:schemas-upnp-org:device:ZonePlayer:1'
const SSDP_MX = 3  // seconds — what speakers use as their max-response delay

// SSDP M-SEARCH is UDP multicast and packet loss is common, especially across
// bridges. We send 3 search packets at 1s intervals over a 5s collection window
// so that any single dropped packet doesn't blank a speaker from the snapshot.
const DISCOVERY_TIMEOUT_MS = 5_000
const SSDP_RETRANSMIT_COUNT = 3
const SSDP_RETRANSMIT_INTERVAL_MS = 1_000

const REFRESH_INTERVAL_MS = 5 * 60 * 1000   // 5 minutes
const STARTUP_RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000]
const DEVICE_DESCRIPTION_TIMEOUT_MS = 1_500
const SUBNET_SCAN_CONCURRENCY = 32

function normalizeRoomName(name: string): string {
  // Sonos room names can contain typographic apostrophes (Butler's vs Butler\u2019s)
  // and varying whitespace. Normalize for lookup parity.
  return name
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u02bc\u2032]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function parseDeviceDescription(xml: string): { uuid: string; room: string; model: string } | null {
  const uuidMatch = xml.match(/<UDN>uuid:(RINCON_[A-Fa-f0-9]+)<\/UDN>/)
  const roomMatch = xml.match(/<roomName>([^<]+)<\/roomName>/)
  const modelMatch = xml.match(/<modelDescription>([^<]+)<\/modelDescription>/)
  if (!uuidMatch || !roomMatch) return null
  return {
    uuid: uuidMatch[1],
    room: roomMatch[1],
    model: modelMatch?.[1] ?? 'Sonos',
  }
}

async function fetchSpeakerInfo(ip: string): Promise<SpeakerInfo | null> {
  try {
    const { data } = await axios.get<string>(
      `http://${ip}:1400/xml/device_description.xml`,
      { timeout: DEVICE_DESCRIPTION_TIMEOUT_MS, responseType: 'text' },
    )
    const parsed = parseDeviceDescription(typeof data === 'string' ? data : String(data))
    if (!parsed) return null
    return { ...parsed, ip, lastSeen: Date.now() }
  } catch {
    return null
  }
}

/**
 * Send an SSDP M-SEARCH multicast and collect responder LOCATION headers.
 * Resolves with the set of unique LOCATION URLs after DISCOVERY_TIMEOUT_MS.
 */
function ssdpDiscover(): Promise<Set<string>> {
  return new Promise((resolve) => {
    const locations = new Set<string>()
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })

    const finish = (): void => {
      try { socket.close() } catch { /* already closed */ }
      resolve(locations)
    }

    socket.on('message', (msg) => {
      const text = msg.toString('utf8')
      // Only consider responses for the ZonePlayer ST so we don't pick up other UPnP devices
      if (!/ST:\s*urn:schemas-upnp-org:device:ZonePlayer:1/i.test(text)) return
      const locMatch = text.match(/LOCATION:\s*([^\r\n]+)/i)
      if (locMatch) locations.add(locMatch[1].trim())
    })

    socket.on('error', () => finish())

    socket.bind(0, () => {
      try {
        socket.setBroadcast(true)
        socket.setMulticastTTL(2)
      } catch { /* may fail in some sandboxes; carry on */ }

      const msg = Buffer.from(
        'M-SEARCH * HTTP/1.1\r\n' +
        `HOST: ${SSDP_HOST}:${SSDP_PORT}\r\n` +
        'MAN: "ssdp:discover"\r\n' +
        `MX: ${SSDP_MX}\r\n` +
        `ST: ${SSDP_ST}\r\n\r\n`,
      )

      // Send the M-SEARCH multiple times to compensate for UDP packet loss.
      // Sonos speakers will reply to each request, but the dedupe by LOCATION
      // header keeps the result set clean.
      let sent = 0
      const sendOne = (): void => {
        if (sent >= SSDP_RETRANSMIT_COUNT) return
        sent++
        socket.send(msg, 0, msg.length, SSDP_PORT, SSDP_HOST, () => { /* ignore individual errors */ })
        if (sent < SSDP_RETRANSMIT_COUNT) {
          setTimeout(sendOne, SSDP_RETRANSMIT_INTERVAL_MS)
        }
      }
      sendOne()

      setTimeout(finish, DISCOVERY_TIMEOUT_MS)
    })
  })
}

/**
 * Returns the host's primary IPv4 /24 candidates (e.g. 192.168.8.1..254),
 * excluding the host's own address. Picks the first non-internal IPv4 interface.
 */
function getSubnetCandidates(): string[] {
  const ifaces = networkInterfaces()
  for (const [, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue
    for (const a of addrs) {
      if (a.family !== 'IPv4' || a.internal) continue
      const parts = a.address.split('.')
      if (parts.length !== 4) continue
      const prefix = parts.slice(0, 3).join('.')
      const own = Number(parts[3])
      const candidates: string[] = []
      for (let i = 1; i <= 254; i++) {
        if (i !== own) candidates.push(`${prefix}.${i}`)
      }
      return candidates
    }
  }
  return []
}

/**
 * Probe each candidate IP for a Sonos device_description.xml in parallel,
 * bounded by SUBNET_SCAN_CONCURRENCY. Used as the SSDP fallback path.
 */
async function subnetScan(): Promise<SpeakerInfo[]> {
  const candidates = getSubnetCandidates()
  if (candidates.length === 0) return []

  const found: SpeakerInfo[] = []
  let cursor = 0
  const workers = Array.from({ length: SUBNET_SCAN_CONCURRENCY }, async () => {
    while (cursor < candidates.length) {
      const ip = candidates[cursor++]
      const info = await fetchSpeakerInfo(ip)
      if (info) found.push(info)
    }
  })
  await Promise.all(workers)
  return found
}

class SpeakerRegistry {
  private byUuid = new Map<string, SpeakerInfo>()
  private byRoom = new Map<string, string>()  // normalized room name → uuid
  private refreshTimer: NodeJS.Timeout | null = null
  private inFlightRefresh: Promise<void> | null = null
  private lastSuccessfulRefresh = 0
  private startupRetryIndex = 0
  private startupRetryTimer: NodeJS.Timeout | null = null

  /** All known speakers, sorted by room name. Useful for diagnostics. */
  list(): SpeakerInfo[] {
    return Array.from(this.byUuid.values()).sort((a, b) => a.room.localeCompare(b.room))
  }

  getByUuid(uuid: string): SpeakerInfo | null {
    return this.byUuid.get(uuid) ?? null
  }

  getByRoom(roomName: string): SpeakerInfo | null {
    const uuid = this.byRoom.get(normalizeRoomName(roomName))
    return uuid ? (this.byUuid.get(uuid) ?? null) : null
  }

  /**
   * Returns *any* known speaker IP. Used by code paths that need a Sonos
   * endpoint but don't care which one (e.g. the album art proxy, since any
   * speaker can serve any other speaker's /getaa via Rincon routing).
   */
  anyIp(): string | null {
    const first = this.list()[0]
    return first?.ip ?? null
  }

  /** Schedule a one-shot refresh, deduping concurrent callers. */
  refresh(): Promise<void> {
    if (this.inFlightRefresh) return this.inFlightRefresh
    this.inFlightRefresh = this.runRefresh().finally(() => {
      this.inFlightRefresh = null
    })
    return this.inFlightRefresh
  }

  /**
   * Look up the **group coordinator** for a room name. This is the speaker
   * that owns the queue and accepts SOAP queue operations — surround/stereo
   * satellites share the same roomName but cannot accept queue ops directly.
   *
   * Resolution order:
   *   1. Ask the topology source (node-sonos-http-api /zones) for the
   *      coordinator UUID of the matching zone, then look that UUID up in
   *      the registry for its current IP.
   *   2. Fallback to local byRoom map if topology is unavailable (this loses
   *      coordinator-vs-satellite distinction but at least returns *something*
   *      when only one speaker exists for the room).
   *   3. If still missing, force a discovery refresh and retry the topology
   *      lookup once more — handles brand-new speakers whose IPs just changed.
   */
  async resolveByRoom(roomName: string): Promise<SpeakerInfo | null> {
    const target = normalizeRoomName(roomName)

    const fromTopology = async (): Promise<SpeakerInfo | null> => {
      try {
        const { data } = await axios.get<unknown[]>(`${SONOS_HTTP_API_URL}/zones`, { timeout: 3_000 })
        if (!Array.isArray(data)) return null
        for (const zone of data as Array<Record<string, unknown>>) {
          const coord = zone.coordinator as Record<string, unknown> | undefined
          const coordRoom = typeof coord?.roomName === 'string' ? coord.roomName : ''
          const coordUuid = typeof coord?.uuid === 'string' ? coord.uuid : ''
          if (!coordUuid) continue

          // Direct coordinator-room match (the common case)
          if (normalizeRoomName(coordRoom) === target) {
            return this.getByUuid(coordUuid)
          }
          // Match against any member of the zone — the user may have asked
          // for a satellite by name, but we still want the coordinator's IP
          const members = (zone.members ?? []) as Array<Record<string, unknown>>
          for (const m of members) {
            const room = typeof m.roomName === 'string' ? m.roomName : ''
            if (normalizeRoomName(room) === target) {
              return this.getByUuid(coordUuid)
            }
          }
        }
      } catch { /* topology unavailable */ }
      return null
    }

    const viaTopology = await fromTopology()
    if (viaTopology) return viaTopology

    // Fallback: local byRoom map (last-discovered wins; not coordinator-aware)
    const local = this.getByRoom(roomName)
    if (local) return local

    // Last resort: force a fresh discovery and retry topology
    await this.refresh()
    return (await fromTopology()) ?? this.getByRoom(roomName)
  }

  /**
   * Mark a UUID as stale (e.g. after a SOAP call against its cached IP failed
   * with a connection error) and trigger an immediate refresh. Returns the
   * fresh entry if discovery found it.
   */
  async invalidate(uuid: string): Promise<SpeakerInfo | null> {
    this.byUuid.delete(uuid)
    // Don't drop byRoom entries — they'll be rebuilt by refresh and there's
    // no harm leaving a dangling key behind for one tick.
    await this.refresh()
    return this.getByUuid(uuid)
  }

  /** Initial discovery on startup, with backoff retries until at least one speaker is found. */
  init(): void {
    void this.refresh().then(() => this.scheduleNextStartupRetryIfEmpty())
    this.refreshTimer = setInterval(() => { void this.refresh() }, REFRESH_INTERVAL_MS)
    if (this.refreshTimer.unref) this.refreshTimer.unref()
  }

  shutdown(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer)
    if (this.startupRetryTimer) clearTimeout(this.startupRetryTimer)
    this.refreshTimer = null
    this.startupRetryTimer = null
  }

  private scheduleNextStartupRetryIfEmpty(): void {
    if (this.byUuid.size > 0) return
    if (this.startupRetryIndex >= STARTUP_RETRY_DELAYS_MS.length) return
    const delay = STARTUP_RETRY_DELAYS_MS[this.startupRetryIndex++]
    this.startupRetryTimer = setTimeout(() => {
      void this.refresh().then(() => this.scheduleNextStartupRetryIfEmpty())
    }, delay)
    if (this.startupRetryTimer.unref) this.startupRetryTimer.unref()
  }

  private async runRefresh(): Promise<void> {
    const discovered = await this.discover()
    if (discovered.length === 0) {
      // Don't wipe a previously good map on a transient discovery failure
      console.warn('[SpeakerRegistry] discovery returned 0 speakers; keeping previous snapshot')
      return
    }

    const nextByUuid = new Map<string, SpeakerInfo>()
    const nextByRoom = new Map<string, string>()
    for (const info of discovered) {
      nextByUuid.set(info.uuid, info)
      nextByRoom.set(normalizeRoomName(info.room), info.uuid)
    }

    // Detect IP changes for diagnostics
    for (const [uuid, next] of nextByUuid) {
      const prev = this.byUuid.get(uuid)
      if (prev && prev.ip !== next.ip) {
        console.log(`[SpeakerRegistry] ${next.room} IP changed: ${prev.ip} → ${next.ip}`)
      }
    }

    this.byUuid = nextByUuid
    this.byRoom = nextByRoom
    this.lastSuccessfulRefresh = Date.now()

    if (process.env.DEBUG_SPEAKER_REGISTRY) {
      console.log('[SpeakerRegistry] snapshot:', this.list().map(s => `${s.room}=${s.ip}`).join(', '))
    }
  }

  private async discover(): Promise<SpeakerInfo[]> {
    // 1. SSDP M-SEARCH (fast path)
    let speakers: SpeakerInfo[] = []
    try {
      const locations = await ssdpDiscover()
      if (locations.size > 0) {
        const ips = new Set<string>()
        for (const loc of locations) {
          const m = loc.match(/^https?:\/\/([\d.]+):/i)
          if (m) ips.add(m[1])
        }
        speakers = (await Promise.all(Array.from(ips).map(fetchSpeakerInfo)))
          .filter((s): s is SpeakerInfo => s !== null)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[SpeakerRegistry] SSDP discovery failed:', msg)
    }

    // 2. Topology cross-check — ask node-sonos-http-api what UUIDs *should*
    //    exist on the network and verify SSDP found them all. If any are
    //    missing (UDP packet loss is common), do a subnet scan to fill the
    //    gaps. This is the cheapest way to detect SSDP under-reporting.
    try {
      const expected = await this.expectedUuidsFromTopology()
      const found = new Set(speakers.map(s => s.uuid))
      const missing = [...expected].filter(u => !found.has(u))
      if (missing.length > 0) {
        console.log(`[SpeakerRegistry] SSDP missed ${missing.length} speaker(s): ${missing.join(', ')} — supplementing with subnet scan`)
        const supplemental = await subnetScan()
        for (const s of supplemental) {
          if (!found.has(s.uuid)) {
            speakers.push(s)
            found.add(s.uuid)
          }
        }
      }
    } catch { /* topology unavailable — proceed with whatever SSDP found */ }

    if (speakers.length > 0) return speakers

    // 3. Last resort — full subnet scan (SSDP found nothing, topology
    //    unavailable). Used on first boot in environments where multicast
    //    is blocked entirely.
    console.log('[SpeakerRegistry] SSDP yielded no speakers; falling back to full subnet scan')
    try {
      return await subnetScan()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[SpeakerRegistry] subnet scan failed:', msg)
      return []
    }
  }

  /** Read the set of speaker UUIDs that node-sonos-http-api can see. */
  private async expectedUuidsFromTopology(): Promise<Set<string>> {
    const uuids = new Set<string>()
    try {
      const { data } = await axios.get<unknown[]>(`${SONOS_HTTP_API_URL}/zones`, { timeout: 3_000 })
      if (!Array.isArray(data)) return uuids
      for (const zone of data as Array<Record<string, unknown>>) {
        const coord = zone.coordinator as Record<string, unknown> | undefined
        if (typeof coord?.uuid === 'string') uuids.add(coord.uuid)
        const members = (zone.members ?? []) as Array<Record<string, unknown>>
        for (const m of members) {
          if (typeof m.uuid === 'string') uuids.add(m.uuid)
        }
      }
    } catch { /* topology unavailable */ }
    return uuids
  }

  /** For diagnostics endpoints. */
  status(): { count: number; lastRefresh: number; speakers: SpeakerInfo[] } {
    return {
      count: this.byUuid.size,
      lastRefresh: this.lastSuccessfulRefresh,
      speakers: this.list(),
    }
  }
}

export const speakerRegistry = new SpeakerRegistry()

/**
 * Wrap a SOAP/UPnP call so that, if the cached IP no longer responds (the
 * speaker's DHCP lease changed), we re-discover and retry once with the
 * fresh IP. Pass the UUID so we know which entry to invalidate.
 */
export async function withSpeakerRecovery<T>(
  uuid: string,
  fn: (info: SpeakerInfo) => Promise<T>,
): Promise<T> {
  let info = speakerRegistry.getByUuid(uuid)
  if (!info) {
    const recovered = await speakerRegistry.invalidate(uuid)
    if (!recovered) throw new Error(`Speaker ${uuid} not discoverable on the network`)
    info = recovered
  }
  try {
    return await fn(info)
  } catch (err) {
    if (!isNetworkUnreachable(err)) throw err
    const recovered = await speakerRegistry.invalidate(uuid)
    if (!recovered) throw err
    return await fn(recovered)
  }
}

/**
 * Higher-level convenience: resolve a room name to a speaker, then run `fn`
 * with built-in DHCP-rotation recovery. Throws SpeakerNotFoundError if the
 * room name is not (and cannot be) discovered on the network — request
 * handlers should map that to a 404.
 */
export async function withSpeakerByRoom<T>(
  roomName: string,
  fn: (info: SpeakerInfo) => Promise<T>,
): Promise<T> {
  const info = await speakerRegistry.resolveByRoom(roomName)
  if (!info) throw new SpeakerNotFoundError(roomName)
  return withSpeakerRecovery(info.uuid, fn)
}

export class SpeakerNotFoundError extends Error {
  readonly roomName: string
  constructor(roomName: string) {
    super(`Speaker not found: ${roomName}`)
    this.name = 'SpeakerNotFoundError'
    this.roomName = roomName
  }
}

function isNetworkUnreachable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const code = (err as { code?: string }).code
  if (code && ['ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'ETIMEDOUT', 'ECONNABORTED', 'ECONNRESET'].includes(code)) {
    return true
  }
  // Axios timeout / network errors
  const message = (err as { message?: string }).message ?? ''
  return /timeout|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|socket hang up/i.test(message)
}
