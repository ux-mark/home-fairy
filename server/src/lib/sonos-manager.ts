import { sonosClient, type SonosZone } from './sonos-client.js'
import { getAll, getOne, run } from '../db/index.js'
import { emit } from './socket.js'
import { getLatestEpisodeUrl } from './podcast-resolver.js'
import { log as logToDb } from './logger.js'
import { withSpeakerByRoom } from './speaker-registry.js'
import { getLocation } from './settings-store.js'
import { nowIn, withinWindow } from './schedule-window.js'

function log(msg: string): void {
  logToDb(msg, 'sonos')
}

interface SonosSpeakerRow {
  id: number
  room_name: string
  speaker_name: string
  favourite: string | null
  default_volume: number
}

interface RoomRow {
  name: string
  auto: number
  timer: number
  sonos_follow_me: number
}

interface AutoPlayRow {
  id: number
  room_name: string | null
  mode_name: string | null
  favourite_name: string
  trigger_type: 'mode_change' | 'if_not_playing' | 'if_source_not'
  trigger_value: string | null
  enabled: number
  max_plays: number | null
  podcast_feed_url: string | null
  nas_uri: string | null
  spotify_uri: string | null
  days_of_week: string | null
  time_start: string | null
  time_end: string | null
}

interface SpeakerTimer {
  timeout: NodeJS.Timeout
  roomName: string
  startedAt: number
  durationMs: number
}

/**
 * Schedule gate for an auto-play rule. Returns true when the rule's mode,
 * day-of-week and time-window filters all allow it to fire right now.
 *
 * Rule shape is Mode XOR Time-window (enforced by the route layer): a rule has
 * either `mode_name` set (fires only when that mode is the active mode) or a
 * `time_start`+`time_end` window (fires whenever local time is inside it),
 * never both. `days_of_week` is an independent refinement on either basis;
 * NULL means every day.
 *
 * Exported so the route layer and unit tests can exercise it without the
 * SonosManager class.
 */
export function passesSchedule(rule: {
  mode_name?: string | null
  days_of_week: string | null
  time_start: string | null
  time_end: string | null
}, currentMode: string | null = null, now: Date = new Date()): boolean {
  const tz = getLocation().timezone || 'Europe/Dublin'
  const { isoDay, hhmm } = nowIn(tz, now)

  // Mode-bound rule: current mode must match exactly.
  if (rule.mode_name) {
    if (currentMode !== rule.mode_name) return false
  }

  if (rule.days_of_week) {
    let allowed: number[]
    try {
      allowed = JSON.parse(rule.days_of_week) as number[]
    } catch {
      // Malformed JSON — be conservative and skip the rule rather than firing.
      return false
    }
    if (!Array.isArray(allowed) || !allowed.includes(isoDay)) {
      return false
    }
  }

  if (rule.time_start && rule.time_end) {
    if (!withinWindow(hhmm, rule.time_start, rule.time_end)) {
      return false
    }
  }

  return true
}

/**
 * The "scope" a rule's max_plays counter is tied to. Mode rules reset when
 * the mode session flips; time/day-only rules reset at local midnight in the
 * configured timezone. Returned as a deterministic string so callers can
 * detect transitions by string equality.
 */
function ruleScopeKey(rule: AutoPlayRow, currentMode: string | null, now: Date = new Date()): string {
  if (rule.mode_name) return `mode:${currentMode ?? ''}`
  const tz = getLocation().timezone || 'Europe/Dublin'
  // YYYY-MM-DD in the configured TZ — flips at local midnight.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  })
  return `day:${fmt.format(now)}`
}

class SonosManager {
  private zones: SonosZone[] = []
  private roomSpeakerMap: Map<string, string> = new Map()
  private activeFollowMeRooms: Set<string> = new Set()
  private speakerTimers: Map<string, SpeakerTimer> = new Map()
  private anchorRoom: string | null = null
  private zoneRefreshTimer: NodeJS.Timeout | null = null
  private consecutiveFailures = 0
  private shuttingDown = false
  private isRoomLockedFn: ((roomName: string) => boolean) | null = null
  private rulePlayCounts: Map<number, number> = new Map()
  /** Last scope key seen per rule. Differing key on the next evaluation
   *  means the rule's natural session (mode or day) has rolled — reset. */
  private ruleLastScopeKey: Map<number, string> = new Map()
  private currentMode: string | null = null
  private podcastArtCache: Map<string, string> = new Map()
  private lastPlaybackFingerprint: string = ''
  private lastZonesFingerprint: string = ''

  init(): void {
    this.loadRoomSpeakerMap()
    this.startZonePolling()
    log('Initialised')
  }

  setIsRoomLocked(fn: (roomName: string) => boolean): void {
    this.isRoomLockedFn = fn
  }

  private loadRoomSpeakerMap(): void {
    this.roomSpeakerMap.clear()
    const speakers = getAll<SonosSpeakerRow>('SELECT * FROM sonos_speakers')
    for (const s of speakers) {
      this.roomSpeakerMap.set(s.room_name, s.speaker_name)
    }
    log(`Loaded ${speakers.length} speaker mappings`)
  }

  refreshRoomSpeakerMap(): void {
    this.loadRoomSpeakerMap()
  }

  /** Build a lightweight fingerprint of playback state across all zones */
  private getPlaybackFingerprint(zones: SonosZone[]): string {
    return zones.map(z => {
      const s = z.coordinator.state
      return `${z.coordinator.roomName}:${s.playbackState}:${s.currentTrack?.uri ?? ''}:${s.currentTrack?.title ?? ''}`
    }).join('|')
  }

  /** Structural fingerprint covering everything our `sonos:zones-update`
   *  consumers actually care about (playback state, current track, group
   *  composition, volume, mute). Cheaper than two full JSON.stringify() of
   *  the entire zones tree on every poll tick. */
  private getZonesFingerprint(zones: SonosZone[]): string {
    return zones
      .map(z => {
        const s = z.coordinator.state
        const members = z.members
          .map(m => `${m.roomName}=${m.uuid}`)
          .join(',')
        return [
          z.coordinator.roomName,
          z.coordinator.uuid,
          s.playbackState,
          s.currentTrack?.uri ?? '',
          s.currentTrack?.title ?? '',
          s.volume,
          s.mute ? '1' : '0',
          members,
        ].join('|')
      })
      .join('||')
  }

  private startZonePolling(): void {
    const poll = async () => {
      try {
        const newZones = await sonosClient.getZones()
        const newFingerprint = this.getZonesFingerprint(newZones)
        const changed = newFingerprint !== this.lastZonesFingerprint
        this.lastZonesFingerprint = newFingerprint
        this.zones = newZones
        this.consecutiveFailures = 0
        if (changed) {
          emit('sonos:zones-update', this.injectPodcastArtIntoZones(newZones))
        }
        // Check for playback changes on every poll — a track advance or external
        // play/pause changes the fingerprint without necessarily changing zone membership.
        const playbackFingerprint = this.getPlaybackFingerprint(newZones)
        if (playbackFingerprint !== this.lastPlaybackFingerprint) {
          this.lastPlaybackFingerprint = playbackFingerprint
          // Include the currently-playing speaker and track info so clients can
          // update their queue highlight without waiting for a full now-playing fetch.
          const playingZone = newZones.find(z => z.coordinator.state.playbackState === 'PLAYING')
          const coordinator = playingZone?.coordinator
          emit('sonos:playback-update', {
            source: 'zone-poll',
            speaker: coordinator?.roomName ?? null,
            trackNo: coordinator?.state?.trackNo ?? null,
            uri: coordinator?.state?.currentTrack?.uri ?? null,
          })
        }
      } catch {
        this.consecutiveFailures++
        if (this.consecutiveFailures === 1) {
          log('Sonos API unreachable, will keep retrying')
        }
      }

      if (this.shuttingDown) return
      // Poll every 10s for responsive playback detection, back off to 120s on failures
      const interval = this.consecutiveFailures >= 5 ? 120_000 : 10_000
      this.zoneRefreshTimer = setTimeout(poll, interval)
      this.zoneRefreshTimer.unref()
    }

    // Initial poll after short delay to let server start
    setTimeout(() => poll(), 3000)
  }

  private isFollowMeEnabled(): boolean {
    const pref = getOne<{ value: string }>(
      "SELECT value FROM current_state WHERE key = 'pref_sonos_follow_me'",
    )
    return pref?.value === 'true'
  }

  private isRoomFollowMeEnabled(roomName: string): boolean {
    const room = getOne<RoomRow>('SELECT * FROM rooms WHERE name = ?', [roomName])
    return room?.auto === 1 && room?.sonos_follow_me === 1
  }

  private getSpeakerForRoom(roomName: string): string | undefined {
    return this.roomSpeakerMap.get(roomName)
  }

  private findPlayingZone(): SonosZone | null {
    return this.zones.find(z => z.coordinator.state.playbackState === 'PLAYING') || null
  }

  private findZoneForSpeaker(speakerName: string): SonosZone | null {
    return this.zones.find(z =>
      z.coordinator.roomName === speakerName ||
      z.members.some(m => m.roomName === speakerName),
    ) || null
  }

  private isLineInActive(speakerName: string): boolean {
    const zone = this.findZoneForSpeaker(speakerName)
    if (!zone) return false
    const track = zone.coordinator.state.currentTrack
    return track?.type === 'line_in' || (track?.uri || '').includes('x-rincon-stream:')
  }

  async onRoomMotionActive(roomName: string): Promise<void> {
    if (!this.isFollowMeEnabled()) return
    if (!this.isRoomFollowMeEnabled(roomName)) return
    if (this.isRoomLockedFn?.(roomName)) return

    const speakerName = this.getSpeakerForRoom(roomName)
    if (!speakerName) return

    // Cancel any pending removal timer for this room
    this.cancelSpeakerTimer(roomName)

    // Refresh zones to get current state
    try {
      this.zones = await sonosClient.getZones()
    } catch {
      log(`Failed to refresh zones for room ${roomName}`)
      return
    }

    // Check if this speaker has line-in active
    if (this.isLineInActive(speakerName)) {
      log(`Speaker ${speakerName} has line-in active, skipping follow-me`)
      return
    }

    const playingZone = this.findPlayingZone()

    if (!playingZone) {
      // Nothing playing anywhere — follow-me only moves already-playing music
      log(`No music playing, follow-me skipping ${roomName}`)
      return
    }

    // Something is playing -- check if this speaker is already in the group
    const coordinatorName = playingZone.coordinator.roomName
    const isInGroup = coordinatorName === speakerName ||
      playingZone.members.some(m => m.roomName === speakerName)

    if (isInGroup) {
      // Already part of the group
      this.activeFollowMeRooms.add(roomName)
      this.anchorRoom = coordinatorName
      this.emitFollowMeUpdate()
      return
    }

    // Join the playing group
    log(`Joining ${speakerName} (${roomName}) to group with ${coordinatorName}`)
    try {
      await sonosClient.joinGroup(speakerName, coordinatorName)
      this.anchorRoom = coordinatorName
      this.activeFollowMeRooms.add(roomName)
      this.emitFollowMeUpdate()
    } catch (err) {
      log(`Failed to join group: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async onRoomMotionAllInactive(roomName: string): Promise<void> {
    if (!this.isFollowMeEnabled()) return
    if (!this.isRoomFollowMeEnabled(roomName)) return

    const speakerName = this.getSpeakerForRoom(roomName)
    if (!speakerName) return

    // Don't start timer if one already running
    if (this.speakerTimers.has(roomName)) return

    const room = getOne<RoomRow>('SELECT * FROM rooms WHERE name = ?', [roomName])
    if (!room) return

    const durationMs = room.timer * 60 * 1000
    log(`Starting ${room.timer}min speaker removal timer for ${roomName}`)

    const timeout = setTimeout(async () => {
      this.speakerTimers.delete(roomName)
      log(`Speaker timer expired for ${roomName}, removing ${speakerName} from group`)

      try {
        await sonosClient.leaveGroup(speakerName)
      } catch (err) {
        log(`Failed to leave group: ${err instanceof Error ? err.message : String(err)}`)
      }

      this.activeFollowMeRooms.delete(roomName)

      // If no more active rooms, pause playback
      if (this.activeFollowMeRooms.size === 0 && this.anchorRoom) {
        log('No active rooms remaining, pausing playback')
        try {
          await sonosClient.pause(this.anchorRoom)
        } catch (err) {
          log(`Failed to pause: ${err instanceof Error ? err.message : String(err)}`)
        }
        this.anchorRoom = null
      }

      this.emitFollowMeUpdate()
    }, durationMs)

    timeout.unref()
    this.speakerTimers.set(roomName, {
      timeout,
      roomName,
      startedAt: Date.now(),
      durationMs,
    })
  }

  async onModeChange(newMode: string): Promise<void> {
    // Track the current mode so passesSchedule + ruleScopeKey can see it. The
    // per-rule scope-key check in evaluateAutoPlayRule handles count resets
    // lazily, so we no longer need to clear rulePlayCounts en masse here.
    if (newMode !== this.currentMode) {
      this.currentMode = newMode
      log(`Mode changed to "${newMode}"`)
    }
  }

  /**
   * Called when motion is detected in a room. Evaluates every enabled auto-play
   * rule for this room (or whole-house) — schedule gating happens per rule, so
   * the SQL no longer filters by current mode. Not gated by lux, auto-enable
   * or night lockout — like follow-me.
   * - Room-specific rules: fire only when that room activates
   * - Whole-house rules (room_name = null): fire on first motion in any room
   */
  async onRoomActive(roomName: string): Promise<void> {
    // Cache the mode lookup in case it hasn't been set yet (e.g. fresh boot
    // before the first mode-change event). passesSchedule + ruleScopeKey both
    // read from this.currentMode after this line.
    if (this.currentMode == null) this.currentMode = this.getCurrentModeFromDb()

    const rules = getAll<AutoPlayRow>(
      'SELECT * FROM sonos_auto_play WHERE enabled = 1 AND (room_name = ? OR room_name IS NULL)',
      [roomName],
    )

    if (rules.length === 0) return

    for (const rule of rules) {
      try {
        await this.evaluateAutoPlayRule(rule)
      } catch (err) {
        log(`Auto-play rule ${rule.id} failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  private getCurrentModeFromDb(): string {
    const row = getOne<{ value: string }>(
      "SELECT value FROM current_state WHERE key = 'mode'",
    )
    return row?.value ?? 'Evening'
  }

  private async evaluateAutoPlayRule(rule: AutoPlayRow): Promise<void> {
    // Schedule gates run first: a rule outside its mode/day/window is silently
    // skipped and its play count is untouched. Trigger conditions and max_plays
    // apply only when the schedule allows.
    if (!passesSchedule(rule, this.currentMode)) {
      return
    }

    // Reset the per-rule count when its natural scope rolls: mode session for
    // mode rules, calendar day (in configured TZ) for time/day-only rules.
    const scopeKey = ruleScopeKey(rule, this.currentMode)
    if (this.ruleLastScopeKey.get(rule.id) !== scopeKey) {
      this.rulePlayCounts.delete(rule.id)
      this.ruleLastScopeKey.set(rule.id, scopeKey)
    }

    // Check repeat limit before any other logic
    if (rule.max_plays !== null) {
      const count = this.rulePlayCounts.get(rule.id) ?? 0
      if (count >= rule.max_plays) {
        log(`Auto-play rule ${rule.id}: repeat limit reached (${count}/${rule.max_plays})`)
        return
      }
    }

    // Determine target speaker
    let targetSpeaker: string | null = null

    if (rule.room_name) {
      targetSpeaker = this.getSpeakerForRoom(rule.room_name) ?? null
    } else {
      // Whole house -- use any available speaker as coordinator
      const speakers = getAll<SonosSpeakerRow>('SELECT * FROM sonos_speakers')
      if (speakers.length > 0) {
        targetSpeaker = speakers[0].speaker_name
      }
    }

    if (!targetSpeaker) {
      log(`Auto-play rule ${rule.id}: no target speaker found`)
      return
    }

    // Evaluate trigger condition
    switch (rule.trigger_type) {
      case 'mode_change':
        // Always proceed
        break

      case 'if_not_playing': {
        const playingZone = this.findPlayingZone()
        if (playingZone) {
          log(`Auto-play rule ${rule.id}: skipping, music already playing`)
          return
        }
        break
      }

      case 'if_source_not': {
        // Check if the excluded source is currently active
        if (rule.trigger_value) {
          const zone = this.findZoneForSpeaker(targetSpeaker)
          if (zone) {
            const track = zone.coordinator.state.currentTrack
            const isLineIn = track?.type === 'line_in' || (track?.uri || '').includes('x-rincon-stream:')
            if (isLineIn) {
              log(`Auto-play rule ${rule.id}: skipping, line-in source active`)
              return
            }
          }
        }
        break
      }
    }

    // "Continue what's already playing" — conditions passed, nothing to change
    if (rule.favourite_name === '__continue__') {
      log(`Auto-play rule ${rule.id}: continuing current playback`)
      this.rulePlayCounts.set(rule.id, (this.rulePlayCounts.get(rule.id) ?? 0) + 1)
      return
    }

    // Spotify, NAS library, podcast, or Sonos favourite playback
    try {
      if (rule.spotify_uri) {
        log(`Auto-play rule ${rule.id}: playing Spotify "${rule.favourite_name}" on ${targetSpeaker}`)
        await sonosClient.playSpotifyUri(targetSpeaker, rule.spotify_uri, 'now')
      } else if (rule.nas_uri) {
        log(`Auto-play rule ${rule.id}: playing NAS "${rule.favourite_name}" (${rule.nas_uri}) on ${targetSpeaker}`)
        const isContainer = rule.nas_uri.startsWith('A:') || rule.nas_uri.startsWith('S:') || rule.nas_uri.startsWith('SQ:')
        if (isContainer) {
          const tracks = await sonosClient.getGenreAlbumTracks(rule.nas_uri)
          if (tracks.length === 0) {
            log(`Auto-play rule ${rule.id}: no tracks found in NAS container`)
            return
          }
          await sonosClient.clearQueue(targetSpeaker)
          await withSpeakerByRoom(targetSpeaker, async ({ ip, uuid }) => {
            for (const track of tracks) {
              try { await sonosClient.addToQueueSOAP(ip, track.uri) } catch { /* skip bad track */ }
            }
            await sonosClient.playQueueFromStart(ip, uuid)
          })
        } else {
          await sonosClient.setAVTransportURI(targetSpeaker, rule.nas_uri)
          await sonosClient.play(targetSpeaker)
        }
      } else if (rule.podcast_feed_url) {
        log(`Auto-play rule ${rule.id}: resolving podcast "${rule.favourite_name}" from RSS`)
        const episode = await getLatestEpisodeUrl(rule.podcast_feed_url)
        if (!episode) {
          log(`Auto-play rule ${rule.id}: failed to resolve podcast episode`)
          return
        }
        log(`Auto-play rule ${rule.id}: playing episode "${episode.title}" on ${targetSpeaker}`)
        await sonosClient.setAVTransportURI(targetSpeaker, episode.url)
        await sonosClient.play(targetSpeaker)
        // Cache artwork from the Sonos favourites list
        void this.cachePodcastArtFromFavourites(targetSpeaker, rule.favourite_name)
      } else {
        this.podcastArtCache.delete(targetSpeaker)
        log(`Auto-play rule ${rule.id}: playing "${rule.favourite_name}" on ${targetSpeaker}`)
        await sonosClient.playFavourite(targetSpeaker, rule.favourite_name)
      }
    } catch (err) {
      // The Sonos API request may have reached the speaker before the timeout,
      // leaving it playing even though we got an error. Stop it to prevent
      // follow-me from picking up orphaned playback.
      log(`Auto-play rule ${rule.id}: playback failed, stopping speaker to clean up`)
      try { await sonosClient.pause(targetSpeaker) } catch { /* best effort */ }
      throw err
    }
    this.rulePlayCounts.set(rule.id, (this.rulePlayCounts.get(rule.id) ?? 0) + 1)
    emit('sonos:playback-update', { speaker: targetSpeaker })
  }

  async onLockedStateActivated(): Promise<void> {
    if (this.activeFollowMeRooms.size === 0) return

    log('Locked state activated, pausing follow-me playback')

    if (this.anchorRoom) {
      try {
        await sonosClient.pause(this.anchorRoom)
      } catch (err) {
        log(`Failed to pause on lock: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // Clear all speaker timers
    for (const [, timer] of this.speakerTimers) {
      clearTimeout(timer.timeout)
    }
    this.speakerTimers.clear()
    this.activeFollowMeRooms.clear()
    this.anchorRoom = null

    this.emitFollowMeUpdate()
  }

  private async cachePodcastArtFromFavourites(speaker: string, favouriteName: string): Promise<void> {
    try {
      const favs = await sonosClient.getFavourites()
      const fav = favs.find(f => f.title === favouriteName)
      if (fav?.albumArtURI) {
        this.podcastArtCache.set(speaker, fav.albumArtURI)
        log(`Cached podcast art for ${speaker} from favourites`)
      }
    } catch {
      // Non-critical — artwork is optional
    }
  }

  private cancelSpeakerTimer(roomName: string): void {
    const timer = this.speakerTimers.get(roomName)
    if (timer) {
      clearTimeout(timer.timeout)
      this.speakerTimers.delete(roomName)
      log(`Cancelled speaker timer for ${roomName}`)
    }
  }

  private emitFollowMeUpdate(): void {
    emit('sonos:follow-me-update', {
      enabled: this.isFollowMeEnabled(),
      activeRooms: Array.from(this.activeFollowMeRooms),
      anchorRoom: this.anchorRoom,
    })
  }

  getFollowMeStatus(): { enabled: boolean; activeRooms: string[]; anchorRoom: string | null } {
    return {
      enabled: this.isFollowMeEnabled(),
      activeRooms: Array.from(this.activeFollowMeRooms),
      anchorRoom: this.anchorRoom,
    }
  }

  getZones(): SonosZone[] {
    return this.zones
  }

  setPodcastArt(speaker: string, url: string): void {
    this.podcastArtCache.set(speaker, url)
    log(`Cached podcast art for ${speaker}`)
  }

  clearPodcastArt(speaker: string): void {
    this.podcastArtCache.delete(speaker)
  }

  getPodcastArt(speaker: string): string | null {
    return this.podcastArtCache.get(speaker) ?? null
  }

  private injectPodcastArtIntoZones(zones: SonosZone[]): SonosZone[] {
    return zones.map(zone => {
      const art = this.podcastArtCache.get(zone.coordinator.roomName)
      if (!art || zone.coordinator.state.currentTrack.albumArtUri) return zone
      return {
        ...zone,
        coordinator: {
          ...zone.coordinator,
          state: {
            ...zone.coordinator.state,
            currentTrack: {
              ...zone.coordinator.state.currentTrack,
              albumArtUri: art,
            },
          },
        },
      }
    })
  }

  shutdown(): void {
    this.shuttingDown = true
    if (this.zoneRefreshTimer) {
      clearTimeout(this.zoneRefreshTimer)
      this.zoneRefreshTimer = null
    }
    for (const [, timer] of this.speakerTimers) {
      clearTimeout(timer.timeout)
    }
    this.speakerTimers.clear()
    log('Shutdown complete')
  }
}

export const sonosManager = new SonosManager()
