import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plug,
  RefreshCw,
  Wifi,
  WifiOff,
  Power,
  ChevronDown,
  ChevronUp,
  Pencil,
  Check,
  X,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { KasaDevice } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { BackLink } from '@/components/ui/BackLink'
import { TypeBadge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonList } from '@/components/ui/Skeleton'

// ── Signal strength indicator ─────────────────────────────────────────────────

function SignalDot({ rssi }: { rssi: number | null }) {
  let colorClass: string
  let label: string

  if (rssi === null) {
    colorClass = 'bg-slate-500'
    label = 'Unknown signal'
  } else if (rssi >= -50) {
    colorClass = 'bg-green-500'
    label = 'Strong signal'
  } else if (rssi >= -70) {
    colorClass = 'bg-yellow-500'
    label = 'Good signal'
  } else {
    colorClass = 'bg-red-500'
    label = 'Weak signal'
  }

  return (
    <span
      className={cn('inline-block h-2 w-2 shrink-0 rounded-full', colorClass)}
      title={rssi !== null ? `${rssi} dBm — ${label}` : label}
      aria-label={label}
    />
  )
}

// ── Rename field ──────────────────────────────────────────────────────────────

function RenameField({
  device,
  onRenamed,
}: {
  device: KasaDevice
  onRenamed: () => void
}) {
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(device.label)

  const renameMutation = useMutation({
    mutationFn: (label: string) => api.kasa.renameDevice(device.id, label),
    onSuccess: () => {
      toast({ message: `Device renamed to "${value}"` })
      setEditing(false)
      onRenamed()
    },
    onError: () => {
      toast({ message: 'Failed to rename device. Try again.', type: 'error' })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || trimmed === device.label) {
      setEditing(false)
      setValue(device.label)
      return
    }
    renameMutation.mutate(trimmed)
  }

  const handleCancel = () => {
    setEditing(false)
    setValue(device.label)
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className={cn(
          'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-caption transition-colors',
          'hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-secondary)]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          'min-h-[44px]',
        )}
        aria-label={`Rename ${device.label}`}
      >
        <Pencil className="h-3 w-3" aria-hidden="true" />
        Rename
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        autoFocus
        className="input-field h-9 rounded-md border px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        aria-label="New device name"
        maxLength={64}
      />
      <button
        type="submit"
        disabled={renameMutation.isPending}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-fairy-400 transition-colors hover:bg-fairy-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        aria-label="Save new name"
      >
        <Check className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={handleCancel}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-caption transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-secondary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        aria-label="Cancel rename"
      >
        <X className="h-4 w-4" />
      </button>
    </form>
  )
}

// ── Device card ───────────────────────────────────────────────────────────────

function KasaDeviceCard({
  device,
  onRefetch,
}: {
  device: KasaDevice
  onRefetch: () => void
}) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const isStrip = device.device_type === 'strip'
  const isOn = device.attributes.switch === 'on'

  const toggleMutation = useMutation({
    mutationFn: () => api.kasa.sendCommand(device.id, isOn ? 'off' : 'on'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kasa', 'devices'] })
    },
    onError: () => {
      toast({ message: `Failed to control ${device.label}. Check the device is online.`, type: 'error' })
    },
  })

  return (
    <div className="card rounded-xl border">
      {/* Main row */}
      <div className="flex items-center gap-3 p-4">
        {/* Online/offline indicator */}
        <div
          className={cn(
            'shrink-0 rounded-full p-1.5',
            device.is_online ? 'bg-fairy-500/10 text-fairy-400' : 'bg-slate-500/10 text-slate-500',
          )}
          aria-hidden="true"
        >
          {device.is_online ? (
            <Wifi className="h-4 w-4" />
          ) : (
            <WifiOff className="h-4 w-4" />
          )}
        </div>

        {/* Label + meta */}
        <div className="min-w-0 flex-1">
          <p className={cn('text-sm font-medium', device.is_online ? 'text-heading' : 'text-body')}>
            {device.label}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {device.model && (
              <span className="text-caption text-xs">{device.model}</span>
            )}
            {device.ip_address && (
              <span className="text-caption text-xs">{device.ip_address}</span>
            )}
            {device.rssi !== null && (
              <span className="flex items-center gap-1 text-xs text-caption">
                <SignalDot rssi={device.rssi} />
                {device.rssi} dBm
              </span>
            )}
          </div>
        </div>

        {/* Type badge */}
        <TypeBadge type={device.device_type} />

        {/* Status badge */}
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
            device.is_online
              ? 'bg-green-500/10 text-green-400'
              : 'bg-slate-500/10 text-slate-400',
          )}
        >
          {device.is_online ? 'Online' : 'Offline'}
        </span>

        {/* Toggle power */}
        <button
          onClick={() => toggleMutation.mutate()}
          disabled={toggleMutation.isPending || !device.is_online}
          className={cn(
            'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            isOn
              ? 'bg-fairy-500/15 text-fairy-400 hover:bg-fairy-500/25'
              : 'text-caption hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-secondary)]',
            (!device.is_online || toggleMutation.isPending) && 'cursor-not-allowed opacity-40',
          )}
          aria-label={`Turn ${device.label} ${isOn ? 'off' : 'on'}`}
          aria-pressed={isOn}
        >
          <Power className="h-4 w-4" />
        </button>

        {/* Expand toggle for strips */}
        {isStrip && device.children && device.children.length > 0 && (
          <button
            onClick={() => setExpanded(prev => !prev)}
            className={cn(
              'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-caption transition-colors',
              'hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-secondary)]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            )}
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse sockets for ${device.label}` : `Expand sockets for ${device.label}`}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Rename row */}
      <div className="border-t px-4 py-2">
        <RenameField device={device} onRenamed={onRefetch} />
      </div>

      {/* Child sockets for strips */}
      {isStrip && expanded && device.children && device.children.length > 0 && (
        <div className="border-t px-4 py-3">
          <p className="text-caption mb-2 text-xs font-medium">Sockets</p>
          <div className="space-y-2">
            {device.children.map(child => (
              <KasaDeviceCard key={child.id} device={child} onRefetch={onRefetch} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Health status bar ─────────────────────────────────────────────────────────

function HealthBar() {
  const { data: health, isError } = useQuery({
    queryKey: ['kasa', 'health'],
    queryFn: api.kasa.health,
    refetchInterval: 30_000,
  })

  if (isError) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm">
        <WifiOff className="h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
        <span className="text-red-400">Kasa sidecar is unreachable. Make sure it is running and try again.</span>
      </div>
    )
  }

  if (!health) return null

  const isHealthy = health.status === 'ok'

  return (
    <div
      className={cn(
        'mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
        isHealthy
          ? 'border border-green-500/20 bg-green-500/10'
          : 'border border-yellow-500/20 bg-yellow-500/10',
      )}
    >
      {isHealthy ? (
        <Wifi className="h-4 w-4 shrink-0 text-green-400" aria-hidden="true" />
      ) : (
        <WifiOff className="h-4 w-4 shrink-0 text-yellow-400" aria-hidden="true" />
      )}
      <span className={cn('font-medium', isHealthy ? 'text-green-400' : 'text-yellow-400')}>
        Sidecar {isHealthy ? 'online' : 'degraded'}
      </span>
      <span className="text-caption">
        {health.online_count} of {health.device_count} device{health.device_count !== 1 ? 's' : ''} online
      </span>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function KasaSetupPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const {
    data: devices,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['kasa', 'devices'],
    queryFn: api.kasa.getDevices,
  })

  const discoverMutation = useMutation({
    mutationFn: api.kasa.discover,
    onSuccess: result => {
      toast({
        message: `Discovery complete. Found ${result.discovered} new device${result.discovered !== 1 ? 's' : ''} (${result.total} total).`,
      })
      queryClient.invalidateQueries({ queryKey: ['kasa', 'devices'] })
      queryClient.invalidateQueries({ queryKey: ['kasa', 'health'] })
    },
    onError: () => {
      toast({
        message: 'Device discovery failed. Make sure your Kasa devices are on the same network.',
        type: 'error',
      })
    },
  })

  // Separate top-level devices from children (children are rendered inside their parent)
  const topLevelDevices = devices?.filter(d => d.parent_id === null) ?? []

  // Group by device_type for display
  const strips = topLevelDevices.filter(d => d.device_type === 'strip')
  const others = topLevelDevices.filter(d => d.device_type !== 'strip')

  const handleRefetch = () => {
    queryClient.invalidateQueries({ queryKey: ['kasa', 'devices'] })
  }

  return (
    <div>
      {/* Back link */}
      <BackLink to="/settings" label="Settings" />

      {/* Page header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-heading text-sm font-semibold">Kasa devices</h2>

        <div className="flex items-center gap-2">
          {/* Discover button */}
          <button
            onClick={() => discoverMutation.mutate()}
            disabled={discoverMutation.isPending}
            className={cn(
              'surface text-heading flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:brightness-95 dark:hover:brightness-110',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              discoverMutation.isPending && 'opacity-60',
            )}
          >
            <RefreshCw
              className={cn('h-4 w-4', discoverMutation.isPending && 'animate-spin')}
              aria-hidden="true"
            />
            {discoverMutation.isPending ? 'Scanning network...' : 'Discover devices'}
          </button>
        </div>
      </div>

      {/* Sidecar health */}
      <HealthBar />

      {/* Content */}
      {isLoading ? (
        <div role="status" aria-label="Loading Kasa devices">
          <SkeletonList count={4} height="h-24" />
        </div>
      ) : isError ? (
        <EmptyState
          icon={WifiOff}
          message="Could not load Kasa devices."
          sub="The Kasa sidecar may be unavailable. Make sure it is running, then try again."
        >
          <button
            onClick={() => refetch()}
            className="mt-3 text-xs text-fairy-400 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            Retry
          </button>
        </EmptyState>
      ) : topLevelDevices.length === 0 ? (
        <EmptyState
          icon={Plug}
          message="No Kasa devices found."
          sub="Make sure your devices are on the same network, then click Discover devices."
        >
          <button
            onClick={() => discoverMutation.mutate()}
            disabled={discoverMutation.isPending}
            className={cn(
              'mt-3 rounded-lg bg-fairy-500/10 px-3 py-2 text-xs font-medium text-fairy-400 transition-colors hover:bg-fairy-500/20',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              discoverMutation.isPending && 'opacity-60 cursor-not-allowed',
            )}
          >
            {discoverMutation.isPending ? 'Scanning...' : 'Discover devices'}
          </button>
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {/* Strips */}
          {strips.length > 0 && (
            <section>
              <h3 className="text-body mb-2 text-sm font-medium">Power strips</h3>
              <div className="space-y-2">
                {strips.map(device => (
                  <KasaDeviceCard key={device.id} device={device} onRefetch={handleRefetch} />
                ))}
              </div>
            </section>
          )}

          {/* Individual plugs, switches, dimmers */}
          {others.length > 0 && (
            <section>
              <h3 className="text-body mb-2 text-sm font-medium">Individual devices</h3>
              <div className="space-y-2">
                {others.map(device => (
                  <KasaDeviceCard key={device.id} device={device} onRefetch={handleRefetch} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
