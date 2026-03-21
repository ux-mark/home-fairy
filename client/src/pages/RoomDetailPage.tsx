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
} from 'lucide-react'
import * as Switch from '@radix-ui/react-switch'
import { api } from '@/lib/api'
import type { Light, LightAssignment, RoomDetail, Sensor } from '@/lib/api'
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
    <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2.5">
      <div
        className={cn('h-4 w-4 shrink-0 rounded-full', !isOn && 'opacity-30')}
        style={{ backgroundColor: isOn ? colorHex : '#475569' }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-200">
          {light.label}
        </p>
        <p className="truncate text-xs text-slate-500">{light.group.name}</p>
      </div>
      {light.connected ? (
        <Wifi className="h-3 w-3 shrink-0 text-fairy-500" />
      ) : (
        <WifiOff className="h-3 w-3 shrink-0 text-red-400" />
      )}
      <button
        onClick={onIdentify}
        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-fairy-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        aria-label={`Identify ${light.label}`}
        title="Flash this light"
      >
        <Zap className="h-4 w-4" />
      </button>
      <button
        onClick={onAdd}
        className="rounded-lg bg-fairy-500/15 p-2 text-fairy-400 transition-colors hover:bg-fairy-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
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
  onRemove,
}: {
  assignment: LightAssignment
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-fairy-500/20 bg-fairy-500/5 px-3 py-2.5">
      <Lightbulb className="h-4 w-4 shrink-0 text-fairy-400" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-200">
          {assignment.label}
        </p>
        <p className="text-xs text-slate-500">
          {assignment.has_color ? 'Colour' : 'White only'}
        </p>
      </div>
      <button
        onClick={onRemove}
        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        aria-label={`Remove ${assignment.label} from this room`}
      >
        <X className="h-4 w-4" />
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

  // Fetch room detail
  const { data: room, isLoading: roomLoading } = useQuery({
    queryKey: ['rooms', name],
    queryFn: () => api.rooms.get(name!),
    enabled: !!name,
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

  // Room settings state
  const [displayOrder, setDisplayOrder] = useState<number | null>(null)
  const [timer, setTimer] = useState<number | null>(null)
  const [autoEnabled, setAutoEnabled] = useState<boolean | null>(null)
  const [sensors, setSensors] = useState<Sensor[] | null>(null)

  // Compute effective values (from state or room data)
  const effectiveOrder = displayOrder ?? room?.display_order ?? 0
  const effectiveTimer = timer ?? room?.timer ?? 0
  const effectiveAuto = autoEnabled ?? room?.auto ?? false
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

  // Lights available to assign (not assigned to any room)
  const availableLights = useMemo(() => {
    if (!allLights) return []
    const assignedIds = new Set(effectiveAssigned.map(a => a.id))
    return allLights.filter(
      l => !assignedIds.has(l.id) && !assignedToOtherRooms.has(l.id),
    )
  }, [allLights, effectiveAssigned, assignedToOtherRooms])

  // Mutations
  const identifyMutation = useMutation({
    mutationFn: (selector: string) => api.lifx.identify(selector),
  })

  const saveAssignmentsMutation = useMutation({
    mutationFn: () => api.lights.saveForRoom(name!, effectiveAssigned),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms', name] })
      queryClient.invalidateQueries({ queryKey: ['lights', 'rooms'] })
      setDirty(false)
      toast({ message: 'Light assignments saved' })
    },
    onError: () =>
      toast({ message: 'Failed to save assignments', type: 'error' }),
  })

  const updateRoomMutation = useMutation({
    mutationFn: () =>
      api.rooms.update(name!, {
        display_order: effectiveOrder,
        timer: effectiveTimer,
        auto: effectiveAuto,
        sensors: effectiveSensors,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      toast({ message: 'Room settings saved' })
    },
    onError: () =>
      toast({ message: 'Failed to save room settings', type: 'error' }),
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

  const handleAddSensor = () => {
    setSensors([...effectiveSensors, { name: '', priority_threshold: 50 }])
  }

  const handleUpdateSensor = (index: number, sensor: Sensor) => {
    const updated = [...effectiveSensors]
    updated[index] = sensor
    setSensors(updated)
  }

  const handleRemoveSensor = (index: number) => {
    setSensors(effectiveSensors.filter((_, i) => i !== index))
  }

  if (roomLoading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-32 animate-pulse rounded bg-slate-800" />
        <div className="h-40 animate-pulse rounded-xl bg-slate-800" />
        <div className="h-60 animate-pulse rounded-xl bg-slate-800" />
      </div>
    )
  }

  if (!room) {
    return (
      <div className="py-12 text-center">
        <p className="text-slate-400">Room not found.</p>
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
    <div className="pb-24">
      {/* Back link */}
      <Link
        to="/rooms"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
      >
        <ArrowLeft className="h-4 w-4" />
        All Rooms
      </Link>

      <h2 className="mb-6 text-xl font-semibold text-slate-100">
        {room.name}
      </h2>

      {/* ── Room settings ─────────────────────────────────────────────────── */}
      <section className="mb-8">
        <h3 className="mb-3 text-sm font-medium text-slate-400">
          Room Settings
        </h3>
        <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Display Order
              </label>
              <input
                type="number"
                min={0}
                value={effectiveOrder}
                onChange={e => setDisplayOrder(Number(e.target.value))}
                className="h-11 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Timer (seconds)
              </label>
              <input
                type="number"
                min={0}
                value={effectiveTimer}
                onChange={e => setTimer(Number(e.target.value))}
                className="h-11 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
              />
            </div>
          </div>

          {/* Auto toggle */}
          <div className="flex items-center justify-between">
            <label
              htmlFor="auto-toggle"
              className="text-sm font-medium text-slate-200"
            >
              Automation
            </label>
            <Switch.Root
              id="auto-toggle"
              checked={effectiveAuto}
              onCheckedChange={c => setAutoEnabled(c)}
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

          <button
            onClick={() => updateRoomMutation.mutate()}
            disabled={updateRoomMutation.isPending}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-fairy-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-fairy-600 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            <Save className="h-4 w-4" />
            {updateRoomMutation.isPending ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </section>

      {/* ── Sensor configuration ──────────────────────────────────────────── */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-400">Sensors</h3>
          <button
            onClick={handleAddSensor}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-fairy-400 transition-colors hover:bg-fairy-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
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
                className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3"
              >
                <input
                  type="text"
                  value={sensor.name}
                  onChange={e =>
                    handleUpdateSensor(i, { ...sensor, name: e.target.value })
                  }
                  placeholder="Sensor name"
                  className="h-9 min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                />
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
                  className="h-9 w-20 rounded-lg border border-slate-700 bg-slate-800 px-2.5 text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                />
                <button
                  onClick={() => handleRemoveSensor(i)}
                  className="rounded-lg p-2 text-slate-500 transition-colors hover:text-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                  aria-label="Remove sensor"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-700 py-6 text-center text-xs text-slate-500">
            No sensors configured.
          </p>
        )}
      </section>

      {/* ── Light assignment ───────────────────────────────────────────────── */}
      <section className="mb-8">
        <h3 className="mb-3 text-sm font-medium text-slate-400">
          Assigned Lights
        </h3>
        {effectiveAssigned.length > 0 ? (
          <div className="space-y-2">
            {effectiveAssigned.map(a => (
              <AssignedLightRow
                key={a.id}
                assignment={a}
                onRemove={() => handleUnassign(a.id)}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-700 py-6 text-center text-xs text-slate-500">
            No lights assigned to this room yet.
          </p>
        )}

        {dirty && (
          <button
            onClick={() => saveAssignmentsMutation.mutate()}
            disabled={saveAssignmentsMutation.isPending}
            className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-fairy-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-fairy-600 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            <Save className="h-4 w-4" />
            {saveAssignmentsMutation.isPending
              ? 'Saving...'
              : 'Save Light Assignments'}
          </button>
        )}
      </section>

      <section className="mb-8">
        <h3 className="mb-3 text-sm font-medium text-slate-400">
          Available Lights
        </h3>
        {availableLights.length > 0 ? (
          <div className="space-y-2">
            {availableLights.map(light => (
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
        ) : (
          <p className="rounded-xl border border-dashed border-slate-700 py-6 text-center text-xs text-slate-500">
            {allLights
              ? 'All lights have been assigned.'
              : 'Loading lights...'}
          </p>
        )}
      </section>

      {/* ── Danger zone ───────────────────────────────────────────────────── */}
      <section>
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
    </div>
  )
}
