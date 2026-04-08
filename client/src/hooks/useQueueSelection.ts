import { useState, useCallback } from 'react'

// ── useQueueSelection ─────────────────────────────────────────────────────────
// Manages multi-select state for the queue. Entering select mode is triggered
// by long-press on a row or the "Select" button in QueueHeader.

export interface UseQueueSelectionResult {
  isSelecting: boolean
  selectedIndices: Set<number>
  enterSelectMode: (firstIndex?: number) => void
  exitSelectMode: () => void
  toggleItem: (index: number) => void
  selectAll: (count: number) => void
  clearSelection: () => void
  isSelected: (index: number) => boolean
  selectedCount: number
}

export function useQueueSelection(): UseQueueSelectionResult {
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())

  const enterSelectMode = useCallback((firstIndex?: number) => {
    setIsSelecting(true)
    if (firstIndex !== undefined) {
      setSelectedIndices(new Set([firstIndex]))
    }
  }, [])

  const exitSelectMode = useCallback(() => {
    setIsSelecting(false)
    setSelectedIndices(new Set())
  }, [])

  const toggleItem = useCallback((index: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }, [])

  const selectAll = useCallback((count: number) => {
    setSelectedIndices(new Set(Array.from({ length: count }, (_, i) => i)))
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedIndices(new Set())
  }, [])

  const isSelected = useCallback(
    (index: number) => selectedIndices.has(index),
    [selectedIndices],
  )

  return {
    isSelecting,
    selectedIndices,
    enterSelectMode,
    exitSelectMode,
    toggleItem,
    selectAll,
    clearSelection,
    isSelected,
    selectedCount: selectedIndices.size,
  }
}
