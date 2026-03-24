import { useState, useMemo, useCallback } from 'react'
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
  CheckSquare,
  Square,
  Shield,
  Star,
  ChevronDown,
  ChevronRight,
  Sparkles,
} from 'lucide-react'
import * as Switch from '@radix-ui/react-switch'
import * as Tabs from '@radix-ui/react-tabs'
import { api } from '@/lib/api'
import type { Light, LightAssignment, Sensor, HubDevice, DeviceRoomAssignment } from '@/lib/api'
import { cn, getLightColorHex } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { CollapsibleDeviceGroup } from '@/components/ui/CollapsibleDeviceGroup'
import RoomIntelligence from '@/components/room/RoomIntelligence'
import { getScenesForRoom, getModesForRoom, sortScenesByPriority, getDefaultScene, isSceneInSeason } from '@/lib/scene-utils'

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

// ── Sticky search input ─────────────────────────────────────────────────────

function StickySearch({
  value,
  onChange,
  placeholder,
  matchSummary,
}: {
  value: string
  onChange: (val: string) => void
  placeholder: string
  matchSummary?: string
}) {
  return (
    <div className="sticky top-0 z-10 pb-3 pt-1 chrome">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-caption" />
        <input
          type="search"
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="h-11 w-full rounded-lg border border-[var(--border-secondary)] surface pl-10 pr-10 text-sm text-heading placeholder:text-caption focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-md text-caption hover:text-heading transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {matchSummary && value.trim() && (
        <p className="mt-1.5 text-[11px] text-caption">{matchSummary}</p>
      )}
    </div>
  )
}

// ── Compact available light row ─────────────────────────────────────────────

function AvailableLightRow({
  light,
  onAdd,
  onIdentify,
  selected,
  onToggleSelect,
  multiSelectMode,
  assignedToRoom,
}: {
  light: Light
  onAdd: () => void
  onIdentify: () => void
  selected?: boolean
  onToggleSelect?: () => void
  multiSelectMode?: boolean
  assignedToRoom?: string
}) {
  const isOn = light.power === 'on'
  const colorHex = getLightColorHex(light)
  const isAssignedElsewhere = !!assignedToRoom

  return (
    <div
      className={cn(
        'flex h-[44px] items-center gap-2 rounded-lg px-3 transition-colors',
        isAssignedElsewhere
          ? 'opacity-50'
          : 'card border/50 hover:border-[var(--border-secondary)]',
        selected && 'ring-1 ring-fairy-500 bg-fairy-500/5',
      )}
    >
      {multiSelectMode && !isAssignedElsewhere && (
        <button
          type="button"
          onClick={onToggleSelect}
          className="shrink-0 text-body hover:text-fairy-400 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          aria-label={selected ? `Deselect ${light.label}` : `Select ${light.label}`}
        >
          {selected ? (
            <CheckSquare className="h-4 w-4 text-fairy-400" />
          ) : (
            <Square className="h-4 w-4" />
          )}
        </button>
      )}
      <div
        className={cn('h-4 w-4 shrink-0 rounded-full', !isOn && 'opacity-30')}
        style={{ backgroundColor: isOn ? colorHex : '#475569' }}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-heading">
        {light.label}
      </span>
      {isAssignedElsewhere ? (
        <span className="shrink-0 truncate text-[10px] text-caption">
          In {assignedToRoom}
        </span>
      ) : (
        <>
          <span className="hidden shrink-0 rounded-full bg-[var(--border-secondary)] px-2 py-0.5 text-[10px] font-medium text-body sm:inline-flex">
            {light.group.name}
          </span>
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
          {!multiSelectMode && (
            <button
              onClick={onAdd}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-fairy-500/15 text-fairy-400 transition-colors hover:bg-fairy-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
              aria-label={`Assign ${light.label} to this room`}
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </>
      )}
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
  const cls = deviceTypeBadgeClasses[type] ?? 'surface text-body'
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
  onToggleExclude,
}: {
  assignment: DeviceRoomAssignment
  onRemove: () => void
  onToggleExclude: () => void
}) {
  const isExcluded = !!assignment.config?.exclude_from_all_off

  return (
    <div className="flex items-center gap-3 rounded-lg border border-fairy-500/20 bg-fairy-500/5 px-3 py-2.5 transition-colors">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-heading">
          {assignment.device_label}
        </p>
      </div>
      <DeviceTypeBadge type={assignment.device_type} />
      <button
        onClick={onToggleExclude}
        className={cn(
          'min-h-[44px] flex items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          isExcluded
            ? 'bg-amber-500/15 text-amber-400'
            : 'text-caption hover:text-body hover:surface',
        )}
        aria-label={isExcluded ? `Remove keep-on protection from ${assignment.device_label}` : `Protect ${assignment.device_label} from being turned off`}
        aria-pressed={isExcluded}
      >
        <Shield className="h-3.5 w-3.5" />
        <span>Keep on</span>
      </button>
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

// ── Compact available device row ────────────────────────────────────────────

function AvailableDeviceRow({
  device,
  onAdd,
  selected,
  onToggleSelect,
  multiSelectMode,
}: {
  device: HubDevice
  onAdd: () => void
  selected?: boolean
  onToggleSelect?: () => void
  multiSelectMode?: boolean
}) {
  return (
    <div
      className={cn(
        'flex h-[44px] items-center gap-2 rounded-lg px-3 transition-colors card border/50 hover:border-[var(--border-secondary)]',
        selected && 'ring-1 ring-fairy-500 bg-fairy-500/5',
      )}
    >
      {multiSelectMode && (
        <button
          type="button"
          onClick={onToggleSelect}
          className="shrink-0 text-body hover:text-fairy-400 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          aria-label={selected ? `Deselect ${device.label}` : `Select ${device.label}`}
        >
          {selected ? (
            <CheckSquare className="h-4 w-4 text-fairy-400" />
          ) : (
            <Square className="h-4 w-4" />
          )}
        </button>
      )}
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-heading">
        {device.label}
      </span>
      <DeviceTypeBadge type={device.device_type} />
      {!multiSelectMode && (
        <button
          onClick={onAdd}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-fairy-500/15 text-fairy-400 transition-colors hover:bg-fairy-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          aria-label={`Assign ${device.label} to this room`}
        >
          <Plus className="h-4 w-4" />
        </button>
      )}
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

  // Multi-select state
  const [lightMultiSelect, setLightMultiSelect] = useState(false)
  const [selectedLightIds, setSelectedLightIds] = useState<Set<string>>(new Set())
  const [deviceMultiSelect, setDeviceMultiSelect] = useState(false)
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Set<string>>(new Set())

  // Scenes section state
  const [scenesOpen, setScenesOpen] = useState(false)
  const [selectedMode, setSelectedMode] = useState<string | null>(null)

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

  // Fetch all scenes (for Scenes section)
  const { data: allScenes } = useQuery({
    queryKey: ['scenes'],
    queryFn: api.scenes.getAll,
  })

  // Fetch system current (for current mode)
  const { data: system } = useQuery({
    queryKey: ['system', 'current'],
    queryFn: api.system.getCurrent,
  })

  // Room settings state
  const [displayOrder, setDisplayOrder] = useState<number | null>(null)
  const [timer, setTimer] = useState<number | null>(null)
  const [autoEnabled, setAutoEnabled] = useState<boolean | null>(null)
  const [parentRoom, setParentRoom] = useState<string | null>(null)
  const [sensors, setSensors] = useState<Sensor[] | null>(null)
  const [_roomNameEdit, _setRoomNameEdit] = useState<string | null>(null)

  // Compute effective values (from state or room data)
  const effectiveOrder = displayOrder ?? room?.display_order ?? 0
  const effectiveTimer = timer ?? room?.timer ?? 0
  const effectiveAuto = autoEnabled ?? room?.auto ?? false
  const effectiveParent = parentRoom ?? room?.parent_room ?? ''
  const effectiveSensors = sensors ?? room?.sensors ?? []

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
        has_color: Boolean(l.has_color),
        min_kelvin: l.min_kelvin,
        max_kelvin: l.max_kelvin,
      })) ?? []
    )
  }, [assigned, room])

  // Map of light ID -> room name for lights assigned to OTHER rooms
  const lightToOtherRoom = useMemo(() => {
    if (!allAssignments) return new Map<string, string>()
    const map = new Map<string, string>()
    for (const a of allAssignments) {
      if (a.room_name !== name) {
        map.set(a.light_id, a.room_name)
      }
    }
    return map
  }, [allAssignments, name])

  // IDs already assigned to ANY room
  const assignedToOtherRooms = useMemo(() => {
    return new Set(lightToOtherRoom.keys())
  }, [lightToOtherRoom])

  // Lights available to assign (not assigned to this room), split into free + assigned-elsewhere
  const availableLights = useMemo(() => {
    if (!allLights) return []
    const assignedIds = new Set(effectiveAssigned.map(a => a.id))
    return allLights.filter(l => !assignedIds.has(l.id))
  }, [allLights, effectiveAssigned])

  // Group available lights by LIFX group (only unassigned ones for grouping)
  const availableByGroup = useMemo(() => {
    const groups = new Map<string, Light[]>()
    for (const light of availableLights) {
      if (assignedToOtherRooms.has(light.id)) continue // these go in a separate section
      const groupName = light.group.name || 'Ungrouped'
      if (!groups.has(groupName)) groups.set(groupName, [])
      groups.get(groupName)!.push(light)
    }
    return groups
  }, [availableLights, assignedToOtherRooms])

  // Lights assigned to other rooms (shown but not assignable)
  const lightsInOtherRooms = useMemo(() => {
    return availableLights.filter(l => assignedToOtherRooms.has(l.id))
  }, [availableLights, assignedToOtherRooms])

  // All lights in each LIFX group (to check "fully assigned")
  const allLightsByGroup = useMemo(() => {
    if (!allLights) return new Map<string, Light[]>()
    const groups = new Map<string, Light[]>()
    for (const light of allLights) {
      const groupName = light.group.name || 'Ungrouped'
      if (!groups.has(groupName)) groups.set(groupName, [])
      groups.get(groupName)!.push(light)
    }
    return groups
  }, [allLights])

  // Check if a LIFX group is fully assigned to this room
  const isGroupFullyAssigned = useCallback(
    (groupName: string) => {
      const groupLights = allLightsByGroup.get(groupName)
      if (!groupLights || groupLights.length === 0) return false
      const assignedIds = new Set(effectiveAssigned.map(a => a.id))
      return groupLights.every(l => assignedIds.has(l.id))
    },
    [allLightsByGroup, effectiveAssigned],
  )

  // Filter assigned lights by search
  const filteredAssigned = useMemo(() => {
    if (!lightSearch.trim()) return effectiveAssigned
    const q = lightSearch.toLowerCase()
    return effectiveAssigned.filter(a => a.label.toLowerCase().includes(q))
  }, [effectiveAssigned, lightSearch])

  // Filter available lights by search (returns groups with matching lights)
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

  // Build search match summary for lights
  const lightMatchSummary = useMemo(() => {
    if (!lightSearch.trim()) return ''
    const parts: string[] = []
    for (const [group, lights] of filteredAvailableByGroup) {
      parts.push(`${lights.length} in ${group}`)
    }
    const assignedMatches = filteredAssigned.length
    if (assignedMatches > 0) {
      parts.unshift(`${assignedMatches} assigned`)
    }
    return parts.length > 0 ? parts.join(', ') : 'No matches'
  }, [lightSearch, filteredAvailableByGroup, filteredAssigned])

  // Build a map from light ID to Light object for assigned lights
  const lightById = useMemo(() => {
    if (!allLights) return new Map<string, Light>()
    return new Map(allLights.map(l => [l.id, l]))
  }, [allLights])

  // ── Device (switches/dimmers/twinkly/fairy) assignment state ──────────
  const SWITCH_TYPES = ['switch', 'dimmer']
  const OTHER_TYPES = ['twinkly', 'fairy']

  // Devices assigned to THIS room (from API or local pending state)
  const [pendingDeviceAssigns, setPendingDeviceAssigns] = useState<
    { device_id: string; device_label: string; device_type: string; config?: Record<string, unknown> }[]
  >([])
  const [pendingDeviceUnassigns, setPendingDeviceUnassigns] = useState<string[]>([])
  const [pendingDeviceConfigs, setPendingDeviceConfigs] = useState<Record<string, Record<string, unknown>>>({})

  // Devices currently assigned to this room from API
  const apiDevicesForRoom = useMemo(() => {
    if (!allDeviceRoomAssignments) return []
    return allDeviceRoomAssignments.filter(a => a.room_name === name)
  }, [allDeviceRoomAssignments, name])

  // Effective assigned devices = API assignments minus pending unassigns plus pending assigns
  const effectiveDeviceAssignments = useMemo(() => {
    const base = apiDevicesForRoom
      .filter(a => !pendingDeviceUnassigns.includes(a.device_id))
      .map(a => ({
        ...a,
        config: pendingDeviceConfigs[a.device_id]
          ? { ...a.config, ...pendingDeviceConfigs[a.device_id] }
          : a.config,
      }))
    const pending: DeviceRoomAssignment[] = pendingDeviceAssigns.map(p => ({
      id: 0,
      device_id: p.device_id,
      device_label: p.device_label,
      device_type: p.device_type,
      room_name: name!,
      config: pendingDeviceConfigs[p.device_id] ?? p.config ?? {},
    }))
    return [...base, ...pending]
  }, [apiDevicesForRoom, pendingDeviceAssigns, pendingDeviceUnassigns, pendingDeviceConfigs, name])

  // Filter to only device types that belong in the Switches tab (not sensors)
  const DEVICE_TYPES = [...SWITCH_TYPES, ...OTHER_TYPES]
  const filteredDeviceAssignments = useMemo(
    () => effectiveDeviceAssignments.filter(d => DEVICE_TYPES.includes(d.device_type)),
    [effectiveDeviceAssignments],
  )

  // All device IDs already assigned to ANY room
  const deviceIdsAssignedToAnyRoom = useMemo(() => {
    if (!allDeviceRoomAssignments) return new Set<string>()
    return new Set(allDeviceRoomAssignments.map(a => a.device_id))
  }, [allDeviceRoomAssignments])

  // Available devices by type for switches tab
  const availableDevicesByType = useMemo(() => {
    if (!allHubDevices) return new Map<string, HubDevice[]>()
    const assignedIds = new Set(effectiveDeviceAssignments.map(d => d.device_id))
    const allTypes = [...SWITCH_TYPES, ...OTHER_TYPES]
    const groups = new Map<string, HubDevice[]>()
    for (const device of allHubDevices) {
      if (!allTypes.includes(device.device_type)) continue
      if (assignedIds.has(String(device.id))) continue
      if (deviceIdsAssignedToAnyRoom.has(String(device.id))) continue
      const type = device.device_type
      if (!groups.has(type)) groups.set(type, [])
      groups.get(type)!.push(device)
    }
    return groups
  }, [allHubDevices, effectiveDeviceAssignments, deviceIdsAssignedToAnyRoom])

  // Filter assigned devices by search
  const filteredAssignedDevices = useMemo(() => {
    if (!deviceSearch.trim()) return filteredDeviceAssignments
    const q = deviceSearch.toLowerCase()
    return filteredDeviceAssignments.filter(d => d.device_label.toLowerCase().includes(q))
  }, [filteredDeviceAssignments, deviceSearch])

  // Filter available devices by search (group-aware)
  const filteredAvailableDevicesByType = useMemo(() => {
    if (!deviceSearch.trim()) return availableDevicesByType
    const q = deviceSearch.toLowerCase()
    const filtered = new Map<string, HubDevice[]>()
    for (const [type, devices] of availableDevicesByType) {
      const matching = devices.filter(d => d.label.toLowerCase().includes(q))
      if (matching.length > 0) filtered.set(type, matching)
    }
    return filtered
  }, [availableDevicesByType, deviceSearch])

  // Device search match summary
  const deviceMatchSummary = useMemo(() => {
    if (!deviceSearch.trim()) return ''
    const parts: string[] = []
    const assignedMatches = filteredAssignedDevices.length
    if (assignedMatches > 0) {
      parts.push(`${assignedMatches} assigned`)
    }
    for (const [type, devices] of filteredAvailableDevicesByType) {
      const label = type.charAt(0).toUpperCase() + type.slice(1)
      parts.push(`${devices.length} in ${label}`)
    }
    return parts.length > 0 ? parts.join(', ') : 'No matches'
  }, [deviceSearch, filteredAssignedDevices, filteredAvailableDevicesByType])

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
      // Save device assignments (new assigns)
      for (const d of pendingDeviceAssigns) {
        await api.hubitat.assignDevice({
          device_id: d.device_id,
          device_label: d.device_label,
          device_type: d.device_type,
          room_name: name!,
          config: pendingDeviceConfigs[d.device_id] ?? d.config,
        })
      }
      // Save device config changes for existing assignments
      for (const [deviceId, config] of Object.entries(pendingDeviceConfigs)) {
        // Skip if it was a new assign (already handled above) or unassigned
        if (pendingDeviceAssigns.find(p => p.device_id === deviceId)) continue
        if (pendingDeviceUnassigns.includes(deviceId)) continue
        const existing = apiDevicesForRoom.find(a => a.device_id === deviceId)
        if (existing) {
          await api.hubitat.assignDevice({
            device_id: existing.device_id,
            device_label: existing.device_label,
            device_type: existing.device_type,
            room_name: name!,
            config: { ...existing.config, ...config },
          })
        }
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
      setPendingDeviceConfigs({})
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

  const handleAssignAllInGroup = (groupLights: Light[]) => {
    const newAssigned = [...effectiveAssigned]
    const assignedIds = new Set(newAssigned.map(a => a.id))
    for (const light of groupLights) {
      if (!assignedIds.has(light.id) && !assignedToOtherRooms.has(light.id)) {
        newAssigned.push(toAssignment(light))
      }
    }
    setAssigned(newAssigned)
    setDirty(true)
  }

  const handleRemoveAllLights = () => {
    if (!window.confirm(`Remove all ${effectiveAssigned.length} lights from this room?`)) return
    setAssigned([])
    setDirty(true)
  }

  const handleAssignSelectedLights = () => {
    if (selectedLightIds.size === 0) return
    const newAssigned = [...effectiveAssigned]
    const assignedIds = new Set(newAssigned.map(a => a.id))
    for (const id of selectedLightIds) {
      if (!assignedIds.has(id)) {
        const light = lightById.get(id)
        if (light) newAssigned.push(toAssignment(light))
      }
    }
    setAssigned(newAssigned)
    setSelectedLightIds(new Set())
    setLightMultiSelect(false)
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

  const handleToggleDeviceExclude = (deviceId: string) => {
    const current = pendingDeviceConfigs[deviceId] ?? {}
    const assignment = effectiveDeviceAssignments.find(d => d.device_id === deviceId)
    const currentExclude = current.exclude_from_all_off ?? assignment?.config?.exclude_from_all_off ?? false
    setPendingDeviceConfigs(prev => ({
      ...prev,
      [deviceId]: { ...prev[deviceId], exclude_from_all_off: !currentExclude },
    }))
    setDirty(true)
  }

  const handleAssignAllDevicesInType = (devices: HubDevice[]) => {
    const newAssigns = [...pendingDeviceAssigns]
    const assignedIds = new Set(effectiveDeviceAssignments.map(d => d.device_id))
    for (const device of devices) {
      const id = String(device.id)
      if (!assignedIds.has(id) && !newAssigns.find(p => p.device_id === id)) {
        newAssigns.push({
          device_id: id,
          device_label: device.label,
          device_type: device.device_type,
        })
      }
    }
    setPendingDeviceAssigns(newAssigns)
    setDirty(true)
  }

  const handleRemoveAllDevices = () => {
    if (!window.confirm(`Remove all ${filteredDeviceAssignments.length} devices from this room?`)) return
    // Unassign API devices
    for (const d of apiDevicesForRoom) {
      if (!pendingDeviceUnassigns.includes(d.device_id)) {
        setPendingDeviceUnassigns(prev => [...prev, d.device_id])
      }
    }
    // Clear pending assigns
    setPendingDeviceAssigns([])
    setDirty(true)
  }

  const handleAssignSelectedDevices = () => {
    if (selectedDeviceIds.size === 0) return
    const newAssigns = [...pendingDeviceAssigns]
    for (const id of selectedDeviceIds) {
      const device = allHubDevices?.find(d => String(d.id) === id)
      if (device && !newAssigns.find(p => p.device_id === id)) {
        newAssigns.push({
          device_id: id,
          device_label: device.label,
          device_type: device.device_type,
        })
      }
    }
    setPendingDeviceAssigns(newAssigns)
    setSelectedDeviceIds(new Set())
    setDeviceMultiSelect(false)
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

  const toggleLightSelect = (id: string) => {
    setSelectedLightIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleDeviceSelect = (id: string) => {
    setSelectedDeviceIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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

  const isSearchingLights = lightSearch.trim().length > 0
  const isSearchingDevices = deviceSearch.trim().length > 0

  // Device type display labels
  const deviceTypeLabels: Record<string, string> = {
    switch: 'Switches',
    dimmer: 'Dimmers',
    twinkly: 'Twinkly',
    fairy: 'Fairy',
  }

  return (
    <div className="pb-40">
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
                effectiveAuto ? 'bg-fairy-500' : 'bg-[var(--border-secondary)]',
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

      {/* ── Scenes ──────────────────────────────────────────────────────────── */}
      {(() => {
        const roomScenes = allScenes && name ? getScenesForRoom(allScenes, name) : []
        const modesForRoom = allScenes && name ? getModesForRoom(allScenes, name) : []
        const filteredScenes = selectedMode
          ? roomScenes.filter(s => (Array.isArray(s.modes) ? s.modes : []).some(m => (m ?? '').toLowerCase() === selectedMode.toLowerCase()))
          : roomScenes
        const sortedScenes = sortScenesByPriority(filteredScenes, name ?? '')
        const currentMode = system?.mode ?? ''
        const headingId = 'scenes-section-heading'
        const panelId = 'scenes-section-panel'

        return (
          <section className="mb-8">
            <button
              id={headingId}
              aria-expanded={scenesOpen}
              aria-controls={panelId}
              onClick={() => setScenesOpen(prev => !prev)}
              className={cn(
                'flex w-full items-center justify-between py-3 text-left transition-colors',
                'min-h-[44px]',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                !scenesOpen && 'border-b border-[var(--border-secondary)]',
              )}
            >
              <span className="flex items-center gap-2">
                <span className="text-heading text-base font-semibold">Scenes</span>
                {roomScenes.length > 0 && (
                  <span className="rounded-full bg-fairy-500/15 px-2 py-0.5 text-[10px] font-bold text-fairy-400">
                    {roomScenes.length}
                  </span>
                )}
              </span>
              <ChevronDown
                className={cn(
                  'h-5 w-5 text-[var(--text-secondary)] transition-transform duration-300',
                  scenesOpen && 'rotate-180',
                )}
                aria-hidden="true"
              />
            </button>

            <div
              id={panelId}
              role="region"
              aria-labelledby={headingId}
              className="grid transition-all duration-300"
              style={{ gridTemplateRows: scenesOpen ? '1fr' : '0fr' }}
            >
              <div className="overflow-hidden">
                <div className="pt-3 pb-2">
                  {/* Mode pills */}
                  {modesForRoom.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filter scenes by mode">
                      <button
                        type="button"
                        aria-pressed={selectedMode === null}
                        onClick={() => setSelectedMode(null)}
                        className={cn(
                          'min-h-[44px] rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                          selectedMode === null
                            ? 'bg-fairy-500 text-white'
                            : 'surface text-body hover:text-heading',
                        )}
                      >
                        All
                      </button>
                      {modesForRoom.map(mode => (
                        <button
                          key={mode}
                          type="button"
                          aria-pressed={selectedMode === mode}
                          onClick={() => setSelectedMode(prev => (prev === mode ? null : mode))}
                          className={cn(
                            'min-h-[44px] rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                            selectedMode === mode
                              ? 'bg-fairy-500 text-white'
                              : 'surface text-body hover:text-heading',
                          )}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Scene rows */}
                  {sortedScenes.length === 0 ? (
                    <div className="rounded-xl card border p-6 text-center">
                      <Sparkles className="mx-auto mb-3 h-8 w-8 text-[var(--text-caption)]" aria-hidden="true" />
                      <p className="text-sm text-body">No scenes are assigned to this room yet.</p>
                      <p className="mt-1 text-xs text-[var(--text-caption)]">
                        Visit the{' '}
                        <Link to="/scenes" className="text-fairy-400 underline hover:text-fairy-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500">
                          Scenes page
                        </Link>
                        {' '}to create or assign scenes.
                      </p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-[var(--border-secondary)]">
                      {sortedScenes.map(scene => {
                        const isActive = room?.current_scene === scene.name
                        const season = isSceneInSeason(scene)
                        const isDefault = currentMode
                          ? getDefaultScene(allScenes ?? [], name ?? '', currentMode)?.name === scene.name
                          : false

                        return (
                          <li key={scene.name}>
                            <Link
                              to={`/scenes/${encodeURIComponent(scene.name)}`}
                              className={cn(
                                'group flex min-h-[44px] items-center gap-3 py-3 transition-colors',
                                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 rounded-lg',
                              )}
                            >
                              {/* Scene icon */}
                              <div
                                className="surface flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base"
                                aria-hidden="true"
                              >
                                {scene.icon || <Sparkles className="h-4 w-4 text-[var(--text-caption)]" />}
                              </div>

                              {/* Name and badges */}
                              <div className="min-w-0 flex-1">
                                <span className="text-sm font-medium text-heading">{scene.name}</span>
                                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                  {isDefault && (
                                    <span className="flex items-center gap-1 rounded-full bg-fairy-500/10 px-2 py-0.5 text-[10px] font-medium text-fairy-400">
                                      <Star className="h-3 w-3" fill="currentColor" aria-hidden="true" />
                                      Default
                                    </span>
                                  )}
                                  {season.hasSeason && (
                                    <span className={cn(
                                      'rounded-full px-2 py-0.5 text-[10px] font-medium',
                                      season.inSeason
                                        ? 'bg-emerald-500/10 text-emerald-400'
                                        : 'bg-[var(--surface)] text-[var(--text-caption)]',
                                    )}>
                                      {season.label}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Active indicator */}
                              {isActive && (
                                <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-fairy-400" aria-label="Currently active">
                                  <span className="h-2 w-2 rounded-full bg-fairy-400" aria-hidden="true" />
                                  Active
                                </span>
                              )}

                              <ChevronRight
                                className="h-4 w-4 shrink-0 text-[var(--text-caption)] transition-colors group-hover:text-[var(--text-secondary)]"
                                aria-hidden="true"
                              />
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </section>
        )
      })()}

      {/* ── Room intelligence ───────────────────────────────────────────────── */}
      <RoomIntelligence roomName={name!} />

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
                <span className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none',
                  activeTab === 'lights' ? 'bg-white/20' : 'bg-fairy-500/15 text-fairy-400',
                )}>
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
              Devices
              {filteredDeviceAssignments.length > 0 && (
                <span className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none',
                  activeTab === 'switches' ? 'bg-white/20' : 'bg-fairy-500/15 text-fairy-400',
                )}>
                  {filteredDeviceAssignments.length}
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
              {effectiveSensors.length > 0 && (
                <span className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none',
                  activeTab === 'sensors' ? 'bg-white/20' : 'bg-fairy-500/15 text-fairy-400',
                )}>
                  {effectiveSensors.length}
                </span>
              )}
            </Tabs.Trigger>
          </Tabs.List>

          {/* ── Lights tab ───────────────────────────────────────────────────── */}
          <Tabs.Content value="lights" className="space-y-4">
            {/* Sticky search */}
            <StickySearch
              value={lightSearch}
              onChange={setLightSearch}
              placeholder="Search lights by name..."
              matchSummary={lightMatchSummary}
            />

            {/* Multi-select toolbar */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setLightMultiSelect(prev => !prev)
                  if (lightMultiSelect) setSelectedLightIds(new Set())
                }}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 min-h-[36px] text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                  lightMultiSelect
                    ? 'bg-fairy-500/15 text-fairy-400'
                    : 'text-body hover:text-heading hover:surface',
                )}
              >
                <CheckSquare className="h-3.5 w-3.5" />
                {lightMultiSelect ? 'Cancel selection' : 'Multi-select'}
              </button>
              {lightMultiSelect && selectedLightIds.size > 0 && (
                <button
                  type="button"
                  onClick={handleAssignSelectedLights}
                  className="flex items-center gap-1.5 rounded-lg bg-fairy-500 px-3 min-h-[36px] text-xs font-medium text-white transition-colors hover:bg-fairy-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Assign {selectedLightIds.size} selected
                </button>
              )}
            </div>

            {/* Assigned lights */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-medium text-body">
                  Assigned to this room
                  {effectiveAssigned.length > 0 && (
                    <span className="ml-1.5 text-caption">
                      ({effectiveAssigned.length})
                    </span>
                  )}
                </h4>
                {effectiveAssigned.length > 1 && (
                  <button
                    type="button"
                    onClick={handleRemoveAllLights}
                    className="flex items-center gap-1 rounded-lg px-2.5 min-h-[36px] text-[11px] font-medium text-red-400 transition-colors hover:bg-red-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                  >
                    <Trash2 className="h-3 w-3" />
                    Remove all
                  </button>
                )}
              </div>
              {filteredAssigned.length > 0 ? (
                <div className="space-y-1.5">
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
                  No assigned lights match &ldquo;{lightSearch}&rdquo;.
                </p>
              ) : (
                <p className="rounded-xl border border-dashed border-[var(--border-secondary)] py-6 text-center text-xs text-caption">
                  No lights assigned to this room yet. Add them from the groups below.
                </p>
              )}
            </div>

            {/* Available lights grouped by LIFX group */}
            <div>
              <h4 className="mb-3 text-sm font-medium text-body">
                Available
              </h4>
              {filteredAvailableByGroup.size > 0 ? (
                <div className="space-y-2">
                  {Array.from(filteredAvailableByGroup.entries()).map(
                    ([groupName, lights]) => (
                      <CollapsibleDeviceGroup
                        key={groupName}
                        title={groupName}
                        count={lights.length}
                        totalInGroup={allLightsByGroup.get(groupName)?.length ?? lights.length}
                        defaultOpen={isSearchingLights}
                        onAssignAll={() => handleAssignAllInGroup(lights)}
                        fullyAssigned={isGroupFullyAssigned(groupName)}
                      >
                        <div className="space-y-1">
                          {lights.map(light => (
                            <AvailableLightRow
                              key={light.id}
                              light={light}
                              onAdd={() => handleAssign(light)}
                              onIdentify={() =>
                                identifyMutation.mutate(`id:${light.id}`)
                              }
                              multiSelectMode={lightMultiSelect}
                              selected={selectedLightIds.has(light.id)}
                              onToggleSelect={() => toggleLightSelect(light.id)}
                            />
                          ))}
                        </div>
                      </CollapsibleDeviceGroup>
                    ),
                  )}
                </div>
              ) : availableByGroup.size > 0 && lightSearch.trim() ? (
                <p className="rounded-xl border border-dashed border-[var(--border-secondary)] py-6 text-center text-xs text-caption">
                  No available lights match &ldquo;{lightSearch}&rdquo;.
                </p>
              ) : availableByGroup.size === 0 && allLights && allLights.length > 0 ? (
                <p className="rounded-xl border border-dashed border-[var(--border-secondary)] py-6 text-center text-xs text-caption">
                  All available lights have been assigned.
                </p>
              ) : !allLights ? (
                <p className="rounded-xl border border-dashed border-[var(--border-secondary)] py-6 text-center text-xs text-caption">
                  No LIFX lights found. Check your LIFX connection.
                </p>
              ) : null}
            </div>

            {/* Lights assigned to other rooms */}
            {lightsInOtherRooms.length > 0 && !isSearchingLights && (
              <div>
                <h4 className="mb-3 text-sm font-medium text-caption">
                  Assigned to other rooms
                </h4>
                <div className="space-y-1">
                  {lightsInOtherRooms.map(light => (
                    <AvailableLightRow
                      key={light.id}
                      light={light}
                      onAdd={() => {}}
                      onIdentify={() =>
                        identifyMutation.mutate(`id:${light.id}`)
                      }
                      assignedToRoom={lightToOtherRoom.get(light.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </Tabs.Content>

          {/* ── Switches tab ─────────────────────────────────────────────────── */}
          <Tabs.Content value="switches" className="space-y-4">
            {/* Sticky search */}
            <StickySearch
              value={deviceSearch}
              onChange={setDeviceSearch}
              placeholder="Search devices by name..."
              matchSummary={deviceMatchSummary}
            />

            {/* Multi-select toolbar */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeviceMultiSelect(prev => !prev)
                  if (deviceMultiSelect) setSelectedDeviceIds(new Set())
                }}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 min-h-[36px] text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                  deviceMultiSelect
                    ? 'bg-fairy-500/15 text-fairy-400'
                    : 'text-body hover:text-heading hover:surface',
                )}
              >
                <CheckSquare className="h-3.5 w-3.5" />
                {deviceMultiSelect ? 'Cancel selection' : 'Multi-select'}
              </button>
              {deviceMultiSelect && selectedDeviceIds.size > 0 && (
                <button
                  type="button"
                  onClick={handleAssignSelectedDevices}
                  className="flex items-center gap-1.5 rounded-lg bg-fairy-500 px-3 min-h-[36px] text-xs font-medium text-white transition-colors hover:bg-fairy-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Assign {selectedDeviceIds.size} selected
                </button>
              )}
            </div>

            {/* Assigned devices */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-medium text-body">
                  Assigned to this room
                  {filteredDeviceAssignments.length > 0 && (
                    <span className="ml-1.5 text-caption">
                      ({filteredDeviceAssignments.length})
                    </span>
                  )}
                </h4>
                {filteredDeviceAssignments.length > 1 && (
                  <button
                    type="button"
                    onClick={handleRemoveAllDevices}
                    className="flex items-center gap-1 rounded-lg px-2.5 min-h-[36px] text-[11px] font-medium text-red-400 transition-colors hover:bg-red-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                  >
                    <Trash2 className="h-3 w-3" />
                    Remove all
                  </button>
                )}
              </div>
              {filteredAssignedDevices.length > 0 ? (
                <div className="space-y-1.5">
                  {filteredAssignedDevices.map(d => (
                    <AssignedDeviceRow
                      key={d.device_id}
                      assignment={d}
                      onRemove={() => handleUnassignDevice(d.device_id)}
                      onToggleExclude={() => handleToggleDeviceExclude(d.device_id)}
                    />
                  ))}
                </div>
              ) : filteredDeviceAssignments.length > 0 && deviceSearch.trim() ? (
                <p className="rounded-xl border border-dashed border-[var(--border-secondary)] py-6 text-center text-xs text-caption">
                  No assigned devices match &ldquo;{deviceSearch}&rdquo;.
                </p>
              ) : (
                <p className="rounded-xl border border-dashed border-[var(--border-secondary)] py-6 text-center text-xs text-caption">
                  No devices assigned yet. Add them from the groups below.
                </p>
              )}
            </div>

            {/* Available devices grouped by type */}
            <div>
              <h4 className="mb-3 text-sm font-medium text-body">
                Available
              </h4>
              {filteredAvailableDevicesByType.size > 0 ? (
                <div className="space-y-2">
                  {Array.from(filteredAvailableDevicesByType.entries()).map(
                    ([typeName, devices]) => (
                      <CollapsibleDeviceGroup
                        key={typeName}
                        title={deviceTypeLabels[typeName] ?? typeName}
                        count={devices.length}
                        totalInGroup={availableDevicesByType.get(typeName)?.length ?? devices.length}
                        defaultOpen={isSearchingDevices}
                        onAssignAll={() => handleAssignAllDevicesInType(devices)}
                      >
                        <div className="space-y-1">
                          {devices.map(device => (
                            <AvailableDeviceRow
                              key={device.id}
                              device={device}
                              onAdd={() => handleAssignDevice(device)}
                              multiSelectMode={deviceMultiSelect}
                              selected={selectedDeviceIds.has(String(device.id))}
                              onToggleSelect={() => toggleDeviceSelect(String(device.id))}
                            />
                          ))}
                        </div>
                      </CollapsibleDeviceGroup>
                    ),
                  )}
                </div>
              ) : availableDevicesByType.size > 0 && deviceSearch.trim() ? (
                <p className="rounded-xl border border-dashed border-[var(--border-secondary)] py-6 text-center text-xs text-caption">
                  No available devices match &ldquo;{deviceSearch}&rdquo;.
                </p>
              ) : availableDevicesByType.size === 0 && allHubDevices ? (
                <p className="rounded-xl border border-dashed border-[var(--border-secondary)] py-6 text-center text-xs text-caption">
                  All devices have been assigned to rooms.
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
            {(() => {
              const SENSOR_TYPES = ['motion', 'contact', 'temperature', 'sensor']
              const hubSensors = allHubDevices?.filter(d => SENSOR_TYPES.includes(d.device_type)) ?? []
              const assignedNames = new Set(effectiveSensors.map(s => s.name))
              const availableSensors = hubSensors.filter(d => !assignedNames.has(d.label))

              return (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-caption">
                      Configure motion sensors and their lux thresholds.
                    </p>
                    {availableSensors.length > 0 && (
                      <button
                        onClick={handleAddSensor}
                        className="min-h-[44px] flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-fairy-400 transition-colors hover:bg-fairy-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add sensor
                      </button>
                    )}
                  </div>

                  {effectiveSensors.length > 0 ? (
                    <div className="space-y-2">
                      {effectiveSensors.map((sensor, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 rounded-xl card border p-3"
                        >
                          <select
                            value={sensor.name}
                            onChange={e =>
                              handleUpdateSensor(i, { ...sensor, name: e.target.value })
                            }
                            className="h-11 min-w-0 flex-1 rounded-lg border border-[var(--border-secondary)] surface px-2.5 text-sm text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                          >
                            <option value="" disabled>Select a sensor</option>
                            {sensor.name && !hubSensors.some(d => d.label === sensor.name) && (
                              <option value={sensor.name}>{sensor.name}</option>
                            )}
                            {hubSensors
                              .filter(d => d.label === sensor.name || !assignedNames.has(d.label))
                              .map(d => (
                                <option key={d.id} value={d.label}>
                                  {d.label}
                                </option>
                              ))}
                          </select>
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
                  ) : hubSensors.length > 0 ? (
                    <p className="rounded-xl border border-dashed border-[var(--border-secondary)] py-6 text-center text-xs text-caption">
                      No sensors configured. Add a sensor to enable motion-based automation.
                    </p>
                  ) : (
                    <p className="rounded-xl border border-dashed border-[var(--border-secondary)] py-6 text-center text-xs text-caption">
                      No sensors found in Hubitat. Sync your devices first.
                    </p>
                  )}
                </>
              )
            })()}
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
      <div className="fixed inset-x-0 bottom-[60px] z-30 border-t border-[var(--border-primary)] chrome p-4 md:bottom-0 md:left-56">
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
