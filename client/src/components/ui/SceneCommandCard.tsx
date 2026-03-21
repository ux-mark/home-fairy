import { Trash2 } from 'lucide-react'
import type { SceneCommand } from '@/lib/api'

const COMMAND_TYPES = [
  { value: 'lifx_scene', label: 'LIFX Scene' },
  { value: 'lifx_light', label: 'LIFX Light' },
  { value: 'lifx_off', label: 'LIFX Off' },
  { value: 'hubitat_device', label: 'Hubitat Device' },
  { value: 'all_off', label: 'All Off' },
  { value: 'scene_timer', label: 'Scene Timer' },
  { value: 'mode_update', label: 'Mode Update' },
] as const

interface SceneCommandCardProps {
  command: SceneCommand
  index: number
  onChange: (index: number, command: SceneCommand) => void
  onDelete: (index: number) => void
}

export default function SceneCommandCard({
  command,
  index,
  onChange,
  onDelete,
}: SceneCommandCardProps) {
  const updateField = <K extends keyof SceneCommand>(
    key: K,
    value: SceneCommand[K],
  ) => {
    onChange(index, { ...command, [key]: value })
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-3">
          {/* Type selector */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Type
            </label>
            <select
              value={command.type}
              onChange={e =>
                updateField(
                  'type',
                  e.target.value as SceneCommand['type'],
                )
              }
              className="h-11 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
            >
              {COMMAND_TYPES.map(t => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Name */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Name
            </label>
            <input
              type="text"
              value={command.name}
              onChange={e => updateField('name', e.target.value)}
              placeholder="Command name"
              className="h-11 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
            />
          </div>

          {/* Dynamic fields based on type */}
          {(command.type === 'lifx_light' || command.type === 'lifx_off') && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Selector
              </label>
              <input
                type="text"
                value={command.selector ?? ''}
                onChange={e => updateField('selector', e.target.value)}
                placeholder="e.g. label:Kitchen"
                className="h-11 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
              />
            </div>
          )}

          {command.type === 'lifx_light' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Colour
                </label>
                <input
                  type="text"
                  value={command.color ?? ''}
                  onChange={e => updateField('color', e.target.value)}
                  placeholder="e.g. hue:120"
                  className="h-11 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Brightness
                </label>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={command.brightness ?? ''}
                  onChange={e =>
                    updateField('brightness', Number(e.target.value))
                  }
                  placeholder="0-1"
                  className="h-11 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                />
              </div>
            </div>
          )}

          {command.type === 'hubitat_device' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Device ID
                </label>
                <input
                  type="text"
                  value={command.id ?? ''}
                  onChange={e => updateField('id', e.target.value)}
                  placeholder="Device ID"
                  className="h-11 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Command
                </label>
                <input
                  type="text"
                  value={command.command ?? ''}
                  onChange={e => updateField('command', e.target.value)}
                  placeholder="e.g. on, off"
                  className="h-11 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                />
              </div>
            </div>
          )}

          {command.type === 'scene_timer' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Duration (seconds)
              </label>
              <input
                type="number"
                min={0}
                value={command.duration ?? ''}
                onChange={e =>
                  updateField('duration', Number(e.target.value))
                }
                placeholder="Duration in seconds"
                className="h-11 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
              />
            </div>
          )}

          {command.type === 'mode_update' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Mode
              </label>
              <input
                type="text"
                value={command.command ?? ''}
                onChange={e => updateField('command', e.target.value)}
                placeholder="e.g. Evening"
                className="h-11 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
              />
            </div>
          )}
        </div>

        {/* Delete */}
        <button
          onClick={() => onDelete(index)}
          className="shrink-0 rounded-lg p-2.5 text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          aria-label={`Delete command ${command.name || index + 1}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
