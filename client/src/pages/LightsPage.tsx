import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  RefreshCw,
  Power,
  Wifi,
  WifiOff,
  Zap,
  ChevronDown,
  ChevronUp,
  Search,
  Info,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { Light } from '@/lib/api'
import { cn, getLightColorHex } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { EmptyState } from '@/components/ui/EmptyState'
import { BackLink } from '@/components/ui/BackLink'

// ── Expandable light card ────────────────────────────────────────────────────

function LightRow({ light }: { light: Light }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [expanded, setExpanded] = useState(false)
  const [brightness, setBrightness] = useState(Math.round(light.brightness * 100))

  const isOn = light.power === 'on'
  const colorHex = getLightColorHex(light)

  const toggleMutation = useMutation({
    mutationFn: () => api.lifx.toggle(`id:${light.id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lifx', 'lights'] }),
    onError: () => toast({ message: 'Failed to toggle light', type: 'error' }),
  })

  const identifyMutation = useMutation({
    mutationFn: () => api.lifx.identify(`id:${light.id}`),
  })

  const setStateMutation = useMutation({
    mutationFn: (b: number) =>
      api.lifx.setState(`id:${light.id}`, { brightness: b / 100, duration: 0.3 }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lifx', 'lights'] }),
  })

  const handleBrightnessCommit = () => {
    setStateMutation.mutate(brightness)
  }

  return (
    <div className="card rounded-xl border transition-colors">
      {/* Main row */}
      <div className="flex items-center gap-3 p-4">
        {/* Colour dot */}
        <div
          className={cn('h-5 w-5 shrink-0 rounded-full', !isOn && 'opacity-30')}
          style={{ backgroundColor: isOn ? colorHex : '#475569' }}
          aria-hidden="true"
        />

        {/* Label + meta */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        >
          <p
            className={cn(
              'break-words text-sm font-medium',
              isOn ? 'text-heading' : 'text-body',
            )}
          >
            {light.label}
          </p>
          <p className="text-caption mt-0.5 break-words text-xs">
            {light.group.name}
            {isOn && ` \u00B7 ${Math.round(light.brightness * 100)}%`}
          </p>
        </button>

        {/* Connection */}
        <span title={light.connected ? 'Connected' : 'Disconnected'} aria-label={light.connected ? 'Connected' : 'Disconnected'} role="img">
          {light.connected ? (
            <Wifi className="h-3.5 w-3.5 text-fairy-500" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-red-400" />
          )}
        </span>

        {/* Identify */}
        <button
          onClick={() => identifyMutation.mutate()}
          className="text-body flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-tertiary)] hover:text-fairy-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          aria-label={`Identify ${light.label}`}
          title="Flash this light"
        >
          <Zap className="h-4 w-4" />
        </button>

        {/* Power */}
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

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-caption flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors hover:text-[var(--text-secondary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          aria-label={expanded ? `Collapse ${light.label} controls` : `Expand ${light.label} controls`}
        >
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Expanded controls */}
      {expanded && isOn && (
        <div className="border-t px-4 py-3">
          <label className="text-body mb-2 flex items-center justify-between text-xs font-medium">
            <span>Brightness</span>
            <span className="text-heading">{brightness}%</span>
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={brightness}
            onChange={e => setBrightness(Number(e.target.value))}
            onPointerUp={handleBrightnessCommit}
            onKeyUp={e => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                handleBrightnessCommit()
              }
            }}
            className="h-11 w-full cursor-pointer appearance-none rounded-lg"
            style={{
              background: `linear-gradient(to right, var(--bg-primary), ${colorHex})`,
            }}
            aria-label={`Brightness for ${light.label}`}
          />

          {/* Colour info */}
          <div className="text-caption mt-2 flex items-center gap-2 text-xs">
            <div
              className="h-4 w-4 rounded-full border"
              style={{ backgroundColor: colorHex, borderColor: 'var(--border-secondary)' }}
            />
            {light.product.capabilities.has_color ? (
              <span>
                H:{Math.round(light.color.hue)}\u00B0 S:
                {Math.round(light.color.saturation * 100)}%
              </span>
            ) : (
              <span>{light.color.kelvin}K</span>
            )}
            <span style={{ color: 'var(--border-secondary)' }}>\u00B7</span>
            <span>{light.product.name}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Lights page ──────────────────────────────────────────────────────────────

export default function LightsPage() {
  const queryClient = useQueryClient()
  const [groupFilter, setGroupFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  const {
    data: lights,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ['lifx', 'lights'],
    queryFn: api.lifx.getLights,
  })

  const groups = Array.from(
    new Set(lights?.map(l => l.group.name) ?? []),
  ).sort()

  // Filter by group and search
  const filteredLights = useMemo(() => {
    let result = lights ?? []
    if (groupFilter !== 'all') {
      result = result.filter(l => l.group.name === groupFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        l =>
          (l.label ?? '').toLowerCase().includes(q) ||
          (l.group?.name ?? '').toLowerCase().includes(q),
      )
    }
    return result
  }, [lights, groupFilter, search])

  return (
    <div>
      <BackLink to="/devices" label="Devices" className="mb-3" />
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-body text-sm font-medium">LIFX Lights</h2>
        <div className="flex items-center gap-2">
          {/* Group filter */}
          {groups.length > 1 && (
            <select
              value={groupFilter}
              onChange={e => setGroupFilter(e.target.value)}
              className="input-field h-10 rounded-lg border px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
              aria-label="Filter by group"
            >
              <option value="all">All groups</option>
              {groups.map(g => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          )}

          {/* Refresh */}
          <button
            onClick={() =>
              queryClient.invalidateQueries({ queryKey: ['lifx', 'lights'] })
            }
            disabled={isFetching}
            className={cn(
              'surface text-heading flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:brightness-95 dark:hover:brightness-110',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              isFetching && 'opacity-60',
            )}
          >
            <RefreshCw
              className={cn('h-4 w-4', isFetching && 'animate-spin')}
            />
            Refresh
          </button>
        </div>
      </div>

      {/* Admin note */}
      <div className="card text-body mb-4 flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs">
        <Info className="text-caption h-3.5 w-3.5 shrink-0" />
        <p>
          Manage light assignments in{' '}
          <Link
            to="/rooms"
            className="text-fairy-400 underline-offset-2 hover:underline"
          >
            Room settings
          </Link>
          . This page is for direct light control.
        </p>
      </div>

      {/* Search input */}
      <div className="relative mb-4">
        <Search className="text-caption absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        <input
          type="search"
          aria-label="Search lights by name or group"
          placeholder="Search by light name or group..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-field h-11 w-full rounded-lg border pl-10 pr-3 text-sm placeholder:text-[var(--text-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="surface h-16 animate-pulse rounded-xl"
            />
          ))}
        </div>
      ) : filteredLights.length > 0 ? (
        <>
          {(search.trim() || groupFilter !== 'all') && lights && (
            <p className="text-caption mb-3 text-xs">
              Showing {filteredLights.length} of {lights.length} light{lights.length !== 1 ? 's' : ''}
            </p>
          )}
          <div className="space-y-3">
            {filteredLights.map(light => (
              <LightRow key={light.id} light={light} />
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          icon={Search}
          message={
            search.trim() || groupFilter !== 'all'
              ? 'No lights match the current filter.'
              : 'No LIFX lights found.'
          }
          sub={
            search.trim() || groupFilter !== 'all'
              ? undefined
              : 'Make sure your lights are powered on and connected to the network.'
          }
        >
          {(search.trim() || groupFilter !== 'all') && (
            <button
              onClick={() => {
                setSearch('')
                setGroupFilter('all')
              }}
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
