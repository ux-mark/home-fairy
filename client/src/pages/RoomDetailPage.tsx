import { useState, useMemo, useCallback, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  X,
  Zap,
  Save,
  Wifi,
  WifiOff,
  Lightbulb,
  Trash2,
  Pencil,
  ToggleLeft,
  Activity,
  CheckSquare,
  Square,
  Shield,
  ChevronRight,
  Sparkles,
  Check,
  ExternalLink,
  CirclePause,
  CircleSlash,
} from 'lucide-react'
import * as Switch from '@radix-ui/react-switch'
import * as Tabs from '@radix-ui/react-tabs'
import { getSocket } from '@/hooks/useSocket'
import { api } from '@/lib/api'
import type { Light, LightAssignment, Sensor, HubDevice, DeviceRoomAssignment, DeactivatedDevice, SonosZone, AutoPlayRule } from '@/lib/api'
import { cn, getLightColorHex } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { Accordion } from '@/components/ui/Accordion'
import { BackLink } from '@/components/ui/BackLink'
import { TypeBadge, StatusBadge } from '@/components/ui/Badge'
import { SearchInput } from '@/components/ui/SearchInput'
import RoomIntelligence from '@/components/room/RoomIntelligence'
import { FavouriteSelector } from '@/components/sonos/FavouriteSelector'
import { PillSelect } from '@/components/ui/PillSelect'
import { CardRadioGroup } from '@/components/ui/CardRadioGroup'
import { getScenesForRoom, getModesForRoom, getDefaultScene, isSceneInSeason } from '@/lib/scene-utils'
import { LucideIcon } from '@/components/ui/LucideIcon'
import { IconPicker } from '@/components/ui/IconPicker'

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
      <span className="min-w-0 flex-1 break-words text-sm font-medium text-heading">
        {light.label}
      </span>
      {isAssignedElsewhere ? (
        <span className="shrink-0 break-words text-[10px] text-caption">
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
  deactivated,
}: {
  assignment: LightAssignment
  light?: Light
  onRemove: () => void
  onIdentify: () => void
  deactivated?: boolean
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
        <p className={cn('break-words text-sm font-medium', deactivated ? 'text-slate-500' : 'text-heading')}>
          {assignment.label}
          {deactivated && <span className="ml-1.5"><StatusBadge status="deactivated" /></span>}
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

// ── Assigned device row ─────────────────────────────────────────────────────

function AssignedDeviceRow({
  assignment,
  onRemove,
  onToggleExclude,
  deactivated,
}: {
  assignment: DeviceRoomAssignment
  onRemove: () => void
  onToggleExclude: () => void
  deactivated?: boolean
}) {
  const isExcluded = !!assignment.config?.exclude_from_all_off

  return (
    <div className="flex items-center gap-3 rounded-lg border border-fairy-500/20 bg-fairy-500/5 px-3 py-2.5 transition-colors">
      <div className="min-w-0 flex-1">
        <p className={cn('break-words text-sm font-medium', deactivated ? 'text-slate-500' : 'text-heading')}>
          {assignment.device_label}
          {deactivated && <span className="ml-1.5"><StatusBadge status="deactivated" /></span>}
        </p>
      </div>
      <TypeBadge type={assignment.device_type} />
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
      <span className="min-w-0 flex-1 break-words text-sm font-medium text-heading">
        {device.label}
      </span>
      <TypeBadge type={device.device_type} />
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

  // Section accordion state
  const [settingsOpen, setSettingsOpen] = useState(true)
  const [scenesOpen, setScenesOpen] = useState(false)
  const [devicesOpen, setDevicesOpen] = useState(false)

  // Inline add/edit auto-play rule form state
  const [showAddRuleForm, setShowAddRuleForm] = useState(false)
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null)
  const [newRuleFavourite, setNewRuleFavourite] = useState('')
  const [newRuleMode, setNewRuleMode] = useState('')
  const [newRuleTriggerType, setNewRuleTriggerType] = useState<'mode_change' | 'if_not_playing' | 'if_source_not'>('if_not_playing')
  const [newRuleSourceValue, setNewRuleSourceValue] = useState('')
  const [newRuleMaxPlays, setNewRuleMaxPlays] = useState<string>('')
  const [podcastFeedUrl, setPodcastFeedUrl] = useState<string | null>(null)
  const [podcastResolving, setPodcastResolving] = useState(false)
  const [podcastFailed, setPodcastFailed] = useState(false)
  const [manualFeedUrl, setManualFeedUrl] = useState('')

  // Auto-detect podcast when favourite changes
  useEffect(() => {
    const fav = newRuleFavourite
    if (!fav || fav === '__continue__') {
      setPodcastFeedUrl(null)
      setPodcastFailed(false)
      setManualFeedUrl('')
      return
    }
    let cancelled = false
    setPodcastResolving(true)
    setPodcastFailed(false)
    api.sonos.resolvePodcast(fav).then(result => {
      if (cancelled) return
      setPodcastResolving(false)
      if (result.isPodcast) {
        if (result.feedUrl) {
          setPodcastFeedUrl(result.feedUrl)
        } else {
          setPodcastFailed(true)
          setPodcastFeedUrl(null)
        }
      } else {
        setPodcastFeedUrl(null)
      }
    }).catch(() => { if (!cancelled) setPodcastResolving(false) })
    return () => { cancelled = true }
  }, [newRuleFavourite])

  // Open groups state for available lights and devices
  const [openLightGroups, setOpenLightGroups] = useState<Set<string>>(new Set())
  const [openDeviceGroups, setOpenDeviceGroups] = useState<Set<string>>(new Set())

  const toggleLightGroup = (name: string) => {
    setOpenLightGroups(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const toggleDeviceGroup = (name: string) => {
    setOpenDeviceGroups(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

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

  // Fetch all Kasa devices
  const { data: allKasaDevices } = useQuery({
    queryKey: ['kasa', 'devices'],
    queryFn: api.kasa.getDevices,
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

  const { data: systemCurrent } = useQuery({
    queryKey: ['system', 'current'],
    queryFn: api.system.getCurrent,
  })

  // Fetch deactivated devices for dimmed treatment
  const { data: deactivatedDevices } = useQuery({
    queryKey: ['devices', 'deactivated'],
    queryFn: api.devices.getDeactivated,
  })

  // Sonos queries
  const { data: sonosSpeakers } = useQuery({
    queryKey: ['sonos', 'speakers'],
    queryFn: api.sonos.getSpeakers,
    enabled: !!name,
  })

  const { data: sonosFavourites } = useQuery({
    queryKey: ['sonos', 'favourites'],
    queryFn: api.sonos.getFavourites,
    enabled: !!name,
  })

  const { data: sonosFollowMeStatus } = useQuery({
    queryKey: ['sonos', 'follow-me-status'],
    queryFn: api.sonos.getFollowMeStatus,
    enabled: !!name,
  })

  const { data: autoPlayRules } = useQuery({
    queryKey: ['sonos', 'auto-play'],
    queryFn: api.sonos.getAutoPlayRules,
    enabled: !!name,
    staleTime: 30_000,
  })

  const { data: sonosModes } = useQuery({
    queryKey: ['system', 'modes'],
    queryFn: api.system.getModes,
    staleTime: 60_000,
  })

  // Find the speaker mapped to this room
  const roomSpeaker = useMemo(
    () => sonosSpeakers?.find(s => s.room_name === name) ?? null,
    [sonosSpeakers, name],
  )

  // Live Sonos zone data for the now-playing indicator
  const [liveZones, setLiveZones] = useState<SonosZone[] | null>(null)

  useEffect(() => {
    if (!roomSpeaker) return
    const s = getSocket()

    function handleZonesUpdate(zones: SonosZone[]) {
      setLiveZones(zones)
    }
    function handleFollowMeUpdate() {
      queryClient.invalidateQueries({ queryKey: ['sonos', 'follow-me-status'] })
    }

    s.on('sonos:zones-update', handleZonesUpdate)
    s.on('sonos:playback-update', handleZonesUpdate)
    s.on('sonos:follow-me-update', handleFollowMeUpdate)

    return () => {
      s.off('sonos:zones-update', handleZonesUpdate)
      s.off('sonos:playback-update', handleZonesUpdate)
      s.off('sonos:follow-me-update', handleFollowMeUpdate)
    }
  }, [roomSpeaker, queryClient])

  // Find the live zone for this room's speaker
  const roomZone = useMemo(() => {
    if (!roomSpeaker || !liveZones) return null
    return liveZones.find(z =>
      z.coordinator.roomName === roomSpeaker.speaker_name ||
      z.members.some(m => m.roomName === roomSpeaker.speaker_name),
    ) ?? null
  }, [roomSpeaker, liveZones])

  // Determine if this speaker is in the follow-me group
  const isInFollowMeGroup = useMemo(() => {
    if (!roomSpeaker || !sonosFollowMeStatus) return false
    return sonosFollowMeStatus.activeRooms.includes(roomSpeaker.room_name)
  }, [roomSpeaker, sonosFollowMeStatus])

  // Auto-play rules for this room
  const roomAutoPlayRules = useMemo(
    () => autoPlayRules?.filter(r => r.room_name === name) ?? [],
    [autoPlayRules, name],
  )

  const { data: availableSources } = useQuery({
    queryKey: ['sonos', 'services'],
    queryFn: api.sonos.getServices,
    staleTime: 60_000,
  })

  // Fetch default scene assignments for this room
  const { data: roomDefaultScenes } = useQuery({
    queryKey: ['room-default-scenes', name],
    queryFn: () => api.roomDefaultScenes.getForRoom(name!),
    enabled: !!name,
  })

  // Mutation to set/clear default scene for a room+mode
  const setDefaultSceneMutation = useMutation({
    mutationFn: ({ mode, scene }: { mode: string; scene: string | null }) =>
      api.roomDefaultScenes.set(name!, mode, scene),
    onSuccess: (data) => {
      queryClient.setQueryData(['room-default-scenes', name], data)
      queryClient.invalidateQueries({ queryKey: ['room-default-scenes'] })
    },
  })

  // Room settings state
  const [displayOrder, setDisplayOrder] = useState<number | null>(null)
  const [timer, setTimer] = useState<number | null>(null)
  const [autoEnabled, setAutoEnabled] = useState<boolean | null>(null)
  const [parentRoom, setParentRoom] = useState<string | null>(null)
  const [sensors, setSensors] = useState<Sensor[] | null>(null)
  const [_roomNameEdit, _setRoomNameEdit] = useState<string | null>(null)
  const [iconPickerOpen, setIconPickerOpen] = useState(false)

  // Compute effective values (from state or room data)
  const effectiveOrder = displayOrder ?? room?.display_order ?? 0
  const effectiveTimer = timer ?? room?.timer ?? 0
  const effectiveAuto = autoEnabled ?? room?.auto ?? false
  const effectiveParent = parentRoom ?? room?.parent_room ?? ''
  const effectiveSensors = (sensors ?? room?.sensors ?? []).map(s => {
    // Resolve current name from hub devices (handles renamed sensors)
    if (s.id && allHubDevices) {
      const hubDevice = allHubDevices.find(d => String(d.id) === s.id)
      if (hubDevice && hubDevice.label !== s.name) {
        return { ...s, name: hubDevice.label }
      }
    }
    return s
  })

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

  // Build a lookup of deactivated device IDs keyed as "type:id"
  const deactivatedSet = useMemo(() => {
    if (!deactivatedDevices) return new Set<string>()
    return new Set(
      (deactivatedDevices as DeactivatedDevice[]).map(d => `${d.deviceType}:${d.deviceId}`),
    )
  }, [deactivatedDevices])

  const isLightDeactivated = (lightId: string) => deactivatedSet.has(`lifx:${lightId}`)
  const isHubDeviceDeactivated = (deviceId: string) => deactivatedSet.has(`hub:${deviceId}`)
  const isKasaDeviceDeactivated = (deviceId: string) => deactivatedSet.has(`kasa:${deviceId}`)

  // ── Device (switches/dimmers/twinkly/fairy/kasa) assignment state ─────
  const SWITCH_TYPES = ['switch', 'dimmer']
  const OTHER_TYPES = ['twinkly', 'fairy']
  const KASA_TYPES = ['kasa_plug', 'kasa_strip', 'kasa_outlet', 'kasa_switch', 'kasa_dimmer']

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
  const DEVICE_TYPES = [...SWITCH_TYPES, ...OTHER_TYPES, ...KASA_TYPES]
  const filteredDeviceAssignments = useMemo(
    () => effectiveDeviceAssignments.filter(d => DEVICE_TYPES.includes(d.device_type)),
    [effectiveDeviceAssignments],
  )

  // All device IDs already assigned to ANY room
  const deviceIdsAssignedToAnyRoom = useMemo(() => {
    if (!allDeviceRoomAssignments) return new Set<string>()
    return new Set(allDeviceRoomAssignments.map(a => a.device_id))
  }, [allDeviceRoomAssignments])

  // Available devices by type for switches tab (Hub + Kasa)
  const availableDevicesByType = useMemo(() => {
    const assignedIds = new Set(effectiveDeviceAssignments.map(d => d.device_id))
    const allTypes = [...SWITCH_TYPES, ...OTHER_TYPES, ...KASA_TYPES]
    const groups = new Map<string, HubDevice[]>()

    // Hub devices
    if (allHubDevices) {
      for (const device of allHubDevices) {
        if (!allTypes.includes(device.device_type)) continue
        if (assignedIds.has(String(device.id))) continue
        if (deviceIdsAssignedToAnyRoom.has(String(device.id))) continue
        const type = device.device_type
        if (!groups.has(type)) groups.set(type, [])
        groups.get(type)!.push(device)
      }
    }

    // Kasa devices — all grouped under a single "Kasa plugs" category
    if (allKasaDevices) {
      const kasaGroup = 'kasa_plug'
      for (const kd of allKasaDevices) {
        const kasaType = kd.parent_id ? 'kasa_outlet' : ('kasa_' + kd.device_type)
        if (assignedIds.has(kd.id)) continue
        if (deviceIdsAssignedToAnyRoom.has(kd.id)) continue
        if (!groups.has(kasaGroup)) groups.set(kasaGroup, [])
        groups.get(kasaGroup)!.push({
          id: kd.id as unknown as number,
          label: kd.label,
          device_name: kd.model ?? '',
          device_type: kasaType,
          capabilities: [],
          attributes: kd.attributes as Record<string, unknown>,
        })
      }
    }

    return groups
  }, [allHubDevices, allKasaDevices, effectiveDeviceAssignments, deviceIdsAssignedToAnyRoom])

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

  // Sonos setting mutations — these save immediately (not batched with room save)
  const updateFollowMeMutation = useMutation({
    mutationFn: (value: boolean) => api.rooms.update(name!, { sonos_follow_me: value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms', name] })
      toast({ message: 'Follow-me music setting saved' })
    },
    onError: () => toast({ message: 'Failed to save follow-me setting', type: 'error' }),
  })

  function resetRuleForm() {
    setShowAddRuleForm(false)
    setEditingRuleId(null)
    setNewRuleFavourite('')
    setNewRuleMode('')
    setNewRuleTriggerType('if_not_playing')
    setNewRuleSourceValue('')
    setNewRuleMaxPlays('')
    setPodcastFeedUrl(null)
    setPodcastFailed(false)
    setManualFeedUrl('')
  }

  function openEditRule(rule: AutoPlayRule) {
    setShowAddRuleForm(false)
    setEditingRuleId(rule.id)
    setNewRuleFavourite(rule.favourite_name)
    setNewRuleMode(rule.mode_name)
    setNewRuleTriggerType(rule.trigger_type)
    setNewRuleSourceValue(rule.trigger_value ?? '')
    setNewRuleMaxPlays(rule.max_plays !== null ? String(rule.max_plays) : '')
    setPodcastFeedUrl(rule.podcast_feed_url ?? null)
    setPodcastFailed(false)
    setManualFeedUrl('')
  }

  const createAutoPlayRuleMutation = useMutation({
    mutationFn: api.sonos.createAutoPlayRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sonos', 'auto-play'] })
      toast({ message: 'Auto-play rule added' })
      resetRuleForm()
    },
    onError: () => toast({ message: 'Failed to add rule', type: 'error' }),
  })

  const deleteAutoPlayRuleMutation = useMutation({
    mutationFn: (id: number) => api.sonos.deleteAutoPlayRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sonos', 'auto-play'] })
      toast({ message: 'Auto-play rule deleted' })
      setEditingRuleId(null)
    },
    onError: () => toast({ message: 'Failed to delete rule', type: 'error' }),
  })

  const toggleAutoPlayRuleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      api.sonos.updateAutoPlayRule(id, { enabled: enabled ? 1 : 0 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sonos', 'auto-play'] })
    },
    onError: () => toast({ message: 'Failed to update rule', type: 'error' }),
  })

  const editAutoPlayRuleMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<AutoPlayRule> }) =>
      api.sonos.updateAutoPlayRule(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sonos', 'auto-play'] })
      toast({ message: 'Auto-play rule updated' })
      resetRuleForm()
    },
    onError: () => toast({ message: 'Failed to update rule', type: 'error' }),
  })

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
      // Save sensor assignments via device_rooms
      const currentSensorIds = new Set((room?.sensors ?? []).map(s => s.id))
      const newSensorIds = new Set(effectiveSensors
        .filter(s => s.name)
        .map(s => {
          // Use existing sensor ID if available, otherwise look up by label
          if (s.id) return s.id
          const hubDevice = allHubDevices!.find(d => d.label === s.name)
          return hubDevice ? String(hubDevice.id) : null
        })
        .filter((id): id is string => id != null))

      // Unassign removed sensors
      for (const sensor of room?.sensors ?? []) {
        if (sensor.id && !newSensorIds.has(sensor.id)) {
          await api.hubitat.unassignDevice(sensor.id, name!)
        }
      }

      // Assign new sensors
      for (const sensor of effectiveSensors) {
        if (!sensor.name) continue
        const hubDevice = allHubDevices!.find(d => d.label === sensor.name)
        if (!hubDevice) continue
        const sensorId = String(hubDevice.id)
        if (!currentSensorIds.has(sensorId)) {
          await api.hubitat.assignDevice({
            device_id: sensorId,
            device_label: sensor.name,
            device_type: 'motion',
            room_name: name!,
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

  const updateIconMutation = useMutation({
    mutationFn: (icon: string) => api.rooms.update(name!, { icon }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms', name] })
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      toast({ message: 'Room icon updated' })
    },
    onError: () =>
      toast({ message: 'Failed to update room icon', type: 'error' }),
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
      if (newAssigns.find(p => p.device_id === id)) continue
      // Check hub devices first, then look in available groups (includes Kasa)
      const hubDevice = allHubDevices?.find(d => String(d.id) === id)
      if (hubDevice) {
        newAssigns.push({
          device_id: id,
          device_label: hubDevice.label,
          device_type: hubDevice.device_type,
        })
      } else {
        // Check available groups (includes Kasa devices mapped to HubDevice shape)
        for (const devices of availableDevicesByType.values()) {
          const found = devices.find(d => String(d.id) === id)
          if (found) {
            newAssigns.push({
              device_id: id,
              device_label: found.label,
              device_type: found.device_type,
            })
            break
          }
        }
      }
    }
    setPendingDeviceAssigns(newAssigns)
    setSelectedDeviceIds(new Set())
    setDeviceMultiSelect(false)
    setDirty(true)
  }

  const handleAddSensor = () => {
    setSensors([...effectiveSensors, { name: '' }])
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
    kasa_plug: 'Kasa plugs',
  }

  return (
    <div className="pb-40">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <BackLink to="/rooms" label="All Rooms" className="mb-3" />

        <div className="flex items-center gap-3">
          {/* Room icon — click to change, or show add-icon button if none set */}
          <div className="relative">
            {room.icon ? (
              <button
                type="button"
                onClick={() => setIconPickerOpen(v => !v)}
                aria-label="Change room icon"
                title="Change room icon"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-fairy-400 transition-colors hover:bg-fairy-500/15 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-fairy-500"
              >
                <LucideIcon name={room.icon} className="h-5 w-5" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIconPickerOpen(v => !v)}
                aria-label="Add room icon"
                title="Add room icon"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-dashed border-[var(--border-secondary)] text-caption transition-colors hover:border-fairy-500/50 hover:text-fairy-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-fairy-500"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            {iconPickerOpen && (
              <div className="absolute left-0 top-full z-50 mt-1">
                <IconPicker
                  value={room.icon}
                  onChange={(iconName) => updateIconMutation.mutate(iconName)}
                  onClose={() => setIconPickerOpen(false)}
                />
              </div>
            )}
          </div>

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

      <div className="space-y-4">
      {/* ── Settings card ───────────────────────────────────────────────────── */}
      <section>
        <Accordion
          id="room-settings"
          title="Room Settings"
          open={settingsOpen}
          onToggle={() => setSettingsOpen(prev => !prev)}
        >
          <div className="space-y-4">
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

            {/* ── Sonos controls (only shown when a speaker is mapped to this room) ── */}
            {roomSpeaker && (
              <div className="space-y-4 border-t border-[var(--border-secondary)] pt-4">
                <p className="text-xs font-semibold text-caption">Music</p>

                {/* Follow-me music toggle */}
                <div>
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="sonos-follow-me-toggle"
                      className="text-sm font-medium text-heading"
                    >
                      Follow-me music
                    </label>
                    <Switch.Root
                      id="sonos-follow-me-toggle"
                      checked={room.sonos_follow_me}
                      disabled={updateFollowMeMutation.isPending || sonosFollowMeStatus?.enabled === false}
                      onCheckedChange={(c) => updateFollowMeMutation.mutate(c)}
                      className={cn(
                        'relative h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                        room.sonos_follow_me && sonosFollowMeStatus?.enabled !== false
                          ? 'bg-fairy-500'
                          : 'bg-[var(--border-secondary)]',
                      )}
                      aria-describedby="sonos-follow-me-desc"
                    >
                      <Switch.Thumb
                        className={cn(
                          'block h-5 w-5 rounded-full bg-white shadow transition-transform',
                          room.sonos_follow_me ? 'translate-x-6' : 'translate-x-1',
                        )}
                      />
                    </Switch.Root>
                  </div>
                  <p
                    id="sonos-follow-me-desc"
                    className={cn(
                      'mt-1 text-xs',
                      sonosFollowMeStatus?.enabled === false ? 'text-amber-400' : 'text-caption',
                    )}
                  >
                    {sonosFollowMeStatus?.enabled === false
                      ? 'Enable follow-me music in Settings to use this.'
                      : 'Music follows you when you enter this room.'}
                  </p>
                </div>

                {/* Auto-play rules */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-heading">Auto-play rules</p>
                    {roomAutoPlayRules.length > 0 && (
                      <span className="rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 text-xs text-caption">
                        {roomAutoPlayRules.length}
                      </span>
                    )}
                  </div>

                  {roomAutoPlayRules.length > 0 && (
                    <ul className="space-y-2" role="list">
                      {roomAutoPlayRules.map(rule => {
                        const isEditing = editingRuleId === rule.id
                        const isPodcast = !!rule.podcast_feed_url
                        const mainText = rule.favourite_name === '__continue__'
                          ? `Continue what's already playing when mode changes to "${rule.mode_name}".`
                          : isPodcast
                            ? `Play latest "${rule.favourite_name}" episode when mode changes to "${rule.mode_name}".`
                            : `Play "${rule.favourite_name}" when mode changes to "${rule.mode_name}".`
                        let conditionText: string | undefined
                        if (rule.trigger_type === 'if_not_playing') conditionText = 'Only if nothing is playing.'
                        else if (rule.trigger_type === 'if_source_not' && rule.trigger_value) conditionText = `Only if "${rule.trigger_value}" is not active.`
                        if (rule.max_plays !== null) {
                          const limitText = rule.max_plays === 1 ? 'Plays once per mode change.' : `Plays ${rule.max_plays} times per mode change.`
                          conditionText = conditionText ? `${conditionText} ${limitText}` : limitText
                        }

                        if (isEditing) {
                          return (
                            <li key={rule.id} className="rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] p-4 space-y-4">
                              <p className="text-heading text-sm font-medium">Edit auto-play rule</p>

                              <div>
                                <p className="text-heading text-sm mb-1.5">Room</p>
                                <span className="inline-flex items-center rounded-full bg-fairy-500/10 px-3 py-1.5 text-sm font-medium text-fairy-400">{name}</span>
                              </div>

                              <div>
                                <label htmlFor="room-edit-rule-favourite" className="text-heading text-sm mb-1.5 block">Favourite</label>
                                <FavouriteSelector favourites={sonosFavourites ?? []} value={newRuleFavourite} onChange={setNewRuleFavourite} id="room-edit-rule-favourite" />
                                {podcastResolving && (
                                  <p className="text-caption text-xs mt-1">Detecting podcast...</p>
                                )}
                                {podcastFeedUrl && !podcastResolving && (
                                  <p className="text-xs mt-1 text-fairy-400">Podcast detected. The latest episode will play automatically.</p>
                                )}
                                {podcastFailed && !podcastResolving && (
                                  <div className="mt-2">
                                    <p className="text-xs text-amber-400 mb-1">Podcast detected, but we could not find its feed automatically.</p>
                                    <input
                                      type="url"
                                      value={manualFeedUrl}
                                      onChange={e => setManualFeedUrl(e.target.value)}
                                      placeholder="Paste the podcast RSS feed URL"
                                      className="w-full h-11 rounded-lg border border-[var(--border-secondary)] surface px-3 text-sm text-heading placeholder:text-caption focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                                    />
                                  </div>
                                )}
                              </div>

                              <div>
                                <p className="text-heading text-sm mb-1.5">Mode</p>
                                <PillSelect
                                  id="room-edit-rule-mode"
                                  options={sonosModes?.map(m => ({ value: m.name, label: m.name })) ?? []}
                                  value={newRuleMode}
                                  onChange={setNewRuleMode}
                                  placeholder="Select a mode"
                                  aria-label="Select a mode"
                                />
                              </div>

                              {newRuleFavourite !== '__continue__' && (
                                <div>
                                  <p className="text-heading text-sm mb-2">Condition</p>
                                  <CardRadioGroup
                                    name="room-edit-trigger-type"
                                    options={[
                                      { value: 'if_not_playing', label: 'Only if nothing is playing', description: 'Skipped when music is already playing.', icon: CirclePause },
                                      { value: 'mode_change', label: 'Always when mode changes', description: 'Starts playback every time this mode activates.', icon: Zap },
                                      { value: 'if_source_not', label: 'Only if a source is not active', description: 'Skipped when a specific source is playing.', icon: CircleSlash },
                                    ]}
                                    value={newRuleTriggerType}
                                    onChange={(v) => setNewRuleTriggerType(v as AutoPlayRule['trigger_type'])}
                                    aria-label="Trigger condition"
                                  />
                                  {newRuleTriggerType === 'if_source_not' && (
                                    <div className="mt-3">
                                      <label htmlFor="room-edit-rule-source" className="text-caption text-xs mb-1.5 block">Source</label>
                                      <PillSelect
                                        id="room-edit-rule-source"
                                        options={(availableSources ?? []).map(s => ({ value: s, label: s }))}
                                        value={newRuleSourceValue}
                                        onChange={setNewRuleSourceValue}
                                        aria-label="Select a source"
                                      />
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Repeat limit */}
                              <div>
                                <p className="text-heading text-sm mb-1.5">Repeat limit</p>
                                <p className="text-caption text-xs mb-2">
                                  How many times this rule fires per mode change
                                </p>
                                <PillSelect
                                  id="room-edit-rule-max-plays"
                                  options={[
                                    { value: '', label: 'Unlimited' },
                                    { value: '1', label: 'Once' },
                                    { value: '2', label: '2 times' },
                                    { value: '3', label: '3 times' },
                                    { value: '5', label: '5 times' },
                                  ]}
                                  value={newRuleMaxPlays}
                                  onChange={setNewRuleMaxPlays}
                                />
                              </div>

                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  onClick={() => {
                                    if (!newRuleFavourite || !newRuleMode) return
                                    const effectiveTrigger = newRuleFavourite === '__continue__' ? 'mode_change' : newRuleTriggerType
                                    editAutoPlayRuleMutation.mutate({
                                      id: rule.id,
                                      data: {
                                        mode_name: newRuleMode,
                                        favourite_name: newRuleFavourite,
                                        trigger_type: effectiveTrigger,
                                        trigger_value: effectiveTrigger === 'if_source_not' ? newRuleSourceValue : null,
                                        max_plays: newRuleMaxPlays ? Number(newRuleMaxPlays) : null,
                                        podcast_feed_url: podcastFeedUrl ?? (podcastFailed && manualFeedUrl ? manualFeedUrl : null),
                                      },
                                    })
                                  }}
                                  disabled={!newRuleFavourite || !newRuleMode || (newRuleTriggerType === 'if_source_not' && newRuleFavourite !== '__continue__' && !newRuleSourceValue) || editAutoPlayRuleMutation.isPending}
                                  className="rounded-lg px-4 py-2 min-h-[44px] bg-fairy-500 text-white text-sm font-medium hover:bg-fairy-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                                >
                                  {editAutoPlayRuleMutation.isPending ? 'Saving...' : 'Save changes'}
                                </button>
                                <button onClick={resetRuleForm} className="rounded-lg px-4 py-2 min-h-[44px] border border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-heading text-sm hover:bg-[var(--bg-tertiary)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500">
                                  Cancel
                                </button>
                              </div>

                              <div className="border-t border-red-500/20 pt-4 mt-4">
                                <p className="text-sm font-medium text-red-400 mb-2">Danger zone</p>
                                <button
                                  onClick={() => deleteAutoPlayRuleMutation.mutate(rule.id)}
                                  disabled={deleteAutoPlayRuleMutation.isPending}
                                  className={cn(
                                    'rounded-lg px-4 py-2 min-h-[44px] text-sm font-medium transition-colors',
                                    'border border-red-500/30 text-red-400 hover:bg-red-500/10',
                                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500',
                                    'disabled:cursor-not-allowed disabled:opacity-40',
                                  )}
                                >
                                  {deleteAutoPlayRuleMutation.isPending ? 'Deleting...' : 'Delete this rule'}
                                </button>
                              </div>
                            </li>
                          )
                        }

                        return (
                          <li
                            key={rule.id}
                            className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] px-3 py-2.5"
                          >
                            <div className="min-w-0 flex-1">
                              <p className={cn('text-xs', rule.enabled ? 'text-body' : 'text-caption line-through')}>
                                {mainText}
                              </p>
                              {conditionText && (
                                <p className={cn('text-xs mt-0.5', rule.enabled ? 'text-caption' : 'text-caption line-through')}>
                                  {conditionText}
                                </p>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <Switch.Root
                                checked={!!rule.enabled}
                                onCheckedChange={checked =>
                                  toggleAutoPlayRuleMutation.mutate({ id: rule.id, enabled: checked })
                                }
                                disabled={toggleAutoPlayRuleMutation.isPending}
                                aria-label={`${rule.enabled ? 'Disable' : 'Enable'} rule for ${rule.mode_name}`}
                                className={cn(
                                  'relative h-6 w-10 shrink-0 cursor-pointer rounded-full transition-colors',
                                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                                  'disabled:cursor-not-allowed disabled:opacity-40',
                                  rule.enabled ? 'bg-fairy-500' : 'bg-[var(--border-secondary)]',
                                )}
                              >
                                <Switch.Thumb
                                  className={cn(
                                    'block h-4 w-4 rounded-full bg-white shadow transition-transform',
                                    rule.enabled ? 'translate-x-5' : 'translate-x-1',
                                  )}
                                />
                              </Switch.Root>
                              <button
                                onClick={() => openEditRule(rule)}
                                aria-label={`Edit rule for ${rule.mode_name}`}
                                className={cn(
                                  'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg',
                                  'text-caption transition-colors hover:bg-fairy-500/10 hover:text-fairy-400',
                                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                                )}
                              >
                                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                <span className="sr-only">Edit rule</span>
                              </button>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}

                  {showAddRuleForm ? (
                    <div className="rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] p-4 space-y-4">
                      <p className="text-heading text-sm font-medium">New auto-play rule</p>

                      <div>
                        <p className="text-heading text-sm mb-1.5">Room</p>
                        <span className="inline-flex items-center rounded-full bg-fairy-500/10 px-3 py-1.5 text-sm font-medium text-fairy-400">{name}</span>
                      </div>

                      <div>
                        <label htmlFor="room-detail-rule-favourite" className="text-heading text-sm mb-1.5 block">Favourite</label>
                        <FavouriteSelector favourites={sonosFavourites ?? []} value={newRuleFavourite} onChange={setNewRuleFavourite} id="room-detail-rule-favourite" />
                        {podcastResolving && (
                          <p className="text-caption text-xs mt-1">Detecting podcast...</p>
                        )}
                        {podcastFeedUrl && !podcastResolving && (
                          <p className="text-xs mt-1 text-fairy-400">Podcast detected. The latest episode will play automatically.</p>
                        )}
                        {podcastFailed && !podcastResolving && (
                          <div className="mt-2">
                            <p className="text-xs text-amber-400 mb-1">Podcast detected, but we could not find its feed automatically.</p>
                            <input
                              type="url"
                              value={manualFeedUrl}
                              onChange={e => setManualFeedUrl(e.target.value)}
                              placeholder="Paste the podcast RSS feed URL"
                              className="w-full h-11 rounded-lg border border-[var(--border-secondary)] surface px-3 text-sm text-heading placeholder:text-caption focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                            />
                          </div>
                        )}
                      </div>

                      <div>
                        <p className="text-heading text-sm mb-1.5">Mode</p>
                        <PillSelect
                          id="room-detail-rule-mode"
                          options={sonosModes?.map(m => ({ value: m.name, label: m.name })) ?? []}
                          value={newRuleMode}
                          onChange={setNewRuleMode}
                          placeholder="Select a mode"
                          aria-label="Select a mode"
                        />
                      </div>

                      {newRuleFavourite !== '__continue__' && (
                        <div>
                          <p className="text-heading text-sm mb-2">Condition</p>
                          <CardRadioGroup
                            name="room-detail-trigger-type"
                            options={[
                              { value: 'if_not_playing', label: 'Only if nothing is playing', description: 'Skipped when music is already playing.', icon: CirclePause },
                              { value: 'mode_change', label: 'Always when mode changes', description: 'Starts playback every time this mode activates.', icon: Zap },
                              { value: 'if_source_not', label: 'Only if a source is not active', description: 'Skipped when a specific source is playing.', icon: CircleSlash },
                            ]}
                            value={newRuleTriggerType}
                            onChange={(v) => setNewRuleTriggerType(v as AutoPlayRule['trigger_type'])}
                            aria-label="Trigger condition"
                          />
                          {newRuleTriggerType === 'if_source_not' && (
                            <div className="mt-3">
                              <label htmlFor="room-detail-rule-source" className="text-caption text-xs mb-1.5 block">Source</label>
                              <PillSelect
                                id="room-detail-rule-source"
                                options={(availableSources ?? []).map(s => ({ value: s, label: s }))}
                                value={newRuleSourceValue}
                                onChange={setNewRuleSourceValue}
                                aria-label="Select a source"
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {/* Repeat limit */}
                      <div>
                        <p className="text-heading text-sm mb-1.5">Repeat limit</p>
                        <p className="text-caption text-xs mb-2">
                          How many times this rule fires per mode change
                        </p>
                        <PillSelect
                          id="room-add-rule-max-plays"
                          options={[
                            { value: '', label: 'Unlimited' },
                            { value: '1', label: 'Once' },
                            { value: '2', label: '2 times' },
                            { value: '3', label: '3 times' },
                            { value: '5', label: '5 times' },
                          ]}
                          value={newRuleMaxPlays}
                          onChange={setNewRuleMaxPlays}
                        />
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => {
                            if (!newRuleFavourite || !newRuleMode) return
                            const effectiveTrigger = newRuleFavourite === '__continue__' ? 'mode_change' : newRuleTriggerType
                            createAutoPlayRuleMutation.mutate({
                              room_name: name ?? null,
                              mode_name: newRuleMode,
                              favourite_name: newRuleFavourite,
                              trigger_type: effectiveTrigger,
                              trigger_value: effectiveTrigger === 'if_source_not' ? newRuleSourceValue : null,
                              enabled: 1,
                              max_plays: newRuleMaxPlays ? Number(newRuleMaxPlays) : null,
                              podcast_feed_url: podcastFeedUrl ?? (podcastFailed && manualFeedUrl ? manualFeedUrl : null),
                            })
                          }}
                          disabled={!newRuleFavourite || !newRuleMode || (newRuleTriggerType === 'if_source_not' && newRuleFavourite !== '__continue__' && !newRuleSourceValue) || createAutoPlayRuleMutation.isPending}
                          className="rounded-lg px-4 py-2 min-h-[44px] bg-fairy-500 text-white text-sm font-medium hover:bg-fairy-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                        >
                          {createAutoPlayRuleMutation.isPending ? 'Saving...' : 'Save rule'}
                        </button>
                        <button onClick={resetRuleForm} className="rounded-lg px-4 py-2 min-h-[44px] border border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-heading text-sm hover:bg-[var(--bg-tertiary)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : !editingRuleId && (
                    <button
                      onClick={() => { resetRuleForm(); setShowAddRuleForm(true) }}
                      className="rounded-lg px-4 py-2 min-h-[44px] bg-fairy-500 text-white text-sm font-medium hover:bg-fairy-600 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                    >
                      Add auto-play rule
                    </button>
                  )}

                  {roomAutoPlayRules.length === 0 && !showAddRuleForm && (
                    <p className="text-xs text-caption">
                      No auto-play rules for this room yet. Add a rule to automatically start music when a mode activates.
                    </p>
                  )}
                </div>

                {/* Now playing indicator — shown when speaker is in follow-me group */}
                {isInFollowMeGroup && roomZone && (
                  <div className={cn(
                    'rounded-lg border border-fairy-500/20 bg-fairy-500/5 px-3 py-2.5',
                  )}>
                    <p className="mb-1 text-xs font-medium text-caption">Now playing</p>
                    {roomZone.coordinator.state.currentTrack.type === 'line_in' ? (
                      <p className="text-sm text-fairy-400">External audio source active</p>
                    ) : roomZone.coordinator.state.playbackState === 'PLAYING' ? (
                      <div>
                        <p className="break-words text-sm font-medium text-fairy-400">
                          {roomZone.coordinator.state.currentTrack.title || roomZone.coordinator.state.currentTrack.stationName || 'Unknown track'}
                        </p>
                        {roomZone.coordinator.state.currentTrack.artist && (
                          <p className="mt-0.5 break-words text-xs text-caption">
                            {roomZone.coordinator.state.currentTrack.artist}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-caption">Paused</p>
                    )}
                  </div>
                )}

                {/* Speaker detail link */}
                <Link
                  to={`/sonos/${encodeURIComponent(roomSpeaker.speaker_name)}`}
                  className="inline-flex items-center gap-1.5 text-xs text-fairy-400 hover:text-fairy-300 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  View speaker details
                </Link>
              </div>
            )}
          </div>
        </Accordion>
      </section>

      {/* ── Scenes (mode-grouped) ────────────────────────────────────────────── */}
      {(() => {
        const roomScenes = allScenes && name ? getScenesForRoom(allScenes, name) : []
        const modesForRoom = allScenes && name ? getModesForRoom(allScenes, name, systemCurrent?.all_modes) : []
        const modeIcons = systemCurrent?.mode_icons ?? {}

        return (
          <section>
            <Accordion
              id="room-scenes"
              title="Scenes"
              open={scenesOpen}
              onToggle={() => setScenesOpen(prev => !prev)}
              count={roomScenes.length}
            >
              <div className="pt-1 pb-2">
                {roomScenes.length === 0 ? (
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
                  <div className="space-y-4">
                    {modesForRoom.map(mode => {
                      const scenesInMode = roomScenes
                        .filter(s => (Array.isArray(s.modes) ? s.modes : []).some(m => (m ?? '').toLowerCase() === mode.toLowerCase()))
                        .sort((a, b) => a.name.localeCompare(b.name))
                      if (scenesInMode.length === 0) return null
                      const defaultSceneName = getDefaultScene(roomDefaultScenes ? { [name ?? '']: roomDefaultScenes } : undefined, name ?? '', mode)

                      return (
                        <div key={mode}>
                          <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-caption">
                            <LucideIcon name={modeIcons[mode] ?? null} className="h-4 w-4 text-fairy-400" aria-hidden="true" />
                            {mode}
                          </h4>
                          <ul className="divide-y divide-[var(--border-secondary)] rounded-xl card border overflow-hidden">
                            {scenesInMode.map(scene => {
                              const isActive = room?.current_scene === scene.name
                              const season = isSceneInSeason(scene)
                              const isDefault = scene.name === defaultSceneName

                              return (
                                <li key={scene.name} className={cn(
                                  'flex items-center gap-3 px-3 py-2.5',
                                  isDefault && 'bg-fairy-500/5',
                                )}>
                                  {/* Default scene radio control */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault()
                                      setDefaultSceneMutation.mutate({
                                        mode,
                                        scene: isDefault ? null : scene.name,
                                      })
                                    }}
                                    aria-label={isDefault ? `Clear ${scene.name} as default scene for ${mode}` : `Set ${scene.name} as default scene for ${mode}`}
                                    className={cn(
                                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                                      isDefault
                                        ? 'border-fairy-500 bg-fairy-500'
                                        : 'border-[var(--border-secondary)] hover:border-fairy-400',
                                    )}
                                  >
                                    {isDefault && (
                                      <Activity className="h-3 w-3 text-white" aria-hidden="true" />
                                    )}
                                  </button>

                                  {/* Link to scene editor */}
                                  <Link
                                    to={`/scenes/${encodeURIComponent(scene.name)}`}
                                    className={cn(
                                      'group flex min-h-[44px] flex-1 items-center gap-3 transition-colors',
                                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 rounded-lg',
                                    )}
                                  >
                                    <div
                                      className="surface flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base"
                                      aria-hidden="true"
                                    >
                                      {scene.icon || <Sparkles className="h-4 w-4 text-[var(--text-caption)]" />}
                                    </div>

                                    <div className="min-w-0 flex-1">
                                      <span className="text-sm font-medium text-heading">{scene.name}</span>
                                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                        {isDefault && (
                                          <span className="flex items-center gap-1 rounded-full bg-fairy-500/10 px-2 py-0.5 text-[10px] font-medium text-fairy-400">
                                            <Activity className="h-3 w-3" aria-hidden="true" />
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
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </Accordion>
          </section>
        )
      })()}

      {/* ── Room intelligence ───────────────────────────────────────────────── */}
      <RoomIntelligence roomName={name!} />

      {/* ── Devices section with tabs ───────────────────────────────────────── */}
      <section>
        <Accordion
          id="room-devices"
          title="Devices"
          open={devicesOpen}
          onToggle={() => setDevicesOpen(prev => !prev)}
          count={effectiveAssigned.length + filteredDeviceAssignments.length}
        >
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
            <SearchInput
              value={lightSearch}
              onChange={setLightSearch}
              placeholder="Search lights by name..."
              matchSummary={lightMatchSummary}
              sticky
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
                      deactivated={isLightDeactivated(a.id)}
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
                    ([groupName, lights]) => {
                      const fullyAssigned = isGroupFullyAssigned(groupName)
                      const isOpen = isSearchingLights || openLightGroups.has(groupName)
                      return (
                        <Accordion
                          key={groupName}
                          id={`light-group-${groupName}`}
                          title={groupName}
                          open={isOpen}
                          onToggle={() => toggleLightGroup(groupName)}
                          count={lights.length}
                          trailing={
                            fullyAssigned ? (
                              <Check className="h-3.5 w-3.5 text-fairy-400" aria-label="All assigned" />
                            ) : lights.length > 0 ? (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); handleAssignAllInGroup(lights) }}
                                className="flex items-center gap-1 rounded-lg px-2.5 min-h-[36px] text-[11px] font-medium text-fairy-400 transition-colors hover:bg-fairy-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                                aria-label={`Assign all ${lights.length} from ${groupName}`}
                              >
                                <Plus className="h-3 w-3" />
                                Assign all
                              </button>
                            ) : null
                          }
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
                        </Accordion>
                      )
                    },
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
            <SearchInput
              value={deviceSearch}
              onChange={setDeviceSearch}
              placeholder="Search devices by name..."
              matchSummary={deviceMatchSummary}
              sticky
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
                      deactivated={
                        d.device_type.startsWith('kasa')
                          ? isKasaDeviceDeactivated(d.device_id)
                          : isHubDeviceDeactivated(d.device_id)
                      }
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
                    ([typeName, devices]) => {
                      const groupLabel = deviceTypeLabels[typeName] ?? typeName
                      const isOpen = isSearchingDevices || openDeviceGroups.has(typeName)
                      return (
                        <Accordion
                          key={typeName}
                          id={`device-group-${typeName}`}
                          title={groupLabel}
                          open={isOpen}
                          onToggle={() => toggleDeviceGroup(typeName)}
                          count={devices.length}
                          trailing={
                            devices.length > 0 ? (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); handleAssignAllDevicesInType(devices) }}
                                className="flex items-center gap-1 rounded-lg px-2.5 min-h-[36px] text-[11px] font-medium text-fairy-400 transition-colors hover:bg-fairy-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                                aria-label={`Assign all ${devices.length} from ${groupLabel}`}
                              >
                                <Plus className="h-3 w-3" />
                                Assign all
                              </button>
                            ) : null
                          }
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
                        </Accordion>
                      )
                    },
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
              ) : !allHubDevices && !allKasaDevices ? (
                <p className="rounded-xl border border-dashed border-[var(--border-secondary)] py-6 text-center text-xs text-caption">
                  No devices found. Check your hub and Kasa sidecar connections.
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
        </Accordion>
      </section>
      </div>

      {/* ── Danger zone ────────────────────────────────────────────────────── */}
      <section className="mt-8">
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
