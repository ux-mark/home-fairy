/**
 * ColorBrightnessPicker
 *
 * LIFX-style colour/temperature picker with:
 *   - "Colours" tab: circular hue-saturation wheel (ColorWheel)
 *   - "Whites"  tab: Kelvin preset grid (KelvinPresets)
 *   - Vertical brightness slider (Radix UI, butter-smooth on mobile)
 *   - Tabs only shown for colour-capable lights (has_color=true)
 *   - White-only lights show KelvinPresets + brightness slider directly
 *
 * All colour work is done in HSV space (= HSB, matching LIFX's API).
 *
 * Props:
 *   onChange  — called on every pointer move during drag (instant local UI update)
 *   onCommit  — called on pointer up for the final API commit
 *
 * The parent is responsible for debouncing any API calls it makes in onChange.
 * This component is a simple controlled input: it reports changes, parent decides what to do.
 */
import { useCallback, useState } from 'react'
import * as Slider from '@radix-ui/react-slider'
import { Loader2 } from 'lucide-react'
import { kelvinToHex, hsbToHex } from '@/lib/utils'
import ColorWheel from './ColorWheel'
import KelvinPresets from './KelvinPresets'

export interface HsvColor {
  h: number // 0-360
  s: number // 0-100
  v: number // 0-100 (brightness in LIFX terms)
}

interface ColorBrightnessPickerProps {
  hasColor: boolean
  /**
   * HSV colour — h: 0-360, s: 0-100, v: 0-100.
   */
  color: HsvColor
  kelvin: number
  brightness: number
  minKelvin?: number
  maxKelvin?: number
  /** Called on every pointer move during drag — update local UI state immediately */
  onChange: (update: { color?: HsvColor; kelvin?: number; brightness?: number }) => void
  /** Called on pointer up — fire the final API commit */
  onCommit: (update: { color?: HsvColor; kelvin?: number; brightness?: number }) => void
  /** Show a spinner in the brightness thumb while an API call is in flight */
  loading?: boolean
}

// Brightness slider width and height
const SLIDER_W = 40
const SLIDER_H = 252

export default function ColorBrightnessPicker({
  hasColor,
  color,
  kelvin,
  brightness,
  minKelvin = 1500,
  maxKelvin = 9000,
  onChange,
  onCommit,
  loading = false,
}: ColorBrightnessPickerProps) {
  // Active tab — only relevant when hasColor=true
  const [tab, setTab] = useState<'colours' | 'whites'>(() => {
    // Default to Whites tab if light is currently in white mode (low saturation)
    return hasColor && color.s > 5 ? 'colours' : 'whites'
  })

  // ── Colour wheel ──────────────────────────────────────────────────────────

  const handleColorWheelChange = useCallback(
    (h: number, s: number) => {
      onChange({ color: { h, s, v: color.v } })
    },
    [color.v, onChange],
  )

  const handleColorWheelCommit = useCallback(
    (h: number, s: number) => {
      onCommit({ color: { h, s, v: color.v } })
    },
    [color.v, onCommit],
  )

  // ── Kelvin presets ────────────────────────────────────────────────────────

  const handleKelvinChange = useCallback(
    (k: number) => {
      onChange({ kelvin: k })
    },
    [onChange],
  )

  const handleKelvinCommit = useCallback(
    (k: number) => {
      onCommit({ kelvin: k })
    },
    [onCommit],
  )

  // ── Brightness slider (Radix UI vertical, butter-smooth on touch) ─────────

  const effectiveBrightness = hasColor ? color.v : brightness

  // null = use server value; non-null = user is dragging (finger-tracks at 60fps)
  const [dragValue, setDragValue] = useState<number | null>(null)

  const displayBrightness = dragValue ?? effectiveBrightness

  const handleBrightnessChange = useCallback(
    (vals: number[]) => {
      const b = vals[0]
      setDragValue(b)
      if (hasColor) {
        onChange({ color: { h: color.h, s: color.s, v: b }, brightness: b })
      } else {
        onChange({ brightness: b })
      }
    },
    [hasColor, color, onChange],
  )

  const handleBrightnessCommit = useCallback(
    (vals: number[]) => {
      const b = vals[0]
      setDragValue(null)
      if (hasColor) {
        onCommit({ color: { h: color.h, s: color.s, v: b }, brightness: b })
      } else {
        onCommit({ brightness: b })
      }
    },
    [hasColor, color, onCommit],
  )

  // ── Derived display values ────────────────────────────────────────────────

  const currentColorHex = hasColor
    ? hsbToHex(color.h, color.s / 100, displayBrightness / 100)
    : kelvinToHex(kelvin)

  // Brightness slider gradient: black at bottom → current colour at top
  const brightnessGradient =
    tab === 'whites' || !hasColor
      ? `linear-gradient(to top, #0a0a0a, ${kelvinToHex(kelvin)})`
      : `linear-gradient(to top, #0a0a0a, ${hsbToHex(color.h, color.s / 100, 1)})`

  // ── Render ────────────────────────────────────────────────────────────────

  const showWhitesPresets = !hasColor || tab === 'whites'
  const showColourWheel = hasColor && tab === 'colours'

  return (
    <div className="select-none space-y-3">
      {/* Info row */}
      <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-secondary, #94a3b8)' }}>
        <span>
          {showColourWheel
            ? `Hue: ${Math.round(color.h)}°  Sat: ${Math.round(color.s)}%`
            : `Temp: ${kelvin}K`}
        </span>
        <span style={{ color: 'var(--text-primary, #f1f5f9)' }}>
          ☀ {Math.round(displayBrightness)}%
        </span>
      </div>

      {/* Wheel/presets + brightness slider */}
      <div className="flex items-start justify-center gap-3">
        {/* Colour wheel or Kelvin preset grid */}
        {showColourWheel && (
          <div style={{ width: SLIDER_H, height: SLIDER_H, flexShrink: 0 }}>
            <ColorWheel
              hue={color.h}
              saturation={color.s}
              size={SLIDER_H}
              onChange={handleColorWheelChange}
              onCommit={handleColorWheelCommit}
            />
          </div>
        )}
        {showWhitesPresets && (
          <div className="min-w-0 flex-1">
            <KelvinPresets
              kelvin={kelvin}
              minKelvin={minKelvin}
              maxKelvin={maxKelvin}
              onChange={handleKelvinChange}
              onCommit={handleKelvinCommit}
            />
          </div>
        )}

        {/* Vertical brightness slider — Radix UI for butter-smooth touch tracking */}
        <Slider.Root
          orientation="vertical"
          min={0}
          max={100}
          step={1}
          value={[displayBrightness]}
          onValueChange={handleBrightnessChange}
          onValueCommit={handleBrightnessCommit}
          aria-label="Brightness"
          className="relative flex touch-none select-none justify-center rounded-full"
          style={{
            width: SLIDER_W,
            height: SLIDER_H,
            flexShrink: 0,
            // Prevent text-selection and long-press popups on iOS Safari during drag
            userSelect: 'none',
            WebkitTouchCallout: 'none',
          } as React.CSSProperties}
        >
          <Slider.Track
            className="relative w-full overflow-hidden rounded-full"
            style={{ background: brightnessGradient }}
          >
            {/* Range is invisible — the gradient track IS the visual indicator */}
            <Slider.Range className="absolute w-full" style={{ background: 'transparent' }} />
          </Slider.Track>
          <Slider.Thumb
            className={[
              'relative flex items-center justify-center rounded-full border-2 border-white',
              // Invisible touch-target enlargement for easier finger targeting
              'before:absolute before:inset-[-8px] before:content-[""]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              loading ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
            ].join(' ')}
            style={{
              width: 28,
              height: 28,
              backgroundColor: currentColorHex,
              boxShadow: '0 0 0 1.5px rgba(0,0,0,0.3), 0 2px 8px rgba(0,0,0,0.4)',
              // GPU acceleration for jank-free thumb movement
              willChange: 'transform',
              transform: 'translateZ(0)',
            }}
            aria-label="Brightness"
          >
            {loading && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-white/80" aria-hidden="true" />
            )}
          </Slider.Thumb>
        </Slider.Root>
      </div>

      {/* Tab bar — only for colour-capable lights */}
      {hasColor && (
        <div className="flex justify-center gap-1 pt-1">
          {(['colours', 'whites'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="min-h-[44px] rounded-full px-5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
              style={
                tab === t
                  ? { backgroundColor: 'var(--bg-tertiary, #1e293b)', color: 'var(--text-primary, #f1f5f9)' }
                  : { color: 'var(--text-secondary, #94a3b8)' }
              }
              aria-pressed={tab === t}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
