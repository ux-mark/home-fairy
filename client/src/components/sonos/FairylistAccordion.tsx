import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Loader2, Play, Plus } from 'lucide-react'
import { api } from '@/lib/api'
import { invalidateQueue } from '@/lib/queueCache'
import { useToast } from '@/hooks/useToast'
import { FairylistActionsMenu } from './FairylistActionsMenu'
import { Accordion } from '@/components/ui/Accordion'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'

// ── Props ─────────────────────────────────────────────────────────────────────

interface FairylistAccordionProps {
  onSelectFairylist: (id: number) => void
  effectiveSpeaker: string | null
}

// ── Shared action button style ─────────────────────────────────────────────────

const actionBtn = cn(
  'flex h-10 w-10 items-center justify-center rounded-lg',
  'text-caption transition-colors hover:bg-[var(--bg-tertiary)] hover:text-body',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
  'disabled:opacity-40',
)

// ── Component ─────────────────────────────────────────────────────────────────

export function FairylistAccordion({ onSelectFairylist, effectiveSpeaker }: FairylistAccordionProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [open, setOpen] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)

  const {
    data: fairylists,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['fairylists'],
    queryFn: api.fairylists.list,
    staleTime: 30_000,
    retry: 1,
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => api.fairylists.create(name),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['fairylists'] })
      toast({ message: `Created "${created.name}"` })
      setNewName('')
      setShowCreate(false)
    },
    onError: () => {
      toast({ message: 'Could not create Fairylist', type: 'error' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.fairylists.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fairylists'] })
      toast({ message: 'Fairylist deleted' })
      setPendingDeleteId(null)
    },
    onError: () => {
      toast({ message: 'Could not delete Fairylist', type: 'error' })
      setPendingDeleteId(null)
    },
  })

  const playMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      api.fairylists.play(id, effectiveSpeaker!).then(() => name),
    onSuccess: (name) => {
      toast({ message: `Playing "${name}" — replaced queue` })
      invalidateQueue(queryClient, effectiveSpeaker)
    },
    onError: () => toast({ message: 'Could not play Fairylist', type: 'error' }),
  })

  const queueMutation = useMutation({
    mutationFn: ({ id, mode }: { id: number; name: string; mode: 'append' | 'next' }) =>
      api.fairylists.queue(id, effectiveSpeaker!, mode),
    onSuccess: (_data, { name, mode }) => {
      toast({ message: mode === 'next' ? `"${name}" will play next` : `Added "${name}" to queue` })
      invalidateQueue(queryClient, effectiveSpeaker)
    },
    onError: () => toast({ message: 'Could not queue Fairylist', type: 'error' }),
  })

  function handleCreate() {
    const trimmed = newName.trim()
    if (!trimmed) return
    createMutation.mutate(trimmed)
  }

  const pendingDeleteList = pendingDeleteId !== null
    ? fairylists?.find(fl => fl.id === pendingDeleteId)
    : undefined

  return (
    <>
      <Accordion
        id="fairylists"
        title="Fairylists"
        open={open}
        onToggle={() => setOpen(v => !v)}
        count={fairylists?.length}
      >
        {/* Loading state */}
        {isLoading && (
          <div className="space-y-2 pt-1" role="status" aria-label="Loading Fairylists">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 flex-1 rounded" />
                <Skeleton className="h-8 w-8 rounded-lg" />
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {isError && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex-1">Could not load Fairylists.</span>
            <button
              type="button"
              onClick={() => refetch()}
              className="shrink-0 text-xs underline hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && fairylists?.length === 0 && !showCreate && (
          <p className="py-2 text-sm text-caption">
            No Fairylists yet. Create one to share playlists with your household.
          </p>
        )}

        {/* Fairylist rows */}
        {!isLoading && !isError && fairylists && fairylists.length > 0 && (
          <ul className="-mx-1 mb-2 divide-y divide-[var(--border-secondary)]" aria-label="Fairylists">
            {fairylists.map(fl => (
              <li key={fl.id} className="flex items-center gap-2 py-2">
                <button
                  type="button"
                  onClick={() => onSelectFairylist(fl.id)}
                  aria-label={`Open ${fl.name}`}
                  className={cn(
                    'min-w-0 flex-1 rounded-lg px-1 py-1 text-left transition-colors',
                    'hover:bg-[var(--bg-tertiary)]',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                  )}
                >
                  <p className="truncate text-sm font-medium text-heading">{fl.name}</p>
                  <p className="text-xs text-caption">
                    {fl.item_count} {fl.item_count === 1 ? 'track' : 'tracks'}
                  </p>
                </button>
                <button
                  type="button"
                  disabled={!effectiveSpeaker || playMutation.isPending}
                  onClick={() => playMutation.mutate({ id: fl.id, name: fl.name })}
                  aria-label={`Play ${fl.name}`}
                  className={actionBtn}
                >
                  {playMutation.isPending && playMutation.variables?.id === fl.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Play className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
                <FairylistActionsMenu
                  name={fl.name}
                  queueDisabled={!effectiveSpeaker || queueMutation.isPending}
                  onAddToQueue={() => queueMutation.mutate({ id: fl.id, name: fl.name, mode: 'append' })}
                  onPlayNext={() => queueMutation.mutate({ id: fl.id, name: fl.name, mode: 'next' })}
                  onDelete={() => setPendingDeleteId(fl.id)}
                />
              </li>
            ))}
          </ul>
        )}

        {/* Create Fairylist */}
        {!isLoading && !isError && (
          showCreate ? (
            <div className="space-y-2 pt-1">
              <label htmlFor="fairylist-name-input" className="text-xs font-medium text-caption">
                Fairylist name
              </label>
              <input
                id="fairylist-name-input"
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setShowCreate(false); setNewName('') } }}
                placeholder="e.g. Weekend chill"
                autoFocus
                className={cn(
                  'w-full rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)]',
                  'px-3 py-2 text-sm text-body placeholder:text-caption',
                  'focus:outline-2 focus:outline-fairy-500',
                )}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setNewName('') }}
                  className={cn(
                    'flex-1 rounded-lg border border-[var(--border-primary)] py-2 text-sm text-caption',
                    'transition-colors hover:text-body',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                    'min-h-[44px]',
                  )}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!newName.trim() || createMutation.isPending}
                  onClick={handleCreate}
                  className={cn(
                    'flex-1 rounded-lg bg-fairy-500 py-2 text-sm font-semibold text-white',
                    'transition-colors hover:bg-fairy-400',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                    'disabled:opacity-40',
                    'min-h-[44px]',
                  )}
                >
                  {createMutation.isPending ? (
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    'Create'
                  )}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-primary)] py-2.5',
                'text-sm font-medium text-caption transition-colors',
                'hover:border-fairy-500/50 hover:text-fairy-400',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                'mt-1',
              )}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create Fairylist
            </button>
          )
        )}
      </Accordion>

      {/* Delete confirmation dialog */}
      <Dialog.Root open={pendingDeleteId !== null} onOpenChange={open => { if (!open) setPendingDeleteId(null) }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content
            className={cn(
              'fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl',
              'bg-[var(--bg-primary)] shadow-xl px-4 py-6',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
              'focus:outline-none',
            )}
            aria-describedby="delete-fairylist-desc"
          >
            <Dialog.Title className="text-base font-semibold text-heading mb-1">
              Delete Fairylist
            </Dialog.Title>
            <p id="delete-fairylist-desc" className="text-sm text-caption mb-6">
              Delete &ldquo;{pendingDeleteList?.name}&rdquo;? This will remove the Fairylist and all its tracks for everyone in the household.
            </p>
            <div className="flex gap-3">
              <Dialog.Close asChild>
                <button
                  className={cn(
                    'flex-1 rounded-xl border border-[var(--border-primary)] py-3 text-sm font-medium text-caption',
                    'transition-colors hover:text-body',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                    'min-h-[44px]',
                  )}
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => pendingDeleteId !== null && deleteMutation.mutate(pendingDeleteId)}
                className={cn(
                  'flex-1 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white',
                  'transition-colors hover:bg-red-500',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                  'disabled:opacity-40',
                  'min-h-[44px]',
                )}
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
