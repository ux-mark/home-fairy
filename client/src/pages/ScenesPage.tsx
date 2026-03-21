import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, ChevronRight, Sparkles, Zap } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'

function SceneCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="animate-pulse space-y-2">
        <div className="h-8 w-8 rounded-lg bg-slate-800" />
        <div className="h-5 w-28 rounded bg-slate-800" />
        <div className="h-4 w-20 rounded bg-slate-800" />
      </div>
    </div>
  )
}

export default function ScenesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: scenes, isLoading } = useQuery({
    queryKey: ['scenes'],
    queryFn: api.scenes.getAll,
  })

  const { data: rooms } = useQuery({
    queryKey: ['rooms'],
    queryFn: api.rooms.getAll,
  })

  // Which scenes are currently active in any room
  const activeSceneNames = new Set(
    rooms?.filter(r => r.current_scene).map(r => r.current_scene!) ?? [],
  )

  const createMutation = useMutation({
    mutationFn: () =>
      api.scenes.create({
        name: `New Scene ${(scenes?.length ?? 0) + 1}`,
        icon: '',
        rooms: [],
        modes: [],
        commands: [],
        tags: [],
      }),
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: ['scenes'] })
      navigate(`/scenes/${encodeURIComponent(data.name)}`)
    },
    onError: () =>
      toast({ message: 'Failed to create scene', type: 'error' }),
  })

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-400">All Scenes</h2>
        <button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className="flex min-h-[44px] items-center gap-1.5 rounded-lg bg-fairy-500 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-fairy-600 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        >
          <Plus className="h-4 w-4" />
          Create Scene
        </button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SceneCardSkeleton key={i} />
          ))}
        </div>
      ) : scenes && scenes.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {scenes.map(scene => {
            const isActive = activeSceneNames.has(scene.name)
            return (
              <Link
                key={scene.name}
                to={`/scenes/${encodeURIComponent(scene.name)}`}
                className={cn(
                  'group rounded-xl border bg-slate-900 p-4 transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                  isActive
                    ? 'border-fairy-500/40 shadow-lg shadow-fairy-500/10'
                    : 'border-slate-800 hover:border-slate-700',
                )}
              >
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 text-xl">
                    {scene.icon || <Sparkles className="h-5 w-5 text-slate-500" />}
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-600 transition-colors group-hover:text-slate-400" />
                </div>

                <h3 className="text-base font-semibold text-slate-100">
                  {scene.name}
                </h3>

                {/* Badges */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {scene.rooms.slice(0, 3).map(r => (
                    <span
                      key={r.name}
                      className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-400"
                    >
                      {r.name}
                    </span>
                  ))}
                  {scene.rooms.length > 3 && (
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                      +{scene.rooms.length - 3}
                    </span>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {scene.modes.slice(0, 3).map(m => (
                    <span
                      key={m}
                      className="rounded-full bg-fairy-500/10 px-2 py-0.5 text-[10px] font-medium text-fairy-400"
                    >
                      {m}
                    </span>
                  ))}
                </div>

                <p className="mt-2 text-xs text-slate-500">
                  {scene.commands.length} command
                  {scene.commands.length !== 1 ? 's' : ''}
                </p>

                {isActive && (
                  <div className="mt-2 flex items-center gap-1 text-xs font-medium text-fairy-400">
                    <Zap className="h-3 w-3" />
                    Active
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-700 py-12 text-center">
          <Sparkles className="mx-auto mb-3 h-8 w-8 text-slate-600" />
          <p className="text-sm text-slate-400">No scenes created yet.</p>
          <p className="mt-1 text-xs text-slate-500">
            Tap "Create Scene" to build your first lighting scene.
          </p>
        </div>
      )}
    </div>
  )
}
