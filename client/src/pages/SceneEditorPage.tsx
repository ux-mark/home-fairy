import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Save,
  Eye,
  EyeOff,
  Plus,
  X,
  Power,
  Trash2,
  Lightbulb,
  Search,
  Copy,
  AlertTriangle,
} from 'lucide-react'
import * as Tabs from '@radix-ui/react-tabs'
import * as Switch from '@radix-ui/react-switch'
import { api } from '@/lib/api'
import type {
  Scene,
  SceneCommand,
  SceneRoom,
  Room,
  LightRoom,
  Light,
} from '@/lib/api'
import { cn, hsbToHex, kelvinToHex, debounce, DEFAULT_MODES } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import ColorBrightnessPicker from '@/components/ui/ColorBrightnessPicker'
import SceneCommandCard from '@/components/ui/SceneCommandCard'

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
}: {
  state: LightEditorState
  livePreview: boolean
  onChange: (updated: LightEditorState) => void
  onLivePreviewToggle: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isOn = state.power === 'on'

  // Preview colour — 40px circle
  const previewHex = state.hasColor
    ? hsbToHex(state.hue, state.saturation / 100, state.brightness / 100)
    : kelvinToHex(state.kelvin)

  // Debounced live change for API calls
  const debouncedApiCall = useMemo(() => {
    return debounce(
      (update: { color?: { h: number; s: number; l: number }; kelvin?: number; brightness?: number }) => {
        if (!livePreview) return
        const lifxColor = update.color
          ? `hue:${update.color.h} saturation:${(update.color.s / 100).toFixed(2)}`
          : update.kelvin
            ? `kelvin:${update.kelvin}`
            : undefined
        const lifxBrightness = update.brightness !== undefined ? update.brightness / 100 : undefined
        api.lifx.setState(state.selector, {
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
    (update: { color?: { h: number; s: number; l: number }; kelvin?: number; brightness?: number }) => {
      if (!livePreview) return
      debouncedApiCall(update)
    },
    [livePreview, debouncedApiCall],
  )

  return (
    <div className="rounded-xl card border transition-colors">
      {/* Header row - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-fairy-500"
      >
        {/* Large colour preview circle (40px) */}
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
          <p className="truncate text-sm font-medium text-heading">
            {state.label}
          </p>
          <p className="text-xs text-caption">
            {isOn
              ? `${state.brightness}% brightness`
              : 'Off'}
          </p>
        </div>
        {/* Power toggle (stop propagation) */}
        <button
          onClick={e => {
            e.stopPropagation()
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
              : 'text-caption hover:surface',
          )}
          aria-label={`Turn ${state.label} ${isOn ? 'off' : 'on'}`}
        >
          <Power className="h-5 w-5" />
        </button>
      </button>

      {/* Expanded colour/brightness controls */}
      {expanded && isOn && (
        <div className="border-t border-[var(--border-primary)] p-4">
          {/* Live preview toggle with warning */}
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
                  livePreview ? 'bg-fairy-500' : 'bg-slate-700',
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
              }
              if (update.kelvin !== undefined) next.kelvin = update.kelvin
              if (update.brightness !== undefined)
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

  const availableModes = systemCurrent?.all_modes ?? [...DEFAULT_MODES]

  // ── Form state ───────────────────────────────────────────────────────────

  const [sceneName, setSceneName] = useState('')
  const [icon, setIcon] = useState('')
  const [sceneRooms, setSceneRooms] = useState<SceneRoom[]>([])
  const [modes, setModes] = useState<string[]>([])
  const [commands, setCommands] = useState<SceneCommand[]>([])
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

  // Initialize state from scene data
  useEffect(() => {
    if (scene && !initialized) {
      setSceneName(scene.name)
      setIcon(scene.icon ?? '')
      // Filter out malformed room entries (e.g. entries with no name)
      const validRooms = (Array.isArray(scene.rooms) ? scene.rooms : []).filter(
        (r): r is SceneRoom => !!r && typeof r.name === 'string' && r.name.length > 0,
      )
      setSceneRooms(validRooms)
      setModes(Array.isArray(scene.modes) ? scene.modes : [])
      setCommands(Array.isArray(scene.commands) ? scene.commands : [])
      setTags(Array.isArray(scene.tags) ? scene.tags : [])

      // Build light states from commands
      const states = new Map<string, LightEditorState>()
      for (const cmd of scene.commands) {
        if (cmd.type === 'lifx_light' && cmd.light_id) {
          // Parse the color string
          let hue = 0, sat = 0, kelvin = 3500
          if (cmd.color) {
            const hueMatch = cmd.color.match(/hue:([\d.]+)/)
            const satMatch = cmd.color.match(/saturation:([\d.]+)/)
            const kelvinMatch = cmd.color.match(/kelvin:(\d+)/)
            if (hueMatch) hue = parseFloat(hueMatch[1])
            if (satMatch) sat = parseFloat(satMatch[1]) * 100
            if (kelvinMatch) kelvin = parseInt(kelvinMatch[1])
          }

          // Find the light assignment for capabilities
          const assignment = allAssignments?.find(
            a => a.light_id === cmd.light_id,
          )

          states.set(cmd.light_id, {
            lightId: cmd.light_id,
            selector: cmd.selector ?? `id:${cmd.light_id}`,
            label: cmd.name,
            hasColor: assignment?.has_color ?? true,
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

  // Lights grouped by room for the scene's rooms
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
        const roomLights = allAssignments.filter(
          a => a.room_name === room.name,
        )
        for (const rl of roomLights) {
          if (!next.has(rl.light_id)) {
            const live = allLights.find(l => l.id === rl.light_id)
            next.set(rl.light_id, {
              lightId: rl.light_id,
              selector: rl.light_selector || `id:${rl.light_id}`,
              label: rl.light_label,
              hasColor: rl.has_color,
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

  // ── Mutations ────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: () => {
      // Build commands from light states + existing non-light commands
      const lightCommands: SceneCommand[] = []
      for (const [, ls] of lightStates) {
        // Only include lights in rooms that are still part of the scene
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

      const nonLightCommands = commands.filter(c => c.type !== 'lifx_light')
      const allCommands = [...lightCommands, ...nonLightCommands]

      const data: Partial<Scene> = {
        name: sceneName,
        icon,
        rooms: sceneRooms,
        modes,
        commands: allCommands,
        tags,
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

  // ── Handlers ─────────────────────────────────────────────────────────────

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
      setSceneRooms([...sceneRooms, { name: roomName, priority: 50 }])
    }
  }

  const handleRoomPriorityChange = (roomName: string, priority: number) => {
    setSceneRooms(
      sceneRooms.map(r => (r.name === roomName ? { ...r, priority } : r)),
    )
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

  const handleAddCommand = () => {
    setCommands([
      ...commands,
      { type: 'all_off', name: '' },
    ])
  }

  const handleCommandChange = (index: number, command: SceneCommand) => {
    const updated = [...commands]
    updated[index] = command
    setCommands(updated)
  }

  const handleCommandDelete = (index: number) => {
    setCommands(commands.filter((_, i) => i !== index))
  }

  const handleApplyToAllInRoom = (roomName: string) => {
    const roomLights = roomLightsMap.get(roomName) ?? []
    if (roomLights.length === 0) return
    // Use the first light's state as template
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

  // Filter lights within a room by search
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

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="pb-24">
      {/* Back link */}
      <Link
        to="/scenes"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-body transition-colors hover:text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
      >
        <ArrowLeft className="h-4 w-4" />
        All Scenes
      </Link>

      {/* ── Top section: name + icon ──────────────────────────────────────── */}
      <section className="mb-6 space-y-3">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={icon}
            onChange={e => setIcon(e.target.value)}
            placeholder="Icon"
            maxLength={4}
            className="h-12 w-14 shrink-0 rounded-xl border border-[var(--border-secondary)] surface text-center text-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
            aria-label="Scene icon (emoji or text)"
          />
          <input
            type="text"
            value={sceneName}
            onChange={e => setSceneName(e.target.value)}
            placeholder="Scene name"
            className="h-12 min-w-0 flex-1 rounded-xl border border-[var(--border-secondary)] surface px-4 text-lg font-semibold text-heading placeholder:text-caption focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          />
        </div>
      </section>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <Tabs.Root defaultValue="lights" className="space-y-4">
        <Tabs.List className="flex gap-1 overflow-x-auto rounded-xl card p-1">
          <Tabs.Trigger
            value="lights"
            className={cn(
              'min-h-[44px] flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              'data-[state=active]:bg-fairy-500 data-[state=active]:text-white',
              'data-[state=inactive]:text-body data-[state=inactive]:hover:text-heading',
            )}
          >
            Lights
          </Tabs.Trigger>
          <Tabs.Trigger
            value="rooms"
            className={cn(
              'min-h-[44px] flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              'data-[state=active]:bg-fairy-500 data-[state=active]:text-white',
              'data-[state=inactive]:text-body data-[state=inactive]:hover:text-heading',
            )}
          >
            Rooms & Modes
          </Tabs.Trigger>
          <Tabs.Trigger
            value="advanced"
            className={cn(
              'min-h-[44px] flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              'data-[state=active]:bg-fairy-500 data-[state=active]:text-white',
              'data-[state=inactive]:text-body data-[state=inactive]:hover:text-heading',
            )}
          >
            Advanced
          </Tabs.Trigger>
        </Tabs.List>

        {/* ── Tab 1: Lights ─────────────────────────────────────────────── */}
        <Tabs.Content value="lights" className="space-y-6">
          {sceneRooms.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border-secondary)] py-8 text-center">
              <Lightbulb className="mx-auto mb-2 h-8 w-8 text-slate-600" />
              <p className="text-sm text-body">
                No rooms added to this scene yet.
              </p>
              <p className="mt-1 text-xs text-caption">
                Go to the "Rooms & Modes" tab to add rooms first.
              </p>
            </div>
          ) : (
            <>
              {/* Search/filter at top */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-caption" />
                <input
                  type="search"
                  placeholder="Search lights by name..."
                  value={lightSearch}
                  onChange={e => setLightSearch(e.target.value)}
                  className="h-11 w-full rounded-lg border border-[var(--border-secondary)] surface pl-10 pr-3 text-sm text-heading placeholder:text-caption focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                />
              </div>

              {sceneRooms.map(sceneRoom => {
                const roomLights = roomLightsMap.get(sceneRoom.name) ?? []
                const filteredLights = filterRoomLights(roomLights)

                return (
                  <div key={sceneRoom.name}>
                    {/* Room heading with "Apply to all" */}
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
                        No lights match "{lightSearch}" in this room.
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

        {/* ── Tab 2: Rooms & Modes ──────────────────────────────────────── */}
        <Tabs.Content value="rooms" className="space-y-6">
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
                        : 'border-[var(--border-primary)] card',
                    )}
                  >
                    <button
                      onClick={() => handleRoomToggle(room.name)}
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                        inScene
                          ? 'border-fairy-500 bg-fairy-500 text-white'
                          : 'border-slate-600',
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
                    {inScene && (
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-caption">
                          Priority
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={inScene.priority}
                          onChange={e =>
                            handleRoomPriorityChange(
                              room.name,
                              Number(e.target.value),
                            )
                          }
                          className="h-9 w-16 rounded-lg border border-[var(--border-secondary)] surface px-2 text-center text-sm text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          {/* Mode selection */}
          <section>
            <h3 className="mb-3 text-sm font-medium text-body">Modes</h3>
            <div className="flex flex-wrap gap-2">
              {availableModes.map(mode => {
                const selected = modes.includes(mode)
                return (
                  <button
                    key={mode}
                    onClick={() => handleModeToggle(mode)}
                    className={cn(
                      'min-h-[44px] rounded-lg px-3.5 py-2 text-sm font-medium transition-colors',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                      selected
                        ? 'bg-fairy-500 text-white'
                        : 'surface text-body hover:text-heading',
                    )}
                  >
                    {mode}
                  </button>
                )
              })}
            </div>
          </section>
        </Tabs.Content>

        {/* ── Tab 3: Advanced ───────────────────────────────────────────── */}
        <Tabs.Content value="advanced" className="space-y-6">
          {/* Commands (non-light ones) */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-body">Commands</h3>
              <button
                onClick={handleAddCommand}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-fairy-400 transition-colors hover:bg-fairy-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Command
              </button>
            </div>
            {commands.filter(c => c.type !== 'lifx_light').length > 0 ? (
              <div className="space-y-3">
                {commands.map((cmd, i) => {
                  if (cmd.type === 'lifx_light') return null
                  return (
                    <SceneCommandCard
                      key={i}
                      command={cmd}
                      index={i}
                      onChange={handleCommandChange}
                      onDelete={handleCommandDelete}
                    />
                  )
                })}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-[var(--border-secondary)] py-6 text-center text-xs text-caption">
                No additional commands. Light commands are managed in the Lights
                tab.
              </p>
            )}
          </section>

          {/* Tags */}
          <section>
            <h3 className="mb-3 text-sm font-medium text-body">Tags</h3>
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <span
                  key={tag}
                  className="flex items-center gap-1 rounded-full surface px-2.5 py-1 text-xs font-medium text-slate-300"
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
                className="h-11 min-w-0 flex-1 rounded-lg border border-[var(--border-secondary)] surface px-3 text-sm text-heading placeholder:text-caption focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
              />
              <button
                type="submit"
                disabled={!tagInput.trim()}
                className="min-h-[44px] rounded-lg surface px-3 text-sm font-medium text-slate-300 transition-colors hover:bg-[var(--bg-tertiary)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
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
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border-primary)] card/95 p-4 backdrop-blur-sm md:bottom-0 md:left-56">
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
