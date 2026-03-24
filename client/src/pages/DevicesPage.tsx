import { useState, useMemo } from 'react'
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
} from 'lucide-react'
import { api } from '@/lib/api'
import type { Light, DeviceRoomAssignment, HubDevice } from '@/lib/api'
import { cn, getLightColorHex } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { TypeBadge } from '@/components/ui/Badge'
import { FilterChip } from '@/components/ui/FilterChip'
import { SearchInput } from '@/components/ui/SearchInput'
import { EmptyState } from '@/components/ui/EmptyState'

// ── Types ─────────────────────────────────────────────────────────────────────

type DeviceFilter = 'all' | 'lights' | 'switches' | 'twinkly' | 'fairy'
type GroupMode = 'room' | 'type'

interface UnifiedDevice {
  key: string
  kind: 'lifx' | 'switch' | 'dimmer' | 'twinkly' | 'fairy'
  label: string
  roomName: string | null
  isOn: boolean
  light?: Light
  hubDevice?: HubDevice
  deviceRoom?: DeviceRoomAssignment
}


// ── LIFX Light card ───────────────────────────────────────────────────────────

function LightCard({ device }: { device: UnifiedDevice }) {
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
          <p className={cn('truncate text-sm font-medium hover:text-fairy-400 transition-colors', isOn ? 'text-heading' : 'text-body')}>
            {light.label}
          </p>
          <p className="text-caption mt-0.5 truncate text-xs">
            {device.roomName ?? light.group.name}
            {isOn && ` · ${Math.round(light.brightness * 100)}%`}
          </p>
        </Link>

        {device.roomName && (
          <Link
            to={`/rooms/${encodeURIComponent(device.roomName)}`}
            className="hidden shrink-0 rounded-full bg-fairy-500/10 px-2 py-0.5 text-[10px] font-medium text-fairy-400 hover:bg-fairy-500/20 transition-colors sm:inline-flex"
          >
            {device.roomName}
          </Link>
        )}

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

function HubDeviceCard({ device }: { device: UnifiedDevice }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [expanded, setExpanded] = useState(false)
  const [level, setLevel] = useState(50)

  const toggleMutation = useMutation({
    mutationFn: () => {
      const cmd = device.isOn ? 'off' : 'on'
      return api.hubitat.sendCommand(device.hubDevice!.id.toString(), cmd)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubitat'] })
      toast({ message: `${device.label} turned ${device.isOn ? 'off' : 'on'}` })
    },
    onError: () => toast({ message: `Failed to control ${device.label}`, type: 'error' }),
  })

  const setLevelMutation = useMutation({
    mutationFn: (lvl: number) =>
      api.hubitat.sendCommand(device.hubDevice!.id.toString(), 'setLevel', lvl),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hubitat'] }),
  })

  const isKeepOn = !!device.deviceRoom?.config?.exclude_from_all_off

  const toggleKeepOn = useMutation({
    mutationFn: () =>
      api.hubitat.updateDeviceConfig(
        device.hubDevice!.id.toString(),
        device.deviceRoom!.room_name,
        { exclude_from_all_off: !isKeepOn },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubitat', 'device-rooms'] })
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

        {device.roomName && (
          <Link
            to={`/rooms/${encodeURIComponent(device.roomName)}`}
            className="hidden shrink-0 rounded-full bg-fairy-500/10 px-2 py-0.5 text-[10px] font-medium text-fairy-400 hover:bg-fairy-500/20 transition-colors sm:inline-flex"
          >
            {device.roomName}
          </Link>
        )}

        <TypeBadge type={device.kind} />

        {device.deviceRoom && (
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
        )}

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

// ── Unified device card dispatcher ────────────────────────────────────────────

function DeviceCard({ device }: { device: UnifiedDevice }) {
  if (device.kind === 'lifx') return <LightCard device={device} />
  return <HubDeviceCard device={device} />
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

  const { data: lightAssignments } = useQuery({
    queryKey: ['lights', 'rooms'],
    queryFn: api.lights.getRoomAssignments,
  })

  const { data: deviceAssignments } = useQuery({
    queryKey: ['hubitat', 'device-rooms'],
    queryFn: api.hubitat.getDeviceRooms,
  })

  const isLoading = lightsLoading || hubLoading

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

    // Hub devices
    const switchTypes = ['switch', 'dimmer', 'twinkly', 'fairy']
    if (hubDevices) {
      for (const d of hubDevices) {
        if (!switchTypes.includes(d.device_type)) continue
        const assignment = deviceRoomMap.get(String(d.id))
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
      }
    }

    return devices
  }, [lights, hubDevices, lightRoomMap, deviceRoomMap])

  // Filter
  const filtered = useMemo(() => {
    let result = allDevices

    if (filter !== 'all') {
      if (filter === 'lights') {
        result = result.filter(d => d.kind === 'lifx')
      } else if (filter === 'switches') {
        result = result.filter(d => d.kind === 'switch' || d.kind === 'dimmer')
      } else {
        result = result.filter(d => d.kind === filter)
      }
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        d =>
          d.label.toLowerCase().includes(q) ||
          (d.roomName ?? '').toLowerCase().includes(q),
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

  const filterTabs: { value: DeviceFilter; label: string; count: number }[] = useMemo(() => [
    { value: 'all', label: 'All', count: allDevices.length },
    { value: 'lights', label: 'Lights', count: allDevices.filter(d => d.kind === 'lifx').length },
    { value: 'switches', label: 'Switches', count: allDevices.filter(d => d.kind === 'switch' || d.kind === 'dimmer').length },
    { value: 'twinkly', label: 'Twinkly', count: allDevices.filter(d => d.kind === 'twinkly').length },
    { value: 'fairy', label: 'Fairy', count: allDevices.filter(d => d.kind === 'fairy').length },
  ], [allDevices])

  const groupLabel = (key: string) => {
    if (groupMode === 'type') {
      const labels: Record<string, string> = { lifx: 'LIFX Lights', switch: 'Switches', dimmer: 'Dimmers', twinkly: 'Twinkly', fairy: 'Fairy' }
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
                  {devices.map(d => <DeviceCard key={d.key} device={d} />)}
                </div>
              </div>
            ))}

          {grouped.unassigned.length > 0 && (
            <div>
              <h3 className="text-caption mb-2 text-sm font-medium">Unassigned</h3>
              <div className="space-y-2">
                {grouped.unassigned.map(d => <DeviceCard key={d.key} device={d} />)}
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
