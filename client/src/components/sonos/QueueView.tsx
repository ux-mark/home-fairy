import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { arrayMove } from '@dnd-kit/sortable'
import { AlertTriangle, ArrowUp } from 'lucide-react'
import { api } from '@/lib/api'
import type { SonosQueueItem, SonosPlaybackState } from '@/lib/api'
import { useQueueSync } from '@/hooks/useQueueSync'
import { normalizeUri } from '@/lib/normalizeUri'
import { useQueueSelection } from '@/hooks/useQueueSelection'
import { useUndoableQueueAction } from '@/hooks/useUndoableQueueAction'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/Skeleton'
import { QueueEmptyState } from './QueueEmptyState'
import { QueueBulkActionBar } from './QueueBulkActionBar'
import { QueueHeader } from './QueueHeader'
import { NowPlayingCard } from './queue/NowPlayingCard'
import { UpNextWindow } from './queue/UpNextWindow'
import { PlayedHistorySection } from './queue/PlayedHistorySection'

// ── Types ─────────────────────────────────────────────────────────────────────

interface QueueViewProps {
  speaker: string
  open: boolean
  onClose: () => void
  currentTrackUri: string | null
  playbackState?: SonosPlaybackState | null
}

// ── QueueView ─────────────────────────────────────────────────────────────────

export function QueueView({ speaker, open, onClose, currentTrackUri, playbackState }: QueueViewProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const nowPlayingCardRef = useRef<HTMLDivElement>(null)

  const queueKey = ['sonos', 'queue', speaker]

  const { queue, isLoading, isError, refetch } = useQueueSync({
    speaker,
    enabled: open && !!speaker,
  })

  const selection = useQueueSelection()
  const undo = useUndoableQueueAction()

  const [swipedIndex, setSwipedIndex] = useState<number | null>(null)
  const [showJumpPill, setShowJumpPill] = useState(false)

  // ── Derived state ─────────────────────────────────────────────────────────
  // Resolve the index of the currently playing track — with safe fallbacks so we
  // never silently highlight position 0 when nothing is playing.
  const currentIndex = useMemo(() => {
    if (!queue || queue.length === 0) return -1
    if (currentTrackUri) {
      const normalizedUri = normalizeUri(currentTrackUri)
      const idx = queue.findIndex(item => item.uri && normalizeUri(item.uri) === normalizedUri)
      if (idx >= 0) return idx
    }
    const trackNo = playbackState?.trackNo
    if (typeof trackNo === 'number' && trackNo >= 1 && trackNo <= queue.length) {
      return trackNo - 1
    }
    return -1
  }, [queue, currentTrackUri, playbackState?.trackNo])

  const currentItem = currentIndex >= 0 && queue ? queue[currentIndex] : null

  // ── Jump-to-now pill: observe the now-playing card ───────────────────────
  useEffect(() => {
    if (!open) return
    const card = nowPlayingCardRef.current
    const scrollEl = scrollAreaRef.current
    if (!card || !scrollEl) return

    const observer = new IntersectionObserver(
      ([entry]) => setShowJumpPill(!entry.isIntersecting),
      { root: scrollEl, threshold: 0.2 },
    )
    observer.observe(card)
    return () => observer.disconnect()
  }, [queue, currentIndex, open])

  // ── Scroll refs ───────────────────────────────────────────────────────────
  const didInitialScroll = useRef(false)
  const prevCurrentIndex = useRef(-1)

  // ── Initial scroll anchoring ──────────────────────────────────────────────
  // When the sheet first opens with a non-trivial history, the scroll starts
  // at the top (Recently Played) and the user would have to scroll down to see
  // what's playing. Anchor to the now-playing card instead so the timeline
  // reads naturally: a slice of history peeks above, the current track sits
  // in the viewport, and Up Next continues below.
  useEffect(() => {
    if (!open) {
      didInitialScroll.current = false
      prevCurrentIndex.current = -1
      return
    }
    if (didInitialScroll.current) return
    if (isLoading || !queue || queue.length === 0 || currentIndex < 0) return
    const card = nowPlayingCardRef.current
    if (!card) return
    // Double-rAF ensures the browser has both laid out and painted queue items
    // before scrolling, preventing a scroll to position 0 during layout.
    let id2: number
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => {
        card.scrollIntoView({ behavior: 'auto', block: 'start' })
        didInitialScroll.current = true
        prevCurrentIndex.current = currentIndex
      })
    })
    return () => { cancelAnimationFrame(id1); cancelAnimationFrame(id2) }
  }, [open, isLoading, queue, currentIndex])

  // ── Auto-scroll on track advance ─────────────────────────────────────────
  // After the initial anchor scroll, if the user is watching the queue and the
  // track advances, smoothly follow the now-playing card so it stays visible.
  useEffect(() => {
    if (!open || !didInitialScroll.current) return
    if (currentIndex < 0 || currentIndex === prevCurrentIndex.current) return
    prevCurrentIndex.current = currentIndex
    // Only auto-scroll if the now-playing card is out of view
    if (!showJumpPill) return
    nowPlayingCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [open, currentIndex, showJumpPill])

  const handleJumpToNowPlaying = useCallback(() => {
    nowPlayingCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setTimeout(() => nowPlayingCardRef.current?.focus(), 300)
  }, [])

  // ── Focus trap + keyboard ─────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setTimeout(() => cancelBtnRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const el = panelRef.current
    if (!el) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab') return
      const focusable = el!.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // ── Mutations ─────────────────────────────────────────────────────────────
  const reorderMutation = useMutation({
    mutationFn: ({ from, to }: { from: number; to: number }) =>
      api.sonos.reorderQueue(speaker, from, to),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queueKey }),
    onError: () => {
      queryClient.invalidateQueries({ queryKey: queueKey })
      toast({ message: 'Could not reorder queue', type: 'error' })
    },
  })

  const removeMutation = useMutation({
    mutationFn: (index: number) => api.sonos.removeFromQueue(speaker, index),
    onError: () => {
      queryClient.invalidateQueries({ queryKey: queueKey })
      toast({ message: 'Could not remove track', type: 'error' })
    },
  })

  const bulkFavouritesMutation = useMutation({
    mutationFn: async (indices: number[]) => {
      if (!queue) return
      const tracks = indices.map(i => queue[i]).filter(Boolean)
      await Promise.all(
        tracks.map(t =>
          api.favourites.add({
            source: t.uri?.startsWith('spotify:') ? 'spotify' : 'nas',
            source_uri: t.uri,
            title: t.title,
            album_art_uri: t.albumArtUri ?? undefined,
          }),
        ),
      )
    },
    onSuccess: () => {
      toast({ message: `Added ${selection.selectedCount} tracks to favourites` })
      selection.exitSelectMode()
    },
    onError: () => toast({ message: 'Could not add to favourites', type: 'error' }),
  })

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleRemove(index: number) {
    if (!queue) return
    const removedItem = queue[index]
    const snapshot = [...queue]

    queryClient.setQueryData<SonosQueueItem[]>(
      queueKey,
      queue.filter((_, i) => i !== index),
    )

    undo.scheduleAction(
      `Removed "${removedItem.title}"`,
      () => removeMutation.mutate(index),
      () => queryClient.setQueryData<SonosQueueItem[]>(queueKey, snapshot),
    )
  }

  function handleReorderFromUpNext(from: number, to: number) {
    if (!queue) return
    queryClient.setQueryData<SonosQueueItem[]>(
      queueKey,
      arrayMove([...queue], from, to),
    )
    reorderMutation.mutate({ from, to })
  }

  function handleClearRequest() {
    if (!queue || queue.length === 0) return
    const snapshot = [...queue]
    const snapshotUris = snapshot.map(t => t.uri).filter(Boolean)

    // Optimistic client clear
    queryClient.setQueryData<SonosQueueItem[]>(queueKey, [])

    // Fire the server clear immediately — the user expects the speaker to stop
    // queueing up these tracks right away, not after a 5s grace period.
    api.sonos.clearQueue(speaker).catch(() => {
      toast({ message: 'Could not clear queue', type: 'error' })
      queryClient.setQueryData<SonosQueueItem[]>(queueKey, snapshot)
    })

    undo.scheduleAction(
      `Queue cleared · ${snapshot.length} ${snapshot.length === 1 ? 'track' : 'tracks'}`,
      // Commit: nothing to do — the clear already happened.
      () => {},
      // Undo: restore the client state and re-add everything on the server.
      () => {
        queryClient.setQueryData<SonosQueueItem[]>(queueKey, snapshot)
        if (snapshotUris.length > 0) {
          api.sonos
            .restoreQueue(speaker, snapshotUris)
            .then(() => {
              toast({ message: `Restored ${snapshotUris.length} tracks` })
              queryClient.invalidateQueries({ queryKey: queueKey })
            })
            .catch(() => {
              toast({ message: 'Could not restore queue', type: 'error' })
              queryClient.invalidateQueries({ queryKey: queueKey })
            })
        }
      },
    )
  }

  function handleBulkRemove() {
    if (!queue) return
    const indices = Array.from(selection.selectedIndices).sort((a, b) => b - a)
    const snapshot = [...queue]
    const removedCount = indices.length
    const selectedSet = new Set(selection.selectedIndices)

    queryClient.setQueryData<SonosQueueItem[]>(
      queueKey,
      queue.filter((_, i) => !selectedSet.has(i)),
    )
    selection.exitSelectMode()

    undo.scheduleAction(
      `Removed ${removedCount} tracks`,
      async () => {
        for (const idx of indices) {
          await removeMutation.mutateAsync(idx)
        }
      },
      () => queryClient.setQueryData<SonosQueueItem[]>(queueKey, snapshot),
    )
  }

  function handleBulkPlayNext() {
    if (!queue) return
    const indices = Array.from(selection.selectedIndices).sort()
    const tracks = indices.map(i => queue[i]).filter(Boolean)

    Promise.all(tracks.map(t => api.sonos.playNext(speaker, t.uri)))
      .then(() => {
        toast({ message: `${tracks.length} tracks queued next` })
        queryClient.invalidateQueries({ queryKey: queueKey })
      })
      .catch(() => toast({ message: 'Could not queue tracks', type: 'error' }))

    selection.exitSelectMode()
  }

  // ── Render helpers ────────────────────────────────────────────────────────
  const title = queue && queue.length > 0 ? `Queue (${queue.length})` : 'Queue'

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/60 transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Slide-up panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 flex flex-col transition-transform duration-300 ease-out',
          'max-h-[calc(100dvh-4rem)]',
          open ? 'translate-y-0' : 'translate-y-full',
        )}
        style={{ borderRadius: '1rem 1rem 0 0', background: 'var(--bg-secondary)' }}
      >
        {/* Header bar */}
        <div
          className="flex shrink-0 items-center justify-between border-b px-4 py-3"
          style={{ borderColor: 'var(--border-secondary)' }}
        >
          <button
            ref={cancelBtnRef}
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] text-sm text-slate-400 hover:text-slate-300 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            Close
          </button>

          <h2 className="text-sm font-semibold text-heading">{title}</h2>

          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] text-sm font-semibold text-fairy-400 hover:text-fairy-300 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            Done
          </button>
        </div>

        {/* Scrollable content */}
        <div ref={scrollAreaRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto relative">
          {isLoading && (
            <div className="flex flex-col gap-2 px-4 py-3" role="status" aria-label="Loading queue">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-1">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-3/4 rounded" />
                    <Skeleton className="h-3 w-1/2 rounded" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {isError && (
            <div className="flex flex-col items-center justify-center gap-4 py-16 text-center px-4">
              <AlertTriangle className="h-10 w-10 text-red-400" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-heading">Could not load queue</p>
                <p className="mt-1 text-xs text-caption">Check the speaker is reachable.</p>
              </div>
              <button
                onClick={() => refetch()}
                className="rounded-lg border border-[var(--border-primary)] px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
              >
                Retry
              </button>
            </div>
          )}

          {!isLoading && !isError && (!queue || queue.length === 0) && (
            <QueueEmptyState speaker={speaker} />
          )}

          {!isLoading && !isError && queue && queue.length > 0 && (
            <>
              {/* Queue controls — shuffle, repeat, select, save, clear + summary */}
              <QueueHeader
                speaker={speaker}
                currentPlayMode={playbackState?.currentPlayMode}
                onModeChange={() => {}}
                queue={queue}
                isSelecting={selection.isSelecting}
                onToggleSelect={
                  selection.isSelecting ? selection.exitSelectMode : () => selection.enterSelectMode()
                }
                onClearRequest={handleClearRequest}
              />

              {/* Aria-live drag announcement target */}
              <div aria-live="polite" aria-atomic="true" className="sr-only" id="queue-dnd-announce" />

              {/* Timeline: history → now playing → up next */}
              <PlayedHistorySection
                speaker={speaker}
                queue={queue}
                currentIndex={currentIndex}
                onRemove={handleRemove}
                isSelecting={selection.isSelecting}
                isSelected={selection.isSelected}
                onSelectToggle={selection.toggleItem}
                onEnterSelectMode={selection.enterSelectMode}
                swipedIndex={swipedIndex}
                onSwipeOpen={setSwipedIndex}
              />

              <NowPlayingCard
                ref={nowPlayingCardRef}
                speaker={speaker}
                item={currentItem}
                currentIndex={currentIndex}
                playbackState={playbackState}
                onRemove={handleRemove}
                variant="sticky"
              />

              <UpNextWindow
                speaker={speaker}
                queue={queue}
                currentIndex={currentIndex}
                onRemove={handleRemove}
                onReorder={handleReorderFromUpNext}
                isSelecting={selection.isSelecting}
                isSelected={selection.isSelected}
                onSelectToggle={selection.toggleItem}
                onEnterSelectMode={selection.enterSelectMode}
                swipedIndex={swipedIndex}
                onSwipeOpen={setSwipedIndex}
              />

              {/* Bulk action bar — sticky to bottom of scroll area in select mode */}
              {selection.isSelecting && (
                <QueueBulkActionBar
                  selectedCount={selection.selectedCount}
                  totalCount={queue.length}
                  onPlayNext={handleBulkPlayNext}
                  onRemove={handleBulkRemove}
                  onAddToFavourites={() =>
                    bulkFavouritesMutation.mutate(Array.from(selection.selectedIndices))
                  }
                  onSelectAll={() =>
                    selection.selectedCount === queue.length
                      ? selection.clearSelection()
                      : selection.selectAll(queue.length)
                  }
                  onCancel={selection.exitSelectMode}
                  isRemoving={removeMutation.isPending}
                />
              )}
            </>
          )}
        </div>

        {/* Undo snackbar — fixed to bottom of panel, above scroll area */}
        {undo.pendingAction && (
          <div
            className={cn(
              'absolute bottom-16 left-1/2 -translate-x-1/2 z-30',
              'flex items-center gap-3 rounded-full px-4 py-2.5 shadow-lg',
              'bg-slate-800 border border-slate-700',
            )}
            role="status"
            aria-live="polite"
          >
            <span className="text-sm text-slate-200 whitespace-nowrap">
              {undo.pendingAction.label}
            </span>
            <button
              onClick={undo.triggerUndo}
              className="text-sm font-semibold text-fairy-400 hover:text-fairy-300 transition-colors focus-visible:outline-2 focus-visible:outline-fairy-500 rounded"
            >
              Undo
            </button>
          </div>
        )}

        {/* Jump to now-playing pill */}
        {showJumpPill && currentItem && !selection.isSelecting && (
          <button
            onClick={handleJumpToNowPlaying}
            className={cn(
              'absolute bottom-4 right-4 z-30',
              'flex items-center gap-1.5 rounded-full px-3 py-2 shadow-lg',
              'bg-fairy-500/90 text-white text-xs font-semibold',
              'hover:bg-fairy-500 transition-colors',
              'focus-visible:outline-2 focus-visible:outline-white',
            )}
            aria-label="Jump to now playing track"
          >
            <ArrowUp className="h-3 w-3" aria-hidden="true" />
            Now playing
          </button>
        )}
      </div>
    </>
  )
}
