import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { Section } from './Section'

export function HushingHomeSection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: scenes } = useQuery({
    queryKey: ['scenes'],
    queryFn: api.scenes.getAll,
  })

  const { data: hushingStatus } = useQuery({
    queryKey: ['system', 'hushing-status'],
    queryFn: api.system.getHushingStatus,
    refetchInterval: 10_000,
  })

  const mutation = useMutation({
    mutationFn: (scene: string | null) => api.system.setHushingScene(scene),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'hushing-status'] })
      toast({ message: 'Hushing Home scene saved' })
    },
    onError: () => toast({ message: 'Failed to save scene', type: 'error' }),
  })

  const allScenes = scenes ?? []
  const currentScene = hushingStatus?.sceneName ?? ''

  return (
    <Section title="Hushing Home">
      <div className="space-y-5">
        <p className="text-caption text-xs">
          When Hushing Home is active, the selected scene runs across the home and motion-triggered changes are paused. All rooms are locked. Tap the Hushing Home button on the home screen to activate.
        </p>

        {hushingStatus?.active && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
            <p className="text-amber-400 text-sm font-medium">Home is Hushing</p>
          </div>
        )}

        <div className="space-y-2">
          <label
            className="block text-sm font-medium text-heading"
            htmlFor="hushing-scene-select"
          >
            Hushing scene
          </label>
          <p className="text-xs text-caption">
            This scene activates across all rooms when Hushing Home is turned on.
          </p>
          <select
            id="hushing-scene-select"
            value={currentScene}
            onChange={e => mutation.mutate(e.target.value || null)}
            disabled={mutation.isPending}
            aria-label="Select the scene to activate when Hushing Home is on"
            className={cn(
              'surface w-full rounded-lg border border-[var(--border-primary)] px-3 py-2 text-sm text-heading',
              'min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500',
            )}
          >
            <option value="">-- No scene selected --</option>
            {allScenes.map(s => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
            {/* Keep current option visible even if the scene no longer exists */}
            {currentScene && !allScenes.some(s => s.name === currentScene) && (
              <option value={currentScene}>{currentScene}</option>
            )}
          </select>
        </div>

        {allScenes.length === 0 && (
          <p className="text-caption text-sm">No scenes configured yet.</p>
        )}
      </div>
    </Section>
  )
}
