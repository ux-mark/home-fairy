/**
 * KelvinPresets
 *
 * A 3-column grid of preset Kelvin temperature buttons.
 * Matches the LIFX app's whites preset picker design.
 *
 * Only presets within [minKelvin, maxKelvin] are shown.
 * The selected preset is highlighted with a ring border.
 *
 * On tap: calls both onChange and onCommit (discrete selection, not a drag).
 */
import { kelvinToHex } from '@/lib/utils'

interface KelvinPresetsProps {
  kelvin: number
  minKelvin?: number
  maxKelvin?: number
  onChange: (kelvin: number) => void
  onCommit: (kelvin: number) => void
}

interface KelvinPreset {
  name: string
  kelvin: number
}

const KELVIN_PRESETS: KelvinPreset[] = [
  { name: 'Candlelight',      kelvin: 1500 },
  { name: 'Sunset',           kelvin: 2000 },
  { name: 'Amber',            kelvin: 2200 },
  { name: 'Ultra Warm',       kelvin: 2500 },
  { name: 'Incandescent',     kelvin: 2700 },
  { name: 'Warm',             kelvin: 3000 },
  { name: 'Neutral Warm',     kelvin: 3200 },
  { name: 'Neutral',          kelvin: 3500 },
  { name: 'Cool',             kelvin: 4000 },
  { name: 'Cool Daylight',    kelvin: 4500 },
  { name: 'Soft Daylight',    kelvin: 5000 },
  { name: 'Daylight',         kelvin: 5600 },
  { name: 'Noon Daylight',    kelvin: 6000 },
  { name: 'Bright Daylight',  kelvin: 6500 },
  { name: 'Cloudy Daylight',  kelvin: 7000 },
  { name: 'Blue Daylight',    kelvin: 7500 },
  { name: 'Blue Overcast',    kelvin: 8000 },
  { name: 'Blue Ice',         kelvin: 9000 },
]

/** All kelvin backgrounds are light (warm amber → white → light blue), so dark text throughout */
const PRESET_TEXT_COLOR = '#1a1a1a'

export default function KelvinPresets({
  kelvin,
  minKelvin = 1500,
  maxKelvin = 9000,
  onChange,
  onCommit,
}: KelvinPresetsProps) {
  const visiblePresets = KELVIN_PRESETS.filter(
    p => p.kelvin >= minKelvin && p.kelvin <= maxKelvin,
  )

  return (
    <div
      className="overflow-y-auto"
      style={{ maxHeight: 252 }}
      role="listbox"
      aria-label="Colour temperature presets"
    >
      <div className="grid grid-cols-3 gap-1 p-0.5">
        {visiblePresets.map(preset => {
          const bg = kelvinToHex(preset.kelvin)
          const textColor = PRESET_TEXT_COLOR
          const isSelected = kelvin === preset.kelvin

          return (
            <button
              key={preset.kelvin}
              type="button"
              role="option"
              aria-selected={isSelected}
              onClick={() => {
                onChange(preset.kelvin)
                onCommit(preset.kelvin)
              }}
              className="flex min-h-[44px] flex-col items-center justify-center rounded-lg px-1 py-1.5 text-center transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
              style={{
                backgroundColor: bg,
                color: textColor,
                outline: isSelected ? `2px solid #10b981` : undefined,
                outlineOffset: isSelected ? '2px' : undefined,
                boxShadow: isSelected
                  ? '0 0 0 2px rgba(16, 185, 129, 0.4)'
                  : undefined,
              }}
            >
              <span className="block text-[10px] font-semibold leading-tight">
                {preset.name}
              </span>
              <span className="block text-[9px] leading-tight opacity-75">
                {preset.kelvin}K
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
