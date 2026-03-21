import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, ChevronRight, Sparkles, Zap, Search, CalendarDays } from 'lucide-react'
import { api } from '@/lib/api'
import type { Scene } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function isSceneInSeason(scene: Scene): { hasSeason: boolean; inSeason: boolean; label: string } {
  if (!scene.active_from || !scene.active_to) {
    return { hasSeason: false, inSeason: true, label: '' }
  }
  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()
  const today = month * 100 + day

  const [fromM, fromD] = scene.active_from.split('-').map(Number)
  const [toM, toD] = scene.active_to.split('-').map(Number)
  const from = fromM * 100 + fromD
  const to = toM * 100 + toD

  const inRange = from <= to
    ? (today >= from && today <= to)
    : (today >= from || today <= to)

  const fromLabel = `${MONTH_NAMES[fromM - 1]} ${fromD}`
  const toLabel = `${MONTH_NAMES[toM - 1]} ${toD}`

  if (inRange) {
    return { hasSeason: true, inSeason: true, label: `In season until ${toLabel}` }
  }
  return { hasSeason: true, inSeason: false, label: `Out of season until ${fromLabel}` }
}

function SceneCardSkeleton() {
  return (
    <div className="card rounded-xl border p-4">
      <div className="animate-pulse space-y-2">
        <div className="surface h-8 w-8 rounded-lg" />
        <div className="surface h-5 w-28 rounded" />
        <div className="surface h-4 w-20 rounded" />
      </div>
    </div>
  )
}

export default function ScenesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [search, setSearch] = useState('')

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

  // Filter scenes by search
  const filteredScenes = useMemo(() => {
    if (!scenes) return []
    if (!search.trim()) return scenes
    const q = search.toLowerCase()
    return scenes.filter(s => {
      try {
        const tags = Array.isArray(s.tags) ? s.tags : []
        const rooms = Array.isArray(s.rooms) ? s.rooms : []
        const modes = Array.isArray(s.modes) ? s.modes : []
        return (
          (s.name ?? '').toLowerCase().includes(q) ||
          tags.some(t => (t ?? '').toLowerCase().includes(q)) ||
          rooms.some(r => (r?.name ?? '').toLowerCase().includes(q)) ||
          modes.some(m => (m ?? '').toLowerCase().includes(q))
        )
      } catch {
        return false
      }
    })
  }, [scenes, search])

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
        <h2 className="text-body text-sm font-medium">All Scenes</h2>
        <button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className="flex min-h-[44px] items-center gap-1.5 rounded-lg bg-fairy-500 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-fairy-600 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        >
          <Plus className="h-4 w-4" />
          Create Scene
        </button>
      </div>

      {/* Search input */}
      {scenes && scenes.length > 0 && (
        <div className="relative mb-4">
          <Search className="text-caption absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <input
            type="search"
            placeholder="Search scenes by name, tag, room, or mode..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field h-11 w-full rounded-lg border pl-10 pr-3 text-sm placeholder:text-[var(--text-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          />
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SceneCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredScenes.length > 0 ? (
        <>
          {search.trim() && scenes && filteredScenes.length !== scenes.length && (
            <p className="text-caption mb-3 text-xs">
              Showing {filteredScenes.length} of {scenes.length} scene{scenes.length !== 1 ? 's' : ''}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredScenes.map(scene => {
              const isActive = activeSceneNames.has(scene.name)
              const season = isSceneInSeason(scene)
              return (
                <Link
                  key={scene.name}
                  to={`/scenes/${encodeURIComponent(scene.name)}`}
                  className={cn(
                    'card group rounded-xl border p-4 transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                    isActive && 'border-fairy-500/40 shadow-lg shadow-fairy-500/10',
                    season.hasSeason && !season.inSeason && 'opacity-50',
                  )}
                >
                  <div className="mb-3 flex items-start justify-between">
                    <div className="surface flex h-10 w-10 items-center justify-center rounded-lg text-xl">
                      {scene.icon || <Sparkles className="text-caption h-5 w-5" />}
                    </div>
                    <ChevronRight className="text-caption h-5 w-5 transition-colors group-hover:text-[var(--text-secondary)]" />
                  </div>

                  <h3 className="text-heading text-base font-semibold">
                    {scene.name}
                  </h3>

                  {/* Badges */}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(Array.isArray(scene.rooms) ? scene.rooms : []).filter(r => r?.name).slice(0, 3).map(r => (
                      <span
                        key={r.name}
                        className="surface text-body rounded-full px-2 py-0.5 text-[10px] font-medium"
                      >
                        {r.name}
                      </span>
                    ))}
                    {Array.isArray(scene.rooms) && scene.rooms.length > 3 && (
                      <span className="surface text-caption rounded-full px-2 py-0.5 text-[10px] font-medium">
                        +{scene.rooms.length - 3}
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(Array.isArray(scene.modes) ? scene.modes : []).slice(0, 3).map(m => (
                      <span
                        key={m}
                        className="rounded-full bg-fairy-500/10 px-2 py-0.5 text-[10px] font-medium text-fairy-400"
                      >
                        {m}
                      </span>
                    ))}
                  </div>

                  <p className="text-caption mt-2 text-xs">
                    {(Array.isArray(scene.commands) ? scene.commands : []).length} command
                    {(Array.isArray(scene.commands) ? scene.commands : []).length !== 1 ? 's' : ''}
                  </p>

                  {isActive && (
                    <div className="mt-2 flex items-center gap-1 text-xs font-medium text-fairy-400">
                      <Zap className="h-3 w-3" />
                      Active
                    </div>
                  )}

                  {season.hasSeason && (
                    <div className={cn(
                      'mt-2 flex items-center gap-1 text-xs font-medium',
                      season.inSeason ? 'text-green-500' : 'text-caption',
                    )}>
                      <CalendarDays className="h-3 w-3" />
                      {season.label}
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        </>
      ) : scenes && scenes.length > 0 && search.trim() ? (
        <div className="rounded-xl border border-dashed py-12 text-center" style={{ borderColor: 'var(--border-secondary)' }}>
          <Search className="text-caption mx-auto mb-3 h-8 w-8" />
          <p className="text-body text-sm">
            No scenes match "{search}".
          </p>
          <p className="text-caption mt-1 text-xs">
            Try a different search term or clear the filter.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed py-12 text-center" style={{ borderColor: 'var(--border-secondary)' }}>
          <Sparkles className="text-caption mx-auto mb-3 h-8 w-8" />
          <p className="text-body text-sm">No scenes created yet.</p>
          <p className="text-caption mt-1 text-xs">
            Tap "Create Scene" to build your first lighting scene.
          </p>
        </div>
      )}
    </div>
  )
}
