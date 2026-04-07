import { useState, useRef } from 'react'

// ── useUndoableQueueAction ────────────────────────────────────────────────────
// Wraps a destructive queue action (remove, clear) with a 5-second undo window.
// The caller is responsible for the optimistic update and restoring state on undo.
//
// Usage:
//   1. Call scheduleAction(label, onCommit, onUndo) immediately after the optimistic update.
//   2. Render a snackbar while pendingAction is non-null with a triggerUndo button.
//   3. The commit fires automatically after windowMs unless undone first.

interface PendingAction {
  label: string
  onUndo: () => void
}

interface UseUndoableQueueActionResult {
  pendingAction: PendingAction | null
  scheduleAction: (label: string, onCommit: () => void, onUndo: () => void) => void
  triggerUndo: () => void
}

export function useUndoableQueueAction(windowMs = 5000): UseUndoableQueueActionResult {
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function scheduleAction(label: string, onCommit: () => void, onUndo: () => void) {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    setPendingAction({ label, onUndo })

    timerRef.current = setTimeout(() => {
      onCommit()
      setPendingAction(null)
      timerRef.current = null
    }, windowMs)
  }

  function triggerUndo() {
    if (!pendingAction) return
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    pendingAction.onUndo()
    setPendingAction(null)
  }

  return { pendingAction, scheduleAction, triggerUndo }
}
