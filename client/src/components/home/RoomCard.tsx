import { Thermometer, Lock, Activity, Footprints } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn, formatTimeAgo } from '@/lib/utils'
import type { Room, Scene } from '@/lib/api'
import { getDefaultScene, isSceneInSeason } from '@/lib/scene-utils'
import { LucideIcon } from '@/components/ui/LucideIcon'
import { getLuxIcon, getTempColor, getActivityColor } from './helpers'

export function RoomCard({
  room,
  allRooms,
  scenes,
  currentMode,
  defaultScenes,
  onToggleScene,
  onToggleAuto,
  isLocked,
  expandedChildren,
  onToggleChild,
}: {
  room: Room
  allRooms: Room[]
  scenes: Scene[]
  currentMode: string
  defaultScenes: Record<string, Record<string, string>> | undefined
  onToggleScene: (name: string, isActive: boolean) => void
  onToggleAuto: () => void
  isLocked?: boolean
  expandedChildren: Set<string>
  onToggleChild: (childName: string) => void
}) {
  const childRooms = allRooms
    .filter(r => r.parent_room === room.name && !r.promoted)
    .sort((a, b) => a.name.localeCompare(b.name))
  const parentRoom = room.parent_room
    ? allRooms.find(r => r.name === room.parent_room) ?? null
    : null
  // Show ALL scenes for room + mode, in season
  const roomScenes = scenes.filter(s => {
    const rooms = Array.isArray(s.rooms) ? s.rooms : []
    const modes = Array.isArray(s.modes) ? s.modes : []
    const { inSeason } = isSceneInSeason(s)
    if (!inSeason) return false
    return (
      rooms.some(r => r?.name === room.name) &&
      modes.some(m => (m ?? '').toLowerCase() === currentMode.toLowerCase())
    )
  })

  const defaultSceneName = getDefaultScene(defaultScenes, room.name, currentMode)

  // Sort: default scene first, then alphabetical
  const sortedScenes = [...roomScenes].sort((a, b) => {
    if (a.name === defaultSceneName) return -1
    if (b.name === defaultSceneName) return 1
    return a.name.localeCompare(b.name)
  })

  return (
    <div className="card rounded-xl border p-4 transition-colors" style={{ borderColor: 'var(--border-primary)' }}>
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-start gap-2">
          <LucideIcon name={room.icon} className="mt-0.5 h-4 w-4 shrink-0 text-fairy-400" aria-hidden="true" />
          <h3 className="text-heading text-base font-semibold">
            {room.name}
            {room.parent_room && room.promoted && parentRoom && (
              <>
                {' '}
                <Link
                  to={`/rooms/${encodeURIComponent(room.parent_room)}`}
                  className="text-xs font-normal text-fairy-400 hover:text-fairy-300 transition-colors"
                  aria-label={`Part of ${room.parent_room}`}
                >
                  in {room.parent_room}
                </Link>
              </>
            )}
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          {isLocked && (
            <Lock className="h-3.5 w-3.5 text-indigo-400" aria-label="Room locked" />
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleAuto() }}
            aria-label={`Switch to ${room.auto ? 'manual' : 'auto'} mode`}
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              room.auto
                ? 'bg-fairy-500/15 text-fairy-400 hover:bg-fairy-500/25'
                : 'surface text-caption hover:brightness-95 dark:hover:brightness-110',
            )}
          >
            {room.auto ? 'Auto' : 'Manual'}
          </button>
        </div>
      </div>

      {/* Environmental indicators + activity */}
      <div className="text-body mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {room.lux !== null && (() => {
          const { icon, className, label } = getLuxIcon(room.lux)
          return (
            <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
              <LucideIcon name={icon} className={cn('h-3.5 w-3.5', className)} aria-label={label} />
              {room.lux} lux
            </span>
          )
        })()}
        {room.temperature !== null && (
          <span className={cn('flex items-center gap-1', getTempColor(room.temperature))}>
            <Thermometer className="h-3.5 w-3.5" />
            {Math.round(room.temperature * 10) / 10}&deg;C
          </span>
        )}
        <span className={cn('flex items-center gap-1', getActivityColor(room.last_active))}>
          <Footprints className="h-3 w-3" />
          {formatTimeAgo(room.last_active)}
        </span>
      </div>

      {/* Quick scene buttons — all scenes, no limit */}
      {sortedScenes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sortedScenes.map(scene => {
            const isActive = room.current_scene === scene.name
            const isDefault = scene.name === defaultSceneName
            return (
              <button
                key={scene.name}
                onClick={() => onToggleScene(scene.name, isActive)}
                aria-pressed={isActive}
                className={cn(
                  'flex min-h-[44px] items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                  isActive
                    ? 'bg-fairy-500/20 text-fairy-700 dark:text-fairy-300'
                    : 'surface text-body hover:brightness-95 dark:hover:brightness-110',
                )}
              >
                {isDefault && (
                  <Activity className="h-3 w-3 text-fairy-400" aria-label="Default scene for this mode" />
                )}
                {scene.icon && <span className="text-sm" aria-hidden="true">{scene.icon}</span>}
                {scene.name}
              </button>
            )
          })}
        </div>
      )}

      {/* Sub-spaces — each child renders in place as either a pill or expanded content */}
      {childRooms.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[var(--border-secondary)] pt-3">
          {childRooms.map(child => {
            const isExpanded = expandedChildren.has(child.name)

            if (!isExpanded) {
              return (
                <button
                  key={child.name}
                  onClick={() => onToggleChild(child.name)}
                  aria-expanded={false}
                  className={cn(
                    'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors min-h-[44px]',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                    'surface text-body hover:text-heading',
                  )}
                >
                  <LucideIcon name={child.icon} className="h-3.5 w-3.5 shrink-0 text-fairy-400" aria-hidden="true" />
                  {child.name}
                </button>
              )
            }

            const childScenes = scenes.filter(s => {
              const rooms = Array.isArray(s.rooms) ? s.rooms : []
              const modes = Array.isArray(s.modes) ? s.modes : []
              const { inSeason } = isSceneInSeason(s)
              if (!inSeason) return false
              return (
                rooms.some(r => r?.name === child.name) &&
                modes.some(m => (m ?? '').toLowerCase() === currentMode.toLowerCase())
              )
            })
            const childDefault = getDefaultScene(defaultScenes, child.name, currentMode)
            const sortedChildScenes = [...childScenes].sort((a, b) => {
              if (a.name === childDefault) return -1
              if (b.name === childDefault) return 1
              return a.name.localeCompare(b.name)
            })

            return (
              <div key={child.name} className="w-full rounded-lg bg-[var(--bg-secondary)] p-3">
                <button
                  onClick={() => onToggleChild(child.name)}
                  className="mb-2 flex items-center gap-1.5 min-h-[44px] text-left"
                  aria-expanded={true}
                  aria-label={`Collapse ${child.name}`}
                >
                  <LucideIcon name={child.icon} className="h-3.5 w-3.5 text-fairy-400" aria-hidden="true" />
                  <span className="text-xs font-medium text-heading">{child.name}</span>
                </button>

                {/* Child environmental indicators */}
                <div className="text-body mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {child.lux !== null && (() => {
                    const { icon, className, label } = getLuxIcon(child.lux)
                    return (
                      <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                        <LucideIcon name={icon} className={cn('h-3.5 w-3.5', className)} aria-label={label} />
                        {child.lux} lux
                      </span>
                    )
                  })()}
                  {child.temperature !== null && (
                    <span className={cn('flex items-center gap-1', getTempColor(child.temperature))}>
                      <Thermometer className="h-3.5 w-3.5" />
                      {Math.round(child.temperature * 10) / 10}&deg;C
                    </span>
                  )}
                  <span className={cn('flex items-center gap-1', getActivityColor(child.last_active))}>
                    <Footprints className="h-3 w-3" />
                    {formatTimeAgo(child.last_active)}
                  </span>
                </div>

                {/* Child scene buttons */}
                {sortedChildScenes.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {sortedChildScenes.map(scene => {
                      const isActive = child.current_scene === scene.name
                      const isDefault = scene.name === childDefault
                      return (
                        <button
                          key={scene.name}
                          onClick={() => onToggleScene(scene.name, isActive)}
                          aria-pressed={isActive}
                          className={cn(
                            'flex min-h-[44px] items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                            isActive
                              ? 'bg-fairy-500/20 text-fairy-700 dark:text-fairy-300'
                              : 'surface text-body hover:brightness-95 dark:hover:brightness-110',
                          )}
                        >
                          {isDefault && (
                            <Activity className="h-3 w-3 text-fairy-400" aria-label="Default scene for this mode" />
                          )}
                          {scene.icon && <span className="text-sm" aria-hidden="true">{scene.icon}</span>}
                          {scene.name}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-caption">No scenes for this mode</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
