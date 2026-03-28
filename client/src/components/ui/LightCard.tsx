import { Power, Zap, Wifi, WifiOff } from 'lucide-react'
import { cn, getLightColorHex } from '@/lib/utils'
import type { Light } from '@/lib/api'

interface LightCardProps {
  light: Light
  onToggle?: () => void
  onIdentify?: () => void
  showControls?: boolean
  compact?: boolean
}

export default function LightCard({
  light,
  onToggle,
  onIdentify,
  showControls = false,
  compact = false,
}: LightCardProps) {
  const isOn = light.power === 'on'
  const colorHex = getLightColorHex(light)

  return (
    <div
      className={cn(
        'card rounded-xl border transition-colors',
        compact ? 'px-3 py-2.5' : 'p-4',
      )}
    >
      <div className="flex items-center gap-3">
        {/* Colour dot */}
        <div
          className={cn(
            'shrink-0 rounded-full',
            compact ? 'h-4 w-4' : 'h-5 w-5',
            !isOn && 'opacity-30',
          )}
          style={{ backgroundColor: isOn ? colorHex : '#475569' }}
          aria-hidden="true"
        />

        {/* Label and meta */}
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'break-words font-medium',
              compact ? 'text-sm' : 'text-base',
              isOn ? 'text-heading' : 'text-body',
            )}
          >
            {light.label}
          </p>
          {!compact && (
            <p className="text-caption mt-0.5 break-words text-xs">
              {light.group.name}
              {isOn && ` \u00B7 ${Math.round(light.brightness * 100)}%`}
            </p>
          )}
        </div>

        {/* Connection status */}
        <span
          className={cn('shrink-0', compact ? 'hidden' : '')}
          title={light.connected ? 'Connected' : 'Disconnected'}
          aria-label={light.connected ? 'Connected' : 'Disconnected'}
          role="img"
        >
          {light.connected ? (
            <Wifi className="h-3.5 w-3.5 text-fairy-500" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-red-400" />
          )}
        </span>

        {/* Controls */}
        {showControls && (
          <div className="flex items-center gap-1.5">
            {onIdentify && (
              <button
                onClick={onIdentify}
                className="text-body rounded-lg p-2 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors hover:bg-[var(--bg-tertiary)] hover:text-fairy-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                aria-label={`Identify ${light.label}`}
                title="Flash this light"
              >
                <Zap className="h-4 w-4" />
              </button>
            )}
            {onToggle && (
              <button
                onClick={onToggle}
                className={cn(
                  'rounded-lg p-2 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                  isOn
                    ? 'bg-fairy-500/15 text-fairy-400 hover:bg-fairy-500/25'
                    : 'text-caption hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-secondary)]',
                )}
                aria-label={`Turn ${light.label} ${isOn ? 'off' : 'on'}`}
              >
                <Power className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
