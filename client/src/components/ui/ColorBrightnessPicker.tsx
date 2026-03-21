import { useCallback } from 'react'
import { HslColorPicker, type HslColor } from 'react-colorful'
import { cn, kelvinToHex, hsbToHex } from '@/lib/utils'

interface ColorBrightnessPickerProps {
  hasColor: boolean
  color: HslColor
  kelvin: number
  brightness: number
  minKelvin?: number
  maxKelvin?: number
  onChange: (update: { color?: HslColor; kelvin?: number; brightness?: number }) => void
  onLiveChange?: (update: { color?: HslColor; kelvin?: number; brightness?: number }) => void
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
  const handleColorChange = useCallback(
    (c: HslColor) => {
      onChange({ color: c })
      onLiveChange?.({ color: c })
    },
    [onChange, onLiveChange],
  )

  const handleKelvinChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const k = Number(e.target.value)
      onChange({ kelvin: k })
      onLiveChange?.({ kelvin: k })
    },
    [onChange, onLiveChange],
  )

  const handleBrightnessChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const b = Number(e.target.value)
      onChange({ brightness: b })
      onLiveChange?.({ brightness: b })
    },
    [onChange, onLiveChange],
  )

  // Compute preview color
  const previewHex = hasColor
    ? hsbToHex(color.h, color.s / 100, brightness / 100)
    : kelvinToHex(kelvin)

  return (
    <div className="space-y-4">
      {/* Colour preview */}
      <div className="flex items-center gap-3">
        <div
          className="h-10 w-10 shrink-0 rounded-full border-2 border-slate-700 shadow-inner"
          style={{
            backgroundColor: previewHex,
            opacity: brightness / 100 || 0.05,
          }}
          aria-hidden="true"
        />
        <div className="text-sm text-slate-400">
          {hasColor
            ? `HSL ${Math.round(color.h)}\u00B0 ${Math.round(color.s)}% \u00B7 ${brightness}%`
            : `${kelvin}K \u00B7 ${brightness}%`}
        </div>
      </div>

      {/* Colour picker or kelvin slider */}
      {hasColor ? (
        <div className="overflow-hidden rounded-xl">
          <HslColorPicker color={color} onChange={handleColorChange} />
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-400">
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
              className="relative z-10 h-11 w-full cursor-pointer appearance-none rounded-lg bg-transparent"
              style={{
                background: `linear-gradient(to right, ${kelvinToHex(minKelvin)}, ${kelvinToHex(Math.round((minKelvin + maxKelvin) / 2))}, ${kelvinToHex(maxKelvin)})`,
              }}
              aria-label="Colour temperature"
            />
            <div className="mt-1 flex justify-between text-[10px] text-slate-500">
              <span>Warm {minKelvin}K</span>
              <span>Cool {maxKelvin}K</span>
            </div>
          </div>
        </div>
      )}

      {/* Brightness slider */}
      <div className="space-y-2">
        <label className="flex items-center justify-between text-xs font-medium text-slate-400">
          <span>Brightness</span>
          <span className="text-slate-300">{brightness}%</span>
        </label>
        <div className="relative">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={brightness}
            onChange={handleBrightnessChange}
            className={cn(
              'h-11 w-full cursor-pointer appearance-none rounded-lg',
            )}
            style={{
              background: `linear-gradient(to right, #0f172a, ${previewHex})`,
            }}
            aria-label="Brightness"
          />
        </div>
      </div>
    </div>
  )
}
