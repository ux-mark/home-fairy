import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { usePersistedState } from '@/hooks/usePersistedState'
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
  Music2,
  Volume2,
} from 'lucide-react'
import { getSocket } from '@/hooks/useSocket'
import { api } from '@/lib/api'
import type { Light, Room, DeviceRoomAssignment, HubDevice, KasaDevice, SonosSpeakerMapping, SonosZone } from '@/lib/api'
import { cn, getLightColorHex } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { TypeBadge, StatusBadge } from '@/components/ui/Badge'
import { FilterChip } from '@/components/ui/FilterChip'
import { SearchInput } from '@/components/ui/SearchInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonList } from '@/components/ui/Skeleton'
import { Accordion } from '@/components/ui/Accordion'
import { LucideIcon } from '@/components/ui/LucideIcon'

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

type DeviceFilter = 'all' | 'lights' | 'switches' | 'twinkly' | 'fairy' | 'kasa' | 'sensors' | 'sonos' | 'deactivated'
type GroupMode = 'room' | 'type'

interface UnifiedDevice {
  key: string
  kind: 'lifx' | 'switch' | 'dimmer' | 'twinkly' | 'fairy' | 'kasa' | 'sensor'
  label: string
  roomName: string | null
  isOn: boolean
  isDeactivated: boolean
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
  const isDeactivated = device.isDeactivated

  const toggleMutation = useMutation({
    mutationFn: () => api.lifx.toggle(`id:${light.id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lifx', 'lights'] }),
    onError: () => toast({ message: 'Failed to toggle light', type: 'error' }),
  })

  return (
    <div className="card rounded-xl border transition-colors">
      <div className="flex items-center gap-3 p-4">
        <div
          className={cn('h-5 w-5 shrink-0 rounded-full', (!isOn || isDeactivated) && 'opacity-30')}
          style={{ backgroundColor: isOn && !isDeactivated ? colorHex : '#475569' }}
          aria-hidden="true"
        />
        <Link
          to={`/lights/${light.id}`}
          className={cn('block min-w-0 flex-1 text-left', 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500')}
        >
          <p className={cn('break-words text-sm font-medium hover:text-fairy-400 transition-colors', isDeactivated ? 'text-slate-500' : isOn ? 'text-heading' : 'text-body')}>
            {light.label}
          </p>
          <p className={cn('mt-0.5 break-words text-xs', isDeactivated ? 'text-slate-600' : 'text-caption')}>
            {device.roomName ?? light.group.name}
            {isOn && !isDeactivated && ` · ${Math.round(light.brightness * 100)}%`}
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
        {isDeactivated && <StatusBadge status="deactivated" />}

        <button
          onClick={() => toggleMutation.mutate()}
          disabled={toggleMutation.isPending || isDeactivated}
          className={cn(
            'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            isDeactivated && 'cursor-not-allowed opacity-40',
            !isDeactivated && isOn
              ? 'bg-fairy-500/15 text-fairy-400 hover:bg-fairy-500/25'
              : 'text-caption hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-secondary)]',
          )}
          aria-label={isDeactivated ? `${light.label} is deactivated` : `Turn ${light.label} ${isOn ? 'off' : 'on'}`}
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

  const isDeactivated = device.isDeactivated
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
            className={cn('block text-sm font-medium hover:text-fairy-400 transition-colors', isDeactivated ? 'text-slate-500' : device.isOn ? 'text-heading' : 'text-body')}
          >
            {device.label}
          </Link>
          {device.roomName && (
            <p className={cn('mt-0.5 text-xs', isDeactivated ? 'text-slate-600' : 'text-caption')}>{device.roomName}</p>
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
        {isDeactivated && <StatusBadge status="deactivated" />}

        <button
          onClick={(e) => {
            e.stopPropagation()
            toggleKeepOn.mutate()
          }}
          disabled={toggleKeepOn.isPending || isDeactivated}
          className={cn(
            'flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            isDeactivated && 'cursor-not-allowed opacity-40',
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
          disabled={toggleMutation.isPending || isDeactivated}
          className={cn(
            'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            isDeactivated && 'cursor-not-allowed opacity-40',
            !isDeactivated && device.isOn
              ? 'bg-fairy-500/15 text-fairy-400 hover:bg-fairy-500/25'
              : 'text-caption hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-secondary)]',
          )}
          aria-label={isDeactivated ? `${device.label} is deactivated` : `Turn ${device.label} ${device.isOn ? 'off' : 'on'}`}
        >
          <Power className="h-4 w-4" />
        </button>

        {isDimmer && !isDeactivated && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-caption flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors hover:text-[var(--text-secondary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
            aria-label={expanded ? `Collapse ${device.label} controls` : `Expand ${device.label} controls`}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
      </div>

      {expanded && isDimmer && !isDeactivated && (
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

  const isDeactivated = device.isDeactivated
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
      <div className="flex flex-col gap-1.5 p-4">
        {/* Row 1: online dot + device label + power toggle */}
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'h-2 w-2 shrink-0 rounded-full',
              kasa.is_online ? 'bg-emerald-400' : 'bg-slate-500',
            )}
            aria-hidden="true"
            title={kasa.is_online ? 'Online' : 'Offline'}
          />
          <Link
            to={`/devices/kasa/${encodeURIComponent(kasa.id)}`}
            className={cn(
              'min-w-0 flex-1 text-sm font-medium hover:text-fairy-400 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              isDeactivated ? 'text-slate-500' : device.isOn ? 'text-heading' : 'text-body',
            )}
          >
            {device.label}
          </Link>
          <button
            onClick={() => toggleMutation.mutate()}
            disabled={toggleMutation.isPending || !kasa.is_online || isDeactivated}
            className={cn(
              'flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              (!kasa.is_online || isDeactivated) && 'cursor-not-allowed opacity-40',
              !isDeactivated && device.isOn && kasa.is_online
                ? 'bg-fairy-500/15 text-fairy-400 hover:bg-fairy-500/25'
                : 'text-caption hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-secondary)]',
            )}
            aria-label={
              isDeactivated
                ? `${device.label} is deactivated`
                : !kasa.is_online
                  ? `${device.label} is offline`
                  : `Turn ${device.label} ${device.isOn ? 'off' : 'on'}`
            }
          >
            <Power className="h-4 w-4" />
          </button>
        </div>

        {/* Row 2: room/power info + pills/badges (wraps on narrow screens) */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className={cn('text-xs', isDeactivated ? 'text-slate-600' : 'text-caption')}>
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
            {device.isOn && !isDeactivated && kasa.has_emeter && typeof powerWatts === 'number' && (
              <span>{(device.roomName || device.kasaParentLabel) ? ' · ' : ''}{powerWatts.toFixed(1)} W</span>
            )}
            {!isDeactivated && typeof energyKwh === 'number' && energyKwh > 0 && (
              <span> · {energyKwh.toFixed(2)} kWh</span>
            )}
          </p>

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
          {isDeactivated && <StatusBadge status="deactivated" />}

          <button
            onClick={(e) => {
              e.stopPropagation()
              toggleKeepOn.mutate()
            }}
            disabled={toggleKeepOn.isPending || isDeactivated}
            className={cn(
              'flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              isDeactivated && 'cursor-not-allowed opacity-40',
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
        </div>
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
  const isDeactivated = device.isDeactivated

  return (
    <div className="card rounded-xl border transition-colors">
      <div className="flex flex-col gap-1.5 p-4">
        {/* Row 1: device label + badges */}
        <div className="flex items-center gap-2">
          <Link
            to={`/devices/${hub.id}`}
            className={cn('min-w-0 flex-1 text-sm font-medium hover:text-fairy-400 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500', isDeactivated ? 'text-slate-500' : 'text-heading')}
          >
            {device.label}
          </Link>
          <TypeBadge type={hub.device_type} />
          {isDeactivated && <StatusBadge status="deactivated" />}
        </div>

        {/* Row 2: room name + sensor readings (wrap naturally on narrow screens) */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {device.roomName && (
            <span className={cn('text-xs', isDeactivated ? 'text-slate-600' : 'text-caption')}>{device.roomName}</span>
          )}
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

// ── Sonos speaker card ────────────────────────────────────────────────────────

function SonosSpeakerCard({
  speaker,
  zones,
}: {
  speaker: SonosSpeakerMapping
  zones: SonosZone[] | undefined
}) {
  // Find this speaker's zone to get playback state
  const zone = zones?.find(z =>
    z.coordinator.roomName === speaker.speaker_name ||
    z.members.some(m => m.roomName === speaker.speaker_name),
  )
  const state = zone?.coordinator.state

  let playbackText: string
  if (!state) {
    playbackText = 'Idle'
  } else if (state.playbackState === 'PLAYING') {
    const track = state.currentTrack
    const label = track.stationName || track.title
    playbackText = label ? `Playing: ${label}` : 'Playing'
  } else if (state.playbackState === 'PAUSED_PLAYBACK') {
    playbackText = 'Paused'
  } else {
    playbackText = 'Idle'
  }

  const volumeText = state ? `Volume ${state.volume}%` : null

  return (
    <div className="card rounded-xl border transition-colors">
      <div className="flex items-center gap-3 p-4">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            state?.playbackState === 'PLAYING'
              ? 'bg-violet-500/15 text-violet-400'
              : 'bg-[var(--bg-tertiary)] text-caption',
          )}
          aria-hidden="true"
        >
          {state?.playbackState === 'PLAYING' ? (
            <Music2 className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </div>

        <Link
          to={`/sonos/${encodeURIComponent(speaker.speaker_name)}`}
          className="block min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        >
          <p className="break-words text-sm font-medium text-heading hover:text-fairy-400 transition-colors">
            {speaker.speaker_name}
          </p>
          <p className="mt-0.5 break-words text-xs text-caption">
            {speaker.room_name}
            {volumeText ? ` · ${volumeText}` : ''}
          </p>
          <p className={cn(
            'mt-0.5 break-words text-xs',
            state?.playbackState === 'PLAYING' ? 'text-fairy-400' : 'text-caption',
          )}>
            {playbackText}
          </p>
        </Link>

        <TypeBadge type="sonos" />
      </div>
    </div>
  )
}

function SonosUnassignedCard({ speakerName }: { speakerName: string }) {
  return (
    <div className="card rounded-xl border border-dashed opacity-60 transition-colors">
      <div className="flex items-center gap-3 p-4">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-tertiary)] text-caption"
          aria-hidden="true"
        >
          <Volume2 className="h-4 w-4" />
        </div>

        <Link
          to="/sonos-setup"
          className="block min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        >
          <p className="break-words text-sm font-medium text-body hover:text-heading transition-colors">
            {speakerName}
          </p>
          <p className="mt-0.5 break-words text-xs text-caption">
            Not assigned to a room
          </p>
        </Link>

        <TypeBadge type="sonos" />
      </div>
    </div>
  )
}

// ── Devices page ──────────────────────────────────────────────────────────────

export default function DevicesPage() {
  const queryClient = useQueryClient()
  const [filter, setFilter] = usePersistedState<DeviceFilter>('devices:filter', 'all')
  const [search, setSearch] = usePersistedState('devices:search', '')
  const [groupMode, setGroupMode] = usePersistedState<GroupMode>('devices:groupMode', 'room')
  const [openGroups, setOpenGroups] = usePersistedState<Set<string>>('devices:openGroups', new Set())

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

  const { data: deactivatedDevices } = useQuery({
    queryKey: ['devices', 'deactivated'],
    queryFn: api.devices.getDeactivated,
    staleTime: 30_000,
  })

  // Sonos queries — only fetched when the sonos tab (or all) is active
  const {
    data: sonosSpeakers,
    isLoading: sonosSpeakersLoading,
  } = useQuery({
    queryKey: ['sonos', 'speakers'],
    queryFn: api.sonos.getSpeakers,
    enabled: filter === 'sonos' || filter === 'all',
  })

  const {
    data: sonosZones,
    isLoading: sonosZonesLoading,
  } = useQuery({
    queryKey: ['sonos', 'zones'],
    queryFn: api.sonos.getZones,
    enabled: filter === 'sonos' || filter === 'all',
  })

  // Invalidate zones cache on real-time Sonos updates
  useEffect(() => {
    if (filter !== 'sonos' && filter !== 'all') return
    const s = getSocket()
    const handler = () => queryClient.invalidateQueries({ queryKey: ['sonos', 'zones'] })
    s.on('sonos:zones-update', handler)
    return () => {
      s.off('sonos:zones-update', handler)
    }
  }, [queryClient, filter])

  const isLoading = lightsLoading || hubLoading || kasaLoading

  // Build deactivated LIFX ID set (hub/kasa use the active field on the device itself)
  const deactivatedLifxIds = useMemo(() => {
    const s = new Set<string>()
    if (deactivatedDevices) {
      for (const d of deactivatedDevices) {
        if (d.deviceType === 'lifx') s.add(d.deviceId)
      }
    }
    return s
  }, [deactivatedDevices])

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
          isDeactivated: deactivatedLifxIds.has(l.id),
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
            isDeactivated: d.active === false,
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
            isDeactivated: d.active === false,
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
          isDeactivated: d.active === false,
          kasaDevice: d,
          deviceRoom: assignment,
          kasaParentLabel: d.parent_id ? kasaParentLabels.get(d.parent_id) ?? null : null,
        })
      }
    }

    return devices
  }, [lights, hubDevices, kasaDevices, lightRoomMap, deviceRoomMap, deactivatedLifxIds])

  // Filter
  const filtered = useMemo(() => {
    let result = allDevices

    if (filter !== 'all') {
      if (filter === 'deactivated') {
        result = result.filter(d => d.isDeactivated)
      } else if (filter === 'lights') {
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

  const deactivatedCount = useMemo(() => allDevices.filter(d => d.isDeactivated).length, [allDevices])

  const sonosCount = useMemo(() => sonosSpeakers?.length ?? 0, [sonosSpeakers])

  // Speakers present in zones but not in the speakers mapping list
  const sonosUnassignedSpeakers = useMemo(() => {
    if (!sonosZones) return []
    const assignedNames = new Set(sonosSpeakers?.map(s => s.speaker_name) ?? [])
    const allSpeakerNames = new Set<string>()
    for (const zone of sonosZones) {
      allSpeakerNames.add(zone.coordinator.roomName)
      for (const member of zone.members) {
        allSpeakerNames.add(member.roomName)
      }
    }
    return Array.from(allSpeakerNames).filter(name => !assignedNames.has(name)).sort()
  }, [sonosZones, sonosSpeakers])

  const filterTabs: { value: DeviceFilter; label: string; count: number }[] = useMemo(() => {
    const tabs: { value: DeviceFilter; label: string; count: number }[] = [
      { value: 'all', label: 'All', count: allDevices.length },
      { value: 'lights', label: 'Lights', count: allDevices.filter(d => d.kind === 'lifx').length },
      { value: 'switches', label: 'Switches', count: allDevices.filter(d => d.kind === 'switch' || d.kind === 'dimmer').length },
      { value: 'sensors', label: 'Sensors', count: sensorCount },
      { value: 'twinkly', label: 'Twinkly', count: allDevices.filter(d => d.kind === 'twinkly').length },
      { value: 'fairy', label: 'Fairy', count: allDevices.filter(d => d.kind === 'fairy').length },
      { value: 'kasa', label: 'Kasa', count: kasaCount },
      { value: 'sonos', label: 'Sonos', count: sonosCount },
    ]
    // Only show the deactivated tab when there are deactivated devices
    if (deactivatedCount > 0) {
      tabs.push({ value: 'deactivated', label: 'Deactivated', count: deactivatedCount })
    }
    return tabs
  }, [allDevices, kasaCount, sensorCount, deactivatedCount, sonosCount])

  const groupLabel = (key: string) => {
    if (groupMode === 'type') {
      const labels: Record<string, string> = { lifx: 'LIFX Lights', switch: 'Switches', dimmer: 'Dimmers', twinkly: 'Twinkly', fairy: 'Fairy', kasa: 'Kasa', sensor: 'Sensors' }
      return labels[key] ?? key
    }
    return key
  }

  function toggleGroup(key: string) {
    setOpenGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const computedOpenGroups = useMemo(() => {
    if (!search.trim()) return openGroups
    const expanded = new Set(openGroups)
    for (const key of grouped.groups.keys()) {
      expanded.add(key)
    }
    return expanded
  }, [search, openGroups, grouped.groups])

  const roomIconMap = useMemo<Record<string, string | null>>(
    () => Object.fromEntries((rooms ?? []).map(r => [r.name, r.icon])),
    [rooms],
  )

  const roomOrderMap = useMemo(
    () => new Map((rooms ?? []).map(r => [r.name, r.display_order])),
    [rooms],
  )

  const roomMap = useMemo(() => {
    const map = new Map<string, Room>()
    for (const r of rooms ?? []) map.set(r.name, r)
    return map
  }, [rooms])

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center gap-2">
        <LayoutGrid className="h-5 w-5 text-fairy-400" aria-hidden="true" />
        <h1 className="text-heading text-lg font-semibold">All Devices</h1>
      </div>

      <div className="mb-4 flex items-center justify-end gap-3">
        <button
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ['lifx', 'lights'] })
            queryClient.invalidateQueries({ queryKey: ['hubitat'] })
            queryClient.invalidateQueries({ queryKey: ['kasa'] })
            queryClient.invalidateQueries({ queryKey: ['sonos', 'speakers'] })
            queryClient.invalidateQueries({ queryKey: ['sonos', 'zones'] })
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
          aria-label={groupMode === 'room' ? 'Switch to group by type' : 'Switch to group by room'}
        >
          {groupMode === 'room' ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}
          {groupMode === 'room' ? 'Room' : 'Type'}
        </button>
      </div>

      {/* Filter summary — not shown for sonos tab (separate view) */}
      {filter !== 'sonos' && (search.trim() || filter !== 'all') && (
        <p className="text-caption mb-3 text-xs">
          Showing {filtered.length} of {allDevices.length} device{allDevices.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* Content */}
      {filter === 'sonos' ? (
        sonosSpeakersLoading || sonosZonesLoading ? (
          <SkeletonList count={4} height="h-20" />
        ) : (sonosSpeakers?.length ?? 0) === 0 && sonosUnassignedSpeakers.length === 0 ? (
          <EmptyState
            icon={Volume2}
            message="No Sonos speakers found."
            sub="Make sure Sonos is running and the speakers are on the same network."
          />
        ) : (
          <div className="space-y-3">
            {sonosSpeakers && sonosSpeakers.length > 0 && (
              <Accordion
                id="sonos-assigned"
                title={
                  <span className="flex items-center gap-1.5">
                    <Volume2 className="h-4 w-4 shrink-0 text-fairy-400" aria-hidden="true" />
                    Assigned speakers
                  </span>
                }
                open={computedOpenGroups.has('__sonos-assigned')}
                onToggle={() => toggleGroup('__sonos-assigned')}
                count={sonosSpeakers.length}
              >
                <div className="space-y-2">
                  {sonosSpeakers.map(s => (
                    <SonosSpeakerCard key={s.id} speaker={s} zones={sonosZones} />
                  ))}
                </div>
              </Accordion>
            )}
            {sonosUnassignedSpeakers.length > 0 && (
              <Accordion
                id="sonos-unassigned"
                title="Not assigned to a room"
                open={computedOpenGroups.has('__sonos-unassigned')}
                onToggle={() => toggleGroup('__sonos-unassigned')}
                count={sonosUnassignedSpeakers.length}
              >
                <div className="space-y-2">
                  {sonosUnassignedSpeakers.map(name => (
                    <SonosUnassignedCard key={name} speakerName={name} />
                  ))}
                </div>
              </Accordion>
            )}
          </div>
        )
      ) : isLoading ? (
        <SkeletonList count={6} height="h-16" />
      ) : filtered.length > 0 ? (
        <div className="space-y-3">
          {groupMode === 'room' ? (() => {
            // Build hierarchy: separate parent rooms from child rooms
            const allEntries = Array.from(grouped.groups.entries())
            // childrenOf maps parentRoomName -> [childRoomName, devices][]
            const childrenOf = new Map<string, [string, UnifiedDevice[]][]>()
            const topLevelEntries: [string, UnifiedDevice[]][] = []

            for (const [group, devices] of allEntries) {
              const room = roomMap.get(group)
              const parentName = room?.parent_room
              if (parentName && !room?.promoted) {
                // Non-promoted child — nest under parent
                if (!childrenOf.has(parentName)) childrenOf.set(parentName, [])
                childrenOf.get(parentName)!.push([group, devices])
              } else {
                // Top-level room OR promoted child (gets its own accordion)
                topLevelEntries.push([group, devices])
              }
            }

            // Add parent rooms that have children with devices but no devices of their own
            const topLevelNames = new Set(topLevelEntries.map(([name]) => name))
            for (const parentName of childrenOf.keys()) {
              if (!topLevelNames.has(parentName)) {
                topLevelEntries.push([parentName, []])
              }
            }

            return topLevelEntries
              .sort(([a], [b]) => (roomOrderMap.get(a) ?? 999) - (roomOrderMap.get(b) ?? 999))
              .map(([group, ownDevices]) => {
                const childEntries = (childrenOf.get(group) ?? [])
                  .sort(([a], [b]) => (roomOrderMap.get(a) ?? 999) - (roomOrderMap.get(b) ?? 999))
                const totalCount = ownDevices.length + childEntries.reduce((sum, [, d]) => sum + d.length, 0)
                const accordionId = `devices-${group.replace(/\s+/g, '-').toLowerCase()}`
                return (
                  <Accordion
                    key={group}
                    id={accordionId}
                    title={
                      <span className="flex items-center gap-1.5">
                        <LucideIcon name={roomIconMap[group] ?? null} className="h-4 w-4 shrink-0 text-fairy-400" aria-hidden="true" />
                        {group}
                      </span>
                    }
                    open={computedOpenGroups.has(group)}
                    onToggle={() => toggleGroup(group)}
                    count={totalCount}
                  >
                    {childEntries.map(([childName, childDevices]) => (
                      <div key={childName} className="ml-2 mt-1">
                        <Accordion
                          id={`devices-${childName.replace(/\s+/g, '-').toLowerCase()}`}
                          card={false}
                          title={
                            <span className="flex items-center gap-1.5">
                              <LucideIcon name={roomIconMap[childName] ?? null} className="h-3.5 w-3.5 shrink-0 text-fairy-400" aria-hidden="true" />
                              {childName}
                            </span>
                          }
                          open={computedOpenGroups.has(childName)}
                          onToggle={() => toggleGroup(childName)}
                          count={childDevices.length}
                        >
                          <div className="space-y-2">
                            {childDevices.map(d => <DeviceCard key={d.key} device={d} rooms={rooms} />)}
                          </div>
                        </Accordion>
                      </div>
                    ))}
                    {ownDevices.length > 0 && (
                      <div className={cn('space-y-2', childEntries.length > 0 && 'mt-2 pt-2')}>
                        {ownDevices.map(d => <DeviceCard key={d.key} device={d} rooms={rooms} />)}
                      </div>
                    )}
                  </Accordion>
                )
              })
          })() : Array.from(grouped.groups.entries())
            .sort(([a], [b]) => (roomOrderMap.get(a) ?? 999) - (roomOrderMap.get(b) ?? 999))
            .map(([group, devices]) => {
              const accordionId = `devices-${group.replace(/\s+/g, '-').toLowerCase()}`
              return (
                <Accordion
                  key={group}
                  id={accordionId}
                  title={groupLabel(group)}
                  open={computedOpenGroups.has(group)}
                  onToggle={() => toggleGroup(group)}
                  count={devices.length}
                >
                  <div className="space-y-2">
                    {devices.map(d => <DeviceCard key={d.key} device={d} rooms={rooms} />)}
                  </div>
                </Accordion>
              )
            })}

          {grouped.unassigned.length > 0 && (
            <Accordion
              id="devices-unassigned"
              title="Unassigned"
              open={computedOpenGroups.has('__unassigned')}
              onToggle={() => toggleGroup('__unassigned')}
              count={grouped.unassigned.length}
            >
              <div className="space-y-2">
                {grouped.unassigned.map(d => <DeviceCard key={d.key} device={d} rooms={rooms} />)}
              </div>
            </Accordion>
          )}

          {/* Sonos speakers shown at bottom of All view */}
          {filter === 'all' && sonosSpeakers && sonosSpeakers.length > 0 && (
            <Accordion
              id="devices-sonos"
              title={
                <span className="flex items-center gap-1.5">
                  <Volume2 className="h-4 w-4 shrink-0 text-fairy-400" aria-hidden="true" />
                  Sonos speakers
                </span>
              }
              open={computedOpenGroups.has('__sonos')}
              onToggle={() => toggleGroup('__sonos')}
              count={sonosSpeakers.length}
            >
              <div className="space-y-2">
                {sonosSpeakers.map(s => (
                  <SonosSpeakerCard key={s.id} speaker={s} zones={sonosZones} />
                ))}
              </div>
            </Accordion>
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
