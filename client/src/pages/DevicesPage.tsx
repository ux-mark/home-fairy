import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  RefreshCw,
  Power,
  Search,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  List,
  Shield,
  Thermometer,
  Battery,
  Sun,
  Activity,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { Light, Room, DeviceRoomAssignment, HubDevice, KasaDevice } from '@/lib/api'
import { cn, getLightColorHex } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { TypeBadge } from '@/components/ui/Badge'
import { FilterChip } from '@/components/ui/FilterChip'
import { SearchInput } from '@/components/ui/SearchInput'
import { EmptyState } from '@/components/ui/EmptyState'

// ── Room assignment pill ──────────────────────────────────────────────────────

function RoomPill({
  roomName,
  deviceLabel,
  rooms,
  onAssign,
}: {
  roomName: string | null
  deviceLabel: string
  rooms: Room[] | undefined
  onAssign: (roomName: string) => Promise<unknown>
}) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const assignMutation = useMutation({
    mutationFn: onAssign,
    onSuccess: () => {
      setOpen(false)
      toast({ message: `${deviceLabel} assigned to room` })
    },
    onError: () => toast({ message: 'Failed to assign device', type: 'error' }),
  })

  return (
    <div ref={ref} className="relative hidden sm:block">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        className={cn(
          'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors',
          roomName
            ? 'bg-fairy-500/10 text-fairy-400 hover:bg-fairy-500/20'
            : 'border border-dashed border-[var(--border-secondary)] text-caption hover:border-fairy-500/40 hover:text-fairy-400',
        )}
        aria-label={roomName ? `Change room for ${deviceLabel} (currently ${roomName})` : `Assign ${deviceLabel} to a room`}
      >
        {roomName ?? 'Assign room'}
      </button>
      {open && rooms && rooms.length > 0 && (
        <div className="absolute right-0 top-full z-20 mt-1 max-h-48 w-40 overflow-y-auto rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-primary)] shadow-lg">
          {rooms.map(room => (
            <button
              key={room.name}
              onClick={(e) => { e.stopPropagation(); assignMutation.mutate(room.name) }}
              disabled={assignMutation.isPending || room.name === roomName}
              className={cn(
                'flex w-full min-h-[36px] items-center px-3 py-1.5 text-left text-xs transition-colors',
                room.name === roomName
                  ? 'text-fairy-400 font-medium bg-fairy-500/5'
                  : 'text-body hover:bg-fairy-500/10 hover:text-heading',
              )}
            >
              {room.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────

type DeviceFilter = 'all' | 'lights' | 'switches' | 'twinkly' | 'fairy' | 'kasa' | 'sensors'
type GroupMode = 'room' | 'type'

interface UnifiedDevice {
  key: string
  kind: 'lifx' | 'switch' | 'dimmer' | 'twinkly' | 'fairy' | 'kasa' | 'sensor'
  label: string
  roomName: string | null
  isOn: boolean
  light?: Light
  hubDevice?: HubDevice
  deviceRoom?: DeviceRoomAssignment
  kasaDevice?: KasaDevice
  kasaParentLabel?: string | null
}


// ── LIFX Light card ───────────────────────────────────────────────────────────

function LightCard({ device, rooms }: { device: UnifiedDevice; rooms?: Room[] }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const light = device.light!

  const isOn = light.power === 'on'
  const colorHex = getLightColorHex(light)

  const toggleMutation = useMutation({
    mutationFn: () => api.lifx.toggle(`id:${light.id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lifx', 'lights'] }),
    onError: () => toast({ message: 'Failed to toggle light', type: 'error' }),
  })

  return (
    <div className="card rounded-xl border transition-colors">
      <div className="flex items-center gap-3 p-4">
        <div
          className={cn('h-5 w-5 shrink-0 rounded-full', !isOn && 'opacity-30')}
          style={{ backgroundColor: isOn ? colorHex : '#475569' }}
          aria-hidden="true"
        />
        <Link
          to={`/lights/${light.id}`}
          className={cn('block min-w-0 flex-1 text-left', 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500')}
        >
          <p className={cn('break-words text-sm font-medium hover:text-fairy-400 transition-colors', isOn ? 'text-heading' : 'text-body')}>
            {light.label}
          </p>
          <p className="text-caption mt-0.5 break-words text-xs">
            {device.roomName ?? light.group.name}
            {isOn && ` · ${Math.round(light.brightness * 100)}%`}
          </p>
        </Link>

        <RoomPill
          roomName={device.roomName}
          deviceLabel={device.label}
          rooms={rooms}
          onAssign={async (room) => {
            const l = light
            await api.lights.saveForRoom(room, [{
              id: l.id,
              label: l.label,
              has_color: l.product.capabilities.has_color,
              min_kelvin: l.product.capabilities.min_kelvin,
              max_kelvin: l.product.capabilities.max_kelvin,
            }])
            queryClient.invalidateQueries({ queryKey: ['lights', 'rooms'] })
          }}
        />

        <TypeBadge type="lifx" />

        <button
          onClick={() => toggleMutation.mutate()}
          disabled={toggleMutation.isPending}
          className={cn(
            'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            isOn
              ? 'bg-fairy-500/15 text-fairy-400 hover:bg-fairy-500/25'
              : 'text-caption hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-secondary)]',
          )}
          aria-label={`Turn ${light.label} ${isOn ? 'off' : 'on'}`}
        >
          <Power className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ── Hub device card (switch/dimmer/twinkly/fairy) ─────────────────────────────

function HubDeviceCard({ device, rooms }: { device: UnifiedDevice; rooms?: Room[] }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [expanded, setExpanded] = useState(false)
  const [level, setLevel] = useState(() => (device.hubDevice?.attributes as Record<string, unknown> | undefined)?.level as number ?? 50)

  const hubNewState = device.isOn ? 'off' : 'on'

  const toggleMutation = useMutation({
    mutationFn: () => api.hubitat.sendCommand(device.hubDevice!.id.toString(), hubNewState),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['hubitat', 'devices'] })
      const previous = queryClient.getQueryData<HubDevice[]>(['hubitat', 'devices'])
      queryClient.setQueryData<HubDevice[]>(['hubitat', 'devices'], old => {
        if (!old) return old
        return old.map(d =>
          d.id === device.hubDevice!.id
            ? { ...d, attributes: { ...(d.attributes as Record<string, unknown>), switch: hubNewState } }
            : d
        )
      })
      return { previous }
    },
    onSuccess: () => {
      toast({ message: `${device.label} turned ${hubNewState}` })
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['hubitat', 'devices'], context.previous)
      }
      toast({ message: `Failed to control ${device.label}`, type: 'error' })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['hubitat'] })
    },
  })

  const setLevelMutation = useMutation({
    mutationFn: (lvl: number) =>
      api.hubitat.sendCommand(device.hubDevice!.id.toString(), 'setLevel', lvl),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hubitat'] }),
  })

  const isKeepOn = !!device.deviceRoom?.config?.exclude_from_all_off

  const toggleKeepOn = useMutation({
    mutationFn: () => {
      const newValue = !isKeepOn
      const id = device.hubDevice!.id.toString()
      if (device.deviceRoom) {
        // Update room-level config
        return api.hubitat.updateDeviceConfig(id, device.deviceRoom.room_name, { exclude_from_all_off: newValue })
      }
      // Update device-level config (no room assignment)
      return api.hubitat.updateDeviceLevelConfig(id, { exclude_from_all_off: newValue })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubitat'] })
      toast({ message: isKeepOn ? `${device.label} will now turn off with All Off` : `${device.label} will stay on during All Off` })
    },
    onError: () => toast({ message: 'Failed to update device setting', type: 'error' }),
  })

  const isDimmer = device.kind === 'dimmer'

  return (
    <div className="card rounded-xl border transition-colors">
      <div className="flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <Link
            to={`/devices/${device.hubDevice!.id}`}
            className={cn('block text-sm font-medium hover:text-fairy-400 transition-colors', device.isOn ? 'text-heading' : 'text-body')}
          >
            {device.label}
          </Link>
          {device.roomName && (
            <p className="text-caption mt-0.5 text-xs">{device.roomName}</p>
          )}
        </div>

        <RoomPill
          roomName={device.roomName}
          deviceLabel={device.label}
          rooms={rooms}
          onAssign={async (room) => {
            await api.hubitat.assignDevice({ device_id: device.hubDevice!.id.toString(), device_label: device.label, device_type: device.hubDevice!.device_type, room_name: room })
            queryClient.invalidateQueries({ queryKey: ['hubitat', 'device-rooms'] })
          }}
        />

        <TypeBadge type={device.kind} />

        <button
          onClick={(e) => {
            e.stopPropagation()
            toggleKeepOn.mutate()
          }}
          disabled={toggleKeepOn.isPending}
          className={cn(
            'flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            isKeepOn
              ? 'bg-amber-500/15 text-amber-400'
              : 'text-caption hover:bg-amber-500/10 hover:text-amber-300',
          )}
          aria-label={isKeepOn ? `Remove keep-on protection from ${device.label}` : `Protect ${device.label} from being turned off`}
          aria-pressed={isKeepOn}
        >
          <Shield className="h-3 w-3" />
          <span>Keep on</span>
        </button>

        <button
          onClick={() => toggleMutation.mutate()}
          disabled={toggleMutation.isPending}
          className={cn(
            'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            device.isOn
              ? 'bg-fairy-500/15 text-fairy-400 hover:bg-fairy-500/25'
              : 'text-caption hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-secondary)]',
          )}
          aria-label={`Turn ${device.label} ${device.isOn ? 'off' : 'on'}`}
        >
          <Power className="h-4 w-4" />
        </button>

        {isDimmer && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-caption flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors hover:text-[var(--text-secondary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
      </div>

      {expanded && isDimmer && (
        <div className="border-t px-4 py-3">
          <label className="text-body mb-2 flex items-center justify-between text-xs font-medium">
            <span>Level</span>
            <span className="text-heading">{level}%</span>
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={level}
            onChange={e => setLevel(Number(e.target.value))}
            onPointerUp={() => setLevelMutation.mutate(level)}
            onKeyUp={e => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') setLevelMutation.mutate(level)
            }}
            className="h-11 w-full cursor-pointer appearance-none rounded-lg"
            aria-label={`Level for ${device.label}`}
          />
        </div>
      )}
    </div>
  )
}

// ── Kasa device card ──────────────────────────────────────────────────────────

function KasaDeviceCard({ device, rooms }: { device: UnifiedDevice; rooms?: Room[] }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const kasa = device.kasaDevice!

  const newState = device.isOn ? 'off' : 'on'

  const toggleMutation = useMutation({
    mutationFn: () => api.kasa.sendCommand(kasa.id, newState),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['kasa', 'devices'] })
      const previous = queryClient.getQueryData<KasaDevice[]>(['kasa', 'devices'])
      queryClient.setQueryData<KasaDevice[]>(['kasa', 'devices'], old => {
        if (!old) return old
        return old.map(d =>
          d.id === kasa.id
            ? { ...d, attributes: { ...d.attributes, switch: newState } }
            : d
        )
      })
      return { previous }
    },
    onSuccess: () => {
      toast({ message: `${device.label} turned ${newState}` })
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['kasa', 'devices'], context.previous)
      }
      toast({ message: `Failed to control ${device.label}`, type: 'error' })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['kasa'] })
    },
  })

  const isKeepOn = !!device.deviceRoom?.config?.exclude_from_all_off

  const toggleKeepOn = useMutation<unknown, Error, void>({
    mutationFn: () => {
      const newValue = !isKeepOn
      if (device.deviceRoom) {
        // Device is assigned to a room — update room-level config
        return api.hubitat.updateDeviceConfig(
          kasa.id,
          device.deviceRoom.room_name,
          { exclude_from_all_off: newValue },
        )
      }
      // Device not assigned — update device-level config
      return api.kasa.updateConfig(kasa.id, { exclude_from_all_off: newValue })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubitat', 'device-rooms'] })
      queryClient.invalidateQueries({ queryKey: ['kasa'] })
      toast({ message: isKeepOn ? `${device.label} will now turn off with All Off` : `${device.label} will stay on during All Off` })
    },
    onError: () => toast({ message: 'Failed to update device setting', type: 'error' }),
  })

  const attrs = kasa.attributes
  const powerWatts = attrs.power
  const energyKwh = attrs.energy

  return (
    <div className="card rounded-xl border transition-colors">
      <div className="flex items-center gap-3 p-4">
        {/* Online/offline indicator */}
        <div
          className={cn(
            'h-2 w-2 shrink-0 rounded-full',
            kasa.is_online ? 'bg-emerald-400' : 'bg-slate-500',
          )}
          aria-hidden="true"
          title={kasa.is_online ? 'Online' : 'Offline'}
        />

        <div className="min-w-0 flex-1">
          <Link
            to={`/devices/kasa/${encodeURIComponent(kasa.id)}`}
            className={cn(
              'block text-sm font-medium hover:text-fairy-400 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              device.isOn ? 'text-heading' : 'text-body',
            )}
          >
            {device.label}
          </Link>
          <p className="text-caption mt-0.5 text-xs">
            {device.roomName && <span>{device.roomName}</span>}
            {device.kasaParentLabel && device.kasaDevice?.parent_id && (
              <span>
                {device.roomName ? ' · ' : ''}on{' '}
                <Link
                  to={`/devices/kasa/${encodeURIComponent(device.kasaDevice.parent_id)}`}
                  className="hover:text-fairy-400 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  {device.kasaParentLabel}
                </Link>
              </span>
            )}
            {device.isOn && kasa.has_emeter && typeof powerWatts === 'number' && (
              <span>{(device.roomName || device.kasaParentLabel) ? ' · ' : ''}{powerWatts.toFixed(1)} W</span>
            )}
            {typeof energyKwh === 'number' && energyKwh > 0 && (
              <span> · {energyKwh.toFixed(2)} kWh</span>
            )}
          </p>
        </div>

        <RoomPill
          roomName={device.roomName}
          deviceLabel={device.label}
          rooms={rooms}
          onAssign={async (room) => {
            await api.hubitat.assignDevice({ device_id: kasa.id, device_label: device.label, device_type: 'kasa_' + kasa.device_type, room_name: room })
            queryClient.invalidateQueries({ queryKey: ['hubitat', 'device-rooms'] })
          }}
        />

        <TypeBadge type={kasa.device_type} />

        <button
          onClick={(e) => {
            e.stopPropagation()
            toggleKeepOn.mutate()
          }}
          disabled={toggleKeepOn.isPending}
          className={cn(
            'flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            isKeepOn
              ? 'bg-amber-500/15 text-amber-400'
              : 'text-caption hover:bg-amber-500/10 hover:text-amber-300',
          )}
          aria-label={isKeepOn ? `Remove keep-on protection from ${device.label}` : `Protect ${device.label} from being turned off`}
          aria-pressed={isKeepOn}
        >
          <Shield className="h-3 w-3" />
          <span>Keep on</span>
        </button>

        <button
          onClick={() => toggleMutation.mutate()}
          disabled={toggleMutation.isPending || !kasa.is_online}
          className={cn(
            'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            !kasa.is_online && 'cursor-not-allowed opacity-40',
            device.isOn && kasa.is_online
              ? 'bg-fairy-500/15 text-fairy-400 hover:bg-fairy-500/25'
              : 'text-caption hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-secondary)]',
          )}
          aria-label={
            !kasa.is_online
              ? `${device.label} is offline`
              : `Turn ${device.label} ${device.isOn ? 'off' : 'on'}`
          }
        >
          <Power className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ── Sensor card (read-only — no power toggle) ────────────────────────────────

function SensorCard({ device }: { device: UnifiedDevice }) {
  const hub = device.hubDevice!
  const attrs = hub.attributes as Record<string, unknown>

  const temperature = typeof attrs.temperature === 'number' ? attrs.temperature : null
  const illuminance = typeof attrs.illuminance === 'number' ? attrs.illuminance : null
  const batteryLevel = typeof attrs.battery === 'number' ? attrs.battery : null
  const motionState = typeof attrs.motion === 'string' ? attrs.motion : null
  const contactState = typeof attrs.contact === 'string' ? attrs.contact : null

  return (
    <div className="card rounded-xl border transition-colors">
      <div className="flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <Link
            to={`/devices/${hub.id}`}
            className="block text-sm font-medium text-heading hover:text-fairy-400 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            {device.label}
          </Link>
          {device.roomName && (
            <p className="text-caption mt-0.5 text-xs">{device.roomName}</p>
          )}
        </div>

        {/* Sensor readings */}
        <div className="flex items-center gap-3">
          {motionState && (
            <span className={cn(
              'flex items-center gap-1 text-xs font-medium',
              motionState === 'active' ? 'text-fairy-400' : 'text-caption',
            )}>
              <Activity className="h-3.5 w-3.5" aria-hidden="true" />
              {motionState === 'active' ? 'Active' : 'Inactive'}
            </span>
          )}
          {contactState && (
            <span className={cn(
              'flex items-center gap-1 text-xs font-medium',
              contactState === 'open' ? 'text-amber-400' : 'text-caption',
            )}>
              {contactState === 'open' ? 'Open' : 'Closed'}
            </span>
          )}
          {temperature !== null && (
            <span className="text-caption flex items-center gap-1 text-xs">
              <Thermometer className="h-3.5 w-3.5" aria-hidden="true" />
              {temperature}°
            </span>
          )}
          {illuminance !== null && (
            <span className="text-caption flex items-center gap-1 text-xs">
              <Sun className="h-3.5 w-3.5" aria-hidden="true" />
              {illuminance} lux
            </span>
          )}
          {batteryLevel !== null && (
            <span className={cn(
              'flex items-center gap-1 text-xs',
              batteryLevel <= 15 ? 'text-red-400' : batteryLevel <= 30 ? 'text-amber-400' : 'text-caption',
            )}>
              <Battery className="h-3.5 w-3.5" aria-hidden="true" />
              {batteryLevel}%
            </span>
          )}
        </div>

        <TypeBadge type={hub.device_type} />
      </div>
    </div>
  )
}

// ── Unified device card dispatcher ────────────────────────────────────────────

function DeviceCard({ device, rooms }: { device: UnifiedDevice; rooms?: Room[] }) {
  if (device.kind === 'lifx') return <LightCard device={device} rooms={rooms} />
  if (device.kind === 'kasa') return <KasaDeviceCard device={device} rooms={rooms} />
  if (device.kind === 'sensor') return <SensorCard device={device} />
  return <HubDeviceCard device={device} rooms={rooms} />
}

// ── Devices page ──────────────────────────────────────────────────────────────

export default function DevicesPage() {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<DeviceFilter>('all')
  const [search, setSearch] = useState('')
  const [groupMode, setGroupMode] = useState<GroupMode>('room')

  const {
    data: lights,
    isLoading: lightsLoading,
    isFetching: lightsFetching,
  } = useQuery({
    queryKey: ['lifx', 'lights'],
    queryFn: api.lifx.getLights,
  })

  const {
    data: hubDevices,
    isLoading: hubLoading,
  } = useQuery({
    queryKey: ['hubitat', 'devices'],
    queryFn: api.hubitat.getDevices,
  })

  const {
    data: kasaDevices,
    isLoading: kasaLoading,
  } = useQuery({
    queryKey: ['kasa', 'devices'],
    queryFn: api.kasa.getDevices,
  })

  const { data: lightAssignments } = useQuery({
    queryKey: ['lights', 'rooms'],
    queryFn: api.lights.getRoomAssignments,
  })

  const { data: deviceAssignments } = useQuery({
    queryKey: ['hubitat', 'device-rooms'],
    queryFn: api.hubitat.getDeviceRooms,
  })

  const { data: rooms } = useQuery({
    queryKey: ['rooms'],
    queryFn: api.rooms.getAll,
  })

  const isLoading = lightsLoading || hubLoading || kasaLoading

  // Build light ID -> room name map
  const lightRoomMap = useMemo(() => {
    const map = new Map<string, string>()
    if (lightAssignments) {
      for (const a of lightAssignments) map.set(a.light_id, a.room_name)
    }
    return map
  }, [lightAssignments])

  // Build device ID -> assignment map
  const deviceRoomMap = useMemo(() => {
    const map = new Map<string, DeviceRoomAssignment>()
    if (deviceAssignments) {
      for (const a of deviceAssignments) map.set(a.device_id, a)
    }
    return map
  }, [deviceAssignments])

  // Build unified device list
  const allDevices = useMemo(() => {
    const devices: UnifiedDevice[] = []

    // LIFX lights
    if (lights) {
      for (const l of lights) {
        devices.push({
          key: `lifx-${l.id}`,
          kind: 'lifx',
          label: l.label,
          roomName: lightRoomMap.get(l.id) ?? null,
          isOn: l.power === 'on',
          light: l,
        })
      }
    }

    // Hub devices (controllable)
    const switchTypes = ['switch', 'dimmer', 'twinkly', 'fairy']
    const sensorTypes = ['motion', 'sensor', 'contact', 'temperature']
    if (hubDevices) {
      for (const d of hubDevices) {
        const assignment = deviceRoomMap.get(String(d.id))
        if (switchTypes.includes(d.device_type)) {
          const attrs = d.attributes
          const switchAttr = attrs?.switch
          devices.push({
            key: `hub-${d.id}`,
            kind: d.device_type as UnifiedDevice['kind'],
            label: d.label,
            roomName: assignment?.room_name ?? null,
            isOn: switchAttr === 'on',
            hubDevice: d,
            deviceRoom: assignment,
          })
        } else if (sensorTypes.includes(d.device_type)) {
          devices.push({
            key: `hub-${d.id}`,
            kind: 'sensor',
            label: d.label,
            roomName: assignment?.room_name ?? null,
            isOn: false,
            hubDevice: d,
            deviceRoom: assignment,
          })
        }
      }
    }

    // Kasa devices — show individual sockets as top-level devices.
    // Parent strips are hidden; sockets show "on [Strip Name]" as context.
    if (kasaDevices) {
      // Build parent label lookup for socket context
      const kasaParentLabels = new Map<string, string>()
      for (const d of kasaDevices) {
        if (d.device_type === 'strip') kasaParentLabels.set(d.id, d.label)
      }

      for (const d of kasaDevices) {
        // Skip parent strips — their sockets are shown individually
        if (d.device_type === 'strip') continue

        const assignment = deviceRoomMap.get(d.id)
        devices.push({
          key: `kasa-${d.id}`,
          kind: 'kasa',
          label: d.label,
          roomName: assignment?.room_name ?? null,
          isOn: d.attributes.switch === 'on',
          kasaDevice: d,
          deviceRoom: assignment,
          kasaParentLabel: d.parent_id ? kasaParentLabels.get(d.parent_id) ?? null : null,
        })
      }
    }

    return devices
  }, [lights, hubDevices, kasaDevices, lightRoomMap, deviceRoomMap])

  // Filter
  const filtered = useMemo(() => {
    let result = allDevices

    if (filter !== 'all') {
      if (filter === 'lights') {
        result = result.filter(d => d.kind === 'lifx')
      } else if (filter === 'switches') {
        result = result.filter(d => d.kind === 'switch' || d.kind === 'dimmer')
      } else if (filter === 'kasa') {
        result = result.filter(d => d.kind === 'kasa')
      } else if (filter === 'sensors') {
        result = result.filter(d => d.kind === 'sensor')
      } else {
        result = result.filter(d => d.kind === filter)
      }
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        d =>
          d.label.toLowerCase().includes(q) ||
          (d.roomName ?? '').toLowerCase().includes(q) ||
          // Also search Kasa model
          (d.kasaDevice?.model ?? '').toLowerCase().includes(q),
      )
    }

    return result
  }, [allDevices, filter, search])

  // Group
  const grouped = useMemo(() => {
    const groups = new Map<string, UnifiedDevice[]>()
    const unassigned: UnifiedDevice[] = []

    for (const d of filtered) {
      if (!d.roomName) {
        unassigned.push(d)
        continue
      }
      const key = groupMode === 'room' ? d.roomName : d.kind
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(d)
    }

    return { groups, unassigned }
  }, [filtered, groupMode])

  const kasaCount = useMemo(() => allDevices.filter(d => d.kind === 'kasa').length, [allDevices])

  const sensorCount = useMemo(() => allDevices.filter(d => d.kind === 'sensor').length, [allDevices])

  const filterTabs: { value: DeviceFilter; label: string; count: number }[] = useMemo(() => [
    { value: 'all', label: 'All', count: allDevices.length },
    { value: 'lights', label: 'Lights', count: allDevices.filter(d => d.kind === 'lifx').length },
    { value: 'switches', label: 'Switches', count: allDevices.filter(d => d.kind === 'switch' || d.kind === 'dimmer').length },
    { value: 'sensors', label: 'Sensors', count: sensorCount },
    { value: 'twinkly', label: 'Twinkly', count: allDevices.filter(d => d.kind === 'twinkly').length },
    { value: 'fairy', label: 'Fairy', count: allDevices.filter(d => d.kind === 'fairy').length },
    { value: 'kasa', label: 'Kasa', count: kasaCount },
  ], [allDevices, kasaCount, sensorCount])

  const groupLabel = (key: string) => {
    if (groupMode === 'type') {
      const labels: Record<string, string> = { lifx: 'LIFX Lights', switch: 'Switches', dimmer: 'Dimmers', twinkly: 'Twinkly', fairy: 'Fairy', kasa: 'Kasa', sensor: 'Sensors' }
      return labels[key] ?? key
    }
    return key
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-heading text-sm font-semibold">All Devices</h2>
        <button
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ['lifx', 'lights'] })
            queryClient.invalidateQueries({ queryKey: ['hubitat'] })
            queryClient.invalidateQueries({ queryKey: ['kasa'] })
          }}
          disabled={lightsFetching}
          className={cn(
            'surface text-heading flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:brightness-95 dark:hover:brightness-110',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            lightsFetching && 'opacity-60',
          )}
        >
          <RefreshCw className={cn('h-4 w-4', lightsFetching && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Filter chips */}
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {filterTabs.map(tab => (
          <FilterChip
            key={tab.value}
            label={tab.label}
            active={filter === tab.value}
            onClick={() => setFilter(tab.value)}
            count={tab.count}
          />
        ))}
      </div>

      {/* Search + group toggle */}
      <div className="mb-4 flex gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by device name or room..."
          className="flex-1"
        />
        <button
          onClick={() => setGroupMode(prev => prev === 'room' ? 'type' : 'room')}
          className={cn(
            'surface flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-body transition-colors hover:brightness-95 dark:hover:brightness-110',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
          title={groupMode === 'room' ? 'Grouped by room' : 'Grouped by type'}
        >
          {groupMode === 'room' ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}
          {groupMode === 'room' ? 'Room' : 'Type'}
        </button>
      </div>

      {/* Filter summary */}
      {(search.trim() || filter !== 'all') && (
        <p className="text-caption mb-3 text-xs">
          Showing {filtered.length} of {allDevices.length} device{allDevices.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="surface h-16 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="space-y-6">
          {Array.from(grouped.groups.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([group, devices]) => (
              <div key={group}>
                <h3 className="text-body mb-2 text-sm font-medium">{groupLabel(group)}</h3>
                <div className="space-y-2">
                  {devices.map(d => <DeviceCard key={d.key} device={d} rooms={rooms} />)}
                </div>
              </div>
            ))}

          {grouped.unassigned.length > 0 && (
            <div>
              <h3 className="text-caption mb-2 text-sm font-medium">Unassigned</h3>
              <div className="space-y-2">
                {grouped.unassigned.map(d => <DeviceCard key={d.key} device={d} rooms={rooms} />)}
              </div>
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          icon={Search}
          message={search.trim() || filter !== 'all'
            ? 'No devices match the current filter.'
            : 'No devices found.'}
          sub={search.trim() || filter !== 'all'
            ? undefined
            : 'Make sure your lights and hubs are powered on and connected.'}
        >
          {(search.trim() || filter !== 'all') && (
            <button
              onClick={() => { setSearch(''); setFilter('all') }}
              className="mt-2 text-xs text-fairy-400 hover:underline"
            >
              Clear filters
            </button>
          )}
        </EmptyState>
      )}
    </div>
  )
}
