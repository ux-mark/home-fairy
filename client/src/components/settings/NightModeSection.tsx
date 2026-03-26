import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Lock, Unlock } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { Section } from './Section'

export function NightModeSection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: rooms } = useQuery({
    queryKey: ['rooms'],
    queryFn: api.rooms.getAll,
  })

  const { data: prefs } = useQuery({
    queryKey: ['system', 'preferences'],
    queryFn: api.system.getPreferences,
  })

  const { data: system } = useQuery({
    queryKey: ['system', 'current'],
    queryFn: api.system.getCurrent,
  })

  const { data: nightStatus } = useQuery({
    queryKey: ['system', 'night-status'],
    queryFn: api.system.getNightStatus,
    refetchInterval: 10_000,
  })

  const mutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api.system.setPreference(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'preferences'] })
      toast({ message: 'Night mode settings saved' })
    },
    onError: () => toast({ message: 'Failed to save settings', type: 'error' }),
  })

  const unlockMutation = useMutation({
    mutationFn: api.system.unlockNight,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'night-status'] })
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      toast({ message: 'All rooms unlocked' })
    },
    onError: () => toast({ message: 'Failed to unlock rooms', type: 'error' }),
  })

  const nightExclude: string[] = (() => {
    try {
      return prefs?.night_exclude_rooms ? JSON.parse(prefs.night_exclude_rooms) : ['Bedroom']
    } catch { return ['Bedroom'] }
  })()

  const guestExclude: string[] = (() => {
    try {
      return prefs?.guest_night_exclude_rooms ? JSON.parse(prefs.guest_night_exclude_rooms) : ['Bedroom']
    } catch { return ['Bedroom'] }
  })()

  const wakeMode = prefs?.night_wake_mode || 'Morning'
  const allModes = system?.all_modes ?? []
  const roomNames = (rooms ?? []).sort((a, b) => a.display_order - b.display_order).map(r => r.name)

  const toggleRoom = (prefKey: string, current: string[], roomName: string) => {
    const next = current.includes(roomName)
      ? current.filter(r => r !== roomName)
      : [...current, roomName]
    mutation.mutate({ key: prefKey, value: JSON.stringify(next) })
  }

  return (
    <Section title="Night Mode">
      <div className="space-y-5">
        <p className="text-caption text-xs">
          Choose how the house behaves at bedtime. Nighttime turns off all lights and locks rooms until the wake mode is reached. Guest Night lets you go to bed while keeping rooms on for others.
        </p>

        {/* Wake mode selector */}
        <div>
          <label htmlFor="wake-mode-select" className="text-heading text-sm mb-1 block">
            Wake mode
          </label>
          <p className="text-caption text-xs mb-2">
            Rooms unlock when this mode is reached.
          </p>
          <select
            id="wake-mode-select"
            value={wakeMode}
            onChange={(e) => mutation.mutate({ key: 'night_wake_mode', value: e.target.value })}
            disabled={mutation.isPending}
            className={cn(
              'surface rounded-lg border border-[var(--border-primary)] px-3 py-2 text-sm text-heading',
              'min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500',
            )}
          >
            {allModes.map(mode => (
              <option key={mode} value={mode}>{mode}</option>
            ))}
          </select>
        </div>

        {/* Nighttime exclusions */}
        <div className="border-t border-[var(--border-secondary)] pt-5">
          <p className="text-heading text-sm mb-1">Nighttime -- rooms that respond to motion</p>
          <p className="text-caption text-xs mb-3">
            All lights turn off when you tap Nighttime, but these rooms stay unlocked and will respond to motion during the night with their Sleep Time scene.
          </p>
          <div className="flex flex-wrap gap-2">
            {roomNames.map(name => {
              const checked = nightExclude.includes(name)
              return (
                <button
                  key={name}
                  onClick={() => toggleRoom('night_exclude_rooms', nightExclude, name)}
                  disabled={mutation.isPending}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-medium transition-colors min-h-[44px]',
                    checked
                      ? 'bg-indigo-500/15 text-indigo-400 ring-1 ring-indigo-500/30'
                      : 'surface text-body hover:brightness-95 dark:hover:brightness-110',
                  )}
                >
                  {name}
                </button>
              )
            })}
          </div>
        </div>

        {/* Guest Night exclusions */}
        <div className="border-t border-[var(--border-secondary)] pt-5">
          <p className="text-heading text-sm mb-1">Guest Night -- rooms that stay on</p>
          <p className="text-caption text-xs mb-3">
            These rooms keep their lights on when you tap Guest Night -- for when the guest goes to bed but others are still up. All other rooms turn off and lock.
          </p>
          <div className="flex flex-wrap gap-2">
            {roomNames.map(name => {
              const checked = guestExclude.includes(name)
              return (
                <button
                  key={name}
                  onClick={() => toggleRoom('guest_night_exclude_rooms', guestExclude, name)}
                  disabled={mutation.isPending}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-medium transition-colors min-h-[44px]',
                    checked
                      ? 'bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/30'
                      : 'surface text-body hover:brightness-95 dark:hover:brightness-110',
                  )}
                >
                  {name}
                </button>
              )
            })}
          </div>
        </div>

        {/* Current lockout status */}
        {nightStatus?.active && (
          <div className="border-t border-[var(--border-secondary)] pt-5">
            <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 px-4 py-3">
              <div className="flex items-center gap-3 mb-2">
                <Lock className="h-4 w-4 text-indigo-400" />
                <p className="text-heading text-sm font-medium">
                  {nightStatus.lockedRooms.length} room{nightStatus.lockedRooms.length !== 1 ? 's' : ''} locked
                </p>
              </div>
              <p className="text-caption text-xs mb-3">
                {nightStatus.lockedRooms.join(', ')} -- unlocks at {nightStatus.wakeMode}
              </p>
              <button
                onClick={() => unlockMutation.mutate()}
                disabled={unlockMutation.isPending}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors min-h-[44px]',
                  'bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500',
                  'disabled:opacity-50',
                )}
              >
                <Unlock className="h-4 w-4" />
                Unlock now
              </button>
            </div>
          </div>
        )}
      </div>
    </Section>
  )
}
