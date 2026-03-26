import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Power, ChevronRight, Wifi, WifiOff, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'
import { cn, getLightColorHex } from '@/lib/utils'
import { BackLink } from '@/components/ui/BackLink'
import { TypeBadge, StatusBadge } from '@/components/ui/Badge'
import { useToast } from '@/hooks/useToast'

export default function LightDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: lights, isLoading: lightsLoading } = useQuery({
    queryKey: ['lifx', 'lights'],
    queryFn: api.lifx.getLights,
  })

  const light = lights?.find(l => l.id === id)

  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: ['lifx', 'usage', id],
    queryFn: () => api.lifx.getUsage(id!),
    enabled: !!id && !!light,
    staleTime: 60_000,
  })

  const { data: deactivatedDevices } = useQuery({
    queryKey: ['devices', 'deactivated'],
    queryFn: api.devices.getDeactivated,
    staleTime: 30_000,
  })

  const isDeactivated = !!(id && deactivatedDevices?.some(d => d.deviceType === 'lifx' && d.deviceId === id))

  const reactivateMutation = useMutation({
    mutationFn: () => api.devices.reactivate('lifx', id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices', 'deactivated'] })
      queryClient.invalidateQueries({ queryKey: ['lifx', 'lights'] })
      toast({ message: 'Light reactivated successfully' })
    },
    onError: () => toast({ message: 'Light is still unreachable. Check the physical connection.', type: 'error' }),
  })

  const deactivateMutation = useMutation({
    mutationFn: () => api.devices.deactivate('lifx', id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices', 'deactivated'] })
      toast({ message: 'Light deactivated. It will be skipped in scenes and automations.' })
    },
    onError: () => toast({ message: 'Failed to deactivate light', type: 'error' }),
  })

  const toggleMutation = useMutation({
    mutationFn: () => api.lifx.toggle(`id:${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lifx', 'lights'] }),
    onError: () => toast({ message: 'Failed to toggle light', type: 'error' }),
  })

  const setStateMutation = useMutation({
    mutationFn: (brightness: number) =>
      api.lifx.setState(`id:${id}`, { brightness: brightness / 100, duration: 0.3 }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lifx', 'lights'] }),
  })

  // Room assignment
  const [lightRoomDropdownOpen, setLightRoomDropdownOpen] = useState(false)
  const lightRoomDropdownRef = useRef<HTMLDivElement>(null)
  const { data: rooms } = useQuery({ queryKey: ['rooms'], queryFn: api.rooms.getAll })
  const { data: lightAssignments } = useQuery({ queryKey: ['lights', 'rooms'], queryFn: api.lights.getRoomAssignments })
  const lightRoom = lightAssignments?.find(a => a.light_id === id)

  const assignLightRoomMutation = useMutation({
    mutationFn: (roomName: string) =>
      api.lights.saveForRoom(roomName, [{
        id: light?.id ?? '',
        label: light?.label ?? '',
        has_color: light?.product.capabilities.has_color ?? false,
        min_kelvin: light?.product.capabilities.min_kelvin ?? 2500,
        max_kelvin: light?.product.capabilities.max_kelvin ?? 9000,
      }]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lights', 'rooms'] })
      setLightRoomDropdownOpen(false)
      toast({ message: 'Assigned to room' })
    },
    onError: () => toast({ message: 'Failed to assign', type: 'error' }),
  })

  useEffect(() => {
    if (!lightRoomDropdownOpen) return
    function handleClick(e: MouseEvent) {
      if (lightRoomDropdownRef.current && !lightRoomDropdownRef.current.contains(e.target as Node)) setLightRoomDropdownOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [lightRoomDropdownOpen])

  // Loading state
  if (lightsLoading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading light details">
        <div className="space-y-3">
          <div className="h-8 w-24 animate-pulse rounded-lg bg-[var(--bg-tertiary)]" />
          <div className="h-7 w-48 animate-pulse rounded-lg bg-[var(--bg-tertiary)]" />
        </div>
        {[1, 2].map(i => (
          <div key={i} className="card rounded-xl border p-5 space-y-3">
            <div className="h-5 w-32 animate-pulse rounded bg-[var(--bg-tertiary)]" />
            <div className="h-4 w-full animate-pulse rounded bg-[var(--bg-tertiary)]" />
          </div>
        ))}
      </div>
    )
  }

  // Not found
  if (!light) {
    return (
      <div>
        <BackLink to="/devices" label="All Devices" />
        <div className="card rounded-xl border p-5" role="alert">
          <p className="text-sm text-body">Light not found or offline.</p>
          <button
            onClick={() => navigate('/devices')}
            className="mt-4 rounded-lg bg-fairy-500/15 px-4 py-2 text-sm font-medium text-fairy-400 transition-colors hover:bg-fairy-500/25"
          >
            Back to devices
          </button>
        </div>
      </div>
    )
  }

  const isOn = light.power === 'on'
  const colorHex = getLightColorHex(light)
  const brightness = Math.round(light.brightness * 100)

  return (
    <div className="space-y-6">
      {/* Header */}
      <header>
        <BackLink to="/devices" label="All Devices" />
        <h1 className="text-heading text-xl font-semibold">{light.label}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <TypeBadge type="lifx" />
          {isDeactivated && <StatusBadge status="deactivated" />}
          <span className="text-xs text-caption">{light.product.name}</span>
          <span className={cn('flex items-center gap-1 text-xs', light.connected ? 'text-fairy-500' : 'text-red-400')}>
            {light.connected ? <Wifi className="h-3 w-3" aria-hidden="true" /> : <WifiOff className="h-3 w-3" aria-hidden="true" />}
            {light.connected ? 'Connected' : 'Disconnected'}
          </span>
          <div ref={lightRoomDropdownRef} className="relative inline-flex">
            <button
              onClick={() => setLightRoomDropdownOpen(!lightRoomDropdownOpen)}
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors',
                lightRoom
                  ? 'bg-fairy-500/10 text-fairy-400 hover:bg-fairy-500/20'
                  : 'border border-dashed border-[var(--border-secondary)] text-caption hover:border-fairy-500/40 hover:text-fairy-400',
              )}
              aria-label={lightRoom ? `Change room for ${light.label} (currently ${lightRoom.room_name})` : `Assign ${light.label} to a room`}
            >
              {lightRoom?.room_name ?? 'Assign room'}
            </button>
            {lightRoomDropdownOpen && rooms && rooms.length > 0 && (
              <div className="absolute left-0 top-full z-20 mt-1 max-h-48 w-40 overflow-y-auto rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-primary)] shadow-lg">
                {rooms.map(room => (
                  <button
                    key={room.name}
                    onClick={() => assignLightRoomMutation.mutate(room.name)}
                    disabled={assignLightRoomMutation.isPending || room.name === lightRoom?.room_name}
                    className={cn(
                      'flex w-full min-h-[36px] items-center px-3 py-1.5 text-left text-xs transition-colors',
                      room.name === lightRoom?.room_name
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
        </div>
      </header>

      {/* Deactivation banner */}
      {isDeactivated && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
            <p className="text-heading text-sm font-medium">
              This light is deactivated
            </p>
          </div>
          <p className="text-caption text-xs mb-3">
            It was not responding to commands and will be skipped in scenes and automations.
          </p>
          <button
            onClick={() => reactivateMutation.mutate()}
            disabled={reactivateMutation.isPending}
            className="rounded-lg bg-amber-500/15 px-4 py-2 text-sm font-medium text-amber-400 hover:bg-amber-500/25 transition-colors min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
          >
            {reactivateMutation.isPending ? 'Reactivating...' : 'Reactivate this light'}
          </button>
        </div>
      )}

      {/* Controls */}
      <section className="card rounded-xl border p-5">
        <h2 className="mb-4 text-sm font-semibold text-heading">Controls</h2>
        <div className="space-y-4">
          {/* Power + color swatch */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => toggleMutation.mutate()}
              disabled={toggleMutation.isPending || isDeactivated}
              className={cn(
                'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                isDeactivated && 'cursor-not-allowed opacity-40',
                !isDeactivated && isOn
                  ? 'bg-fairy-500/15 text-fairy-400 hover:bg-fairy-500/25'
                  : 'surface text-caption hover:text-heading',
              )}
              aria-label={isDeactivated ? `${light.label} is deactivated` : `Turn ${light.label} ${isOn ? 'off' : 'on'}`}
            >
              <Power className="h-5 w-5" />
            </button>
            <span className={cn('text-sm font-medium', isDeactivated ? 'text-slate-500' : isOn ? 'text-heading' : 'text-caption')}>
              {isDeactivated ? 'Deactivated' : isOn ? 'On' : 'Off'}
            </span>
            <div
              className={cn('ml-auto h-8 w-8 rounded-full border', (!isOn || isDeactivated) && 'opacity-30')}
              style={{ backgroundColor: isOn && !isDeactivated ? colorHex : '#475569', borderColor: 'var(--border-secondary)' }}
              aria-hidden="true"
            />
          </div>

          {/* Brightness */}
          {isOn && !isDeactivated && (
            <div>
              <label className="text-body mb-2 flex items-center justify-between text-xs font-medium">
                <span>Brightness</span>
                <span className="text-heading">{brightness}%</span>
              </label>
              <input
                type="range"
                min={0}
                max={100}
                defaultValue={brightness}
                onPointerUp={e => setStateMutation.mutate(Number((e.target as HTMLInputElement).value))}
                onKeyUp={e => {
                  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
                    setStateMutation.mutate(Number((e.target as HTMLInputElement).value))
                }}
                className="h-11 w-full cursor-pointer appearance-none rounded-lg"
                style={{
                  background: `linear-gradient(to right, var(--bg-primary), ${colorHex})`,
                }}
                aria-label={`Brightness for ${light.label}`}
              />
            </div>
          )}

          {/* Color info */}
          <div className="text-caption flex items-center gap-2 text-xs">
            {light.product.capabilities.has_color ? (
              <span>Hue: {Math.round(light.color.hue)}°, Saturation: {Math.round(light.color.saturation * 100)}%</span>
            ) : (
              <span>Colour temperature: {light.color.kelvin}K</span>
            )}
          </div>

          {/* LIFX group */}
          <p className="text-xs text-caption">
            LIFX group: <span className="text-body">{light.group.name}</span>
          </p>
        </div>
      </section>

      {/* Room and scene context */}
      {!usageLoading && usage && (
        <section className="card rounded-xl border p-5">
          <h2 className="mb-4 text-sm font-semibold text-heading">Rooms and scenes</h2>
          <div className="space-y-4">
            {/* Room */}
            {usage.room ? (
              <div>
                <p className="mb-2 text-xs font-medium text-caption">Assigned to 1 room</p>
                <Link
                  to={`/rooms/${encodeURIComponent(usage.room)}`}
                  className={cn(
                    'flex min-h-[44px] items-center gap-2 rounded-lg px-2 -mx-2',
                    'text-sm text-fairy-400 transition-colors hover:bg-fairy-500/10',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                  )}
                >
                  <span className="flex-1">{usage.room}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
                </Link>
              </div>
            ) : (
              <p className="text-sm text-caption">
                Not assigned to any room.{' '}
                <Link
                  to="/rooms"
                  className="text-fairy-400 underline underline-offset-2 hover:text-fairy-300"
                >
                  Manage rooms
                </Link>
              </p>
            )}

            {/* Scenes */}
            {usage.scenes.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-medium text-caption">
                  Used in {usage.scenes.length} scene{usage.scenes.length !== 1 ? 's' : ''}
                </p>
                <ul className="space-y-1" role="list">
                  {usage.scenes.map(scene => (
                    <li key={scene.name}>
                      <Link
                        to={`/scenes/${encodeURIComponent(scene.name)}`}
                        className={cn(
                          'flex min-h-[44px] items-center gap-2 rounded-lg px-2 -mx-2',
                          'text-sm text-fairy-400 transition-colors hover:bg-fairy-500/10',
                          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                        )}
                      >
                        {scene.icon && (
                          <span className="text-base leading-none" aria-hidden="true">{scene.icon}</span>
                        )}
                        <span className="flex-1">{scene.name}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-caption">Not used in any scenes.</p>
            )}

            {/* Indicator role */}
            {usage.indicatorRole && (
              <p className="text-xs text-caption">
                Role: <span className="text-body font-medium">
                  {usage.indicatorRole === 'subway' ? 'Subway indicator light' : 'Weather indicator light'}
                </span>
              </p>
            )}
          </div>
        </section>
      )}

      {/* Light management */}
      {!isDeactivated && (
        <section aria-labelledby="light-management-heading">
          <div className="card rounded-xl border p-5">
            <h2 id="light-management-heading" className="mb-4 text-sm font-semibold text-heading">
              Light management
            </h2>
            <button
              onClick={() => deactivateMutation.mutate()}
              disabled={deactivateMutation.isPending}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:bg-slate-800 transition-colors min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
            >
              {deactivateMutation.isPending ? 'Deactivating...' : 'Deactivate light'}
            </button>
            <p className="mt-2 text-xs text-caption">
              Deactivated lights are skipped in scenes and automations. You can reactivate at any time.
            </p>
          </div>
        </section>
      )}
    </div>
  )
}
