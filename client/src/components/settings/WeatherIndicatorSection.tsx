import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Cloud, ChevronDown, Minus, Plus, Play, Palette, RotateCcw } from 'lucide-react'
import { HsvColorPicker } from 'react-colorful'
import { api } from '@/lib/api'
import type { WeatherIndicatorConfig } from '@/lib/api'
import { cn, hsbToHex } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { useAllSensors } from './useAllSensors'
import { Section } from './Section'

export function WeatherIndicatorSection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: weatherConfig } = useQuery({
    queryKey: ['weather', 'indicator'],
    queryFn: api.system.getWeatherIndicator,
  })

  const { data: weatherColors } = useQuery({
    queryKey: ['weather', 'colors'],
    queryFn: api.system.getWeatherColors,
  })

  const { data: lights } = useQuery({
    queryKey: ['lifx', 'lights'],
    queryFn: api.lifx.getLights,
    retry: false,
  })

  const saveMutation = useMutation({
    mutationFn: (config: WeatherIndicatorConfig) => api.system.saveWeatherIndicator(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weather', 'indicator'] })
      toast({ message: 'Weather light settings saved' })
    },
    onError: () => toast({ message: 'Failed to save weather light settings', type: 'error' }),
  })

  const testMutation = useMutation({
    mutationFn: api.system.testWeatherIndicator,
    onSuccess: (data) => {
      const colorEntry = weatherColors?.[data.condition]
      toast({ message: `Weather light: ${colorEntry?.name || data.condition}` })
    },
    onError: () => toast({ message: 'Weather light test failed', type: 'error' }),
  })

  const config: WeatherIndicatorConfig = weatherConfig ?? {
    enabled: false,
    lightId: '',
    lightLabel: '',
    intervalMinutes: 15,
    mode: 'always',
    brightness: 0.5,
  }

  // Local brightness state for smooth slider without toast spam
  const [localBrightness, setLocalBrightness] = useState<number | null>(null)
  const displayBrightness = localBrightness ?? Math.round(config.brightness * 100)

  const updateConfig = (patch: Partial<WeatherIndicatorConfig>) => {
    saveMutation.mutate({ ...config, ...patch })
  }

  const allSensors = useAllSensors()

  // ── Custom colour state ──────────────────────────────────────────────────
  const { data: customColors } = useQuery({
    queryKey: ['weather', 'custom-colors'],
    queryFn: api.system.getWeatherCustomColors,
  })

  const [editingCondition, setEditingCondition] = useState<string | null>(null)
  const [editColor, setEditColor] = useState<{ h: number; s: number; v: number }>({ h: 0, s: 100, v: 100 })
  const [previewingCondition, setPreviewingCondition] = useState<string | null>(null)

  const previewMutation = useMutation({
    mutationFn: (params: { color: string; conditionKey: string; name: string }) =>
      api.system.previewWeatherColor(params.color),
    onMutate: (params) => {
      setPreviewingCondition(params.conditionKey)
      setTimeout(() => setPreviewingCondition(null), 5000)
    },
    onSuccess: (_data, params) => {
      toast({ message: `Previewing ${params.name} on ${config.lightLabel || 'light'}` })
    },
    onError: () => {
      setPreviewingCondition(null)
      toast({ message: 'Could not preview colour', type: 'error' })
    },
  })

  const saveCustomColorMutation = useMutation({
    mutationFn: (params: { condition: string; color: string; hex: string }) =>
      api.system.saveWeatherCustomColor(params.condition, params.color, params.hex),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weather', 'custom-colors'] })
      setEditingCondition(null)
      toast({ message: 'Custom colour saved' })
    },
    onError: () => toast({ message: 'Failed to save custom colour', type: 'error' }),
  })

  const resetAllColorsMutation = useMutation({
    mutationFn: api.system.resetWeatherCustomColors,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weather', 'custom-colors'] })
      toast({ message: 'Colours reset to defaults' })
    },
    onError: () => toast({ message: 'Failed to reset colours', type: 'error' }),
  })

  const handleStartEdit = useCallback((key: string, currentHex: string) => {
    // Parse hex to approximate HSV for the picker initial state
    const r = parseInt(currentHex.slice(1, 3), 16) / 255
    const g = parseInt(currentHex.slice(3, 5), 16) / 255
    const b = parseInt(currentHex.slice(5, 7), 16) / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const d = max - min
    let h = 0
    if (d !== 0) {
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
      else if (max === g) h = ((b - r) / d + 2) * 60
      else h = ((r - g) / d + 4) * 60
    }
    const s = max === 0 ? 0 : (d / max) * 100
    const v = max * 100
    setEditColor({ h, s, v })
    setEditingCondition(key)
  }, [])

  const handleSaveCustomColor = useCallback(() => {
    if (!editingCondition) return
    const lifxColor = `hue:${editColor.h.toFixed(1)} saturation:${(editColor.s / 100).toFixed(2)}`
    const hex = hsbToHex(editColor.h, editColor.s / 100, editColor.v / 100)
    saveCustomColorMutation.mutate({ condition: editingCondition, color: lifxColor, hex })
  }, [editingCondition, editColor, saveCustomColorMutation])

  const handleResetSingleColor = useCallback((condition: string) => {
    if (!customColors) return
    const updated = { ...customColors }
    delete updated[condition]
    // Reset all, then re-save the remaining custom colours
    api.system.resetWeatherCustomColors().then(() => {
      const remaining = Object.entries(updated)
      const saveRemaining = async () => {
        for (const [key, val] of remaining) {
          await api.system.saveWeatherCustomColor(key, val.color, val.hex)
        }
      }
      saveRemaining().then(() => {
        queryClient.invalidateQueries({ queryKey: ['weather', 'custom-colors'] })
        setEditingCondition(null)
        toast({ message: 'Colour reset to default' })
      })
    })
  }, [customColors, queryClient, toast])

  const hasAnyCustomColors = customColors && Object.keys(customColors).length > 0

  const canTest = config.enabled && config.lightId

  return (
    <Section title="Weather Light">
      <p className="text-caption text-xs mb-4">
        A light changes colour to match the current weather forecast
      </p>

      <div className="space-y-4">
        {/* Light selector */}
        <div>
          <label htmlFor="weather-light" className="text-heading text-sm mb-1.5 block">
            Light
          </label>
          <div className="relative">
            <Cloud className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <select
              id="weather-light"
              value={config.lightId}
              onChange={(e) => {
                const light = lights?.find(l => l.id === e.target.value)
                updateConfig({
                  lightId: e.target.value,
                  lightLabel: light?.label ?? '',
                })
              }}
              className="input-field h-11 w-full appearance-none rounded-lg border py-2 pl-9 pr-8 text-sm focus:border-fairy-500 focus:outline-none"
            >
              <option value="">Select a light</option>
              {lights?.map(light => (
                <option key={light.id} value={light.id}>
                  {light.label}{light.group?.name ? ` (${light.group.name})` : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          </div>
        </div>

        {/* Mode selector */}
        <div>
          <p className="text-heading text-sm mb-1.5">Mode</p>
          <div className="surface flex rounded-lg border" style={{ borderColor: 'var(--border-secondary)' }}>
            <button
              onClick={() => updateConfig({ mode: 'always' })}
              aria-pressed={config.mode === 'always'}
              className={cn(
                'flex-1 px-3 py-2.5 text-sm font-medium transition-colors min-h-[44px] rounded-l-lg',
                config.mode === 'always'
                  ? 'bg-fairy-500 text-white'
                  : 'text-caption hover:text-[var(--text-primary)]',
              )}
            >
              Always on
            </button>
            <button
              onClick={() => updateConfig({ mode: 'sensor' })}
              aria-pressed={config.mode === 'sensor'}
              className={cn(
                'flex-1 px-3 py-2.5 text-sm font-medium transition-colors min-h-[44px] rounded-r-lg',
                config.mode === 'sensor'
                  ? 'bg-fairy-500 text-white'
                  : 'text-caption hover:text-[var(--text-primary)]',
              )}
            >
              Sensor trigger
            </button>
          </div>
        </div>

        {/* Sensor selector (only in sensor mode) */}
        {config.mode === 'sensor' && (
          <div>
            <label htmlFor="weather-sensor" className="text-heading text-sm mb-1.5 block">
              Trigger sensor
            </label>
            <div className="relative">
              <select
                id="weather-sensor"
                value={config.sensorName ?? ''}
                onChange={(e) => updateConfig({ sensorName: e.target.value })}
                className="input-field h-11 w-full appearance-none rounded-lg border py-2 pl-3 pr-8 text-sm focus:border-fairy-500 focus:outline-none"
              >
                <option value="">Select a sensor</option>
                {allSensors
                  .filter((s, i, arr) => arr.findIndex(x => x.name === s.name) === i)
                  .map(sensor => (
                  <option key={`${sensor.name}-${sensor.room}`} value={sensor.name}>
                    {sensor.name} ({sensor.room})
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            </div>
          </div>
        )}

        {/* Brightness slider */}
        <div>
          <label htmlFor="weather-brightness" className="text-heading text-sm mb-1.5 block">
            Brightness
          </label>
          <div className="flex items-center gap-3">
            <input
              id="weather-brightness"
              type="range"
              min={5}
              max={100}
              step={5}
              value={displayBrightness}
              onChange={(e) => setLocalBrightness(Number(e.target.value))}
              onPointerUp={() => {
                if (localBrightness !== null) {
                  updateConfig({ brightness: localBrightness / 100 })
                  setLocalBrightness(null)
                }
              }}
              onKeyUp={(e) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                  updateConfig({ brightness: displayBrightness / 100 })
                  setLocalBrightness(null)
                }
              }}
              className="fairy-slider flex-1"
              style={{ background: `linear-gradient(to right, var(--bg-tertiary), #ffd919)` }}
              aria-label="Weather light brightness"
            />
            <span className="w-10 text-right text-sm font-medium text-heading">
              {displayBrightness}%
            </span>
          </div>
        </div>

        {/* Check interval stepper */}
        <div>
          <p className="text-heading text-sm mb-1.5">Check every</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateConfig({ intervalMinutes: Math.max(5, config.intervalMinutes - 5) })}
              disabled={config.intervalMinutes <= 5}
              className="surface flex h-11 w-11 items-center justify-center rounded-lg border text-heading transition-colors hover:brightness-95 dark:hover:brightness-110 disabled:opacity-30"
              style={{ borderColor: 'var(--border-secondary)' }}
              aria-label="Decrease check interval"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-16 text-center text-sm font-medium text-heading">
              {config.intervalMinutes} min
            </span>
            <button
              onClick={() => updateConfig({ intervalMinutes: Math.min(60, config.intervalMinutes + 5) })}
              disabled={config.intervalMinutes >= 60}
              className="surface flex h-11 w-11 items-center justify-center rounded-lg border text-heading transition-colors hover:brightness-95 dark:hover:brightness-110 disabled:opacity-30"
              style={{ borderColor: 'var(--border-secondary)' }}
              aria-label="Increase check interval"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Enable toggle + Test button */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-3">
            <button
              onClick={() => updateConfig({ enabled: !config.enabled })}
              className={cn(
                'relative h-6 w-11 rounded-full transition-colors',
                config.enabled ? 'bg-fairy-500' : 'bg-[var(--bg-tertiary)]',
              )}
              role="switch"
              aria-checked={config.enabled}
              aria-label={config.enabled ? 'Disable weather light' : 'Enable weather light'}
            >
              <span
                className={cn(
                  'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                  config.enabled && 'translate-x-5',
                )}
              />
            </button>
            <span className="text-heading text-sm">{config.enabled ? 'Enabled' : 'Disabled'}</span>
          </div>

          <button
            onClick={() => testMutation.mutate()}
            disabled={!canTest || testMutation.isPending}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px]',
              canTest
                ? 'bg-fairy-500 text-white hover:bg-fairy-600'
                : 'surface text-caption opacity-50 cursor-not-allowed',
            )}
          >
            <Play className="h-4 w-4" />
            {testMutation.isPending ? 'Testing...' : 'Test'}
          </button>
        </div>

        {/* Colour Reference — interactive preview + customisation */}
        {weatherColors && (
          <div className="mt-2 rounded-lg border p-4" style={{ borderColor: 'var(--border-secondary)' }}>
            <p className="text-caption text-xs font-semibold mb-3">
              Colour reference
            </p>

            {!config.lightId && (
              <p className="text-caption text-xs mb-3 italic">
                Select a light above to preview colours
              </p>
            )}

            <div className="space-y-1">
              {Object.entries(weatherColors).map(([key, entry]) => {
                const custom = customColors?.[key]
                const displayHex = custom?.hex || entry.hex
                const displayColor = custom?.color || entry.color
                const isCustomised = !!custom
                const isPreviewing = previewingCondition === key
                const isEditing = editingCondition === key

                return (
                  <div key={key}>
                    <div className="flex items-center gap-3 py-1.5">
                      {/* Colour swatch — tappable for preview */}
                      <div className="relative shrink-0">
                        <button
                          onClick={() => {
                            if (!config.lightId) return
                            previewMutation.mutate({ color: displayColor, conditionKey: key, name: entry.name })
                          }}
                          disabled={!config.lightId}
                          className={cn(
                            'h-10 w-10 rounded-full shrink-0 transition-all active:scale-90',
                            'ring-2 ring-offset-2 ring-offset-[var(--bg-primary)]',
                            isPreviewing
                              ? 'ring-fairy-500 scale-95'
                              : config.lightId
                                ? 'ring-transparent hover:ring-fairy-500/50'
                                : 'ring-transparent opacity-80 cursor-default',
                          )}
                          style={{ backgroundColor: displayHex }}
                          title={config.lightId ? `Preview ${entry.name} on light` : 'Select a light to preview'}
                          aria-label={`Preview ${entry.name}`}
                        />
                        {/* Custom colour indicator dot */}
                        {isCustomised && (
                          <span
                            className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-fairy-500 border-2 border-[var(--bg-primary)]"
                            aria-label="Customised"
                          />
                        )}
                      </div>

                      {/* Label + description */}
                      <div className="flex-1 min-w-0">
                        <p className="text-heading text-sm leading-tight break-words">
                          {entry.name}
                          {isPreviewing && (
                            <span className="ml-1.5 text-fairy-500 text-xs font-normal">Previewing</span>
                          )}
                        </p>
                        <p className="text-caption text-[11px] leading-tight">{entry.description}</p>
                      </div>

                      {/* Edit button */}
                      <button
                        onClick={() => {
                          if (isEditing) {
                            setEditingCondition(null)
                          } else {
                            handleStartEdit(key, displayHex)
                          }
                        }}
                        className={cn(
                          'p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center',
                          isEditing
                            ? 'text-fairy-500 bg-fairy-500/10'
                            : 'text-caption hover:text-heading hover:bg-[var(--bg-tertiary)]',
                        )}
                        aria-label={isEditing ? `Close ${entry.name} editor` : `Edit ${entry.name} colour`}
                      >
                        <Palette className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Inline colour picker when editing */}
                    {isEditing && (
                      <div className="mt-1 mb-3 ml-[52px] rounded-lg border p-3" style={{ borderColor: 'var(--border-secondary)' }}>
                        <div className="weather-color-picker">
                          <HsvColorPicker
                            color={editColor}
                            onChange={setEditColor}
                          />
                        </div>

                        {/* Preview of chosen colour */}
                        <div className="mt-3 flex items-center gap-2">
                          <span
                            className="h-6 w-6 rounded-full shrink-0"
                            style={{ backgroundColor: hsbToHex(editColor.h, editColor.s / 100, editColor.v / 100) }}
                            aria-hidden="true"
                          />
                          <span className="text-caption text-xs">
                            H:{Math.round(editColor.h)} S:{Math.round(editColor.s)}% V:{Math.round(editColor.v)}%
                          </span>
                        </div>

                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={handleSaveCustomColor}
                            disabled={saveCustomColorMutation.isPending}
                            className="flex-1 rounded-lg bg-fairy-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-fairy-600 min-h-[44px]"
                          >
                            {saveCustomColorMutation.isPending ? 'Saving...' : 'Save colour'}
                          </button>
                          <button
                            onClick={() => setEditingCondition(null)}
                            className="rounded-lg px-3 py-2 text-sm font-medium text-caption transition-colors hover:text-heading hover:bg-[var(--bg-tertiary)] min-h-[44px]"
                          >
                            Cancel
                          </button>
                          {isCustomised && (
                            <button
                              onClick={() => handleResetSingleColor(key)}
                              className="rounded-lg px-3 py-2 text-sm font-medium text-caption transition-colors hover:text-heading hover:bg-[var(--bg-tertiary)] min-h-[44px]"
                              title="Reset to default colour"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Reset all button */}
            {hasAnyCustomColors && (
              <button
                onClick={() => resetAllColorsMutation.mutate()}
                disabled={resetAllColorsMutation.isPending}
                className="mt-3 flex items-center gap-1.5 text-caption text-xs transition-colors hover:text-heading"
              >
                <RotateCcw className="h-3 w-3" />
                {resetAllColorsMutation.isPending ? 'Resetting...' : 'Reset all to defaults'}
              </button>
            )}

            {/* Scoped styles for the compact weather colour picker */}
            <style>{`
              .weather-color-picker .react-colorful {
                width: 100% !important;
                height: auto !important;
                gap: 12px;
              }
              .weather-color-picker .react-colorful__saturation {
                min-height: 160px;
                border-radius: 10px !important;
                border-bottom: none !important;
              }
              .weather-color-picker .react-colorful__last-control,
              .weather-color-picker .react-colorful__hue {
                height: 28px !important;
                border-radius: 14px !important;
              }
              .weather-color-picker .react-colorful__interactive {
                outline: none;
              }
              .weather-color-picker .react-colorful__pointer {
                width: 26px !important;
                height: 26px !important;
                border: 3px solid white !important;
                box-shadow: 0 0 0 1.5px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.35) !important;
              }
              .weather-color-picker .react-colorful__hue-pointer {
                width: 30px !important;
                height: 30px !important;
              }
              .weather-color-picker .react-colorful__interactive:focus .react-colorful__pointer {
                box-shadow: 0 0 0 2px #10b981, 0 0 0 4px rgba(16,185,129,0.3), 0 2px 8px rgba(0,0,0,0.35) !important;
              }
            `}</style>
          </div>
        )}
      </div>
    </Section>
  )
}
