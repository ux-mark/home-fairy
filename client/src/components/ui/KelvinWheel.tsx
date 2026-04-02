/**
 * KelvinWheel
 *
 * Canvas-based circular colour-temperature picker.
 * - Y position within the circle maps to kelvin (top = coolest, bottom = warmest)
 * - The disc is painted with a vertical kelvin gradient; near the centre it blends
 *   toward white so the disc looks like the LIFX app's whites wheel
 * - Dragging anywhere within the circle updates the kelvin value
 * - Displays current temperature as "Temp: XXXXXK"
 */
import { useRef, useEffect, useCallback, useState, useId } from 'react'
import { kelvinToRgb } from '@/lib/utils'

interface KelvinWheelProps {
  kelvin: number
  minKelvin?: number
  maxKelvin?: number
  /** Diameter of the wheel in CSS pixels. Default 256. */
  size?: number
  onChange: (kelvin: number) => void
}

export default function KelvinWheel({
  kelvin,
  minKelvin = 2500,
  maxKelvin = 9000,
  size = 256,
  onChange,
}: KelvinWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDragging = useRef(false)
  const labelId = useId()
  const r = size / 2

  // Track drag x so the thumb can move freely left/right while kelvin is from y only
  const [thumbDragX, setThumbDragX] = useState<number | null>(null)

  // Render the kelvin disc once (or when size / kelvin range changes)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const imageData = ctx.createImageData(size, size)
    const data = imageData.data

    for (let y = 0; y < size; y++) {
      // Map y (0=top → cool, size=bottom → warm) to kelvin
      const t = y / size
      const k = maxKelvin * (1 - t) + minKelvin * t
      const { r: kr, g: kg, b: kb } = kelvinToRgb(k)

      for (let x = 0; x < size; x++) {
        const dx = x - r
        const dy = y - r
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (dist <= r) {
          // Blend toward white near the centre (like the LIFX wheel)
          const satFactor = dist / r // 0 at centre, 1 at edge
          const red = Math.round(kr * satFactor + 255 * (1 - satFactor))
          const grn = Math.round(kg * satFactor + 255 * (1 - satFactor))
          const blu = Math.round(kb * satFactor + 255 * (1 - satFactor))

          const i = (y * size + x) * 4
          data[i] = red
          data[i + 1] = grn
          data[i + 2] = blu
          data[i + 3] = 255
        }
      }
    }

    ctx.putImageData(imageData, 0, 0)
  }, [size, r, minKelvin, maxKelvin])

  // Map kelvin to a Y coordinate (0=top=cool, size=bottom=warm)
  const kelvinToY = useCallback(
    (k: number) => {
      const t = (maxKelvin - k) / (maxKelvin - minKelvin)
      return Math.max(0, Math.min(size, t * size))
    },
    [size, minKelvin, maxKelvin],
  )

  // Clamp a point to within the circle and extract kelvin from y
  const handlePointerEvent = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const scaleX = size / rect.width
      const scaleY = size / rect.height
      const canvasX = (e.clientX - rect.left) * scaleX
      const canvasY = (e.clientY - rect.top) * scaleY

      // Clamp to within the circle
      const dx = canvasX - r
      const dy = canvasY - r
      const dist = Math.sqrt(dx * dx + dy * dy)
      let clampedX = canvasX
      let clampedY = canvasY
      if (dist > r) {
        const scale = r / dist
        clampedX = r + dx * scale
        clampedY = r + dy * scale
      }

      // Kelvin from y only
      const t = clampedY / size
      const newKelvin = Math.round((maxKelvin * (1 - t) + minKelvin * t) / 100) * 100

      setThumbDragX(clampedX)
      onChange(Math.max(minKelvin, Math.min(maxKelvin, newKelvin)))
    },
    [size, r, minKelvin, maxKelvin, onChange],
  )

  // Thumb position: x = drag position (or centre), y = kelvin-derived
  const thumbY = kelvinToY(kelvin)
  const thumbX = thumbDragX !== null ? thumbDragX : r

  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
      role="group"
      aria-labelledby={labelId}
    >
      <span id={labelId} className="sr-only">
        Colour temperature wheel. Current temperature {kelvin}K.
        Drag up for cooler, down for warmer.
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
          left: `${(thumbX / size) * 100}%`,
          top: `${(thumbY / size) * 100}%`,
          transform: 'translate(-50%, -50%)',
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: '3px solid white',
          boxShadow: '0 0 0 1.5px rgba(0,0,0,0.3), 0 2px 8px rgba(0,0,0,0.4)',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}
