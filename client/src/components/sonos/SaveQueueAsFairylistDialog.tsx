import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ListPlus, Loader2, Plus, X } from 'lucide-react'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'

// ── Props ─────────────────────────────────────────────────────────────────────

interface SaveQueueAsFairylistDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  speaker: string
  trackCount: number
}

// ── SaveQueueAsFairylistDialog ────────────────────────────────────────────────
// Lets the user save the current speaker queue as a Fairylist.
// Calls POST /sonos/:speaker/queue/save-as-fairylist with the selected fairylist id
// (or creates a new one first then saves to it).

export function SaveQueueAsFairylistDialog({
  open,
  onOpenChange,
  speaker,
  trackCount,
}: SaveQueueAsFairylistDialogProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')

  const { data: fairylists, isLoading } = useQuery({
    queryKey: ['fairylists'],
    queryFn: api.fairylists.list,
    staleTime: 30_000,
    enabled: open,
  })

  const saveMutation = useMutation({
    mutationFn: ({ fairylistId, name }: { fairylistId: number; name: string }) =>
      api.sonos.saveQueueAsFairylist(speaker, fairylistId).then(() => name),
    onSuccess: (name) => {
      queryClient.invalidateQueries({ queryKey: ['fairylists'] })
      toast({ message: `Queue saved to "${name}"` })
      onOpenChange(false)
    },
    onError: () => toast({ message: 'Could not save queue', type: 'error' }),
  })

  const createAndSaveMutation = useMutation({
    mutationFn: async (name: string) => {
      const fairylist = await api.fairylists.create(name)
      await api.sonos.saveQueueAsFairylist(speaker, fairylist.id)
      return name
    },
    onSuccess: (name) => {
      queryClient.invalidateQueries({ queryKey: ['fairylists'] })
      toast({ message: `Created "${name}" with ${trackCount} tracks` })
      setNewName('')
      setShowCreate(false)
      onOpenChange(false)
    },
    onError: () => toast({ message: 'Could not create Fairylist', type: 'error' }),
  })

  function handleCreateAndSave() {
    const trimmed = newName.trim()
    if (!trimmed) return
    createAndSaveMutation.mutate(trimmed)
  }

  const isPending = saveMutation.isPending || createAndSaveMutation.isPending

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed bottom-0 left-0 right-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl',
            'bg-[var(--bg-primary)] shadow-xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
            'focus:outline-none',
          )}
          aria-describedby={undefined}
        >
          {/* Header */}
          <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-[var(--border-primary)] bg-[var(--bg-primary)] px-4 py-4">
            <div className="flex items-center gap-2.5">
              <ListPlus className="h-5 w-5 text-fairy-400" aria-hidden="true" />
              <Dialog.Title className="text-base font-semibold text-heading">
                Save queue as Fairylist
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg text-caption transition-colors',
                  'hover:bg-[var(--bg-secondary)]',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                )}
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          <div className="px-4 py-2 pb-6">
            <p className="mb-4 mt-2 text-sm text-caption">
              {trackCount} {trackCount === 1 ? 'track' : 'tracks'} will be added to the selected Fairylist.
            </p>

            {isLoading && (
              <div className="flex items-center justify-center py-8" role="status" aria-label="Loading Fairylists">
                <Loader2 className="h-5 w-5 animate-spin text-caption" aria-hidden="true" />
              </div>
            )}

            {!isLoading && fairylists && fairylists.length === 0 && !showCreate && (
              <p className="py-4 text-center text-sm text-caption">
                No Fairylists yet. Create one below.
              </p>
            )}

            {!isLoading && fairylists && fairylists.length > 0 && (
              <ul className="divide-y divide-[var(--border-secondary)] mb-2" aria-label="Your Fairylists">
                {fairylists.map(fl => (
                  <li key={fl.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-heading">{fl.name}</p>
                      <p className="text-xs text-caption">
                        {fl.item_count} {fl.item_count === 1 ? 'track' : 'tracks'}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => saveMutation.mutate({ fairylistId: fl.id, name: fl.name })}
                      className={cn(
                        'shrink-0 rounded-lg bg-fairy-500/15 px-3 py-1.5 text-xs font-medium text-fairy-400',
                        'transition-colors hover:bg-fairy-500/25 hover:text-fairy-300',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                        'disabled:opacity-40',
                        'min-h-[36px]',
                      )}
                    >
                      {saveMutation.isPending && saveMutation.variables?.fairylistId === fl.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        'Save here'
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {!showCreate ? (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-primary)] py-3',
                  'text-sm font-medium text-caption transition-colors',
                  'hover:border-fairy-500/50 hover:text-fairy-400',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                  'mt-2',
                )}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Create new Fairylist
              </button>
            ) : (
              <div className="mt-3 space-y-2">
                <label htmlFor="new-fairylist-name" className="text-xs font-medium text-caption">
                  New Fairylist name
                </label>
                <input
                  id="new-fairylist-name"
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateAndSave() }}
                  placeholder="e.g. Sunday morning vibes"
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
                    disabled={!newName.trim() || isPending}
                    onClick={handleCreateAndSave}
                    className={cn(
                      'flex-1 rounded-lg bg-fairy-500 py-2 text-sm font-semibold text-white',
                      'transition-colors hover:bg-fairy-400',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                      'disabled:opacity-40',
                      'min-h-[44px]',
                    )}
                  >
                    {createAndSaveMutation.isPending ? (
                      <Loader2 className="mx-auto h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      'Create and save'
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
