/**
 * ColorBrightnessPicker
 *
 * LIFX-style colour/temperature picker with:
 *   - "Colours" tab: circular hue-saturation wheel (ColorWheel)
 *   - "Whites"  tab: circular kelvin-temperature wheel (KelvinWheel)
 *   - Vertical brightness slider to the right of the wheel
 *   - Tabs only shown for colour-capable lights (has_color=true)
 *   - White-only lights show KelvinWheel + brightness slider directly
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
import { kelvinToHex, hsbToHex } from '@/lib/utils'
import ColorWheel from './ColorWheel'
import KelvinWheel from './KelvinWheel'

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
}

// Wheel display size in CSS px — large enough for comfortable touch interaction
const WHEEL_SIZE = 252
// Brightness slider width and height
const SLIDER_W = 40
const SLIDER_H = WHEEL_SIZE

export default function ColorBrightnessPicker({
  hasColor,
  color,
  kelvin,
  brightness,
  minKelvin = 2500,
  maxKelvin = 9000,
  onChange,
  onCommit,
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

  // ── Kelvin wheel ──────────────────────────────────────────────────────────

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

  // ── Brightness slider ─────────────────────────────────────────────────────

  // Called on every input event (including during touch drag) for instant local update
  const handleBrightnessInput = useCallback(
    (e: React.FormEvent<HTMLInputElement>) => {
      const b = Number((e.target as HTMLInputElement).value)
      if (hasColor) {
        onChange({ color: { h: color.h, s: color.s, v: b }, brightness: b })
      } else {
        onChange({ brightness: b })
      }
    },
    [hasColor, color, onChange],
  )

  // Called on pointer up / finger lift — final commit
  const handleBrightnessChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const b = Number(e.target.value)
      if (hasColor) {
        onCommit({ color: { h: color.h, s: color.s, v: b }, brightness: b })
      } else {
        onCommit({ brightness: b })
      }
    },
    [hasColor, color, onCommit],
  )

  // ── Derived display values ────────────────────────────────────────────────

  const effectiveBrightness = hasColor ? color.v : brightness

  const currentColorHex = hasColor
    ? hsbToHex(color.h, color.s / 100, effectiveBrightness / 100)
    : kelvinToHex(kelvin)

  // Brightness slider gradient: black at bottom → current colour at top
  // We use a vertical gradient (top = bright, bottom = dark)
  const brightnessGradient =
    tab === 'whites' || !hasColor
      ? `linear-gradient(to top, #0a0a0a, ${kelvinToHex(kelvin)})`
      : `linear-gradient(to top, #0a0a0a, ${hsbToHex(color.h, color.s / 100, 1)})`

  // ── Render ────────────────────────────────────────────────────────────────

  const showWhitesWheel = !hasColor || tab === 'whites'
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
          ☀ {Math.round(effectiveBrightness)}%
        </span>
      </div>

      {/* Wheel + brightness slider */}
      <div className="flex items-center justify-center gap-3">
        {/* Colour or kelvin wheel */}
        <div style={{ width: WHEEL_SIZE, height: WHEEL_SIZE, flexShrink: 0 }}>
          {showColourWheel && (
            <ColorWheel
              hue={color.h}
              saturation={color.s}
              size={WHEEL_SIZE}
              onChange={handleColorWheelChange}
              onCommit={handleColorWheelCommit}
            />
          )}
          {showWhitesWheel && (
            <KelvinWheel
              kelvin={kelvin}
              minKelvin={minKelvin}
              maxKelvin={maxKelvin}
              size={WHEEL_SIZE}
              onChange={handleKelvinChange}
              onCommit={handleKelvinCommit}
            />
          )}
        </div>

        {/* Vertical brightness slider */}
        <div
          className="relative flex items-center justify-center overflow-hidden rounded-full"
          style={{
            width: SLIDER_W,
            height: SLIDER_H,
            background: brightnessGradient,
            flexShrink: 0,
          }}
        >
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(effectiveBrightness)}
            onInput={handleBrightnessInput}
            onChange={handleBrightnessChange}
            aria-label="Brightness"
            className="brightness-slider-vertical"
          />
          {/* Colour swatch at the thumb position — purely visual */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute rounded-full border-2 border-white"
            style={{
              width: 28,
              height: 28,
              backgroundColor: currentColorHex,
              // Position thumb: 0% brightness = bottom, 100% = top
              top: `${100 - effectiveBrightness}%`,
              transform: 'translateY(-50%)',
              boxShadow: '0 0 0 1.5px rgba(0,0,0,0.3), 0 2px 8px rgba(0,0,0,0.4)',
            }}
          />
        </div>
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

      {/* Scoped styles for vertical slider */}
      <style>{`
        .brightness-slider-vertical {
          -webkit-appearance: none;
          appearance: none;
          writing-mode: vertical-lr;
          direction: rtl;
          width: ${SLIDER_H}px;
          height: ${SLIDER_W}px;
          background: transparent;
          cursor: pointer;
          outline: none;
          position: absolute;
          inset: 0;
          margin: auto;
        }
        .brightness-slider-vertical:focus-visible {
          outline: 2px solid #10b981;
          outline-offset: 4px;
          border-radius: 4px;
        }
        .brightness-slider-vertical::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: ${SLIDER_W + 4}px;
          height: ${SLIDER_W + 4}px;
          border-radius: 50%;
          background: transparent;
          border: none;
          cursor: pointer;
        }
        .brightness-slider-vertical::-moz-range-thumb {
          width: ${SLIDER_W + 4}px;
          height: ${SLIDER_W + 4}px;
          border-radius: 50%;
          background: transparent;
          border: none;
          cursor: pointer;
        }
        .brightness-slider-vertical::-webkit-slider-runnable-track {
          background: transparent;
        }
        .brightness-slider-vertical::-moz-range-track {
          background: transparent;
        }
      `}</style>
    </div>
  )
}
