import { useState, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Plus,
  X,
  Zap,
  Save,
  Wifi,
  WifiOff,
  Lightbulb,
  Trash2,
  Search,
  ToggleLeft,
  Activity,
} from 'lucide-react'
import * as Switch from '@radix-ui/react-switch'
import * as Tabs from '@radix-ui/react-tabs'
import { api } from '@/lib/api'
import type { Light, LightAssignment, RoomDetail, Sensor, Room, HubDevice, DeviceRoomAssignment } from '@/lib/api'
import { cn, getLightColorHex } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'

// ── Helpers ──────────────────────────────────────────────────────────────────

function toAssignment(light: Light): LightAssignment {
  return {
    id: light.id,
    label: light.label,
    has_color: light.product.capabilities.has_color,
    min_kelvin: light.product.capabilities.min_kelvin,
    max_kelvin: light.product.capabilities.max_kelvin,
  }
}

// ── Available light card ─────────────────────────────────────────────────────

function AvailableLightRow({
  light,
  onAdd,
  onIdentify,
}: {
  light: Light
  onAdd: () => void
  onIdentify: () => void
}) {
  const isOn = light.power === 'on'
  const colorHex = getLightColorHex(light)

  return (
    <div className="flex items-center gap-3 rounded-lg card border/50 px-3 py-2.5 transition-colors hover:border-[var(--border-secondary)]">
      <div
        className={cn('h-4 w-4 shrink-0 rounded-full', !isOn && 'opacity-30')}
        style={{ backgroundColor: isOn ? colorHex : '#475569' }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-heading">
          {light.label}
        </p>
        <p className="truncate text-xs text-caption">{light.group.name}</p>
      </div>
      {light.connected ? (
        <Wifi className="h-3 w-3 shrink-0 text-fairy-500" />
      ) : (
        <WifiOff className="h-3 w-3 shrink-0 text-red-400" />
      )}
      <button
        onClick={onIdentify}
        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-body transition-colors hover:surface hover:text-fairy-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        aria-label={`Identify ${light.label}`}
        title="Flash this light"
      >
        <Zap className="h-4 w-4" />
      </button>
      <button
        onClick={onAdd}
        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-fairy-500/15 text-fairy-400 transition-colors hover:bg-fairy-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        aria-label={`Assign ${light.label} to this room`}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}

// ── Assigned light card ──────────────────────────────────────────────────────

function AssignedLightRow({
  assignment,
  light,
  onRemove,
  onIdentify,
}: {
  assignment: LightAssignment
  light?: Light
  onRemove: () => void
  onIdentify: () => void
}) {
  const isOn = light?.power === 'on'
  const colorHex = light ? getLightColorHex(light) : '#475569'

  return (
    <div className="flex items-center gap-3 rounded-lg border border-fairy-500/20 bg-fairy-500/5 px-3 py-2.5 transition-colors">
      <div
        className={cn('h-4 w-4 shrink-0 rounded-full', !isOn && 'opacity-30')}
        style={{ backgroundColor: isOn ? colorHex : '#475569' }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-heading">
          {assignment.label}
        </p>
        <p className="text-xs text-caption">
          {isOn ? (
            <span className="text-fairy-400">On</span>
          ) : (
            <span>Off</span>
          )}
          {' \u00B7 '}
          {assignment.has_color ? 'Colour' : 'White only'}
        </p>
      </div>
      <button
        onClick={onIdentify}
        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-body transition-colors hover:surface hover:text-fairy-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        aria-label={`Identify ${assignment.label}`}
        title="Flash this light"
      >
        <Zap className="h-4 w-4" />
      </button>
      <button
        onClick={onRemove}
        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-body transition-colors hover:bg-red-500/10 hover:text-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        aria-label={`Remove ${assignment.label} from this room`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

// ── Device type badge ────────────────────────────────────────────────────────

const deviceTypeBadgeClasses: Record<string, string> = {
  switch: 'bg-blue-500/15 text-blue-400',
  dimmer: 'bg-purple-500/15 text-purple-400',
  contact: 'bg-amber-500/15 text-amber-400',
  twinkly: 'bg-pink-500/15 text-pink-400',
  fairy: 'bg-cyan-500/15 text-cyan-400',
}

function DeviceTypeBadge({ type }: { type: string }) {
  const cls = deviceTypeBadgeClasses[type] ?? 'bg-slate-700 text-body'
  return (
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', cls)}>
      {type}
    </span>
  )
}

// ── Assigned device row ─────────────────────────────────────────────────────

function AssignedDeviceRow({
  assignment,
  onRemove,
}: {
  assignment: DeviceRoomAssignment
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-fairy-500/20 bg-fairy-500/5 px-3 py-2.5 transition-colors">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-heading">
          {assignment.device_label}
        </p>
      </div>
      <DeviceTypeBadge type={assignment.device_type} />
      <button
        onClick={onRemove}
        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-body transition-colors hover:bg-red-500/10 hover:text-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        aria-label={`Remove ${assignment.device_label} from this room`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

// ── Available device row ────────────────────────────────────────────────────

function AvailableDeviceRow({
  device,
  onAdd,
}: {
  device: HubDevice
  onAdd: () => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg card border/50 px-3 py-2.5 transition-colors hover:border-[var(--border-secondary)]">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-heading">
          {device.label}
        </p>
      </div>
      <DeviceTypeBadge type={device.device_type} />
      <button
        onClick={onAdd}
        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-fairy-500/15 text-fairy-400 transition-colors hover:bg-fairy-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        aria-label={`Assign ${device.label} to this room`}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function RoomDetailPage() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // Search state for lights and devices
  const [lightSearch, setLightSearch] = useState('')
  const [deviceSearch, setDeviceSearch] = useState('')

  // Active device tab
  const [activeTab, setActiveTab] = useState('lights')

  // Fetch room detail
  const { data: room, isLoading: roomLoading } = useQuery({
    queryKey: ['rooms', name],
    queryFn: () => api.rooms.get(name!),
    enabled: !!name,
  })

  // Fetch all rooms for parent selector
  const { data: allRooms } = useQuery({
    queryKey: ['rooms'],
    queryFn: api.rooms.getAll,
  })

  // Fetch all LIFX lights
  const { data: allLights } = useQuery({
    queryKey: ['lifx', 'lights'],
    queryFn: api.lifx.getLights,
  })

  // Fetch all room assignments
  const { data: allAssignments } = useQuery({
    queryKey: ['lights', 'rooms'],
    queryFn: api.lights.getRoomAssignments,
  })

  // Fetch all Hubitat devices
  const { data: allHubDevices } = useQuery({
    queryKey: ['hubitat', 'devices'],
    queryFn: api.hubitat.getDevices,
  })

  // Fetch all Hubitat device-room assignments
  const { data: allDeviceRoomAssignments } = useQuery({
    queryKey: ['hubitat', 'device-rooms'],
    queryFn: api.hubitat.getDeviceRooms,
  })

  // Room settings state
  const [displayOrder, setDisplayOrder] = useState<number | null>(null)
  const [timer, setTimer] = useState<number | null>(null)
  const [autoEnabled, setAutoEnabled] = useState<boolean | null>(null)
  const [parentRoom, setParentRoom] = useState<string | null>(null)
  const [sensors, setSensors] = useState<Sensor[] | null>(null)
  const [roomNameEdit, setRoomNameEdit] = useState<string | null>(null)

  // Compute effective values (from state or room data)
  const effectiveOrder = displayOrder ?? room?.display_order ?? 0
  const effectiveTimer = timer ?? room?.timer ?? 0
  const effectiveAuto = autoEnabled ?? room?.auto ?? false
  const effectiveParent = parentRoom ?? room?.parent_room ?? ''
  const effectiveSensors = sensors ?? room?.sensors ?? []
  const effectiveRoomName = roomNameEdit ?? room?.name ?? ''

  // Light assignment state
  const [assigned, setAssigned] = useState<LightAssignment[] | null>(null)
  const [dirty, setDirty] = useState(false)

  // Compute assigned lights (from state or room data)
  const effectiveAssigned: LightAssignment[] = useMemo(() => {
    if (assigned !== null) return assigned
    return (
      room?.lights.map(l => ({
        id: l.light_id,
        label: l.light_label,
        has_color: l.has_color,
        min_kelvin: l.min_kelvin,
        max_kelvin: l.max_kelvin,
      })) ?? []
    )
  }, [assigned, room])

  // IDs already assigned to ANY room
  const assignedToOtherRooms = useMemo(() => {
    if (!allAssignments) return new Set<string>()
    return new Set(
      allAssignments
        .filter(a => a.room_name !== name)
        .map(a => a.light_id),
    )
  }, [allAssignments, name])

  // Lights available to assign (not assigned to any room), grouped by LIFX group
  const availableLights = useMemo(() => {
    if (!allLights) return []
    const assignedIds = new Set(effectiveAssigned.map(a => a.id))
    return allLights.filter(
      l => !assignedIds.has(l.id) && !assignedToOtherRooms.has(l.id),
    )
  }, [allLights, effectiveAssigned, assignedToOtherRooms])

  // Group available lights by LIFX group
  const availableByGroup = useMemo(() => {
    const groups = new Map<string, Light[]>()
    for (const light of availableLights) {
      const groupName = light.group.name || 'Ungrouped'
      if (!groups.has(groupName)) groups.set(groupName, [])
      groups.get(groupName)!.push(light)
    }
    return groups
  }, [availableLights])

  // Filter assigned lights by search
  const filteredAssigned = useMemo(() => {
    if (!lightSearch.trim()) return effectiveAssigned
    const q = lightSearch.toLowerCase()
    return effectiveAssigned.filter(a => a.label.toLowerCase().includes(q))
  }, [effectiveAssigned, lightSearch])

  // Filter available lights by search
  const filteredAvailableByGroup = useMemo(() => {
    if (!lightSearch.trim()) return availableByGroup
    const q = lightSearch.toLowerCase()
    const filtered = new Map<string, Light[]>()
    for (const [group, lights] of availableByGroup) {
      const matching = lights.filter(l => l.label.toLowerCase().includes(q))
      if (matching.length > 0) filtered.set(group, matching)
    }
    return filtered
  }, [availableByGroup, lightSearch])

  // Build a map from light ID to Light object for assigned lights
  const lightById = useMemo(() => {
    if (!allLights) return new Map<string, Light>()
    return new Map(allLights.map(l => [l.id, l]))
  }, [allLights])

  // ── Device (switches/dimmers/twinkly/fairy) assignment state ──────────
  const SWITCH_TYPES = ['switch', 'dimmer']
  const OTHER_TYPES = ['twinkly', 'fairy']
  const ALL_DEVICE_TYPES = [...SWITCH_TYPES, ...OTHER_TYPES]

  // Devices assigned to THIS room (from API or local pending state)
  const [pendingDeviceAssigns, setPendingDeviceAssigns] = useState<
    { device_id: string; device_label: string; device_type: string }[]
  >([])
  const [pendingDeviceUnassigns, setPendingDeviceUnassigns] = useState<string[]>([])

  // Devices currently assigned to this room from API
  const apiDevicesForRoom = useMemo(() => {
    if (!allDeviceRoomAssignments) return []
    return allDeviceRoomAssignments.filter(a => a.room_name === name)
  }, [allDeviceRoomAssignments, name])

  // Effective assigned devices = API assignments minus pending unassigns plus pending assigns
  const effectiveDeviceAssignments = useMemo(() => {
    const base = apiDevicesForRoom.filter(
      a => !pendingDeviceUnassigns.includes(a.device_id),
    )
    const pending: DeviceRoomAssignment[] = pendingDeviceAssigns.map(p => ({
      id: 0,
      device_id: p.device_id,
      device_label: p.device_label,
      device_type: p.device_type,
      room_name: name!,
      config: {},
    }))
    return [...base, ...pending]
  }, [apiDevicesForRoom, pendingDeviceAssigns, pendingDeviceUnassigns, name])

  // Assigned switches/dimmers
  const assignedSwitches = useMemo(
    () => effectiveDeviceAssignments.filter(d => SWITCH_TYPES.includes(d.device_type)),
    [effectiveDeviceAssignments],
  )

  // Assigned other devices (twinkly/fairy)
  const assignedOtherDevices = useMemo(
    () => effectiveDeviceAssignments.filter(d => OTHER_TYPES.includes(d.device_type)),
    [effectiveDeviceAssignments],
  )

  // All device IDs already assigned to ANY room
  const deviceIdsAssignedToAnyRoom = useMemo(() => {
    if (!allDeviceRoomAssignments) return new Set<string>()
    return new Set(allDeviceRoomAssignments.map(a => a.device_id))
  }, [allDeviceRoomAssignments])

  // Hub devices available (not assigned to any room), matching relevant types
  const availableSwitchDevices = useMemo(() => {
    if (!allHubDevices) return []
    const assignedIds = new Set(effectiveDeviceAssignments.map(d => d.device_id))
    return allHubDevices.filter(
      d =>
        SWITCH_TYPES.includes(d.device_type) &&
        !assignedIds.has(String(d.id)) &&
        !deviceIdsAssignedToAnyRoom.has(String(d.id)),
    )
  }, [allHubDevices, effectiveDeviceAssignments, deviceIdsAssignedToAnyRoom])

  const availableOtherDevices = useMemo(() => {
    if (!allHubDevices) return []
    const assignedIds = new Set(effectiveDeviceAssignments.map(d => d.device_id))
    return allHubDevices.filter(
      d =>
        OTHER_TYPES.includes(d.device_type) &&
        !assignedIds.has(String(d.id)) &&
        !deviceIdsAssignedToAnyRoom.has(String(d.id)),
    )
  }, [allHubDevices, effectiveDeviceAssignments, deviceIdsAssignedToAnyRoom])

  // Filter by device search
  const filteredAssignedSwitches = useMemo(() => {
    if (!deviceSearch.trim()) return assignedSwitches
    const q = deviceSearch.toLowerCase()
    return assignedSwitches.filter(d => d.device_label.toLowerCase().includes(q))
  }, [assignedSwitches, deviceSearch])

  const filteredAssignedOther = useMemo(() => {
    if (!deviceSearch.trim()) return assignedOtherDevices
    const q = deviceSearch.toLowerCase()
    return assignedOtherDevices.filter(d => d.device_label.toLowerCase().includes(q))
  }, [assignedOtherDevices, deviceSearch])

  const filteredAvailableSwitches = useMemo(() => {
    if (!deviceSearch.trim()) return availableSwitchDevices
    const q = deviceSearch.toLowerCase()
    return availableSwitchDevices.filter(d => d.label.toLowerCase().includes(q))
  }, [availableSwitchDevices, deviceSearch])

  const filteredAvailableOther = useMemo(() => {
    if (!deviceSearch.trim()) return availableOtherDevices
    const q = deviceSearch.toLowerCase()
    return availableOtherDevices.filter(d => d.label.toLowerCase().includes(q))
  }, [availableOtherDevices, deviceSearch])

  // Other rooms for parent selector (exclude self)
  const parentRoomOptions = useMemo(() => {
    return (allRooms ?? []).filter(r => r.name !== name)
  }, [allRooms, name])

  // Mutations
  const identifyMutation = useMutation({
    mutationFn: (selector: string) => api.lifx.identify(selector),
  })

  const saveAllMutation = useMutation({
    mutationFn: async () => {
      // Save room settings
      await api.rooms.update(name!, {
        display_order: effectiveOrder,
        timer: effectiveTimer,
        auto: effectiveAuto,
        parent_room: effectiveParent,
        sensors: effectiveSensors,
      })
      // Save light assignments
      await api.lights.saveForRoom(name!, effectiveAssigned)
      // Save device unassignments
      for (const deviceId of pendingDeviceUnassigns) {
        await api.hubitat.unassignDevice(deviceId, name!)
      }
      // Save device assignments
      for (const d of pendingDeviceAssigns) {
        await api.hubitat.assignDevice({
          device_id: d.device_id,
          device_label: d.device_label,
          device_type: d.device_type,
          room_name: name!,
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['rooms', name] })
      queryClient.invalidateQueries({ queryKey: ['lights', 'rooms'] })
      queryClient.invalidateQueries({ queryKey: ['hubitat', 'device-rooms'] })
      setDirty(false)
      setPendingDeviceAssigns([])
      setPendingDeviceUnassigns([])
      toast({ message: 'Room saved successfully' })
    },
    onError: () =>
      toast({ message: 'Failed to save room', type: 'error' }),
  })

  const deleteRoomMutation = useMutation({
    mutationFn: () => api.rooms.delete(name!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      navigate('/rooms')
      toast({ message: 'Room deleted' })
    },
    onError: () =>
      toast({ message: 'Failed to delete room', type: 'error' }),
  })

  // Handlers
  const handleAssign = (light: Light) => {
    const newAssigned = [...effectiveAssigned, toAssignment(light)]
    setAssigned(newAssigned)
    setDirty(true)
  }

  const handleUnassign = (id: string) => {
    const newAssigned = effectiveAssigned.filter(a => a.id !== id)
    setAssigned(newAssigned)
    setDirty(true)
  }

  const handleAssignDevice = (device: HubDevice) => {
    setPendingDeviceAssigns(prev => [
      ...prev,
      {
        device_id: String(device.id),
        device_label: device.label,
        device_type: device.device_type,
      },
    ])
    setDirty(true)
  }

  const handleUnassignDevice = (deviceId: string) => {
    // If it was a pending assign, just remove it from pending
    const wasPending = pendingDeviceAssigns.find(p => p.device_id === deviceId)
    if (wasPending) {
      setPendingDeviceAssigns(prev => prev.filter(p => p.device_id !== deviceId))
    } else {
      setPendingDeviceUnassigns(prev => [...prev, deviceId])
    }
    setDirty(true)
  }

  const handleAddSensor = () => {
    setSensors([...effectiveSensors, { name: '', priority_threshold: 50 }])
    setDirty(true)
  }

  const handleUpdateSensor = (index: number, sensor: Sensor) => {
    const updated = [...effectiveSensors]
    updated[index] = sensor
    setSensors(updated)
    setDirty(true)
  }

  const handleRemoveSensor = (index: number) => {
    setSensors(effectiveSensors.filter((_, i) => i !== index))
    setDirty(true)
  }

  const markDirty = () => setDirty(true)

  if (roomLoading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-32 animate-pulse rounded surface" />
        <div className="h-40 animate-pulse rounded-xl surface" />
        <div className="h-60 animate-pulse rounded-xl surface" />
      </div>
    )
  }

  if (!room) {
    return (
      <div className="py-12 text-center">
        <p className="text-body">Room not found.</p>
        <Link
          to="/rooms"
          className="mt-2 inline-block text-sm text-fairy-400 hover:underline"
        >
          Back to rooms
        </Link>
      </div>
    )
  }

  return (
    <div className="pb-28">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <Link
          to="/rooms"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-body transition-colors hover:text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        >
          <ArrowLeft className="h-4 w-4" />
          All Rooms
        </Link>

        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-heading">
            {room.name}
          </h2>
        </div>

        {/* Parent room selector */}
        {parentRoomOptions.length > 0 && (
          <div className="mt-2">
            <label className="mr-2 text-xs font-medium text-caption">
              Parent room
            </label>
            <select
              value={effectiveParent}
              onChange={e => {
                setParentRoom(e.target.value)
                markDirty()
              }}
              className="h-9 rounded-lg border border-[var(--border-secondary)] surface px-2.5 text-sm text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
              aria-label="Parent room"
            >
              <option value="">None</option>
              {parentRoomOptions.map(r => (
                <option key={r.name} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── Settings card ───────────────────────────────────────────────────── */}
      <section className="mb-8">
        <h3 className="mb-3 text-sm font-medium text-body">
          Room Settings
        </h3>
        <div className="space-y-4 rounded-xl card border p-4">
          {/* Auto toggle */}
          <div className="flex items-center justify-between">
            <label
              htmlFor="auto-toggle"
              className="text-sm font-medium text-heading"
            >
              Automation
            </label>
            <Switch.Root
              id="auto-toggle"
              checked={effectiveAuto}
              onCheckedChange={c => {
                setAutoEnabled(c)
                markDirty()
              }}
              className={cn(
                'relative h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                effectiveAuto ? 'bg-fairy-500' : 'bg-slate-700',
              )}
            >
              <Switch.Thumb
                className={cn(
                  'block h-5 w-5 rounded-full bg-white shadow transition-transform',
                  effectiveAuto ? 'translate-x-6' : 'translate-x-1',
                )}
              />
            </Switch.Root>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-body">
                Auto-off after inactivity (min)
              </label>
              <input
                type="number"
                min={0}
                value={effectiveTimer}
                onChange={e => {
                  setTimer(Number(e.target.value))
                  markDirty()
                }}
                className="h-11 w-full rounded-lg border border-[var(--border-secondary)] surface px-3 text-sm text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-body">
                Display Order
              </label>
              <input
                type="number"
                min={0}
                value={effectiveOrder}
                onChange={e => {
                  setDisplayOrder(Number(e.target.value))
                  markDirty()
                }}
                className="h-11 w-full rounded-lg border border-[var(--border-secondary)] surface px-3 text-sm text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Devices section with tabs ───────────────────────────────────────── */}
      <section className="mb-8">
        <h3 className="mb-3 text-sm font-medium text-body">Devices</h3>

        <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
          <Tabs.List className="mb-4 flex gap-1 overflow-x-auto rounded-xl card p-1">
            <Tabs.Trigger
              value="lights"
              className={cn(
                'min-h-[44px] flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                'data-[state=active]:bg-fairy-500 data-[state=active]:text-white',
                'data-[state=inactive]:text-body data-[state=inactive]:hover:text-heading',
              )}
            >
              <Lightbulb className="h-4 w-4" />
              Lights
              {effectiveAssigned.length > 0 && (
                <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold leading-none">
                  {effectiveAssigned.length}
                </span>
              )}
            </Tabs.Trigger>
            <Tabs.Trigger
              value="switches"
              className={cn(
                'min-h-[44px] flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                'data-[state=active]:bg-fairy-500 data-[state=active]:text-white',
                'data-[state=inactive]:text-body data-[state=inactive]:hover:text-heading',
              )}
            >
              <ToggleLeft className="h-4 w-4" />
              Switches
              {effectiveDeviceAssignments.length > 0 && (
                <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold leading-none">
                  {effectiveDeviceAssignments.length}
                </span>
              )}
            </Tabs.Trigger>
            <Tabs.Trigger
              value="sensors"
              className={cn(
                'min-h-[44px] flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                'data-[state=active]:bg-fairy-500 data-[state=active]:text-white',
                'data-[state=inactive]:text-body data-[state=inactive]:hover:text-heading',
              )}
            >
              <Activity className="h-4 w-4" />
              Sensors
            </Tabs.Trigger>
          </Tabs.List>

          {/* ── Lights tab ───────────────────────────────────────────────────── */}
          <Tabs.Content value="lights" className="space-y-6">
            {/* Search */}
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

            {/* Assigned lights */}
            <div>
              <h4 className="mb-3 text-sm font-medium text-body">
                Assigned
                {effectiveAssigned.length > 0 && (
                  <span className="ml-1.5 text-caption">
                    ({effectiveAssigned.length})
                  </span>
                )}
              </h4>
              {filteredAssigned.length > 0 ? (
                <div className="space-y-2">
                  {filteredAssigned.map(a => (
                    <AssignedLightRow
                      key={a.id}
                      assignment={a}
                      light={lightById.get(a.id)}
                      onRemove={() => handleUnassign(a.id)}
                      onIdentify={() =>
                        identifyMutation.mutate(`id:${a.id}`)
                      }
                    />
                  ))}
                </div>
              ) : effectiveAssigned.length > 0 && lightSearch.trim() ? (
                <p className="rounded-xl border border-dashed border-[var(--border-secondary)] py-6 text-center text-xs text-caption">
                  No assigned lights match "{lightSearch}".
                </p>
              ) : (
                <p className="rounded-xl border border-dashed border-[var(--border-secondary)] py-6 text-center text-xs text-caption">
                  No lights assigned to this room yet. Add them from below.
                </p>
              )}
            </div>

            {/* Available lights grouped by LIFX group */}
            <div>
              <h4 className="mb-3 text-sm font-medium text-body">
                Available
                {availableLights.length > 0 && (
                  <span className="ml-1.5 text-caption">
                    ({availableLights.length})
                  </span>
                )}
              </h4>
              {filteredAvailableByGroup.size > 0 ? (
                <div className="space-y-4">
                  {Array.from(filteredAvailableByGroup.entries()).map(
                    ([groupName, lights]) => (
                      <div key={groupName}>
                        <p className="mb-2 text-xs font-medium text-caption uppercase tracking-wide">
                          {groupName}
                        </p>
                        <div className="space-y-2">
                          {lights.map(light => (
                            <AvailableLightRow
                              key={light.id}
                              light={light}
                              onAdd={() => handleAssign(light)}
                              onIdentify={() =>
                                identifyMutation.mutate(`id:${light.id}`)
                              }
                            />
                          ))}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              ) : availableLights.length > 0 && lightSearch.trim() ? (
                <p className="rounded-xl border border-dashed border-[var(--border-secondary)] py-6 text-center text-xs text-caption">
                  No available lights match "{lightSearch}".
                </p>
              ) : availableLights.length === 0 && allLights ? (
                <p className="rounded-xl border border-dashed border-[var(--border-secondary)] py-6 text-center text-xs text-caption">
                  All lights have been assigned to rooms.
                </p>
              ) : !allLights ? (
                <p className="rounded-xl border border-dashed border-[var(--border-secondary)] py-6 text-center text-xs text-caption">
                  No LIFX lights found. Check your LIFX connection.
                </p>
              ) : null}
            </div>
          </Tabs.Content>

          {/* ── Switches tab ─────────────────────────────────────────────────── */}
          <Tabs.Content value="switches" className="space-y-6">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-caption" />
              <input
                type="search"
                placeholder="Search devices by name..."
                value={deviceSearch}
                onChange={e => setDeviceSearch(e.target.value)}
                className="h-11 w-full rounded-lg border border-[var(--border-secondary)] surface pl-10 pr-3 text-sm text-heading placeholder:text-caption focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
              />
            </div>

            {/* ── Switches & Dimmers section ─────────────────────────────────── */}
            <div>
              <h4 className="mb-3 text-sm font-medium text-body">
                Assigned Switches
                {assignedSwitches.length > 0 && (
                  <span className="ml-1.5 text-caption">
                    ({assignedSwitches.length})
                  </span>
                )}
              </h4>
              {filteredAssignedSwitches.length > 0 ? (
                <div className="space-y-2">
                  {filteredAssignedSwitches.map(d => (
                    <AssignedDeviceRow
                      key={d.device_id}
                      assignment={d}
                      onRemove={() => handleUnassignDevice(d.device_id)}
                    />
                  ))}
                </div>
              ) : assignedSwitches.length > 0 && deviceSearch.trim() ? (
                <p className="rounded-xl border border-dashed border-[var(--border-secondary)] py-6 text-center text-xs text-caption">
                  No assigned switches match "{deviceSearch}".
                </p>
              ) : (
                <p className="rounded-xl border border-dashed border-[var(--border-secondary)] py-6 text-center text-xs text-caption">
                  No switches assigned yet. Add them from the available devices below.
                </p>
              )}
            </div>

            <div>
              <h4 className="mb-3 text-sm font-medium text-body">
                Available Switches
                {availableSwitchDevices.length > 0 && (
                  <span className="ml-1.5 text-caption">
                    ({availableSwitchDevices.length})
                  </span>
                )}
              </h4>
              {filteredAvailableSwitches.length > 0 ? (
                <div className="space-y-2">
                  {filteredAvailableSwitches.map(d => (
                    <AvailableDeviceRow
                      key={d.id}
                      device={d}
                      onAdd={() => handleAssignDevice(d)}
                    />
                  ))}
                </div>
              ) : availableSwitchDevices.length > 0 && deviceSearch.trim() ? (
                <p className="rounded-xl border border-dashed border-[var(--border-secondary)] py-6 text-center text-xs text-caption">
                  No available switches match "{deviceSearch}".
                </p>
              ) : availableSwitchDevices.length === 0 && allHubDevices ? (
                <p className="rounded-xl border border-dashed border-[var(--border-secondary)] py-6 text-center text-xs text-caption">
                  All switches and dimmers have been assigned to rooms.
                </p>
              ) : !allHubDevices ? (
                <p className="rounded-xl border border-dashed border-[var(--border-secondary)] py-6 text-center text-xs text-caption">
                  No Hubitat devices found. Check your hub connection.
                </p>
              ) : null}
            </div>

            {/* ── Other Devices (Twinkly / Fairy) ────────────────────────────── */}
            <div className="border-t border-[var(--border-primary)] pt-6">
              <h4 className="mb-3 text-sm font-medium text-body">
                Assigned Other Devices
                {assignedOtherDevices.length > 0 && (
                  <span className="ml-1.5 text-caption">
                    ({assignedOtherDevices.length})
                  </span>
                )}
              </h4>
              {filteredAssignedOther.length > 0 ? (
                <div className="space-y-2">
                  {filteredAssignedOther.map(d => (
                    <AssignedDeviceRow
                      key={d.device_id}
                      assignment={d}
                      onRemove={() => handleUnassignDevice(d.device_id)}
                    />
                  ))}
                </div>
              ) : assignedOtherDevices.length > 0 && deviceSearch.trim() ? (
                <p className="rounded-xl border border-dashed border-[var(--border-secondary)] py-6 text-center text-xs text-caption">
                  No assigned devices match "{deviceSearch}".
                </p>
              ) : (
                <p className="rounded-xl border border-dashed border-[var(--border-secondary)] py-6 text-center text-xs text-caption">
                  No Twinkly or Fairy devices assigned. Add them from below.
                </p>
              )}
            </div>

            <div>
              <h4 className="mb-3 text-sm font-medium text-body">
                Available Other Devices
                {availableOtherDevices.length > 0 && (
                  <span className="ml-1.5 text-caption">
                    ({availableOtherDevices.length})
                  </span>
                )}
              </h4>
              {filteredAvailableOther.length > 0 ? (
                <div className="space-y-2">
                  {filteredAvailableOther.map(d => (
                    <AvailableDeviceRow
                      key={d.id}
                      device={d}
                      onAdd={() => handleAssignDevice(d)}
                    />
                  ))}
                </div>
              ) : availableOtherDevices.length > 0 && deviceSearch.trim() ? (
                <p className="rounded-xl border border-dashed border-[var(--border-secondary)] py-6 text-center text-xs text-caption">
                  No available devices match "{deviceSearch}".
                </p>
              ) : availableOtherDevices.length === 0 && allHubDevices ? (
                <p className="rounded-xl border border-dashed border-[var(--border-secondary)] py-6 text-center text-xs text-caption">
                  All Twinkly and Fairy devices have been assigned to rooms.
                </p>
              ) : !allHubDevices ? (
                <p className="rounded-xl border border-dashed border-[var(--border-secondary)] py-6 text-center text-xs text-caption">
                  No Hubitat devices found. Check your hub connection.
                </p>
              ) : null}
            </div>
          </Tabs.Content>

          {/* ── Sensors tab ──────────────────────────────────────────────────── */}
          <Tabs.Content value="sensors" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-caption">
                Configure motion sensors and their priority thresholds.
              </p>
              <button
                onClick={handleAddSensor}
                className="min-h-[44px] flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-fairy-400 transition-colors hover:bg-fairy-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Sensor
              </button>
            </div>

            {effectiveSensors.length > 0 ? (
              <div className="space-y-2">
                {effectiveSensors.map((sensor, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-xl card border p-3"
                  >
                    <input
                      type="text"
                      value={sensor.name}
                      onChange={e =>
                        handleUpdateSensor(i, { ...sensor, name: e.target.value })
                      }
                      placeholder="Sensor name"
                      className="h-11 min-w-0 flex-1 rounded-lg border border-[var(--border-secondary)] surface px-2.5 text-sm text-heading placeholder:text-caption focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                    />
                    <div className="flex flex-col items-center gap-0.5">
                      <label className="text-[10px] text-caption">
                        Priority
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={sensor.priority_threshold}
                        onChange={e =>
                          handleUpdateSensor(i, {
                            ...sensor,
                            priority_threshold: Number(e.target.value),
                          })
                        }
                        className="h-11 w-20 rounded-lg border border-[var(--border-secondary)] surface px-2.5 text-center text-sm text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                      />
                    </div>
                    <button
                      onClick={() => handleRemoveSensor(i)}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-caption transition-colors hover:text-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                      aria-label="Remove sensor"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-[var(--border-secondary)] py-6 text-center text-xs text-caption">
                No sensors configured. Add a sensor to enable motion-based automation.
              </p>
            )}
          </Tabs.Content>
        </Tabs.Root>
      </section>

      {/* ── Danger zone ────────────────────────────────────────────────────── */}
      <section className="mb-8">
        <h3 className="mb-3 text-sm font-medium text-red-400">Danger Zone</h3>
        <button
          onClick={() => {
            if (window.confirm(`Delete "${room.name}"? This cannot be undone.`)) {
              deleteRoomMutation.mutate()
            }
          }}
          disabled={deleteRoomMutation.isPending}
          className="flex min-h-[44px] items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
        >
          <Trash2 className="h-4 w-4" />
          {deleteRoomMutation.isPending ? 'Deleting...' : 'Delete Room'}
        </button>
      </section>

      {/* ── Sticky save bar ────────────────────────────────────────────────── */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border-primary)] bg-slate-950/95 p-4 backdrop-blur-sm md:bottom-0 md:left-56">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <Link
            to="/rooms"
            className="min-h-[44px] rounded-lg px-4 py-2.5 text-sm font-medium text-body transition-colors hover:text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            Cancel
          </Link>
          <button
            onClick={() => saveAllMutation.mutate()}
            disabled={saveAllMutation.isPending}
            className={cn(
              'flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              dirty
                ? 'bg-fairy-500 hover:bg-fairy-600'
                : 'bg-fairy-500/60 cursor-default',
              'disabled:opacity-50',
            )}
          >
            <Save className="h-4 w-4" />
            {saveAllMutation.isPending ? 'Saving...' : 'Save Room'}
          </button>
        </div>
      </div>
    </div>
  )
}
