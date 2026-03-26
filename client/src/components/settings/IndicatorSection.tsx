import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Lightbulb, ChevronDown, Play } from 'lucide-react'
import { api } from '@/lib/api'
import type { MtaIndicatorConfig } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { useAllSensors } from './useAllSensors'
import { Section } from './Section'

export function IndicatorSection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: indicatorConfig } = useQuery({
    queryKey: ['mta', 'indicator'],
    queryFn: api.system.getMtaIndicator,
  })

  const { data: lights } = useQuery({
    queryKey: ['lifx', 'lights'],
    queryFn: api.lifx.getLights,
    retry: false,
  })

  const saveMutation = useMutation({
    mutationFn: (config: MtaIndicatorConfig) => api.system.saveMtaIndicator(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mta', 'indicator'] })
      toast({ message: 'Indicator settings saved' })
    },
    onError: () => toast({ message: 'Failed to save indicator settings', type: 'error' }),
  })

  const testMutation = useMutation({
    mutationFn: api.system.testMtaIndicator,
    onSuccess: (data) => {
      const statusLabels: Record<string, string> = {
        green: 'Green — leave soon',
        orange: 'Orange — leave now',
        red: 'Red — no good trains soon',
        none: 'No data',
      }
      toast({ message: `Indicator test: ${statusLabels[data.status] || data.status} (updating for ${data.windowMinutes} min)` })
    },
    onError: () => toast({ message: 'Indicator test failed', type: 'error' }),
  })

  const config: MtaIndicatorConfig = indicatorConfig ?? {
    enabled: false,
    lightId: '',
    lightLabel: '',
    sensorName: '',
  }

  const updateConfig = (patch: Partial<MtaIndicatorConfig>) => {
    saveMutation.mutate({ ...config, ...patch })
  }

  const allSensors = useAllSensors()

  const canTest = config.enabled && config.lightId

  return (
    <Section title="Indicator Light">
      <p className="text-caption text-xs mb-4">
        When a sensor triggers, a light changes colour to show your subway status.
      </p>

      {/* Status preview dots */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: '#22c55e' }} />
          <span className="text-xs text-caption">Leave soon</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: '#f97316' }} />
          <span className="text-xs text-caption">Leave now</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: '#ef4444' }} />
          <span className="text-xs text-caption">Too late</span>
        </div>
      </div>

      <div className="space-y-4">
        {/* Light selector */}
        <div>
          <label htmlFor="indicator-light" className="text-heading text-sm mb-1.5 block">
            Light
          </label>
          <div className="relative">
            <Lightbulb className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <select
              id="indicator-light"
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

        {/* Sensor selector */}
        <div>
          <label htmlFor="indicator-sensor" className="text-heading text-sm mb-1.5 block">
            Trigger sensor
          </label>
          <div className="relative">
            <select
              id="indicator-sensor"
              value={config.sensorName}
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
              aria-label={config.enabled ? 'Disable indicator' : 'Enable indicator'}
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
      </div>
    </Section>
  )
}
