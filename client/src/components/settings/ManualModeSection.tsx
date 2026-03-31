import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { Section } from './Section'
import { LucideIcon } from '@/components/ui/LucideIcon'

export function ManualModeSection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: rooms } = useQuery({
    queryKey: ['rooms'],
    queryFn: api.rooms.getAll,
  })

  const { data: scenes } = useQuery({
    queryKey: ['scenes'],
    queryFn: api.scenes.getAll,
  })

  const { data: manualStatus } = useQuery({
    queryKey: ['system', 'manual-status'],
    queryFn: api.system.getManualStatus,
    refetchInterval: 10_000,
  })

  const mutation = useMutation({
    mutationFn: ({ name, manual_scene }: { name: string; manual_scene: string | null }) =>
      api.rooms.update(name, { manual_scene }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['system', 'manual-status'] })
      toast({ message: 'Manual scene saved' })
    },
    onError: () => toast({ message: 'Failed to save manual scene', type: 'error' }),
  })

  const sortedRooms = (rooms ?? []).sort((a, b) => a.display_order - b.display_order)
  const allScenes = scenes ?? []

  return (
    <Section title="Manual Mode">
      <div className="space-y-5">
        <p className="text-caption text-xs">
          When Manual mode is active, the selected scene activates in each room and motion-triggered scene changes are paused. Tap the Manual button on the home screen to toggle.
        </p>

        {manualStatus?.active && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
            <p className="text-amber-400 text-sm font-medium">Manual mode is currently active</p>
          </div>
        )}

        <div className="space-y-3">
          {sortedRooms.map(room => {
            const roomScenes = allScenes.filter(s =>
              s.rooms.some(sr => sr.name === room.name)
            )
            const current = room.manual_scene ?? ''

            return (
              <div key={room.name} className="flex items-center gap-3">
                <div className="flex items-center gap-2 w-32 shrink-0">
                  <LucideIcon name={room.icon ?? 'home'} className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
                  <span className="text-heading text-sm truncate">{room.name}</span>
                </div>
                <select
                  value={current}
                  onChange={e => mutation.mutate({
                    name: room.name,
                    manual_scene: e.target.value || null,
                  })}
                  disabled={mutation.isPending}
                  aria-label={`Manual scene for ${room.name}`}
                  className={cn(
                    'surface flex-1 rounded-lg border border-[var(--border-primary)] px-3 py-2 text-sm text-heading',
                    'min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500',
                  )}
                >
                  <option value="">-- No scene --</option>
                  {roomScenes.map(s => (
                    <option key={s.name} value={s.name}>{s.name}</option>
                  ))}
                  {/* Show current if set but not in room's scenes (e.g. scene was moved) */}
                  {room.manual_scene && !roomScenes.some(s => s.name === room.manual_scene) && (
                    <option value={room.manual_scene}>{room.manual_scene}</option>
                  )}
                </select>
              </div>
            )
          })}
        </div>

        {sortedRooms.length === 0 && (
          <p className="text-caption text-sm">No rooms configured yet.</p>
        )}
      </div>
    </Section>
  )
}
