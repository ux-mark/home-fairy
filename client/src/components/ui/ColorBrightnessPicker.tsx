/**
 * ColorBrightnessPicker
 *
 * LIFX-style colour/temperature picker with:
 *   - "Colours" tab: circular hue-saturation wheel (ColorWheel)
 *   - "Whites"  tab: Kelvin preset grid (KelvinPresets)
 *   - Vertical brightness slider (custom pointer-event based, touch-optimised)
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
import { useCallback, useRef, useState } from 'react'
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
}

// Brightness slider width and height
const SLIDER_W = 40
const SLIDER_H = 252

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

  // ── Brightness slider (custom pointer-event based) ────────────────────────

  const sliderRef = useRef<HTMLDivElement>(null)
  const isDraggingBrightness = useRef(false)

  const effectiveBrightness = hasColor ? color.v : brightness

  /** Convert pointer clientY to a brightness value 0–100 */
  const pointerYToBrightness = useCallback((clientY: number): number => {
    const el = sliderRef.current
    if (!el) return effectiveBrightness
    const rect = el.getBoundingClientRect()
    // top = 100%, bottom = 0%
    const ratio = 1 - (clientY - rect.top) / rect.height
    return Math.round(Math.max(0, Math.min(100, ratio * 100)))
  }, [effectiveBrightness])

  const fireBrightnessChange = useCallback(
    (b: number) => {
      if (hasColor) {
        onChange({ color: { h: color.h, s: color.s, v: b }, brightness: b })
      } else {
        onChange({ brightness: b })
      }
    },
    [hasColor, color, onChange],
  )

  const fireBrightnessCommit = useCallback(
    (b: number) => {
      if (hasColor) {
        onCommit({ color: { h: color.h, s: color.s, v: b }, brightness: b })
      } else {
        onCommit({ brightness: b })
      }
    },
    [hasColor, color, onCommit],
  )

  const handleSliderPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      isDraggingBrightness.current = true
      ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
      const b = pointerYToBrightness(e.clientY)
      fireBrightnessChange(b)
    },
    [pointerYToBrightness, fireBrightnessChange],
  )

  const handleSliderPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingBrightness.current) return
      const b = pointerYToBrightness(e.clientY)
      fireBrightnessChange(b)
    },
    [pointerYToBrightness, fireBrightnessChange],
  )

  const handleSliderPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingBrightness.current) return
      isDraggingBrightness.current = false
      const b = pointerYToBrightness(e.clientY)
      fireBrightnessCommit(b)
    },
    [pointerYToBrightness, fireBrightnessCommit],
  )

  const handleSliderKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      let delta = 0
      if (e.key === 'ArrowUp') delta = 1
      else if (e.key === 'ArrowDown') delta = -1
      else if (e.key === 'PageUp') delta = 10
      else if (e.key === 'PageDown') delta = -10
      else return

      e.preventDefault()
      const b = Math.max(0, Math.min(100, Math.round(effectiveBrightness) + delta))
      fireBrightnessChange(b)
      fireBrightnessCommit(b)
    },
    [effectiveBrightness, fireBrightnessChange, fireBrightnessCommit],
  )

  // ── Derived display values ────────────────────────────────────────────────

  const currentColorHex = hasColor
    ? hsbToHex(color.h, color.s / 100, effectiveBrightness / 100)
    : kelvinToHex(kelvin)

  // Brightness slider gradient: black at bottom → current colour at top
  const brightnessGradient =
    tab === 'whites' || !hasColor
      ? `linear-gradient(to top, #0a0a0a, ${kelvinToHex(kelvin)})`
      : `linear-gradient(to top, #0a0a0a, ${hsbToHex(color.h, color.s / 100, 1)})`

  // ── Render ────────────────────────────────────────────────────────────────

  const showWhitesPresets = !hasColor || tab === 'whites'
  const showColourWheel = hasColor && tab === 'colours'

  // Thumb Y%: 0% brightness = 100% from top (bottom), 100% brightness = 0% from top (top)
  const thumbTopPercent = 100 - effectiveBrightness

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

      {/* Wheel/presets + brightness slider */}
      <div className="flex items-center justify-center gap-3">
        {/* Colour wheel or Kelvin preset grid */}
        <div style={{ width: SLIDER_H, height: SLIDER_H, flexShrink: 0 }}>
          {showColourWheel && (
            <ColorWheel
              hue={color.h}
              saturation={color.s}
              size={SLIDER_H}
              onChange={handleColorWheelChange}
              onCommit={handleColorWheelCommit}
            />
          )}
          {showWhitesPresets && (
            <KelvinPresets
              kelvin={kelvin}
              minKelvin={minKelvin}
              maxKelvin={maxKelvin}
              onChange={handleKelvinChange}
              onCommit={handleKelvinCommit}
            />
          )}
        </div>

        {/* Custom vertical brightness slider */}
        <div
          ref={sliderRef}
          role="slider"
          tabIndex={0}
          aria-label="Brightness"
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(effectiveBrightness)}
          className="relative overflow-hidden rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          style={{
            width: SLIDER_W,
            height: SLIDER_H,
            background: brightnessGradient,
            flexShrink: 0,
            touchAction: 'none',
            cursor: 'pointer',
          }}
          onPointerDown={handleSliderPointerDown}
          onPointerMove={handleSliderPointerMove}
          onPointerUp={handleSliderPointerUp}
          onPointerCancel={() => { isDraggingBrightness.current = false }}
          onKeyDown={handleSliderKeyDown}
        >
          {/* Thumb */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute rounded-full border-2 border-white"
            style={{
              width: 28,
              height: 28,
              backgroundColor: currentColorHex,
              left: '50%',
              top: `${thumbTopPercent}%`,
              transform: 'translate(-50%, -50%)',
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
    </div>
  )
}
