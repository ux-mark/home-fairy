import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Lightbulb, ToggleLeft, X, ArrowRight } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

const SWITCH_DEVICE_TYPES = ['switch', 'dimmer']

/**
 * DeviceOnboarding
 *
 * A notification banner that appears on the HomePage when there are
 * unassigned LIFX lights or Hubitat switches/dimmers. Helps users
 * discover new devices and assign them to rooms quickly.
 */
export default function DeviceOnboarding() {
  const [dismissed, setDismissed] = useState(false)

  const { data: allLights } = useQuery({
    queryKey: ['lifx', 'lights'],
    queryFn: api.lifx.getLights,
    staleTime: 60_000,
  })

  const { data: allAssignments } = useQuery({
    queryKey: ['lights', 'rooms'],
    queryFn: api.lights.getRoomAssignments,
    staleTime: 60_000,
  })

  const { data: allHubDevices } = useQuery({
    queryKey: ['hubitat', 'devices'],
    queryFn: api.hubitat.getDevices,
    staleTime: 60_000,
  })

  const { data: allDeviceRoomAssignments } = useQuery({
    queryKey: ['hubitat', 'device-rooms'],
    queryFn: api.hubitat.getDeviceRooms,
    staleTime: 60_000,
  })

  // Calculate unassigned lights
  const assignedLightIds = new Set(allAssignments?.map(a => a.light_id) ?? [])
  const unassignedLights = allLights?.filter(l => !assignedLightIds.has(l.id)) ?? []

  // Calculate unassigned switches/dimmers
  const assignedDeviceIds = new Set(
    allDeviceRoomAssignments?.map(a => a.device_id) ?? [],
  )
  const unassignedSwitches =
    allHubDevices?.filter(
      d =>
        SWITCH_DEVICE_TYPES.includes(d.device_type) &&
        !assignedDeviceIds.has(String(d.id)),
    ) ?? []

  const lightCount = unassignedLights.length
  const switchCount = unassignedSwitches.length
  const totalCount = lightCount + switchCount

  // Don't render if dismissed, still loading, or nothing to show
  const lightsReady = !!allLights && !!allAssignments
  const devicesReady = !!allHubDevices && !!allDeviceRoomAssignments
  if (dismissed || (!lightsReady && !devicesReady) || totalCount === 0) {
    return null
  }

  // Build a human-readable summary
  const parts: string[] = []
  if (lightCount > 0) parts.push(`${lightCount} light${lightCount !== 1 ? 's' : ''}`)
  if (switchCount > 0)
    parts.push(`${switchCount} switch${switchCount !== 1 ? 'es' : ''}`)
  const summary = parts.join(' and ')

  // Combine device names for preview pills
  const previewItems = [
    ...unassignedLights.slice(0, 3).map(l => ({ id: l.id, label: l.label, type: 'light' as const })),
    ...unassignedSwitches.slice(0, Math.max(0, 3 - unassignedLights.length)).map(d => ({
      id: String(d.id),
      label: d.label,
      type: 'switch' as const,
    })),
  ]

  return (
    <div
      className={cn(
        'mb-6 rounded-xl border border-fairy-500/30 bg-fairy-500/5 p-4',
        'transition-all duration-150',
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="flex shrink-0 gap-1.5">
          {lightCount > 0 && (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-fairy-500/15">
              <Lightbulb className="h-5 w-5 text-fairy-400" />
            </div>
          )}
          {switchCount > 0 && (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/15">
              <ToggleLeft className="h-5 w-5 text-blue-400" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-heading text-sm font-medium">
            {summary} not assigned to rooms
          </p>
          <p className="text-body mt-0.5 text-xs">
            Assign them to rooms so scenes and automation can control them.
          </p>

          {/* Quick list of unassigned device names (max 3) */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {previewItems.map(item => (
              <span
                key={item.id}
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-medium',
                  item.type === 'light'
                    ? 'surface text-body'
                    : 'bg-blue-500/10 text-blue-400',
                )}
              >
                {item.label}
              </span>
            ))}
            {totalCount > 3 && (
              <span className="surface text-caption rounded-full px-2 py-0.5 text-[10px] font-medium">
                +{totalCount - previewItems.length} more
              </span>
            )}
          </div>

          <Link
            to="/rooms"
            className={cn(
              'mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-fairy-500 px-4 py-2 text-sm font-medium text-white',
              'transition-colors hover:bg-fairy-600',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            )}
          >
            Assign to rooms
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <button
          onClick={() => setDismissed(true)}
          className={cn(
            'text-body min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg',
            'transition-colors hover:text-[var(--text-primary)]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
          aria-label="Dismiss notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
