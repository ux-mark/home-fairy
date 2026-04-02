/**
 * ColorWheel
 *
 * Canvas-based circular hue-saturation colour picker.
 * - Angle around the circle maps to hue (0-360°)
 * - Distance from centre maps to saturation (0-100%)
 * - Always rendered at full brightness (V=1) so all hues are vivid
 * - Brightness is controlled separately via the parent's brightness slider
 *
 * Pointer events support drag on both mouse and touch.
 */
import { useRef, useEffect, useCallback, useId } from 'react'
import { hsvToRgb } from '@/lib/utils'

interface ColorWheelProps {
  hue: number        // 0-360
  saturation: number // 0-100
  /** Diameter of the wheel in CSS pixels (canvas is sized to match). Default 256. */
  size?: number
  onChange: (hue: number, saturation: number) => void
}

export default function ColorWheel({ hue, saturation, size = 256, onChange }: ColorWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDragging = useRef(false)
  const labelId = useId()
  const r = size / 2

  // Render the hue-saturation disc once (or when size changes)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const imageData = ctx.createImageData(size, size)
    const data = imageData.data

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - r
        const dy = y - r
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (dist <= r) {
          // atan2 with screen coords (y increases down) → hue increases clockwise from right
          const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360
          const sat = dist / r // 0 at centre, 1 at edge

          const { r: red, g, b } = hsvToRgb(angle, sat, 1)
          const i = (y * size + x) * 4
          data[i] = red
          data[i + 1] = g
          data[i + 2] = b
          data[i + 3] = 255
        }
        // Pixels outside the circle remain transparent (alpha=0 by default)
      }
    }

    ctx.putImageData(imageData, 0, 0)
  }, [size, r])

  // Convert pointer event to hue+saturation and emit
  const handlePointerEvent = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      // Scale from CSS coords to canvas pixel coords
      const scaleX = size / rect.width
      const scaleY = size / rect.height
      const dx = (e.clientX - rect.left) * scaleX - r
      const dy = (e.clientY - rect.top) * scaleY - r
      const dist = Math.sqrt(dx * dx + dy * dy)

      const newHue = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360
      // Clamp saturation to within the circle
      const newSat = Math.min(dist / r, 1) * 100

      onChange(Math.round(newHue * 10) / 10, Math.round(newSat * 10) / 10)
    },
    [size, r, onChange],
  )

  // Thumb position — map hue+saturation back to (x, y) on the disc
  const thumbX = r + (saturation / 100) * r * Math.cos(hue * Math.PI / 180)
  const thumbY = r + (saturation / 100) * r * Math.sin(hue * Math.PI / 180)
  // As percentages for positioning within the container
  const thumbLeft = (thumbX / size) * 100
  const thumbTop = (thumbY / size) * 100

  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
      role="group"
      aria-labelledby={labelId}
    >
      <span id={labelId} className="sr-only">
        Colour wheel. Hue {Math.round(hue)}°, Saturation {Math.round(saturation)}%.
        Drag to change colour.
      </span>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        style={{ borderRadius: '50%', display: 'block', touchAction: 'none', width: '100%', height: '100%' }}
        aria-hidden="true"
        onPointerDown={e => {
          isDragging.current = true
          ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
          handlePointerEvent(e)
        }}
        onPointerMove={e => {
          if (!isDragging.current) return
          handlePointerEvent(e)
        }}
        onPointerUp={() => { isDragging.current = false }}
        onPointerCancel={() => { isDragging.current = false }}
      />
      {/* Draggable thumb */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: `${thumbLeft}%`,
          top: `${thumbTop}%`,
          transform: 'translate(-50%, -50%)',
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: '3px solid white',
          boxShadow: '0 0 0 1.5px rgba(0,0,0,0.3), 0 2px 8px rgba(0,0,0,0.4)',
          pointerEvents: 'none',
          transition: 'none',
        }}
      />
    </div>
  )
}
