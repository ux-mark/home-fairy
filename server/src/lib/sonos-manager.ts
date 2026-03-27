import { sonosClient, type SonosZone } from './sonos-client.js'
import { getAll, getOne, run } from '../db/index.js'
import { emit } from './socket.js'

const log = (msg: string) => console.log(`[sonos] ${msg}`)

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
  mode_name: string
  favourite_name: string
  trigger_type: 'mode_change' | 'if_not_playing' | 'if_source_not'
  trigger_value: string | null
  enabled: number
  max_plays: number | null
}

interface SpeakerTimer {
  timeout: NodeJS.Timeout
  roomName: string
  startedAt: number
  durationMs: number
}

class SonosManager {
  private zones: SonosZone[] = []
  private roomSpeakerMap: Map<string, string> = new Map()
  private activeFollowMeRooms: Set<string> = new Set()
  private speakerTimers: Map<string, SpeakerTimer> = new Map()
  private anchorRoom: string | null = null
  private zoneRefreshTimer: NodeJS.Timeout | null = null
  private consecutiveFailures = 0
  private isRoomLockedFn: ((roomName: string) => boolean) | null = null
  private rulePlayCounts: Map<number, number> = new Map()
  private currentMode: string | null = null

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

  private startZonePolling(): void {
    const poll = async () => {
      try {
        const newZones = await sonosClient.getZones()
        const changed = JSON.stringify(newZones) !== JSON.stringify(this.zones)
        this.zones = newZones
        this.consecutiveFailures = 0
        if (changed) {
          emit('sonos:zones-update', newZones)
        }
      } catch {
        this.consecutiveFailures++
        if (this.consecutiveFailures === 1) {
          log('Sonos API unreachable, will keep retrying')
        }
      }

      const interval = this.consecutiveFailures >= 5 ? 120_000 : 30_000
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
    return room?.sonos_follow_me === 1
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
    // Mode change only resets play counts — auto-play rules are triggered by motion
    if (newMode !== this.currentMode) {
      this.rulePlayCounts.clear()
      this.currentMode = newMode
      log(`Mode changed to "${newMode}", auto-play repeat counts reset`)
    }
  }

  /**
   * Called when motion is detected in a room. Evaluates auto-play rules for the
   * current mode. Not gated by lux, auto-enable, or night lockout — like follow-me.
   * - Room-specific rules: fire only when that room activates
   * - Whole-house rules (room_name = null): fire on first motion in any room
   */
  async onRoomActive(roomName: string): Promise<void> {
    const mode = this.currentMode ?? this.getCurrentModeFromDb()

    const rules = getAll<AutoPlayRow>(
      'SELECT * FROM sonos_auto_play WHERE mode_name = ? AND enabled = 1 AND (room_name = ? OR room_name IS NULL)',
      [mode, roomName],
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

    log(`Auto-play rule ${rule.id}: playing "${rule.favourite_name}" on ${targetSpeaker}`)
    await sonosClient.playFavourite(targetSpeaker, rule.favourite_name)
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

  shutdown(): void {
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
