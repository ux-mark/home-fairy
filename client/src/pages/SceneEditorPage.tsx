import { useState, useCallback, useMemo, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { BackLink } from '@/components/ui/BackLink'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Save,
  Eye,
  EyeOff,
  X,
  Power,
  Trash2,
  Lightbulb,
  Search,
  Copy,
  AlertTriangle,
  ToggleLeft,
  Zap,
  Timer,
  Link2,
  CalendarDays,
  Activity,
} from 'lucide-react'
import * as Tabs from '@radix-ui/react-tabs'
import * as Switch from '@radix-ui/react-switch'
import { api } from '@/lib/api'
import type {
  Scene,
  SceneCommand,
  SceneRoom,
  LightRoom,
  DeviceRoomAssignment,
  DeactivatedDevice,
} from '@/lib/api'
import { cn, hsbToHex, kelvinToHex, debounce, DEFAULT_MODES } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/Badge'
import { useToast } from '@/hooks/useToast'
import ColorBrightnessPicker from '@/components/ui/ColorBrightnessPicker'
import { LucideIcon } from '@/components/ui/LucideIcon'

// ── Fairy device patterns ────────────────────────────────────────────────────

const FAIRY_PATTERNS = [
  'Morning',
  'Evening',
  'Night',
  'Rainbow x4',
  'Rainbow x2',
  'Warm White',
  'Cool White',
  'Party',
  'Relax',
  'Off',
]

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ── Types for light state within the editor ──────────────────────────────────

interface LightEditorState {
  lightId: string
  selector: string
  label: string
  hasColor: boolean
  minKelvin: number
  maxKelvin: number
  power: 'on' | 'off'
  hue: number
  saturation: number
  kelvin: number
  brightness: number
}

// ── Per-light editor card ────────────────────────────────────────────────────

function LightEditorCard({
  state,
  livePreview,
  onChange,
  onLivePreviewToggle,
  deactivated,
}: {
  state: LightEditorState
  livePreview: boolean
  onChange: (updated: LightEditorState) => void
  onLivePreviewToggle: () => void
  deactivated?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const isOn = state.power === 'on'

  const previewHex = state.hasColor
    ? hsbToHex(state.hue, state.saturation / 100, state.brightness / 100)
    : kelvinToHex(state.kelvin)

  const debouncedApiCall = useMemo(() => {
    return debounce(
      (update: { color?: { h: number; s: number; v: number }; kelvin?: number; brightness?: number }) => {
        if (!livePreview) return
        const lifxColor = update.color
          ? `hue:${update.color.h} saturation:${(update.color.s / 100).toFixed(2)}`
          : update.kelvin
            ? `kelvin:${update.kelvin}`
            : undefined
        const lifxBrightness = update.brightness !== undefined ? update.brightness / 100 : undefined
        api.lifx.setState(state.selector, {
          power: 'on',
          color: lifxColor,
          brightness: lifxBrightness,
          duration: 0.3,
        })
      },
      300,
    )
  }, [livePreview, state.selector])

  useEffect(() => {
    return () => {
      debouncedApiCall.cancel()
    }
  }, [debouncedApiCall])

  const handleLiveChange = useCallback(
    (update: { color?: { h: number; s: number; v: number }; kelvin?: number; brightness?: number }) => {
      if (!livePreview) return
      debouncedApiCall(update)
    },
    [livePreview, debouncedApiCall],
  )

  return (
    <div className="card rounded-xl border transition-colors">
      <div className="flex items-center gap-3 p-4">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-label={`${state.label} — ${isOn ? `${state.brightness}% brightness` : 'Off'}`}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 rounded-lg"
        >
          <div
            className={cn(
              'h-10 w-10 shrink-0 rounded-full border-2 border-[var(--border-secondary)]',
              !isOn && 'opacity-30',
            )}
            style={{
              backgroundColor: isOn ? previewHex : '#475569',
              opacity: isOn ? Math.max(state.brightness / 100, 0.05) : 0.3,
            }}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className={cn('break-words text-sm font-medium', deactivated ? 'text-slate-500' : 'text-heading')}>
              {state.label}
              {deactivated && <span className="ml-1.5"><StatusBadge status="deactivated" /></span>}
            </p>
            <p className="text-xs text-caption">
              {isOn ? `${state.brightness}% brightness` : 'Off'}
            </p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => {
            onChange({ ...state, power: isOn ? 'off' : 'on' })
            if (livePreview) {
              api.lifx.setState(state.selector, {
                power: isOn ? 'off' : 'on',
                duration: 0.3,
              })
            }
          }}
          className={cn(
            'min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            isOn
              ? 'bg-fairy-500/15 text-fairy-400'
              : 'text-caption hover:bg-[var(--bg-tertiary)]',
          )}
          aria-label={`Turn ${state.label} ${isOn ? 'off' : 'on'}`}
        >
          <Power className="h-5 w-5" />
        </button>
      </div>

      {expanded && isOn && (
        <div className="border-t p-4">
          <div className="mb-4 space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor={`live-${state.lightId}`}
                className="flex items-center gap-2 text-xs font-medium text-body"
              >
                {livePreview ? (
                  <Eye className="h-3.5 w-3.5 text-fairy-400" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" />
                )}
                Live Preview
              </label>
              <Switch.Root
                id={`live-${state.lightId}`}
                checked={livePreview}
                onCheckedChange={onLivePreviewToggle}
                className={cn(
                  'relative h-6 w-10 shrink-0 cursor-pointer rounded-full transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                  livePreview ? 'bg-fairy-500' : 'bg-[var(--border-secondary)]',
                )}
              >
                <Switch.Thumb
                  className={cn(
                    'block h-4 w-4 rounded-full bg-white shadow transition-transform',
                    livePreview ? 'translate-x-5' : 'translate-x-1',
                  )}
                />
              </Switch.Root>
            </div>
            {livePreview && (
              <p className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Changes will be applied to the physical light
              </p>
            )}
          </div>

          <ColorBrightnessPicker
            hasColor={state.hasColor}
            color={{ h: state.hue, s: state.saturation, v: state.brightness }}
            kelvin={state.kelvin}
            brightness={state.brightness}
            minKelvin={state.minKelvin}
            maxKelvin={state.maxKelvin}
            onChange={update => {
              const next = { ...state }
              if (update.color) {
                next.hue = update.color.h
                next.saturation = update.color.s
                // For colour lights, v encodes brightness — keep them in sync.
                next.brightness = update.color.v
              }
              if (update.kelvin !== undefined) next.kelvin = update.kelvin
              // For kelvin lights, brightness comes from the dedicated slider.
              if (!state.hasColor && update.brightness !== undefined)
                next.brightness = update.brightness
              onChange(next)
            }}
            onLiveChange={handleLiveChange}
          />
        </div>
      )}
    </div>
  )
}

// ── Device card for switches/Twinkly ─────────────────────────────────────────

function DeviceToggleCard({
  label,
  isOn,
  onToggle,
  isDimmer,
  level,
  onLevelChange,
  deactivated,
}: {
  label: string
  isOn: boolean
  onToggle: (on: boolean) => void
  isDimmer?: boolean
  level?: number
  onLevelChange?: (level: number) => void
  deactivated?: boolean
}) {
  return (
    <div className="card rounded-xl border transition-colors">
      <div className="flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className={cn('break-words text-sm font-medium', deactivated ? 'text-slate-500' : 'text-heading')}>
            {label}
            {deactivated && <span className="ml-1.5"><StatusBadge status="deactivated" /></span>}
          </p>
          <p className="text-xs text-caption">
            {isOn ? (isDimmer && level !== undefined ? `On at ${level}%` : 'Included') : 'Off'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onToggle(!isOn)}
          className={cn(
            'min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            isOn
              ? 'bg-fairy-500/15 text-fairy-400'
              : 'text-caption hover:bg-[var(--bg-tertiary)]',
          )}
          aria-label={`${isOn ? 'Remove' : 'Add'} ${label}`}
        >
          <Power className="h-5 w-5" />
        </button>
      </div>
      {isOn && isDimmer && onLevelChange && (
        <div className="border-t p-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-body">Level</span>
            <span className="text-xs font-medium text-heading">{level ?? 100}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={level ?? 100}
            onChange={e => onLevelChange(Number(e.target.value))}
            className="fairy-slider w-full"
            aria-label={`${label} brightness level`}
          />
        </div>
      )}
    </div>
  )
}

// ── Fairy device card ────────────────────────────────────────────────────────

function FairyDeviceCard({
  label,
  isOn,
  pattern,
  brightness,
  onToggle,
  onPatternChange,
  onBrightnessChange,
  deactivated,
}: {
  label: string
  isOn: boolean
  pattern: string
  brightness: number
  onToggle: (on: boolean) => void
  onPatternChange: (pattern: string) => void
  onBrightnessChange: (brightness: number) => void
  deactivated?: boolean
}) {
  return (
    <div className="card rounded-xl border transition-colors">
      <div className="flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className={cn('break-words text-sm font-medium', deactivated ? 'text-slate-500' : 'text-heading')}>
            {label}
            {deactivated && <span className="ml-1.5"><StatusBadge status="deactivated" /></span>}
          </p>
          <p className="text-xs text-caption">
            {isOn ? `${pattern} at ${brightness}%` : 'Off'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onToggle(!isOn)}
          className={cn(
            'min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            isOn
              ? 'bg-fairy-500/15 text-fairy-400'
              : 'text-caption hover:bg-[var(--bg-tertiary)]',
          )}
          aria-label={`${isOn ? 'Remove' : 'Add'} ${label}`}
        >
          <Power className="h-5 w-5" />
        </button>
      </div>
      {isOn && (
        <div className="space-y-3 border-t p-4">
          <div>
            <label className="mb-1.5 block text-xs text-body">Pattern</label>
            <select
              value={pattern}
              onChange={e => onPatternChange(e.target.value)}
              className="input-field h-11 w-full rounded-lg border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
            >
              {FAIRY_PATTERNS.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-body">Brightness</span>
              <span className="text-xs font-medium text-heading">{brightness}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={brightness}
              onChange={e => onBrightnessChange(Number(e.target.value))}
              className="fairy-slider w-full"
              aria-label={`${label} brightness`}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Toggle-to-reveal option card ─────────────────────────────────────────────

function OptionToggle({
  label,
  description,
  enabled,
  onToggle,
  children,
  icon: Icon,
}: {
  label: string
  description: string
  enabled: boolean
  onToggle: (on: boolean) => void
  children?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="card rounded-xl border p-4">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            enabled ? 'bg-fairy-500/15 text-fairy-400' : 'surface text-caption',
          )}>
            <Icon className="h-4 w-4" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-heading">{label}</p>
          <p className="text-xs text-caption">{description}</p>
        </div>
        <Switch.Root
          aria-label={label}
          checked={enabled}
          onCheckedChange={onToggle}
          className={cn(
            'relative h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            enabled ? 'bg-fairy-500' : 'bg-[var(--border-secondary)]',
          )}
        >
          <Switch.Thumb
            className={cn(
              'block h-5 w-5 rounded-full bg-white shadow transition-transform',
              enabled ? 'translate-x-6' : 'translate-x-1',
            )}
          />
        </Switch.Root>
      </div>
      {enabled && children && (
        <div className="mt-3 pt-3 border-t">
          {children}
        </div>
      )}
    </div>
  )
}

// ── Main Scene Editor ────────────────────────────────────────────────────────

export default function SceneEditorPage() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // ── Fetch data ───────────────────────────────────────────────────────────

  const { data: scene, isLoading: sceneLoading } = useQuery({
    queryKey: ['scenes', name],
    queryFn: () => api.scenes.get(name!),
    enabled: !!name,
  })

  const { data: allRooms } = useQuery({
    queryKey: ['rooms'],
    queryFn: api.rooms.getAll,
  })

  const { data: allAssignments } = useQuery({
    queryKey: ['lights', 'rooms'],
    queryFn: api.lights.getRoomAssignments,
  })

  const { data: allLights } = useQuery({
    queryKey: ['lifx', 'lights'],
    queryFn: api.lifx.getLights,
  })

  const { data: systemCurrent } = useQuery({
    queryKey: ['system', 'current'],
    queryFn: api.system.getCurrent,
  })

  const { data: allScenes } = useQuery({
    queryKey: ['scenes'],
    queryFn: api.scenes.getAll,
  })

  const { data: allDefaultScenes } = useQuery({
    queryKey: ['room-default-scenes'],
    queryFn: api.roomDefaultScenes.getAll,
  })

  const { data: deactivatedDevices } = useQuery({
    queryKey: ['devices', 'deactivated'],
    queryFn: api.devices.getDeactivated,
  })

  const availableModes = systemCurrent?.all_modes ?? [...DEFAULT_MODES]
  const modeIcons = systemCurrent?.mode_icons ?? {}

  // ── Form state ───────────────────────────────────────────────────────────

  const [sceneName, setSceneName] = useState('')
  const [icon, setIcon] = useState('')
  const [sceneRooms, setSceneRooms] = useState<SceneRoom[]>([])
  const [modes, setModes] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [lightStates, setLightStates] = useState<Map<string, LightEditorState>>(
    new Map(),
  )
  const [livePreviewLights, setLivePreviewLights] = useState<Set<string>>(
    new Set(),
  )
  const [initialized, setInitialized] = useState(false)
  const [lightSearch, setLightSearch] = useState('')

  // Device tab state
  const [deviceCommands, setDeviceCommands] = useState<SceneCommand[]>([])

  // Settings tab option state
  const [allOffEnabled, setAllOffEnabled] = useState(false)
  const [modeChangeEnabled, setModeChangeEnabled] = useState(false)
  const [modeChangeTarget, setModeChangeTarget] = useState('')
  const [sceneTimerEnabled, setSceneTimerEnabled] = useState(false)
  const [sceneTimerTarget, setSceneTimerTarget] = useState('')
  const [sceneTimerDuration, setSceneTimerDuration] = useState(300)
  const [chainSceneEnabled, setChainSceneEnabled] = useState(false)
  const [chainSceneTarget, setChainSceneTarget] = useState('')

  // Season date range state
  const [seasonEnabled, setSeasonEnabled] = useState(false)
  const [seasonFromMonth, setSeasonFromMonth] = useState(12)
  const [seasonFromDay, setSeasonFromDay] = useState(1)
  const [seasonToMonth, setSeasonToMonth] = useState(1)
  const [seasonToDay, setSeasonToDay] = useState(6)

  // Hub devices for rooms
  const [roomDevices, setRoomDevices] = useState<Map<string, DeviceRoomAssignment[]>>(new Map())

  // Fetch devices when rooms change
  useEffect(() => {
    if (sceneRooms.length === 0) {
      setRoomDevices(new Map())
      return
    }

    let cancelled = false
    const fetchDevices = async () => {
      const newMap = new Map<string, DeviceRoomAssignment[]>()
      for (const room of sceneRooms) {
        try {
          const devices = await api.hubitat.getDevicesForRoom(room.name)
          if (!cancelled) {
            newMap.set(room.name, devices)
          }
        } catch {
          if (!cancelled) {
            newMap.set(room.name, [])
          }
        }
      }
      if (!cancelled) {
        setRoomDevices(newMap)
      }
    }
    fetchDevices()
    return () => { cancelled = true }
  }, [sceneRooms])

  // Initialize state from scene data
  useEffect(() => {
    if (scene && !initialized) {
      setSceneName(scene.name)
      setIcon(scene.icon ?? '')
      const validRooms = (Array.isArray(scene.rooms) ? scene.rooms : []).filter(
        (r): r is SceneRoom => !!r && typeof r.name === 'string' && r.name.length > 0,
      )
      setSceneRooms(validRooms)
      setModes(Array.isArray(scene.modes) ? scene.modes : [])
      setTags(Array.isArray(scene.tags) ? scene.tags : [])

      const cmds = Array.isArray(scene.commands) ? scene.commands : []

      // Route device commands
      setDeviceCommands(
        cmds.filter(c =>
          c.type === 'hubitat_device' || c.type === 'twinkly' || c.type === 'fairy_device' || c.type === 'kasa_device',
        ),
      )

      // Route settings option commands
      setAllOffEnabled(cmds.some(c => c.type === 'all_off'))

      const modeCmd = cmds.find(c => c.type === 'mode_update')
      if (modeCmd) {
        setModeChangeEnabled(true)
        setModeChangeTarget(modeCmd.name || '')
      }

      const timerCmd = cmds.find(c => c.type === 'scene_timer')
      if (timerCmd) {
        setSceneTimerEnabled(true)
        setSceneTimerTarget(timerCmd.command || '')
        setSceneTimerDuration(timerCmd.duration ?? 300)
      }

      const chainCmd = cmds.find(c => c.type === 'fairy_scene')
      if (chainCmd) {
        setChainSceneEnabled(true)
        setChainSceneTarget(chainCmd.name || '')
      }

      // Initialize season date range
      if (scene.active_from && scene.active_to) {
        setSeasonEnabled(true)
        const [fm, fd] = scene.active_from.split('-').map(Number)
        const [tm, td] = scene.active_to.split('-').map(Number)
        setSeasonFromMonth(fm)
        setSeasonFromDay(fd)
        setSeasonToMonth(tm)
        setSeasonToDay(td)
      }

      // Build light states from commands
      const states = new Map<string, LightEditorState>()
      for (const cmd of cmds) {
        if (cmd.type === 'lifx_light' && cmd.light_id) {
          let hue = 0, sat = 0, kelvin = 3500
          if (cmd.color) {
            const hueMatch = cmd.color.match(/hue:([\d.]+)/)
            const satMatch = cmd.color.match(/saturation:([\d.]+)/)
            const kelvinMatch = cmd.color.match(/kelvin:(\d+)/)
            if (hueMatch) hue = parseFloat(hueMatch[1])
            if (satMatch) sat = parseFloat(satMatch[1]) * 100
            if (kelvinMatch) kelvin = parseInt(kelvinMatch[1])
          }

          const assignment = allAssignments?.find(a => a.light_id === cmd.light_id)

          states.set(cmd.light_id, {
            lightId: cmd.light_id,
            selector: cmd.selector ?? `id:${cmd.light_id}`,
            label: cmd.name,
            hasColor: assignment ? Boolean(assignment.has_color) : true,
            minKelvin: assignment?.min_kelvin ?? 2500,
            maxKelvin: assignment?.max_kelvin ?? 9000,
            power: cmd.power ?? 'on',
            hue,
            saturation: sat,
            kelvin,
            brightness: Math.round((cmd.brightness ?? 1) * 100),
          })
        }
      }
      setLightStates(states)
      setInitialized(true)
    }
  }, [scene, allAssignments, initialized])

  // ── Derived data ─────────────────────────────────────────────────────────

  const roomLightsMap = useMemo(() => {
    const map = new Map<string, LightRoom[]>()
    if (!allAssignments) return map
    for (const room of sceneRooms) {
      const lights = allAssignments.filter(a => a.room_name === room.name)
      map.set(room.name, lights)
    }
    return map
  }, [allAssignments, sceneRooms])

  // Ensure all assigned lights have a state entry
  useEffect(() => {
    if (!allAssignments || !allLights) return
    setLightStates(prev => {
      const next = new Map(prev)
      let changed = false
      for (const room of sceneRooms) {
        const roomLights = allAssignments.filter(a => a.room_name === room.name)
        for (const rl of roomLights) {
          if (!next.has(rl.light_id)) {
            const live = allLights.find(l => l.id === rl.light_id)
            next.set(rl.light_id, {
              lightId: rl.light_id,
              selector: rl.light_selector || `id:${rl.light_id}`,
              label: rl.light_label,
              hasColor: Boolean(rl.has_color),
              minKelvin: rl.min_kelvin,
              maxKelvin: rl.max_kelvin,
              power: live?.power ?? 'on',
              hue: live?.color.hue ?? 0,
              saturation: live ? live.color.saturation * 100 : 0,
              kelvin: live?.color.kelvin ?? 3500,
              brightness: live ? Math.round(live.brightness * 100) : 100,
            })
            changed = true
          }
        }
      }
      return changed ? next : prev
    })
  }, [sceneRooms, allAssignments, allLights])

  // Categorize room devices (filter out "Always Keep On" devices)
  const categorizedDevices = useMemo(() => {
    const switches: Array<DeviceRoomAssignment & { roomName: string }> = []
    const twinkly: Array<DeviceRoomAssignment & { roomName: string }> = []
    const fairy: Array<DeviceRoomAssignment & { roomName: string }> = []
    const kasa: Array<DeviceRoomAssignment & { roomName: string }> = []

    // Sensor types are not controllable by scenes
    const SENSOR_TYPES = new Set(['motion', 'contact', 'temperature', 'sensor', 'thermostat'])

    for (const [roomName, devices] of roomDevices) {
      for (const device of devices) {
        // Skip "Always Keep On" devices — they are excluded from scene control
        if (device.config?.exclude_from_all_off) continue

        const dt = device.device_type.toLowerCase()

        // Skip sensors — not controllable by scenes
        if (SENSOR_TYPES.has(dt)) continue

        if (dt.startsWith('kasa_')) {
          kasa.push({ ...device, roomName })
        } else if (dt.includes('twinkly')) {
          twinkly.push({ ...device, roomName })
        } else if (dt.includes('fairy')) {
          fairy.push({ ...device, roomName })
        } else {
          switches.push({ ...device, roomName })
        }
      }
    }

    return { switches, twinkly, fairy, kasa }
  }, [roomDevices])

  // Build a set of deactivated device IDs keyed as "type:id"
  const deactivatedSet = useMemo(() => {
    if (!deactivatedDevices) return new Set<string>()
    return new Set(
      (deactivatedDevices as DeactivatedDevice[]).map(d => `${d.deviceType}:${d.deviceId}`),
    )
  }, [deactivatedDevices])

  const isLightDeactivated = (lightId: string) => deactivatedSet.has(`lifx:${lightId}`)
  const isHubDeviceDeactivated = (deviceId: string) => deactivatedSet.has(`hub:${deviceId}`)
  const isKasaDeviceDeactivated = (deviceId: string) => deactivatedSet.has(`kasa:${deviceId}`)

  // Count how many commands in this scene reference deactivated devices
  const deactivatedCount = useMemo(() => {
    if (deactivatedSet.size === 0) return 0
    let count = 0
    for (const [lightId] of lightStates) {
      if (deactivatedSet.has(`lifx:${lightId}`)) count++
    }
    for (const cmd of deviceCommands) {
      if (cmd.type === 'hubitat_device' && cmd.device_id && deactivatedSet.has(`hub:${String(cmd.device_id)}`)) count++
      if (cmd.type === 'kasa_device' && cmd.device_id && deactivatedSet.has(`kasa:${String(cmd.device_id)}`)) count++
    }
    return count
  }, [deactivatedSet, lightStates, deviceCommands])

  // ── Mutations ──────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: () => {
      // Build commands from light states
      const lightCommands: SceneCommand[] = []
      for (const [, ls] of lightStates) {
        const inScene = sceneRooms.some(r => {
          const rl = allAssignments?.find(
            a => a.room_name === r.name && a.light_id === ls.lightId,
          )
          return !!rl
        })
        if (!inScene) continue

        lightCommands.push({
          type: 'lifx_light',
          name: ls.label,
          light_id: ls.lightId,
          selector: ls.selector,
          power: ls.power,
          color: ls.hasColor
            ? `hue:${ls.hue.toFixed(1)} saturation:${(ls.saturation / 100).toFixed(2)}`
            : `kelvin:${ls.kelvin}`,
          brightness: ls.brightness / 100,
          duration: 1,
        })
      }

      // Build option commands from settings state
      const optionCommands: SceneCommand[] = []
      if (allOffEnabled) {
        optionCommands.push({ type: 'all_off', name: 'all_off' })
      }
      if (modeChangeEnabled && modeChangeTarget) {
        optionCommands.push({ type: 'mode_update', name: modeChangeTarget })
      }
      if (sceneTimerEnabled && sceneTimerTarget) {
        optionCommands.push({
          type: 'scene_timer',
          name: 'timer',
          command: sceneTimerTarget,
          duration: sceneTimerDuration,
        })
      }
      if (chainSceneEnabled && chainSceneTarget) {
        optionCommands.push({ type: 'fairy_scene', name: chainSceneTarget })
      }

      // Filter device commands to only include devices in the scene's rooms
      // (prunes orphaned commands from room changes or keep-on exclusions)
      const validIds = new Set<string>()
      const validLabels = new Set<string>()
      for (const category of [categorizedDevices.switches, categorizedDevices.twinkly, categorizedDevices.fairy, categorizedDevices.kasa]) {
        for (const d of category) {
          validIds.add(String(d.device_id))
          validLabels.add(d.device_label)
        }
      }
      const filteredDeviceCommands = deviceCommands.filter(cmd => {
        if (cmd.device_id) return validIds.has(String(cmd.device_id))
        if (cmd.name) return validLabels.has(cmd.name)
        return true
      })

      const allCommands = [...lightCommands, ...filteredDeviceCommands, ...optionCommands]

      const data: Partial<Scene> = {
        name: sceneName,
        icon,
        rooms: sceneRooms,
        modes,
        commands: allCommands,
        tags,
        active_from: seasonEnabled
          ? `${String(seasonFromMonth).padStart(2, '0')}-${String(seasonFromDay).padStart(2, '0')}`
          : null,
        active_to: seasonEnabled
          ? `${String(seasonToMonth).padStart(2, '0')}-${String(seasonToDay).padStart(2, '0')}`
          : null,
      }

      return api.scenes.update(name!, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenes'] })
      toast({ message: 'Scene saved' })
    },
    onError: () => toast({ message: 'Failed to save scene', type: 'error' }),
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.scenes.delete(name!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenes'] })
      navigate('/scenes')
      toast({ message: 'Scene deleted' })
    },
    onError: () =>
      toast({ message: 'Failed to delete scene', type: 'error' }),
  })

  const setDefaultSceneMutation = useMutation({
    mutationFn: ({ roomName, mode, scene }: { roomName: string; mode: string; scene: string | null }) =>
      api.roomDefaultScenes.set(roomName, mode, scene),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['room-default-scenes'] })
    },
    onError: () => toast({ message: 'Failed to update default scene', type: 'error' }),
  })

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleLightStateChange = useCallback(
    (lightId: string, updated: LightEditorState) => {
      setLightStates(prev => {
        const next = new Map(prev)
        next.set(lightId, updated)
        return next
      })
    },
    [],
  )

  const toggleLivePreview = useCallback((lightId: string) => {
    setLivePreviewLights(prev => {
      const next = new Set(prev)
      if (next.has(lightId)) next.delete(lightId)
      else next.add(lightId)
      return next
    })
  }, [])

  const handleRoomToggle = (roomName: string) => {
    const exists = sceneRooms.find(r => r.name === roomName)
    if (exists) {
      setSceneRooms(sceneRooms.filter(r => r.name !== roomName))
    } else {
      setSceneRooms([...sceneRooms, { name: roomName }])
    }
  }

  const handleModeToggle = (mode: string) => {
    if (modes.includes(mode)) {
      setModes(modes.filter(m => m !== mode))
    } else {
      setModes([...modes, mode])
    }
  }

  const handleAddTag = () => {
    const tag = tagInput.trim()
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag])
      setTagInput('')
    }
  }

  const handleApplyToAllInRoom = (roomName: string) => {
    const roomLights = roomLightsMap.get(roomName) ?? []
    if (roomLights.length === 0) return
    const first = lightStates.get(roomLights[0].light_id)
    if (!first) return
    setLightStates(prev => {
      const next = new Map(prev)
      for (const rl of roomLights) {
        const existing = next.get(rl.light_id)
        if (existing) {
          next.set(rl.light_id, {
            ...existing,
            power: first.power,
            hue: first.hue,
            saturation: first.saturation,
            kelvin: first.kelvin,
            brightness: first.brightness,
          })
        }
      }
      return next
    })
  }

  // Device command helpers
  const handleSwitchToggle = useCallback(
    (device: DeviceRoomAssignment, on: boolean) => {
      setDeviceCommands(prev => {
        const filtered = prev.filter(
          c => !(c.type === 'hubitat_device' && c.device_id === String(device.device_id)),
        )
        if (on) {
          return [
            ...filtered,
            {
              type: 'hubitat_device' as const,
              name: device.device_label,
              device_id: String(device.device_id),
              command: 'on',
            },
          ]
        }
        return filtered
      })
    },
    [],
  )

  const handleSwitchLevel = useCallback(
    (device: DeviceRoomAssignment, level: number) => {
      setDeviceCommands(prev =>
        prev.map(c =>
          c.type === 'hubitat_device' && c.device_id === String(device.device_id)
            ? { ...c, command: 'on', brightness: level / 100 }
            : c,
        ),
      )
    },
    [],
  )

  const handleTwinklyToggle = useCallback(
    (device: DeviceRoomAssignment, on: boolean) => {
      setDeviceCommands(prev => {
        const filtered = prev.filter(
          c => !(c.type === 'twinkly' && c.name === device.device_label),
        )
        if (on) {
          return [
            ...filtered,
            {
              type: 'twinkly' as const,
              name: device.device_label,
              command: 'on',
            },
          ]
        }
        return filtered
      })
    },
    [],
  )

  const handleFairyToggle = useCallback(
    (device: DeviceRoomAssignment, on: boolean) => {
      setDeviceCommands(prev => {
        const filtered = prev.filter(
          c => !(c.type === 'fairy_device' && c.name === device.device_label),
        )
        if (on) {
          return [
            ...filtered,
            {
              type: 'fairy_device' as const,
              name: device.device_label,
              command: 'Morning',
              id: '100',
            },
          ]
        }
        return filtered
      })
    },
    [],
  )

  const handleFairyPatternChange = useCallback(
    (device: DeviceRoomAssignment, pattern: string) => {
      setDeviceCommands(prev =>
        prev.map(c =>
          c.type === 'fairy_device' && c.name === device.device_label
            ? { ...c, command: pattern }
            : c,
        ),
      )
    },
    [],
  )

  const handleFairyBrightnessChange = useCallback(
    (device: DeviceRoomAssignment, brightness: number) => {
      setDeviceCommands(prev =>
        prev.map(c =>
          c.type === 'fairy_device' && c.name === device.device_label
            ? { ...c, brightness }
            : c,
        ),
      )
    },
    [],
  )

  const handleKasaToggle = useCallback(
    (device: DeviceRoomAssignment & { roomName: string }, on: boolean) => {
      setDeviceCommands(prev => {
        const filtered = prev.filter(
          c => !(c.type === 'kasa_device' && c.device_id === String(device.device_id)),
        )
        if (on) {
          return [
            ...filtered,
            {
              type: 'kasa_device' as const,
              name: device.device_label,
              device_id: String(device.device_id),
              command: 'on',
            },
          ]
        }
        return filtered
      })
    },
    [],
  )

  const filterRoomLights = useCallback(
    (roomLights: LightRoom[]) => {
      if (!lightSearch.trim()) return roomLights
      const q = lightSearch.toLowerCase()
      return roomLights.filter(rl =>
        rl.light_label.toLowerCase().includes(q),
      )
    },
    [lightSearch],
  )

  // ── Tab trigger style ───────────────────────────────────────────────────

  const tabTriggerClass = cn(
    'min-h-[44px] flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
    'data-[state=active]:bg-fairy-500 data-[state=active]:text-white',
    'data-[state=inactive]:text-body data-[state=inactive]:hover:text-heading',
  )

  // ── Loading / Not found ──────────────────────────────────────────────────

  if (sceneLoading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-32 animate-pulse rounded surface" />
        <div className="h-12 animate-pulse rounded-xl surface" />
        <div className="h-64 animate-pulse rounded-xl surface" />
      </div>
    )
  }

  if (!scene) {
    return (
      <div className="py-12 text-center">
        <p className="text-body">Scene not found.</p>
        <Link
          to="/scenes"
          className="mt-2 inline-block text-sm text-fairy-400 hover:underline"
        >
          Back to scenes
        </Link>
      </div>
    )
  }

  // ── Helpers for device tab ──────────────────────────────────────────────

  const totalDevices =
    categorizedDevices.switches.length +
    categorizedDevices.twinkly.length +
    categorizedDevices.fairy.length +
    categorizedDevices.kasa.length

  const otherScenes = allScenes?.filter(s => s.name !== name) ?? []

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="pb-24">
      {/* Back link */}
      <BackLink to="/scenes" label="All Scenes" className="mb-3" />

      {/* ── Top section: name + icon ──────────────────────────────────────── */}
      <section className="mb-6 space-y-3">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={icon}
            onChange={e => setIcon(e.target.value)}
            placeholder="Icon"
            maxLength={4}
            className="input-field h-12 w-14 shrink-0 rounded-xl border text-center text-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
            aria-label="Scene icon (emoji or text)"
          />
          <input
            type="text"
            value={sceneName}
            onChange={e => setSceneName(e.target.value)}
            placeholder="Scene name"
            className="input-field h-12 min-w-0 flex-1 rounded-xl border px-4 text-lg font-semibold placeholder:text-[var(--text-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          />
        </div>
      </section>

      {/* ── Deactivated devices warning ───────────────────────────────────── */}
      {deactivatedCount > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 mb-4">
          <p className="text-heading text-sm font-medium">
            {deactivatedCount} device{deactivatedCount !== 1 ? 's' : ''} in this scene {deactivatedCount === 1 ? 'is' : 'are'} deactivated
          </p>
          <p className="text-caption text-xs mt-1">
            Deactivated devices will be skipped when this scene activates. Reactivate them from the Devices page.
          </p>
        </div>
      )}

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <Tabs.Root defaultValue="lights" className="space-y-4">
        <Tabs.List className="flex gap-1 overflow-x-auto rounded-xl card p-1">
          <Tabs.Trigger value="lights" className={tabTriggerClass}>
            Lights
          </Tabs.Trigger>
          <Tabs.Trigger value="devices" className={tabTriggerClass}>
            Devices
          </Tabs.Trigger>
          <Tabs.Trigger value="settings" className={tabTriggerClass}>
            Settings
          </Tabs.Trigger>
        </Tabs.List>

        {/* ── Tab 1: Lights ─────────────────────────────────────────────── */}
        <Tabs.Content value="lights" className="space-y-6">
          {sceneRooms.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border-secondary)] py-8 text-center">
              <Lightbulb className="mx-auto mb-2 h-8 w-8 text-caption" />
              <p className="text-sm text-body">
                No rooms added to this scene yet.
              </p>
              <p className="mt-1 text-xs text-caption">
                Go to the Settings tab to add rooms first.
              </p>
            </div>
          ) : (
            <>
              {/* Search/filter */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-caption" />
                <input
                  type="search"
                  aria-label="Search lights by name"
                  placeholder="Search lights by name..."
                  value={lightSearch}
                  onChange={e => setLightSearch(e.target.value)}
                  className="h-11 w-full rounded-lg input-field border pl-10 pr-3 text-sm placeholder:text-[var(--text-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                />
              </div>

              {sceneRooms.map(sceneRoom => {
                const roomLights = roomLightsMap.get(sceneRoom.name) ?? []
                const filteredLights = filterRoomLights(roomLights)

                return (
                  <div key={sceneRoom.name}>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-heading">
                        {sceneRoom.name}
                        {roomLights.length > 0 && (
                          <span className="ml-1.5 text-xs font-normal text-caption">
                            ({roomLights.length} light{roomLights.length !== 1 ? 's' : ''})
                          </span>
                        )}
                      </h3>
                      {roomLights.length > 1 && (
                        <button
                          onClick={() => handleApplyToAllInRoom(sceneRoom.name)}
                          className="min-h-[44px] flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-fairy-400 transition-colors hover:bg-fairy-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Apply to all
                        </button>
                      )}
                    </div>

                    {roomLights.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-[var(--border-secondary)] py-6 text-center">
                        <p className="text-xs text-caption">
                          No lights assigned to this room.
                        </p>
                        <Link
                          to={`/rooms/${encodeURIComponent(sceneRoom.name)}`}
                          className="mt-1 inline-block text-xs text-fairy-400 hover:underline"
                        >
                          Set up lights for {sceneRoom.name}
                        </Link>
                      </div>
                    ) : filteredLights.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-[var(--border-secondary)] py-6 text-center text-xs text-caption">
                        No lights match &quot;{lightSearch}&quot; in this room.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {filteredLights.map(rl => {
                          const ls = lightStates.get(rl.light_id)
                          if (!ls) return null
                          return (
                            <LightEditorCard
                              key={rl.light_id}
                              state={ls}
                              livePreview={livePreviewLights.has(rl.light_id)}
                              onChange={updated =>
                                handleLightStateChange(rl.light_id, updated)
                              }
                              onLivePreviewToggle={() =>
                                toggleLivePreview(rl.light_id)
                              }
                              deactivated={isLightDeactivated(rl.light_id)}
                            />
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </Tabs.Content>

        {/* ── Tab 2: Devices ─────────────────────────────────────────────── */}
        <Tabs.Content value="devices" className="space-y-6">
          {sceneRooms.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border-secondary)] py-8 text-center">
              <ToggleLeft className="mx-auto mb-2 h-8 w-8 text-caption" />
              <p className="text-sm text-body">
                Add rooms in the Settings tab to see available devices.
              </p>
            </div>
          ) : totalDevices === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border-secondary)] py-8 text-center">
              <ToggleLeft className="mx-auto mb-2 h-8 w-8 text-caption" />
              <p className="text-sm text-body">
                No switches or devices assigned to these rooms.
              </p>
              <p className="mt-1 text-xs text-caption">
                Assign devices to rooms from the room detail page.
              </p>
            </div>
          ) : (
            <>
              {/* Switches section */}
              {categorizedDevices.switches.length > 0 && (
                <section>
                  <h3 className="mb-3 text-sm font-medium text-body">
                    Switches &amp; Hub Devices
                  </h3>
                  <div className="space-y-3">
                    {categorizedDevices.switches.map(device => {
                      const cmd = deviceCommands.find(
                        c => c.type === 'hubitat_device' && c.device_id === String(device.device_id),
                      )
                      const isOn = !!cmd
                      const isDimmer = device.device_type.toLowerCase().includes('dimmer')
                      const level = cmd?.brightness !== undefined
                        ? Math.round(cmd.brightness * 100)
                        : 100

                      return (
                        <DeviceToggleCard
                          key={`switch-${device.device_id}`}
                          label={device.device_label}
                          isOn={isOn}
                          onToggle={on => handleSwitchToggle(device, on)}
                          isDimmer={isDimmer}
                          level={level}
                          onLevelChange={l => handleSwitchLevel(device, l)}
                          deactivated={isHubDeviceDeactivated(String(device.device_id))}
                        />
                      )
                    })}
                  </div>
                </section>
              )}

              {/* Twinkly section */}
              {categorizedDevices.twinkly.length > 0 && (
                <section>
                  <h3 className="mb-3 text-sm font-medium text-body">
                    Twinkly Lights
                  </h3>
                  <div className="space-y-3">
                    {categorizedDevices.twinkly.map(device => {
                      const cmd = deviceCommands.find(
                        c => c.type === 'twinkly' && c.name === device.device_label,
                      )
                      return (
                        <DeviceToggleCard
                          key={`twinkly-${device.device_id}`}
                          label={device.device_label}
                          isOn={!!cmd}
                          onToggle={on => handleTwinklyToggle(device, on)}
                          deactivated={isHubDeviceDeactivated(String(device.device_id))}
                        />
                      )
                    })}
                  </div>
                </section>
              )}

              {/* Fairy Devices section */}
              {categorizedDevices.fairy.length > 0 && (
                <section>
                  <h3 className="mb-3 text-sm font-medium text-body">
                    Fairy Devices
                  </h3>
                  <div className="space-y-3">
                    {categorizedDevices.fairy.map(device => {
                      const cmd = deviceCommands.find(
                        c => c.type === 'fairy_device' && c.name === device.device_label,
                      )
                      const isOn = !!cmd
                      const pattern = cmd?.command || 'Morning'
                      const rawBrightness = cmd?.brightness ?? 100

                      return (
                        <FairyDeviceCard
                          key={`fairy-${device.device_id}`}
                          label={device.device_label}
                          isOn={isOn}
                          pattern={pattern}
                          brightness={isNaN(rawBrightness) ? 100 : rawBrightness}
                          onToggle={on => handleFairyToggle(device, on)}
                          onPatternChange={p => handleFairyPatternChange(device, p)}
                          onBrightnessChange={b => handleFairyBrightnessChange(device, b)}
                          deactivated={isHubDeviceDeactivated(String(device.device_id))}
                        />
                      )
                    })}
                  </div>
                </section>
              )}

              {/* Kasa Devices section */}
              {categorizedDevices.kasa.length > 0 && (
                <section>
                  <h3 className="mb-3 text-sm font-medium text-body">
                    Kasa Devices
                  </h3>
                  <div className="space-y-3">
                    {categorizedDevices.kasa.map(device => {
                      const cmd = deviceCommands.find(
                        c => c.type === 'kasa_device' && c.device_id === String(device.device_id),
                      )
                      return (
                        <DeviceToggleCard
                          key={`kasa-${device.device_id}`}
                          label={device.device_label}
                          isOn={!!cmd}
                          onToggle={on => handleKasaToggle(device, on)}
                          deactivated={isKasaDeviceDeactivated(String(device.device_id))}
                        />
                      )
                    })}
                  </div>
                </section>
              )}
            </>
          )}
        </Tabs.Content>

        {/* ── Tab 3: Settings ────────────────────────────────────────────── */}
        <Tabs.Content value="settings" className="space-y-6">
          {/* Room selection */}
          <section>
            <h3 className="mb-3 text-sm font-medium text-body">Rooms</h3>
            <div className="space-y-2">
              {allRooms?.map(room => {
                const inScene = sceneRooms.find(r => r.name === room.name)
                return (
                  <div
                    key={room.name}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border p-3 transition-colors',
                      inScene
                        ? 'border-fairy-500/30 bg-fairy-500/5'
                        : 'card',
                    )}
                  >
                    <button
                      onClick={() => handleRoomToggle(room.name)}
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                        inScene
                          ? 'border-fairy-500 bg-fairy-500 text-white'
                          : 'border-[var(--border-secondary)]',
                      )}
                      aria-label={`${inScene ? 'Remove' : 'Add'} ${room.name}`}
                    >
                      {inScene && (
                        <svg
                          className="h-3.5 w-3.5"
                          viewBox="0 0 14 14"
                          fill="none"
                        >
                          <path
                            d="M11.5 3.5L5.5 10L2.5 7"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>
                    <span className="min-w-0 flex-1 text-sm font-medium text-heading">
                      {room.name}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Mode selection */}
          <section>
            <h3 className="mb-3 text-sm font-medium text-body">Modes</h3>
            <p className="mb-2 text-xs text-caption">
              This scene will be available when any of these modes are active.
            </p>
            <div className="flex flex-wrap gap-2">
              {availableModes.map(mode => {
                const selected = modes.includes(mode)
                const modeIcon = modeIcons[mode] ?? null
                return (
                  <button
                    key={mode}
                    onClick={() => handleModeToggle(mode)}
                    className={cn(
                      'inline-flex items-center gap-1.5 min-h-[44px] rounded-lg px-3.5 py-2 text-sm font-medium transition-colors',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                      selected
                        ? 'bg-fairy-500 text-white'
                        : 'surface text-body hover:text-heading',
                    )}
                  >
                    <LucideIcon name={modeIcon} className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {mode}
                  </button>
                )
              })}
            </div>
          </section>

          {/* Default scene */}
          <section>
            <h3 className="mb-3 text-sm font-medium text-body">Default scene</h3>
            <p className="mb-3 text-xs text-caption">
              Set this scene as the default for a room and mode. The default scene activates automatically when motion is detected.
            </p>
            {sceneRooms.length === 0 ? (
              <p className="text-xs text-caption">Assign this scene to at least one room to set it as a default.</p>
            ) : modes.length === 0 ? (
              <p className="text-xs text-caption">Assign this scene to at least one mode to set it as a default.</p>
            ) : (
              <ul className="space-y-2">
                {sceneRooms.flatMap(sceneRoom =>
                  modes.map(mode => {
                    const currentDefault = allDefaultScenes?.[sceneRoom.name]?.[mode] ?? null
                    const isThisDefault = currentDefault === name
                    const replacingScene = !isThisDefault && currentDefault
                      ? allScenes?.find(s => s.name === currentDefault)
                      : null

                    return (
                      <li key={`${sceneRoom.name}::${mode}`} className="card rounded-lg border p-3">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setDefaultSceneMutation.mutate({
                                roomName: sceneRoom.name,
                                mode,
                                scene: isThisDefault ? null : (name ?? null),
                              })
                            }}
                            aria-label={isThisDefault
                              ? `Clear as default scene for ${sceneRoom.name} during ${mode}`
                              : `Set as default scene for ${sceneRoom.name} during ${mode}`}
                            className={cn(
                              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                              isThisDefault
                                ? 'border-fairy-500 bg-fairy-500'
                                : 'border-[var(--border-secondary)] hover:border-fairy-400',
                            )}
                          >
                            {isThisDefault && (
                              <Activity className="h-3 w-3 text-white" aria-hidden="true" />
                            )}
                          </button>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-heading">
                              {sceneRoom.name} during{' '}
                              <span className="inline-flex items-center gap-1">
                                <LucideIcon name={modeIcons[mode] ?? null} className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                {mode}
                              </span>
                            </p>
                            {replacingScene && (
                              <p className="mt-0.5 text-xs text-caption">
                                Currently &quot;{replacingScene.name}&quot; is the default. Setting this scene will replace it.
                              </p>
                            )}
                          </div>
                        </div>
                      </li>
                    )
                  })
                )}
              </ul>
            )}
          </section>

          {/* Season */}
          <section>
            <h3 className="mb-3 text-sm font-medium text-body">Season</h3>
            <p className="mb-3 text-xs text-caption">
              Restrict this scene to specific dates each year. Outside this range it won't activate from motion, but you can still trigger it manually.
            </p>
            <OptionToggle
              label="Enable seasonal dates"
              description={
                seasonEnabled
                  ? `Active ${MONTH_NAMES[seasonFromMonth - 1]} ${seasonFromDay} — ${MONTH_NAMES[seasonToMonth - 1]} ${seasonToDay}`
                  : 'Active all year'
              }
              enabled={seasonEnabled}
              onToggle={setSeasonEnabled}
              icon={CalendarDays}
            >
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-body">From</label>
                  <div className="flex gap-2">
                    <select
                      value={seasonFromMonth}
                      onChange={e => setSeasonFromMonth(Number(e.target.value))}
                      className="h-11 flex-1 rounded-lg input-field border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                    >
                      {MONTH_NAMES.map((m, i) => (
                        <option key={m} value={i + 1}>{m}</option>
                      ))}
                    </select>
                    <select
                      value={seasonFromDay}
                      onChange={e => setSeasonFromDay(Number(e.target.value))}
                      className="h-11 w-20 rounded-lg input-field border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                    >
                      {Array.from({ length: 31 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>{i + 1}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-body">To</label>
                  <div className="flex gap-2">
                    <select
                      value={seasonToMonth}
                      onChange={e => setSeasonToMonth(Number(e.target.value))}
                      className="h-11 flex-1 rounded-lg input-field border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                    >
                      {MONTH_NAMES.map((m, i) => (
                        <option key={m} value={i + 1}>{m}</option>
                      ))}
                    </select>
                    <select
                      value={seasonToDay}
                      onChange={e => setSeasonToDay(Number(e.target.value))}
                      className="h-11 w-20 rounded-lg input-field border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                    >
                      {Array.from({ length: 31 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>{i + 1}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </OptionToggle>
          </section>

          {/* Scene Options */}
          <section>
            <h3 className="mb-3 text-sm font-medium text-body">
              Scene Options
            </h3>
            <div className="space-y-3">
              <OptionToggle
                label="All Off"
                description="Turn off all lights when this scene activates"
                enabled={allOffEnabled}
                onToggle={setAllOffEnabled}
                icon={Power}
              />

              <OptionToggle
                label="Change Mode"
                description="Switch to a different mode when this scene activates"
                enabled={modeChangeEnabled}
                onToggle={on => {
                  setModeChangeEnabled(on)
                  if (!on) setModeChangeTarget('')
                }}
                icon={Zap}
              >
                <select
                  value={modeChangeTarget}
                  onChange={e => setModeChangeTarget(e.target.value)}
                  className="h-11 w-full rounded-lg input-field border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                >
                  <option value="">Select a mode</option>
                  {availableModes.map(mode => (
                    <option key={mode} value={mode}>{mode}</option>
                  ))}
                </select>
              </OptionToggle>

              <OptionToggle
                label="Scene Timer"
                description="Activate another scene after a delay"
                enabled={sceneTimerEnabled}
                onToggle={on => {
                  setSceneTimerEnabled(on)
                  if (!on) {
                    setSceneTimerTarget('')
                    setSceneTimerDuration(300)
                  }
                }}
                icon={Timer}
              >
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs text-body">
                      Switch to scene
                    </label>
                    <select
                      value={sceneTimerTarget}
                      onChange={e => setSceneTimerTarget(e.target.value)}
                      className="h-11 w-full rounded-lg input-field border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                    >
                      <option value="">Select a scene</option>
                      {otherScenes.map(s => (
                        <option key={s.name} value={s.name}>
                          {s.icon ? `${s.icon} ` : ''}{s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs text-body">
                      After (seconds)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={sceneTimerDuration}
                      onChange={e => setSceneTimerDuration(Number(e.target.value))}
                      className="h-11 w-full rounded-lg input-field border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                    />
                  </div>
                </div>
              </OptionToggle>

              <OptionToggle
                label="Chain Scene"
                description="Also activate another scene at the same time"
                enabled={chainSceneEnabled}
                onToggle={on => {
                  setChainSceneEnabled(on)
                  if (!on) setChainSceneTarget('')
                }}
                icon={Link2}
              >
                <select
                  value={chainSceneTarget}
                  onChange={e => setChainSceneTarget(e.target.value)}
                  className="h-11 w-full rounded-lg input-field border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                >
                  <option value="">Select a scene</option>
                  {otherScenes.map(s => (
                    <option key={s.name} value={s.name}>
                      {s.icon ? `${s.icon} ` : ''}{s.name}
                    </option>
                  ))}
                </select>
              </OptionToggle>
            </div>
          </section>

          {/* Tags */}
          <section>
            <h3 className="mb-3 text-sm font-medium text-body">Tags</h3>
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <span
                  key={tag}
                  className="flex items-center gap-1 rounded-full surface px-2.5 py-1 text-xs font-medium text-heading"
                >
                  {tag}
                  <button
                    onClick={() => setTags(tags.filter(t => t !== tag))}
                    className="rounded-full p-0.5 transition-colors hover:text-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                    aria-label={`Remove tag ${tag}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <form
              onSubmit={e => {
                e.preventDefault()
                handleAddTag()
              }}
              className="mt-2 flex gap-2"
            >
              <input
                type="text"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                placeholder="Add tag"
                className="h-11 min-w-0 flex-1 rounded-lg input-field border px-3 text-sm placeholder:text-caption focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
              />
              <button
                type="submit"
                disabled={!tagInput.trim()}
                className="min-h-[44px] rounded-lg surface px-3 text-sm font-medium text-heading transition-colors hover:brightness-95 dark:hover:brightness-110 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
              >
                Add
              </button>
            </form>
          </section>

          {/* Danger zone */}
          <section>
            <h3 className="mb-3 text-sm font-medium text-red-400">
              Danger Zone
            </h3>
            <button
              onClick={() => {
                if (
                  window.confirm(
                    `Delete "${sceneName}"? This cannot be undone.`,
                  )
                ) {
                  deleteMutation.mutate()
                }
              }}
              disabled={deleteMutation.isPending}
              className="flex min-h-[44px] items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
            >
              <Trash2 className="h-4 w-4" />
              {deleteMutation.isPending ? 'Deleting...' : 'Delete Scene'}
            </button>
          </section>
        </Tabs.Content>
      </Tabs.Root>

      {/* ── Sticky save bar ───────────────────────────────────────────────── */}
      <div className="fixed inset-x-0 bottom-[60px] z-30 border-t chrome p-4 md:bottom-0 md:left-56">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <Link
            to="/scenes"
            className="min-h-[44px] rounded-lg px-4 py-2.5 text-sm font-medium text-body transition-colors hover:text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            Cancel
          </Link>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-fairy-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-fairy-600 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            <Save className="h-4 w-4" />
            {saveMutation.isPending ? 'Saving...' : 'Save Scene'}
          </button>
        </div>
      </div>
    </div>
  )
}
