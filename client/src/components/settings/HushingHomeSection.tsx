import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { Section } from './Section'
import { SearchableSelect } from '@/components/ui/SearchableSelect'

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
  const sceneOptions = allScenes.map(s => ({ value: s.name, label: s.name }))

  return (
    <Section title="Hushing Home">
      <div className="space-y-5">
        <p className="text-caption text-xs">
          When Hushing Home is active, the selected scene runs across the home and motion-triggered changes are paused. All rooms are locked. Tap the Hushing Home button on the home screen to activate.
        </p>

        {hushingStatus?.active && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
            <p className="text-amber-400 text-sm font-medium">Home is Hushed</p>
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
          <SearchableSelect
            id="hushing-scene-select"
            options={sceneOptions}
            value={currentScene}
            onChange={value => mutation.mutate(value || null)}
            placeholder="Search scenes..."
            emptyMessage={allScenes.length === 0 ? 'No scenes configured yet.' : 'No scenes match your search'}
            aria-label="Select the scene to activate when Hushing Home is on"
          />
        </div>
      </div>
    </Section>
  )
}
