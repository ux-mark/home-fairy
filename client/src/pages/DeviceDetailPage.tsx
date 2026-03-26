import { useState, useRef, useEffect } from 'react'
import { useParams, useMatch, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Pencil, Check, X, Power, Shield, AlertTriangle } from 'lucide-react'
import { api, type DeviceInsightsData, type KasaDevice } from '@/lib/api'
import { cn } from '@/lib/utils'
import TimeSeriesChart from '@/components/dashboard/TimeSeriesChart'
import OverUnderBadge from '@/components/dashboard/OverUnderBadge'
import { BackLink } from '@/components/ui/BackLink'
import { TypeBadge, StatusBadge } from '@/components/ui/Badge'
import { Accordion } from '@/components/ui/Accordion'
import { FilterChip } from '@/components/ui/FilterChip'
import { useToast } from '@/hooks/useToast'

// ── Types ─────────────────────────────────────────────────────────────────────

type Period = '24h' | '7d' | '30d'

// ── Source metadata ────────────────────────────────────────────────────────────

interface SourceMeta {
  unit: string
  color: string
  label: string
  chartTitle: string
}

function getSourceMeta(source: string): SourceMeta {
  switch (source) {
    case 'power':
      return { unit: 'W', color: '#f59e0b', label: 'Power', chartTitle: 'Power usage over time' }
    case 'energy':
      return { unit: 'kWh', color: '#8b5cf6', label: 'Energy', chartTitle: 'Energy consumption over time' }
    case 'battery':
      return { unit: '%', color: '#22c55e', label: 'Battery', chartTitle: 'Battery drain over time' }
    case 'temperature':
      return { unit: '°', color: '#10b981', label: 'Temperature', chartTitle: 'Temperature trend' }
    case 'lux':
      return { unit: 'lux', color: '#fbbf24', label: 'Illuminance', chartTitle: 'Illuminance over time' }
    default:
      return { unit: '', color: '#10b981', label: source, chartTitle: `${source} over time` }
  }
}

// ── Attribute value formatting ─────────────────────────────────────────────────

function formatAttributeValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') {
    // Render integers without decimals, floats with up to 2 dp
    return value % 1 === 0 ? String(value) : value.toFixed(2)
  }
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

/** True for attribute keys that deserve visual emphasis */
function isHighlightedAttribute(key: string): boolean {
  const highlights = ['power', 'energy', 'battery', 'temperature', 'switch']
  return highlights.includes(key.toLowerCase())
}

// ── Attribute unit hint ────────────────────────────────────────────────────────

function attributeUnit(key: string): string {
  const lower = key.toLowerCase()
  if (lower === 'battery') return '%'
  if (lower === 'energy') return 'kWh'
  if (lower === 'temperature') return '°'
  if (lower === 'power') return 'W'
  if (lower === 'voltage') return 'V'
  if (lower === 'current') return 'A'
  return ''
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading device details">
      {/* Header skeleton */}
      <div className="space-y-3">
        <div className="h-8 w-24 animate-pulse rounded-lg bg-[var(--bg-tertiary)]" />
        <div className="h-7 w-48 animate-pulse rounded-lg bg-[var(--bg-tertiary)]" />
        <div className="h-5 w-32 animate-pulse rounded-full bg-[var(--bg-tertiary)]" />
      </div>

      {/* Section skeletons */}
      {[1, 2, 3].map(i => (
        <div key={i} className="card rounded-xl border p-5 space-y-3">
          <div className="h-5 w-32 animate-pulse rounded bg-[var(--bg-tertiary)]" />
          <div className="space-y-2">
            <div className="h-4 w-full animate-pulse rounded bg-[var(--bg-tertiary)]" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--bg-tertiary)]" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-[var(--bg-tertiary)]" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Battery level bar ─────────────────────────────────────────────────────────

function BatteryBar({ level }: { level: number }) {
  const clamped = Math.min(100, Math.max(0, level))
  const colorClass =
    clamped <= 15
      ? 'bg-red-500'
      : clamped <= 30
        ? 'bg-amber-400'
        : 'bg-green-500'

  return (
    <div
      className="h-3 w-full overflow-hidden rounded-full bg-[var(--bg-tertiary)]"
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Battery level ${clamped}%`}
    >
      <div
        className={cn('h-full rounded-full transition-all duration-500', colorClass)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}

// ── Headline insights ─────────────────────────────────────────────────────────

function HeadlineInsights({
  deviceInsights,
}: {
  deviceInsights: DeviceInsightsData | undefined
}) {
  if (!deviceInsights) return null

  const { power, battery, temperature } = deviceInsights.insights

  if (!power && !battery && !temperature) return null

  return (
    <section aria-labelledby="insights-heading">
      <div className="card rounded-xl border p-5">
        <h2
          id="insights-heading"
          className="mb-4 text-sm font-semibold text-heading"
        >
          At a glance
        </h2>

        <div className="space-y-5">
          {/* ── Power insights ─────────────────────────────────────────── */}
          {power && (
            <div>
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="text-2xl font-bold tabular-nums text-heading">
                  {power.currentWatts} W
                </span>
                <OverUnderBadge percent={power.overUnderPercent} size="md" />
              </div>
              <p className="mt-0.5 text-xs text-caption">Current draw</p>

              {power.percentOfTotal > 0 && (
                <p className="mt-3 text-sm text-body">
                  This device accounts for{' '}
                  <strong className="font-semibold text-heading">
                    {power.percentOfTotal}%
                  </strong>{' '}
                  of your total energy draw.
                </p>
              )}

              {power.dailyCostImpact !== null && (
                <p className="mt-1 text-sm text-caption">
                  Estimated daily cost:{' '}
                  <span className="font-medium text-body">
                    {power.currencySymbol}
                    {power.dailyCostImpact.toFixed(2)}
                  </span>
                </p>
              )}
            </div>
          )}

          {/* ── Battery insights ───────────────────────────────────────── */}
          {battery && (
            <div>
              {/* Critical replacement warning */}
              {battery.predictedDaysRemaining !== null &&
                battery.predictedDaysRemaining < 30 && (
                  <div
                    className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3"
                    role="alert"
                  >
                    <p className="text-sm font-semibold text-red-400">
                      Replace soon — estimated{' '}
                      <strong>{battery.predictedDaysRemaining} days</strong>{' '}
                      remaining
                    </p>
                  </div>
                )}

              <BatteryBar level={battery.currentLevel} />

              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums text-heading">
                  {battery.currentLevel}%
                </span>
                <span className="text-xs text-caption">battery remaining</span>
              </div>

              {battery.drainPerDay !== null && (
                <p className="mt-2 text-sm text-caption">
                  Draining at{' '}
                  <span className="font-medium text-body">
                    {battery.drainPerDay}% per day
                  </span>
                </p>
              )}

              {battery.predictedDaysRemaining !== null &&
                battery.predictedDaysRemaining >= 30 && (
                  <p className="mt-1 text-sm text-caption">
                    At current rate, this battery will need replacing in
                    approximately{' '}
                    <strong className="font-semibold text-body">
                      {battery.predictedDaysRemaining} days
                    </strong>
                    .
                  </p>
                )}
            </div>
          )}

          {/* ── Temperature insights ───────────────────────────────────── */}
          {temperature && (
            <div>
              <span className="text-2xl font-bold tabular-nums text-heading">
                {temperature.currentTemp}°
              </span>
              <p className="mt-0.5 text-xs text-caption">Current temperature</p>

              {temperature.avgTemp30d !== null && (
                <p className="mt-2 text-sm text-caption">
                  30-day average:{' '}
                  <span className="font-medium text-body">
                    {temperature.avgTemp30d}°
                  </span>
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

// ── Kasa at-a-glance section ──────────────────────────────────────────────────

function formatRuntime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function rssiLabel(rssi: number | null): { text: string; color: string } {
  if (rssi === null) return { text: 'Unknown', color: 'text-caption' }
  if (rssi >= -50) return { text: 'Strong', color: 'text-emerald-400' }
  if (rssi >= -70) return { text: 'Good', color: 'text-amber-400' }
  return { text: 'Weak', color: 'text-red-400' }
}

function KasaAtAGlance({ device }: { device: KasaDevice }) {
  const attrs = device.attributes
  const hasAny =
    typeof attrs.power === 'number' ||
    typeof attrs.voltage === 'number' ||
    typeof attrs.current === 'number' ||
    typeof attrs.runtime_today === 'number' ||
    typeof attrs.energy === 'number'

  if (!hasAny) return null

  return (
    <section aria-labelledby="kasa-glance-heading">
      <div className="card rounded-xl border p-5">
        <h2 id="kasa-glance-heading" className="mb-4 text-sm font-semibold text-heading">
          At a glance
        </h2>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {typeof attrs.power === 'number' && (
            <div>
              <dt className="text-xs text-caption">Power draw</dt>
              <dd className="mt-0.5 text-xl font-bold tabular-nums text-heading">
                {attrs.power.toFixed(1)}<span className="ml-0.5 text-sm font-normal text-caption">W</span>
              </dd>
            </div>
          )}
          {typeof attrs.voltage === 'number' && (
            <div>
              <dt className="text-xs text-caption">Voltage</dt>
              <dd className="mt-0.5 text-xl font-bold tabular-nums text-heading">
                {attrs.voltage.toFixed(1)}<span className="ml-0.5 text-sm font-normal text-caption">V</span>
              </dd>
            </div>
          )}
          {typeof attrs.current === 'number' && (
            <div>
              <dt className="text-xs text-caption">Current</dt>
              <dd className="mt-0.5 text-xl font-bold tabular-nums text-heading">
                {attrs.current.toFixed(3)}<span className="ml-0.5 text-sm font-normal text-caption">A</span>
              </dd>
            </div>
          )}
          {typeof attrs.energy === 'number' && (
            <div>
              <dt className="text-xs text-caption">Total energy</dt>
              <dd className="mt-0.5 text-xl font-bold tabular-nums text-heading">
                {attrs.energy.toFixed(2)}<span className="ml-0.5 text-sm font-normal text-caption">kWh</span>
              </dd>
            </div>
          )}
          {typeof attrs.runtime_today === 'number' && (
            <div>
              <dt className="text-xs text-caption">Runtime today</dt>
              <dd className="mt-0.5 text-xl font-bold tabular-nums text-heading">
                {formatRuntime(attrs.runtime_today)}
              </dd>
            </div>
          )}
          {typeof attrs.runtime_month === 'number' && (
            <div>
              <dt className="text-xs text-caption">Runtime this month</dt>
              <dd className="mt-0.5 text-xl font-bold tabular-nums text-heading">
                {formatRuntime(attrs.runtime_month)}
              </dd>
            </div>
          )}
        </dl>
      </div>
    </section>
  )
}

// ── Kasa device info section ───────────────────────────────────────────────────

function KasaDeviceInfo({ device }: { device: KasaDevice }) {
  const signal = rssiLabel(device.rssi)

  const rows: { label: string; value: string | null | undefined }[] = [
    { label: 'Model', value: device.model },
    { label: 'Firmware', value: device.firmware },
    { label: 'Hardware', value: device.hardware },
    { label: 'IP address', value: device.ip_address },
    { label: 'MAC address', value: device.id },
  ]

  return (
    <section aria-labelledby="kasa-info-heading">
      <div className="card rounded-xl border p-5">
        <h2 id="kasa-info-heading" className="mb-4 text-sm font-semibold text-heading">
          Device info
        </h2>
        <dl className="divide-y divide-[var(--border-secondary)]">
          {rows.map(({ label, value }) =>
            value ? (
              <div key={label} className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0">
                <dt className="shrink-0 text-sm text-body">{label}</dt>
                <dd className="text-right text-sm font-medium tabular-nums text-heading">{value}</dd>
              </div>
            ) : null,
          )}
          {device.rssi !== null && (
            <div className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="shrink-0 text-sm text-body">Signal</dt>
              <dd className={cn('text-right text-sm font-medium', signal.color)}>
                {signal.text}
                <span className="ml-1.5 text-xs text-caption">({device.rssi} dBm)</span>
              </dd>
            </div>
          )}
          {device.last_seen && (
            <div className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="shrink-0 text-sm text-body">Last seen</dt>
              <dd className="text-right text-sm text-body">
                {new Date(device.last_seen).toLocaleString()}
              </dd>
            </div>
          )}
        </dl>
      </div>
    </section>
  )
}

// ── History chart panel ────────────────────────────────────────────────────────

function HistoryChart({
  source,
  deviceLabel,
  period,
}: {
  source: string
  deviceLabel: string
  period: Period
}) {
  const meta = getSourceMeta(source)
  const showRange = period === '7d' || period === '30d'

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'history', source, deviceLabel, period],
    queryFn: () => api.dashboard.getHistory(source, deviceLabel, period),
    staleTime: 60_000,
  })

  return (
    <div>
      <p className="mb-3 text-sm font-medium text-heading">{meta.chartTitle}</p>
      <TimeSeriesChart
        data={data?.data ?? []}
        label={meta.label}
        color={meta.color}
        unit={meta.unit}
        height={180}
        loading={isLoading}
        showRange={showRange}
        emptyMessage="No data recorded for this period."
      />
    </div>
  )
}

// ── Period selector tabs ───────────────────────────────────────────────────────

const PERIODS: { value: Period; label: string }[] = [
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
]

function PeriodTabs({ value, onChange }: { value: Period; onChange: (period: Period) => void }) {
  return (
    <div className="flex gap-1" role="tablist" aria-label="Select history time period">
      {PERIODS.map(p => (
        <FilterChip
          key={p.value}
          label={p.label}
          active={value === p.value}
          onClick={() => onChange(p.value)}
        />
      ))}
    </div>
  )
}

// ── All attributes collapsible ────────────────────────────────────────────────

function AllAttributesSection({ attributeEntries }: { attributeEntries: [string, unknown][] }) {
  const [isOpen, setIsOpen] = useState(false)
  if (attributeEntries.length === 0) return null

  return (
    <section>
      <Accordion
        id="all-attributes"
        title="All attributes"
        open={isOpen}
        onToggle={() => setIsOpen(prev => !prev)}
      >
        <dl className="divide-y divide-[var(--border-secondary)]">
          {attributeEntries.map(([key, value]) => {
            const highlighted = isHighlightedAttribute(key)
            const unit = attributeUnit(key)
            const formatted = formatAttributeValue(value)
            return (
              <div key={key} className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0">
                <dt className="shrink-0 text-sm text-body capitalize">{key.replace(/_/g, ' ')}</dt>
                <dd className={cn('text-right text-sm tabular-nums', highlighted ? 'font-semibold text-heading' : 'text-body')}>
                  {formatted}
                  {unit && <span className="ml-0.5 text-xs text-caption">{unit}</span>}
                </dd>
              </div>
            )
          })}
        </dl>
      </Accordion>
    </section>
  )
}

// ── Kasa device detail view ───────────────────────────────────────────────────

function KasaDeviceDetail({ id }: { id: string }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [period, setPeriod] = useState<Period>('24h')
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')

  const {
    data: device,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['kasa', 'device', id],
    queryFn: () => api.kasa.getDevice(id),
    staleTime: 30_000,
  })

  const { data: health } = useQuery({
    queryKey: ['device', 'health', 'kasa', id],
    queryFn: () => api.devices.getHealth('kasa', id),
    staleTime: 30_000,
  })

  const isDeactivated = device?.active === false || !!health?.deactivatedAt

  const reactivateMutation = useMutation({
    mutationFn: () => api.devices.reactivate('kasa', id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kasa'] })
      queryClient.invalidateQueries({ queryKey: ['device', 'health', 'kasa', id] })
      queryClient.invalidateQueries({ queryKey: ['devices', 'deactivated'] })
      toast({ message: 'Device reactivated successfully' })
    },
    onError: () => toast({ message: 'Device is still unreachable. Check the physical connection.', type: 'error' }),
  })

  const deactivateMutation = useMutation({
    mutationFn: () => api.devices.deactivate('kasa', id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kasa'] })
      queryClient.invalidateQueries({ queryKey: ['device', 'health', 'kasa', id] })
      queryClient.invalidateQueries({ queryKey: ['devices', 'deactivated'] })
      toast({ message: 'Device deactivated. It will be skipped in scenes and automations.' })
    },
    onError: () => toast({ message: 'Failed to deactivate device', type: 'error' }),
  })

  const toggleMutation = useMutation({
    mutationFn: () => {
      const isOn = device?.attributes.switch === 'on'
      return api.kasa.sendCommand(id, isOn ? 'off' : 'on')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kasa', 'device', id] })
      queryClient.invalidateQueries({ queryKey: ['kasa', 'devices'] })
      toast({ message: `${device?.label ?? 'Device'} toggled` })
    },
    onError: () => toast({ message: `Failed to control ${device?.label ?? 'device'}`, type: 'error' }),
  })

  const renameMutation = useMutation({
    mutationFn: (label: string) => api.kasa.renameDevice(id, label),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kasa'] })
      setIsRenaming(false)
      toast({ message: 'Device renamed' })
    },
    onError: () => toast({ message: 'Failed to rename device', type: 'error' }),
  })

  const [roomDropdownOpen, setRoomDropdownOpen] = useState(false)
  const roomDropdownRef = useRef<HTMLDivElement>(null)

  // Fetch rooms and device-room assignments
  const { data: rooms } = useQuery({ queryKey: ['rooms'], queryFn: api.rooms.getAll })
  const { data: allDeviceRooms } = useQuery({
    queryKey: ['hubitat', 'device-rooms'],
    queryFn: api.hubitat.getDeviceRooms,
  })
  const deviceRoom = allDeviceRooms?.find(a => a.device_id === id)

  // Fetch parent strip label for child sockets
  const { data: parentDevice } = useQuery({
    queryKey: ['kasa', 'device', device?.parent_id],
    queryFn: () => api.kasa.getDevice(device!.parent_id!),
    enabled: !!device?.parent_id,
    staleTime: 60_000,
  })

  const assignRoomMutation = useMutation({
    mutationFn: (roomName: string) =>
      api.hubitat.assignDevice({ device_id: id, device_label: device?.label ?? '', device_type: 'kasa_' + (device?.device_type ?? 'plug'), room_name: roomName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubitat', 'device-rooms'] })
      setRoomDropdownOpen(false)
      toast({ message: 'Assigned to room' })
    },
    onError: () => toast({ message: 'Failed to assign', type: 'error' }),
  })

  useEffect(() => {
    if (!roomDropdownOpen) return
    function handleClick(e: MouseEvent) {
      if (roomDropdownRef.current && !roomDropdownRef.current.contains(e.target as Node)) setRoomDropdownOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [roomDropdownOpen])
  const isKeepOn = !!deviceRoom?.config?.exclude_from_all_off

  const toggleKeepOn = useMutation({
    mutationFn: () =>
      api.hubitat.updateDeviceConfig(id, deviceRoom!.room_name, { exclude_from_all_off: !isKeepOn }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubitat', 'device-rooms'] })
      toast({ message: isKeepOn ? `${device?.label} will now turn off with All Off` : `${device?.label} will stay on during All Off` })
    },
    onError: () => toast({ message: 'Failed to update setting', type: 'error' }),
  })

  if (isLoading) {
    return <PageSkeleton />
  }

  if (isError) {
    return (
      <div>
        <BackLink to="/devices" label="All Devices" />
        <div className="card rounded-xl border p-5" role="alert" aria-live="assertive">
          <p className="text-sm text-red-400">
            Could not load device details. The device may be offline or unreachable.
          </p>
          <Link
            to="/devices"
            className="mt-4 inline-block rounded-lg bg-fairy-500/15 px-4 py-2 text-sm font-medium text-fairy-400 transition-colors hover:bg-fairy-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            All Devices
          </Link>
        </div>
      </div>
    )
  }

  if (!device) {
    return (
      <div>
        <BackLink to="/devices" label="All Devices" />
        <div className="card rounded-xl border p-5" role="alert" aria-live="assertive">
          <p className="text-sm text-body">Device not found.</p>
          <Link
            to="/devices"
            className="mt-4 inline-block rounded-lg bg-fairy-500/15 px-4 py-2 text-sm font-medium text-fairy-400 transition-colors hover:bg-fairy-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            All Devices
          </Link>
        </div>
      </div>
    )
  }

  const isOn = device.attributes.switch === 'on'
  // History sources: power and energy for emeter devices
  const historySources: string[] = []
  if (device.has_emeter) {
    historySources.push('power', 'energy')
  }

  const attributeEntries = Object.entries(device.attributes) as [string, unknown][]

  return (
    <div className="space-y-6">
      {/* ── 1. Header ────────────────────────────────────────────────────── */}
      <header>
        <BackLink to="/devices" label="All Devices" />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {isRenaming ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  const trimmed = renameValue.trim()
                  if (trimmed && trimmed !== device.label) {
                    renameMutation.mutate(trimmed)
                  } else {
                    setIsRenaming(false)
                  }
                }}
              >
                <input
                  autoFocus
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xl font-semibold text-heading focus:border-fairy-500 focus:outline-none"
                  aria-label="Device name"
                />
                <button
                  type="submit"
                  disabled={renameMutation.isPending}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-emerald-400 transition-colors hover:bg-emerald-500/15"
                  aria-label="Save name"
                >
                  <Check className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsRenaming(false)}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-body transition-colors hover:bg-white/5"
                  aria-label="Cancel rename"
                >
                  <X className="h-5 w-5" />
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-heading text-xl font-semibold">{device.label}</h1>
                <button
                  onClick={() => { setRenameValue(device.label); setIsRenaming(true) }}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-caption transition-colors hover:text-heading hover:bg-white/5"
                  aria-label="Rename device"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
            )}
            {parentDevice && (
              <p className="mt-1 text-xs text-caption">
                on{' '}
                <Link
                  to={`/devices/kasa/${encodeURIComponent(device.parent_id!)}`}
                  className="text-fairy-400 hover:text-fairy-300 transition-colors"
                >
                  {parentDevice.label}
                </Link>
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <TypeBadge type={device.device_type} />
              {isDeactivated && <StatusBadge status="deactivated" />}
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  device.is_online
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-slate-500/15 text-slate-400',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    device.is_online ? 'bg-emerald-400' : 'bg-slate-500',
                  )}
                  aria-hidden="true"
                />
                {device.is_online ? 'Online' : 'Offline'}
              </span>
              <div ref={roomDropdownRef} className="relative inline-flex">
                <button
                  onClick={() => setRoomDropdownOpen(!roomDropdownOpen)}
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors',
                    deviceRoom
                      ? 'bg-fairy-500/10 text-fairy-400 hover:bg-fairy-500/20'
                      : 'border border-dashed border-[var(--border-secondary)] text-caption hover:border-fairy-500/40 hover:text-fairy-400',
                  )}
                  aria-label={deviceRoom ? `Change room for ${device.label} (currently ${deviceRoom.room_name})` : `Assign ${device.label} to a room`}
                >
                  {deviceRoom?.room_name ?? 'Assign room'}
                </button>
                {roomDropdownOpen && rooms && rooms.length > 0 && (
                  <div className="absolute left-0 top-full z-20 mt-1 max-h-48 w-40 overflow-y-auto rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-primary)] shadow-lg">
                    {rooms.map(room => (
                      <button
                        key={room.name}
                        onClick={() => assignRoomMutation.mutate(room.name)}
                        disabled={assignRoomMutation.isPending || room.name === deviceRoom?.room_name}
                        className={cn(
                          'flex w-full min-h-[36px] items-center px-3 py-1.5 text-left text-xs transition-colors',
                          room.name === deviceRoom?.room_name
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
              {deviceRoom && (
                <button
                  onClick={() => toggleKeepOn.mutate()}
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
            </div>
          </div>

          {/* Toggle button */}
          <button
            onClick={() => toggleMutation.mutate()}
            disabled={toggleMutation.isPending || !device.is_online || isDeactivated}
            className={cn(
              'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              (!device.is_online || isDeactivated) && 'cursor-not-allowed opacity-40',
              !isDeactivated && isOn && device.is_online
                ? 'bg-fairy-500/15 text-fairy-400 hover:bg-fairy-500/25'
                : 'surface text-body hover:text-heading',
            )}
            aria-label={
              isDeactivated
                ? `${device.label} is deactivated`
                : !device.is_online
                  ? `${device.label} is offline`
                  : `Turn ${device.label} ${isOn ? 'off' : 'on'}`
            }
          >
            <Power className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* ── 2. Deactivation banner ──────────────────────────────────────── */}
      {isDeactivated && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
            <p className="text-heading text-sm font-medium">
              This device is deactivated
            </p>
          </div>
          <p className="text-caption text-xs mb-3">
            It was not responding to commands and will be skipped in scenes and automations.
            {health?.lastFailureReason && ` Last error: ${health.lastFailureReason}`}
          </p>
          <button
            onClick={() => reactivateMutation.mutate()}
            disabled={reactivateMutation.isPending}
            className="rounded-lg bg-amber-500/15 px-4 py-2 text-sm font-medium text-amber-400 hover:bg-amber-500/25 transition-colors min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
          >
            {reactivateMutation.isPending ? 'Reactivating...' : 'Reactivate this device'}
          </button>
        </div>
      )}

      {/* ── 3. Kasa at-a-glance ────────────────────────────────────────── */}
      <KasaAtAGlance device={device} />

      {/* ── 3. History charts ─────────────────────────────────────────────── */}
      {historySources.length > 0 && (
        <section aria-labelledby="history-heading">
          <div className="card rounded-xl border p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 id="history-heading" className="text-sm font-semibold text-heading">
                History
              </h2>
              <PeriodTabs value={period} onChange={setPeriod} />
            </div>
            <div className="space-y-8">
              {historySources.map(s => (
                <HistoryChart
                  key={s}
                  source={s}
                  deviceLabel={device.label}
                  period={period}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── 4. Child sockets (strip) ────────────────────────────────────── */}
      {device.children && device.children.length > 0 && (
        <section aria-labelledby="sockets-heading">
          <div className="card rounded-xl border p-5">
            <h2 id="sockets-heading" className="mb-4 text-sm font-semibold text-heading">
              Sockets
            </h2>
            <ul className="divide-y divide-[var(--border-secondary)]" role="list">
              {device.children.map(child => {
                const childOn = child.attributes.switch === 'on'
                const childPower = child.attributes.power
                return (
                  <li key={child.id}>
                    <Link
                      to={`/devices/kasa/${encodeURIComponent(child.id)}`}
                      className={cn(
                        'flex min-h-[44px] items-center gap-3 rounded-lg px-2 -mx-2 py-2',
                        'text-sm transition-colors hover:bg-fairy-500/10',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                      )}
                    >
                      <span
                        className={cn(
                          'h-2 w-2 shrink-0 rounded-full',
                          childOn ? 'bg-emerald-400' : 'bg-slate-500',
                        )}
                        aria-hidden="true"
                      />
                      <span className="flex-1 text-body">{child.label}</span>
                      {childOn && typeof childPower === 'number' && (
                        <span className="text-xs tabular-nums text-caption">{childPower.toFixed(1)} W</span>
                      )}
                      <TypeBadge type="socket" />
                      <ChevronRight className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>
      )}

      {/* ── 5. Device info ──────────────────────────────────────────────── */}
      <KasaDeviceInfo device={device} />

      {/* ── 6. All attributes (collapsed by default) ────────────────────── */}
      <AllAttributesSection attributeEntries={attributeEntries} />

      {/* ── 7. Device management ──────────────────────────────────────────── */}
      {!isDeactivated && (
        <section aria-labelledby="kasa-management-heading">
          <div className="card rounded-xl border p-5">
            <h2 id="kasa-management-heading" className="mb-4 text-sm font-semibold text-heading">
              Device management
            </h2>
            <button
              onClick={() => deactivateMutation.mutate()}
              disabled={deactivateMutation.isPending}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:bg-slate-800 transition-colors min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
            >
              {deactivateMutation.isPending ? 'Deactivating...' : 'Deactivate device'}
            </button>
            <p className="mt-2 text-xs text-caption">
              Deactivated devices are skipped in scenes and automations. You can reactivate at any time.
            </p>
          </div>
        </section>
      )}
    </div>
  )
}

// ── Hub device detail view ────────────────────────────────────────────────────

function HubDeviceDetail({ id }: { id: string }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [period, setPeriod] = useState<Period>('24h')
  const [hubRoomDropdownOpen, setHubRoomDropdownOpen] = useState(false)
  const hubRoomDropdownRef = useRef<HTMLDivElement>(null)

  // Fetch all hub devices and find the one matching :id
  const {
    data: devices,
    isLoading: devicesLoading,
    isError: devicesError,
  } = useQuery({
    queryKey: ['hubitat', 'devices'],
    queryFn: api.hubitat.getDevices,
    staleTime: 60_000,
  })

  const device = devices?.find(d => String(d.id) === id)

  const {
    data: context,
    isLoading: contextLoading,
    isError: contextError,
  } = useQuery({
    queryKey: ['dashboard', 'device-context', id],
    queryFn: () => api.dashboard.getDeviceContext(id),
    enabled: !!device,
    staleTime: 60_000,
  })

  const {
    data: deviceInsights,
    isLoading: insightsLoading,
  } = useQuery({
    queryKey: ['dashboard', 'device', id, 'insights'],
    queryFn: () => api.dashboard.getDeviceInsights(id),
    enabled: !!device,
    staleTime: 60_000,
  })

  // Keep On config
  const { data: allDeviceRooms } = useQuery({
    queryKey: ['hubitat', 'device-rooms'],
    queryFn: api.hubitat.getDeviceRooms,
  })
  const deviceRoom = allDeviceRooms?.find(a => a.device_id === id)
  const isKeepOn = !!deviceRoom?.config?.exclude_from_all_off
  const canKeepOn = device && ['switch', 'dimmer'].includes(device.device_type) && !!deviceRoom

  const toggleKeepOn = useMutation({
    mutationFn: () =>
      api.hubitat.updateDeviceConfig(id, deviceRoom!.room_name, { exclude_from_all_off: !isKeepOn }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubitat', 'device-rooms'] })
      toast({ message: isKeepOn ? `${device?.label} will now turn off with All Off` : `${device?.label} will stay on during All Off` })
    },
    onError: () => toast({ message: 'Failed to update setting', type: 'error' }),
  })

  // Room assignment
  const { data: rooms } = useQuery({ queryKey: ['rooms'], queryFn: api.rooms.getAll })

  const assignHubRoomMutation = useMutation({
    mutationFn: (roomName: string) =>
      api.hubitat.assignDevice({ device_id: id, device_label: device?.label ?? '', device_type: device?.device_type ?? 'switch', room_name: roomName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubitat', 'device-rooms'] })
      setHubRoomDropdownOpen(false)
      toast({ message: 'Assigned to room' })
    },
    onError: () => toast({ message: 'Failed to assign', type: 'error' }),
  })

  // Health / deactivation
  const { data: health } = useQuery({
    queryKey: ['device', 'health', 'hub', id],
    queryFn: () => api.devices.getHealth('hub', id),
    staleTime: 30_000,
  })

  const isDeactivated = device?.active === false || !!health?.deactivatedAt

  const reactivateMutation = useMutation({
    mutationFn: () => api.devices.reactivate('hub', id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubitat'] })
      queryClient.invalidateQueries({ queryKey: ['device', 'health', 'hub', id] })
      queryClient.invalidateQueries({ queryKey: ['devices', 'deactivated'] })
      toast({ message: 'Device reactivated successfully' })
    },
    onError: () => toast({ message: 'Device is still unreachable. Check the physical connection.', type: 'error' }),
  })

  const deactivateMutation = useMutation({
    mutationFn: () => api.devices.deactivate('hub', id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubitat'] })
      queryClient.invalidateQueries({ queryKey: ['device', 'health', 'hub', id] })
      queryClient.invalidateQueries({ queryKey: ['devices', 'deactivated'] })
      toast({ message: 'Device deactivated. It will be skipped in scenes and automations.' })
    },
    onError: () => toast({ message: 'Failed to deactivate device', type: 'error' }),
  })

  useEffect(() => {
    if (!hubRoomDropdownOpen) return
    function handleClick(e: MouseEvent) {
      if (hubRoomDropdownRef.current && !hubRoomDropdownRef.current.contains(e.target as Node)) setHubRoomDropdownOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [hubRoomDropdownOpen])

  const isLoading = devicesLoading || (!!device && (contextLoading || insightsLoading))
  const isError = devicesError || contextError

  // ── Loading state ───────────────────────────────────────────────────────

  if (isLoading) {
    return <PageSkeleton />
  }

  // ── Error state ─────────────────────────────────────────────────────────

  if (isError) {
    return (
      <div>
        <BackLink to="/devices" label="All Devices" />

        <div
          className="card rounded-xl border p-5"
          role="alert"
          aria-live="assertive"
        >
          <p className="text-sm text-red-400">
            Could not load device details. The device may be offline.
          </p>
          <Link
            to="/devices"
            className="mt-4 inline-block rounded-lg bg-fairy-500/15 px-4 py-2 text-sm font-medium text-fairy-400 transition-colors hover:bg-fairy-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            All Devices
          </Link>
        </div>
      </div>
    )
  }

  // ── Device not found ────────────────────────────────────────────────────

  if (!device) {
    return (
      <div>
        <BackLink to="/devices" label="All Devices" />

        <div
          className="card rounded-xl border p-5"
          role="alert"
          aria-live="assertive"
        >
          <p className="text-sm text-body">Device not found.</p>
          <Link
            to="/devices"
            className="mt-4 inline-block rounded-lg bg-fairy-500/15 px-4 py-2 text-sm font-medium text-fairy-400 transition-colors hover:bg-fairy-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            All Devices
          </Link>
        </div>
      </div>
    )
  }

  // ── Success state ───────────────────────────────────────────────────────

  const attributes = device.attributes ?? {}
  const attributeEntries = Object.entries(attributes)

  const historySources = context?.historySources ?? []
  const roomDevices = deviceInsights?.roomDevices ?? []

  return (
    <div className="space-y-6">
      {/* ── 1. Header ────────────────────────────────────────────────────── */}
      <header>
        <BackLink to="/devices" label="All Devices" />

        <h1 className="text-heading text-xl font-semibold">{device.label}</h1>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <TypeBadge type={device.device_type} />
          {isDeactivated && <StatusBadge status="deactivated" />}
          {device.device_name && device.device_name !== device.label && (
            <span className="text-xs text-caption">{device.device_name}</span>
          )}
          <div ref={hubRoomDropdownRef} className="relative inline-flex">
            <button
              onClick={() => setHubRoomDropdownOpen(!hubRoomDropdownOpen)}
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors',
                deviceRoom
                  ? 'bg-fairy-500/10 text-fairy-400 hover:bg-fairy-500/20'
                  : 'border border-dashed border-[var(--border-secondary)] text-caption hover:border-fairy-500/40 hover:text-fairy-400',
              )}
              aria-label={deviceRoom ? `Change room for ${device.label} (currently ${deviceRoom.room_name})` : `Assign ${device.label} to a room`}
            >
              {deviceRoom?.room_name ?? 'Assign room'}
            </button>
            {hubRoomDropdownOpen && rooms && rooms.length > 0 && (
              <div className="absolute left-0 top-full z-20 mt-1 max-h-48 w-40 overflow-y-auto rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-primary)] shadow-lg">
                {rooms.map(room => (
                  <button
                    key={room.name}
                    onClick={() => assignHubRoomMutation.mutate(room.name)}
                    disabled={assignHubRoomMutation.isPending || room.name === deviceRoom?.room_name}
                    className={cn(
                      'flex w-full min-h-[36px] items-center px-3 py-1.5 text-left text-xs transition-colors',
                      room.name === deviceRoom?.room_name
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
          {canKeepOn && (
            <button
              onClick={() => toggleKeepOn.mutate()}
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
        </div>
      </header>

      {/* ── 2. Deactivation banner ──────────────────────────────────────── */}
      {isDeactivated && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
            <p className="text-heading text-sm font-medium">
              This device is deactivated
            </p>
          </div>
          <p className="text-caption text-xs mb-3">
            It was not responding to commands and will be skipped in scenes and automations.
            {health?.lastFailureReason && ` Last error: ${health.lastFailureReason}`}
          </p>
          <button
            onClick={() => reactivateMutation.mutate()}
            disabled={reactivateMutation.isPending}
            className="rounded-lg bg-amber-500/15 px-4 py-2 text-sm font-medium text-amber-400 hover:bg-amber-500/25 transition-colors min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
          >
            {reactivateMutation.isPending ? 'Reactivating...' : 'Reactivate this device'}
          </button>
        </div>
      )}

      {/* ── 3. Headline insights ──────────────────────────────────────────── */}
      <HeadlineInsights deviceInsights={deviceInsights} />

      {/* ── 3. History charts ─────────────────────────────────────────────── */}
      <section aria-labelledby="history-heading">
        <div className="card rounded-xl border p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2
              id="history-heading"
              className="text-sm font-semibold text-heading"
            >
              History
            </h2>

            {historySources.length > 0 && (
              <PeriodTabs value={period} onChange={setPeriod} />
            )}
          </div>

          {historySources.length > 0 ? (
            <div className="space-y-8">
              {historySources.map(s => (
                <HistoryChart
                  key={s.source}
                  source={s.source}
                  deviceLabel={device.label}
                  period={period}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-caption">
              No historical data yet. Data collection starts automatically
              and trends will appear within a few hours.
            </p>
          )}
        </div>
      </section>

      {/* ── 4. Room and scene context ─────────────────────────────────────── */}
      {context && (
        <section aria-labelledby="context-heading">
          <div className="card rounded-xl border p-5">
            <h2
              id="context-heading"
              className="mb-4 text-sm font-semibold text-heading"
            >
              Rooms and scenes
            </h2>

            <div className="space-y-4">
              {/* Rooms */}
              {context.rooms.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-medium text-caption">
                    Assigned to{' '}
                    {context.rooms.length === 1
                      ? '1 room'
                      : `${context.rooms.length} rooms`}
                  </p>
                  <ul className="space-y-1" role="list">
                    {context.rooms.map(r => {
                      const hasConfig =
                        r.config && Object.keys(r.config).length > 0
                      return (
                        <li key={r.room_name}>
                          <Link
                            to={`/rooms/${encodeURIComponent(r.room_name)}`}
                            className={cn(
                              'flex min-h-[44px] items-center gap-2 rounded-lg px-2 -mx-2',
                              'text-sm text-fairy-400 transition-colors hover:bg-fairy-500/10',
                              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                            )}
                          >
                            <span className="flex-1">{r.room_name}</span>
                            {hasConfig &&
                              !!(r.config as Record<string, unknown>).exclude_from_all_off && (
                                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                                  Keep on
                                </span>
                              )}
                            <ChevronRight
                              className="h-4 w-4 shrink-0 opacity-50"
                              aria-hidden="true"
                            />
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-caption">
                  Not assigned to any room.{' '}
                  <Link
                    to="/rooms"
                    className="text-fairy-400 underline underline-offset-2 hover:text-fairy-300 focus-visible:outline-2 focus-visible:outline-fairy-500"
                  >
                    Manage rooms
                  </Link>
                </p>
              )}

              {/* Scenes */}
              {context.scenes.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-medium text-caption">
                    Used in{' '}
                    {context.scenes.length === 1
                      ? '1 scene'
                      : `${context.scenes.length} scenes`}
                  </p>
                  <ul className="space-y-1" role="list">
                    {context.scenes.map(sceneName => (
                      <li key={sceneName}>
                        <Link
                          to={`/scenes/${encodeURIComponent(sceneName)}`}
                          className={cn(
                            'flex min-h-[44px] items-center gap-2 rounded-lg px-2 -mx-2',
                            'text-sm text-fairy-400 transition-colors hover:bg-fairy-500/10',
                            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                          )}
                        >
                          <span className="flex-1">{sceneName}</span>
                          <ChevronRight
                            className="h-4 w-4 shrink-0 opacity-50"
                            aria-hidden="true"
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-caption">
                  Not used in any scenes.
                </p>
              )}

              {/* Other devices in this room */}
              {roomDevices.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-caption">
                    Other devices in this room
                  </p>
                  <ul className="space-y-1" role="list">
                    {roomDevices.map(d => (
                      <li key={d.id}>
                        <Link
                          to={`/devices/${d.id}`}
                          className={cn(
                            'flex min-h-[44px] items-center gap-2 rounded-lg px-2 -mx-2',
                            'text-sm text-fairy-400 transition-colors hover:bg-fairy-500/10',
                            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                          )}
                        >
                          <span className="flex-1">{d.label}</span>
                          <span className="shrink-0 rounded-full bg-slate-500/15 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                            {d.device_type}
                          </span>
                          <ChevronRight
                            className="h-4 w-4 shrink-0 opacity-50"
                            aria-hidden="true"
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}


            </div>
          </div>
        </section>
      )}

      {/* ── 5. All attributes (collapsed by default) ─────────────────────── */}
      <AllAttributesSection attributeEntries={attributeEntries} />

      {/* ── 6. Device management ──────────────────────────────────────────── */}
      {!isDeactivated && (
        <section aria-labelledby="hub-management-heading">
          <div className="card rounded-xl border p-5">
            <h2 id="hub-management-heading" className="mb-4 text-sm font-semibold text-heading">
              Device management
            </h2>
            <button
              onClick={() => deactivateMutation.mutate()}
              disabled={deactivateMutation.isPending}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:bg-slate-800 transition-colors min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
            >
              {deactivateMutation.isPending ? 'Deactivating...' : 'Deactivate device'}
            </button>
            <p className="mt-2 text-xs text-caption">
              Deactivated devices are skipped in scenes and automations. You can reactivate at any time.
            </p>
          </div>
        </section>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const isKasaRoute = useMatch('/devices/kasa/:id')

  if (!id) return null

  if (isKasaRoute) {
    return (
      <div>
        <KasaDeviceDetail id={decodeURIComponent(id)} />
      </div>
    )
  }

  return (
    <div>
      <HubDeviceDetail id={id} />
    </div>
  )
}
