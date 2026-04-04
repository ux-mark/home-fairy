import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ListPlus, Loader2, Plus, X } from 'lucide-react'
import { api } from '@/lib/api'
import type { AddFairylistItemInput } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'

// ── Props ─────────────────────────────────────────────────────────────────────

interface AddToFairylistDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  track: {
    source: 'sonos' | 'spotify' | 'nas' | 'radio'
    source_uri: string
    title: string
    artist?: string
    album_art_uri?: string
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AddToFairylistDialog({ open, onOpenChange, track }: AddToFairylistDialogProps) {
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

  const addItemMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => {
      const data: AddFairylistItemInput = {
        source: track.source,
        source_uri: track.source_uri,
        title: track.title,
        artist: track.artist,
        album_art_uri: track.album_art_uri,
      }
      return api.fairylists.addItem(id, data).then(result => ({ result, name }))
    },
    onSuccess: ({ name }) => {
      queryClient.invalidateQueries({ queryKey: ['fairylists'] })
      toast({ message: `Added to ${name}` })
      onOpenChange(false)
    },
    onError: (err: Error) => {
      if (err.message.includes('Already in this Fairylist')) {
        toast({ message: 'Already in this Fairylist', type: 'error' })
      } else {
        toast({ message: 'Could not add to Fairylist', type: 'error' })
      }
    },
  })

  const createAndAddMutation = useMutation({
    mutationFn: async (name: string) => {
      const fairylist = await api.fairylists.create(name)
      const data: AddFairylistItemInput = {
        source: track.source,
        source_uri: track.source_uri,
        title: track.title,
        artist: track.artist,
        album_art_uri: track.album_art_uri,
      }
      await api.fairylists.addItem(fairylist.id, data)
      return name
    },
    onSuccess: (name) => {
      queryClient.invalidateQueries({ queryKey: ['fairylists'] })
      toast({ message: `Created "${name}" and added track` })
      setNewName('')
      setShowCreate(false)
      onOpenChange(false)
    },
    onError: () => {
      toast({ message: 'Could not create Fairylist', type: 'error' })
    },
  })

  function handleCreateAndAdd() {
    const trimmed = newName.trim()
    if (!trimmed) return
    createAndAddMutation.mutate(trimmed)
  }

  const isPending = addItemMutation.isPending || createAndAddMutation.isPending

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
                Add to Fairylist
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
            {/* Track being added */}
            <p className="mb-4 mt-2 truncate text-sm text-caption">
              {track.title}{track.artist ? ` · ${track.artist}` : ''}
            </p>

            {/* Loading state */}
            {isLoading && (
              <div className="flex items-center justify-center py-8" role="status" aria-label="Loading Fairylists">
                <Loader2 className="h-5 w-5 animate-spin text-caption" aria-hidden="true" />
              </div>
            )}

            {/* Fairylist list */}
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
                      onClick={() => addItemMutation.mutate({ id: fl.id, name: fl.name })}
                      className={cn(
                        'shrink-0 rounded-lg bg-fairy-500/15 px-3 py-1.5 text-xs font-medium text-fairy-400',
                        'transition-colors hover:bg-fairy-500/25 hover:text-fairy-300',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                        'disabled:opacity-40',
                        'min-h-[36px]',
                      )}
                    >
                      {addItemMutation.isPending && addItemMutation.variables?.id === fl.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        'Add'
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Create new Fairylist section */}
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
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateAndAdd() }}
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
                    onClick={handleCreateAndAdd}
                    className={cn(
                      'flex-1 rounded-lg bg-fairy-500 py-2 text-sm font-semibold text-white',
                      'transition-colors hover:bg-fairy-400',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                      'disabled:opacity-40',
                      'min-h-[44px]',
                    )}
                  >
                    {createAndAddMutation.isPending ? (
                      <Loader2 className="mx-auto h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      'Create and add'
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
