import { useEffect, useRef } from 'react'
import type React from 'react'
import { cn } from '@/lib/utils'

interface ActionPopoverProps {
  open: boolean
  onClose: () => void
  triggerRef?: React.RefObject<HTMLButtonElement | null>
  ariaLabel: string
  borderColor?: string
  children: React.ReactNode
}

export function ActionPopover({
  open,
  onClose,
  triggerRef,
  ariaLabel,
  borderColor,
  children,
}: ActionPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: PointerEvent) {
      if (triggerRef?.current && triggerRef.current.contains(e.target as Node)) return
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open, onClose, triggerRef])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={panelRef}
      className={cn(
        'absolute left-0 right-0 top-full z-30',
        'bg-[var(--bg-secondary)]',
        'border-2 border-t-0',
        borderColor ?? 'border-[var(--border-primary)]',
        'rounded-b-xl',
        'shadow-[0_8px_30px_rgba(0,0,0,0.35)] dark:shadow-[0_8px_30px_rgba(255,255,255,0.07)]',
        'overflow-hidden',
      )}
      style={{ clipPath: 'inset(0px -40px -40px -40px)' }}
      role="region"
      aria-label={ariaLabel}
    >
      {children}
    </div>
  )
}
