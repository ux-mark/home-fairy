/**
 * ColorBrightnessPicker
 *
 * Core component for controlling light colour and brightness.
 * Uses react-colorful's HsvColorPicker which works in HSV (= HSB) —
 * the same colour space that LIFX uses. This means what the user sees
 * in the picker matches exactly what the physical light will show.
 *
 * For colour lights (has_color=true):
 *   - The rectangle controls hue (x-axis) and saturation (y-axis going down
 *     from full to desaturated). The V channel of the HsvColorPicker maps
 *     to brightness — dragging vertically in the rectangle changes brightness
 *     directly. No separate brightness slider is shown.
 *   - onChange emits { color } where color.v is brightness (0-100).
 *
 * For white-only lights (has_color=false):
 *   - Shows a kelvin temperature slider instead of the colour rectangle.
 *   - A separate brightness slider is shown because there is no rectangle
 *     to encode brightness.
 */
import { useCallback, useEffect, useMemo } from 'react'
import { HsvColorPicker } from 'react-colorful'
import { kelvinToHex, hsbToHex, debounce } from '@/lib/utils'

export interface HsvColor {
  h: number // 0-360
  s: number // 0-100
  v: number // 0-100 (this is brightness in LIFX terms)
}

interface ColorBrightnessPickerProps {
  hasColor: boolean
  /**
   * HSV colour — h: 0-360, s: 0-100, v: 0-100.
   * For colour lights, v IS the brightness — the rectangle's Y-axis encodes it.
   * For white-only lights, v is ignored and brightness is controlled separately.
   */
  color: HsvColor
  kelvin: number
  /**
   * Brightness 0-100. Used only when hasColor is false (white-only/kelvin lights).
   * For colour lights, read brightness from color.v instead.
   */
  brightness: number
  minKelvin?: number
  maxKelvin?: number
  onChange: (update: { color?: HsvColor; kelvin?: number; brightness?: number }) => void
  onLiveChange?: (update: { color?: HsvColor; kelvin?: number; brightness?: number }) => void
}

export default function ColorBrightnessPicker({
  hasColor,
  color,
  kelvin,
  brightness,
  minKelvin = 2500,
  maxKelvin = 9000,
  onChange,
  onLiveChange,
}: ColorBrightnessPickerProps) {
  // Debounced live change (300ms) for API calls — prevents hammering LIFX
  const debouncedLiveChange = useMemo(() => {
    if (!onLiveChange) return undefined
    return debounce(
      (update: { color?: HsvColor; kelvin?: number; brightness?: number }) => {
        onLiveChange(update)
      },
      300,
    )
  }, [onLiveChange])

  useEffect(() => {
    return () => { debouncedLiveChange?.cancel() }
  }, [debouncedLiveChange])

  const handleColorChange = useCallback(
    (c: { h: number; s: number; v: number }) => {
      // react-colorful HsvColorPicker reports h: 0-360, s: 0-100, v: 0-100
      // v encodes brightness — dragging vertically in the rectangle adjusts it.
      const update: HsvColor = { h: c.h, s: c.s, v: c.v }
      onChange({ color: update, brightness: c.v })
      debouncedLiveChange?.({ color: update, brightness: c.v })
    },
    [onChange, debouncedLiveChange],
  )

  const handleKelvinChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const k = Number(e.target.value)
      onChange({ kelvin: k })
      debouncedLiveChange?.({ kelvin: k })
    },
    [onChange, debouncedLiveChange],
  )

  const handleBrightnessChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const b = Number(e.target.value)
      onChange({ brightness: b })
      debouncedLiveChange?.({ brightness: b })
    },
    [onChange, debouncedLiveChange],
  )

  // For colour lights, brightness comes from color.v (the rectangle's Y-axis).
  // For kelvin lights, brightness is the separate slider value.
  const effectiveBrightness = hasColor ? color.v : brightness

  // Preview colour hex — uses HSB→RGB conversion matching LIFX
  const previewHex = hasColor
    ? hsbToHex(color.h, color.s / 100, effectiveBrightness / 100)
    : kelvinToHex(kelvin)

  // Brightness gradient for kelvin-mode slider: dark → current colour at full brightness
  const fullBrightnessHex = previewHex
  const brightnessGradient = `linear-gradient(to right, #0a0a0a, ${fullBrightnessHex})`

  // Kelvin gradient: warm amber → neutral → cool blue-white
  const kelvinGradient = `linear-gradient(to right, #ff8a00, #f5e6d0, #e0e8f0, #b4d7ff)`

  return (
    <div className="space-y-5">
      {/* Colour preview swatch + current values */}
      <div className="flex items-center gap-3">
        <div
          className="h-10 w-10 shrink-0 rounded-full shadow-inner"
          style={{
            backgroundColor: previewHex,
            opacity: Math.max(effectiveBrightness / 100, 0.08),
            border: '2px solid var(--border-secondary, #334155)',
          }}
          aria-hidden="true"
        />
        <div className="text-sm" style={{ color: 'var(--text-secondary, #94a3b8)' }}>
          {hasColor
            ? `H:${Math.round(color.h)}° S:${Math.round(color.s)}% B:${Math.round(color.v)}%`
            : `${kelvin}K · ${brightness}%`}
        </div>
      </div>

      {/* Colour picker (HSV) or Kelvin slider */}
      {hasColor ? (
        <div className="fairy-picker">
          <HsvColorPicker
            color={{ h: color.h, s: color.s, v: color.v || 100 }}
            onChange={handleColorChange}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <label
            className="block text-xs font-medium"
            style={{ color: 'var(--text-secondary, #94a3b8)' }}
          >
            Colour Temperature
          </label>
          <div className="relative">
            <input
              type="range"
              min={minKelvin}
              max={maxKelvin}
              step={100}
              value={kelvin}
              onChange={handleKelvinChange}
              className="fairy-slider w-full"
              style={{ background: kelvinGradient }}
              aria-label="Colour temperature"
            />
            <div
              className="mt-1 flex justify-between text-[10px]"
              style={{ color: 'var(--text-muted, #64748b)' }}
            >
              <span>Warm {minKelvin}K</span>
              <span>Cool {maxKelvin}K</span>
            </div>
          </div>
        </div>
      )}

      {/* Brightness slider — only for white-only (kelvin) lights.
          For colour lights, brightness is encoded in color.v via the picker rectangle. */}
      {!hasColor && (
        <div className="space-y-2">
          <label
            className="flex items-center justify-between text-xs font-medium"
            style={{ color: 'var(--text-secondary, #94a3b8)' }}
          >
            <span>Brightness</span>
            <span style={{ color: 'var(--text-primary, #f1f5f9)' }}>{brightness}%</span>
          </label>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={brightness}
            onChange={handleBrightnessChange}
            className="fairy-slider w-full"
            style={{ background: brightnessGradient }}
            aria-label="Brightness"
          />
        </div>
      )}

      {/* Scoped styles for picker and sliders */}
      <style>{`
        .fairy-picker .react-colorful {
          width: 100% !important;
          height: auto !important;
          gap: 16px;
        }
        .fairy-picker .react-colorful__saturation {
          min-height: 260px;
          border-radius: 12px !important;
          border-bottom: none !important;
        }
        .fairy-picker .react-colorful__last-control,
        .fairy-picker .react-colorful__hue {
          height: 32px !important;
          border-radius: 16px !important;
        }
        .fairy-picker .react-colorful__interactive {
          outline: none;
        }
        .fairy-picker .react-colorful__pointer {
          width: 30px !important;
          height: 30px !important;
          border: 3px solid white !important;
          box-shadow: 0 0 0 1.5px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.35) !important;
        }
        .fairy-picker .react-colorful__hue-pointer {
          width: 34px !important;
          height: 34px !important;
        }
        .fairy-picker .react-colorful__interactive:focus .react-colorful__pointer {
          box-shadow: 0 0 0 2px #10b981, 0 0 0 4px rgba(16,185,129,0.3), 0 2px 8px rgba(0,0,0,0.35) !important;
        }
        .fairy-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 14px;
          border-radius: 7px;
          outline: none;
          cursor: pointer;
          padding: 15px 0;
          background-clip: content-box;
          box-sizing: content-box;
        }
        .fairy-slider:focus-visible {
          outline: 2px solid #10b981;
          outline-offset: 4px;
        }
        .fairy-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: white;
          border: 3px solid rgba(148, 163, 184, 0.5);
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
          cursor: pointer;
          margin-top: -8px;
          transition: transform 0.1s ease, border-color 0.1s ease;
        }
        .fairy-slider:active::-webkit-slider-thumb {
          transform: scale(1.12);
          border-color: #10b981;
        }
        .fairy-slider::-webkit-slider-runnable-track {
          height: 14px;
          border-radius: 7px;
        }
        .fairy-slider::-moz-range-thumb {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: white;
          border: 3px solid rgba(148, 163, 184, 0.5);
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
          cursor: pointer;
          transition: transform 0.1s ease, border-color 0.1s ease;
        }
        .fairy-slider:active::-moz-range-thumb {
          transform: scale(1.12);
          border-color: #10b981;
        }
        .fairy-slider::-moz-range-track {
          height: 14px;
          border-radius: 7px;
          background: transparent;
        }
      `}</style>
    </div>
  )
}
