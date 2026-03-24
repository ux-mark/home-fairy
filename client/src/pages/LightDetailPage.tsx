import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Power, ChevronRight, Wifi, WifiOff } from 'lucide-react'
import { api } from '@/lib/api'
import { cn, getLightColorHex } from '@/lib/utils'
import { BackLink } from '@/components/ui/BackLink'
import { TypeBadge } from '@/components/ui/Badge'
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
          <span className="text-xs text-caption">{light.product.name}</span>
          <span className={cn('flex items-center gap-1 text-xs', light.connected ? 'text-fairy-500' : 'text-red-400')}>
            {light.connected ? <Wifi className="h-3 w-3" aria-hidden="true" /> : <WifiOff className="h-3 w-3" aria-hidden="true" />}
            {light.connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </header>

      {/* Controls */}
      <section className="card rounded-xl border p-5">
        <h2 className="mb-4 text-sm font-semibold text-heading">Controls</h2>
        <div className="space-y-4">
          {/* Power + color swatch */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => toggleMutation.mutate()}
              disabled={toggleMutation.isPending}
              className={cn(
                'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                isOn
                  ? 'bg-fairy-500/15 text-fairy-400 hover:bg-fairy-500/25'
                  : 'surface text-caption hover:text-heading',
              )}
              aria-label={`Turn ${light.label} ${isOn ? 'off' : 'on'}`}
            >
              <Power className="h-5 w-5" />
            </button>
            <span className={cn('text-sm font-medium', isOn ? 'text-heading' : 'text-caption')}>
              {isOn ? 'On' : 'Off'}
            </span>
            <div
              className={cn('ml-auto h-8 w-8 rounded-full border', !isOn && 'opacity-30')}
              style={{ backgroundColor: isOn ? colorHex : '#475569', borderColor: 'var(--border-secondary)' }}
              aria-hidden="true"
            />
          </div>

          {/* Brightness */}
          {isOn && (
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
    </div>
  )
}
