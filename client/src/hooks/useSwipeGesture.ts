import { useState, useRef, useEffect, type RefObject, type TouchEvent as ReactTouchEvent } from 'react'

// ── useSwipeGesture ───────────────────────────────────────────────────────────
// Attaches non-passive touch listeners to a ref element and manages horizontal
// swipe gesture state. Returns the live translateX offset plus booleans for
// the current gesture phase.

interface UseSwipeGestureOptions {
  /** Element to attach touch listeners to */
  ref: RefObject<HTMLElement | null>
  /** Width (px) of the swipe tray to reveal */
  trayWidth: number
  /** Called when the user swipes far enough to open the tray */
  onSwipeOpen: () => void
  /** Called when the user long-presses (500 ms of stillness) */
  onLongPress: () => void
  /** Whether this item's tray is already open (lifted state) */
  isOpen: boolean
  /** Whether any other item's tray is open; used to cancel competing gesture */
  hasOtherOpen: boolean
  /** Close any competing open tray */
  onCloseOther: () => void
}

interface UseSwipeGestureResult {
  liveX: number
  isGesturing: boolean
  translateX: number
  handleTouchStart: (e: ReactTouchEvent) => void
  handleTouchEnd: (e: ReactTouchEvent) => void
}

export function useSwipeGesture({
  ref,
  trayWidth,
  onSwipeOpen,
  onLongPress,
  isOpen,
  hasOtherOpen,
  onCloseOther,
}: UseSwipeGestureOptions): UseSwipeGestureResult {
  const [liveX, setLiveX] = useState(0)
  const [isGesturing, setIsGesturing] = useState(false)

  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const gestureTypeRef = useRef<'none' | 'horizontal' | 'vertical'>('none')
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isGesturingRef = useRef(false)
  // Capture isOpen for use inside native event handler closure
  const isOpenRef = useRef(isOpen)
  const hasOtherOpenRef = useRef(hasOtherOpen)

  useEffect(() => { isOpenRef.current = isOpen }, [isOpen])
  useEffect(() => { hasOtherOpenRef.current = hasOtherOpen }, [hasOtherOpen])

  const translateX = isGesturing ? liveX : (isOpen ? -trayWidth : 0)

  // Non-passive touchmove so we can preventDefault during horizontal swipe
  useEffect(() => {
    const el = ref.current
    if (!el) return

    function onTouchMove(e: TouchEvent) {
      if (!touchStartRef.current) return

      const touch = e.touches[0]
      const dx = touch.clientX - touchStartRef.current.x
      const dy = touch.clientY - touchStartRef.current.y
      const absDx = Math.abs(dx)
      const absDy = Math.abs(dy)

      // Cancel long-press on any significant movement
      if ((absDx > 5 || absDy > 5) && longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }

      // Determine gesture direction (first one to exceed threshold wins)
      if (gestureTypeRef.current === 'none') {
        if (absDx > 5 && absDx >= absDy) {
          gestureTypeRef.current = 'horizontal'
          isGesturingRef.current = true
          setIsGesturing(true)
        } else if (absDy > 5 && absDy > absDx) {
          gestureTypeRef.current = 'vertical'
        }
      }

      // Horizontal swipe: follow finger, clamped to tray bounds
      if (gestureTypeRef.current === 'horizontal') {
        e.preventDefault()
        const baseX = isOpenRef.current ? -trayWidth : 0
        const newX = Math.max(-trayWidth, Math.min(0, baseX + dx))
        setLiveX(newX)
      }
    }

    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, [ref, trayWidth])

  function handleTouchStart(e: ReactTouchEvent) {
    // Don't intercept touches on drag handle
    if ((e.target as HTMLElement).closest('[data-drag-handle]')) return

    // Close any other item's tray
    if (hasOtherOpenRef.current) {
      onCloseOther()
    }

    const touch = e.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
    gestureTypeRef.current = 'none'
    setLiveX(isOpenRef.current ? -trayWidth : 0)

    longPressTimerRef.current = setTimeout(() => {
      if (gestureTypeRef.current === 'none') {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(50)
        }
        onLongPress()
      }
    }, 500)
  }

  function handleTouchEnd(e: ReactTouchEvent) {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }

    if (gestureTypeRef.current === 'horizontal' && touchStartRef.current) {
      const changedTouch = e.changedTouches[0]
      const dx = changedTouch.clientX - touchStartRef.current.x
      const baseX = isOpenRef.current ? -trayWidth : 0
      const finalX = baseX + dx

      if (finalX < -(trayWidth / 2)) {
        onSwipeOpen()
        setLiveX(-trayWidth)
      } else {
        onCloseOther()
        setLiveX(0)
      }
    }

    isGesturingRef.current = false
    setIsGesturing(false)
    touchStartRef.current = null
    gestureTypeRef.current = 'none'
  }

  return {
    liveX,
    isGesturing,
    translateX,
    handleTouchStart,
    handleTouchEnd,
  }
}
