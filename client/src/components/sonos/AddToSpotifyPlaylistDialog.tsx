import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Loader2, Music2, Plus, X } from 'lucide-react'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'

// ── Props ─────────────────────────────────────────────────────────────────────

interface AddToSpotifyPlaylistDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trackUri: string
  trackName: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AddToSpotifyPlaylistDialog({
  open,
  onOpenChange,
  trackUri,
  trackName,
}: AddToSpotifyPlaylistDialogProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['spotify-status'],
    queryFn: api.spotify.getStatus,
    staleTime: 60_000,
    enabled: open,
  })

  const { data: playlists, isLoading: playlistsLoading } = useQuery({
    queryKey: ['spotify-playlists'],
    queryFn: () => api.spotify.getPlaylists(50, 0),
    staleTime: 60_000,
    enabled: open && !!status?.connected && !status?.needs_reauth,
  })

  const addMutation = useMutation({
    mutationFn: ({ playlistId, playlistName }: { playlistId: string; playlistName: string }) =>
      api.spotify.addToPlaylist(playlistId, trackUri).then(() => playlistName),
    onSuccess: (playlistName) => {
      toast({ message: `Added to "${playlistName}" on Spotify` })
      onOpenChange(false)
    },
    onError: () => {
      toast({ message: 'Could not add to Spotify playlist', type: 'error' })
    },
  })

  const createAndAddMutation = useMutation({
    mutationFn: async (name: string) => {
      const playlist = await api.spotify.createPlaylist(name)
      await api.spotify.addToPlaylist(playlist.id, trackUri)
      return name
    },
    onSuccess: (name) => {
      queryClient.invalidateQueries({ queryKey: ['spotify-playlists'] })
      toast({ message: `Created "${name}" and added track on Spotify` })
      setNewName('')
      setShowCreate(false)
      onOpenChange(false)
    },
    onError: () => {
      toast({ message: 'Could not create Spotify playlist', type: 'error' })
    },
  })

  function handleCreateAndAdd() {
    const trimmed = newName.trim()
    if (!trimmed) return
    createAndAddMutation.mutate(trimmed)
  }

  const isLoading = statusLoading || playlistsLoading
  const isPending = addMutation.isPending || createAndAddMutation.isPending

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
              <Music2 className="h-5 w-5 text-green-400" aria-hidden="true" />
              <Dialog.Title className="text-base font-semibold text-heading">
                Add to Spotify Playlist
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
            <p className="mb-4 mt-2 truncate text-sm text-caption">{trackName}</p>

            {/* Loading state */}
            {isLoading && (
              <div className="flex items-center justify-center py-8" role="status" aria-label="Loading playlists">
                <Loader2 className="h-5 w-5 animate-spin text-caption" aria-hidden="true" />
              </div>
            )}

            {/* Needs reauth */}
            {!isLoading && status?.needs_reauth && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
                <p className="text-sm text-amber-300">
                  Reconnect Spotify in Settings to add to playlists. Playlist write access needs to be granted.
                </p>
              </div>
            )}

            {/* Not connected */}
            {!isLoading && !status?.connected && !status?.needs_reauth && (
              <p className="py-4 text-center text-sm text-caption">
                Connect Spotify in Settings to add to playlists.
              </p>
            )}

            {/* Playlists list */}
            {!isLoading && !status?.needs_reauth && status?.connected && playlists && playlists.items.length === 0 && !showCreate && (
              <p className="py-4 text-center text-sm text-caption">No playlists found. Create one below.</p>
            )}

            {!isLoading && !status?.needs_reauth && playlists && playlists.items.length > 0 && (
              <ul className="divide-y divide-[var(--border-secondary)] mb-2" aria-label="Your Spotify playlists">
                {playlists.items.map(pl => (
                  <li key={pl.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-heading">{pl.name}</p>
                      <p className="text-xs text-caption">
                        {pl.tracks.total} {pl.tracks.total === 1 ? 'track' : 'tracks'}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => addMutation.mutate({ playlistId: pl.id, playlistName: pl.name })}
                      className={cn(
                        'shrink-0 rounded-lg bg-green-500/15 px-3 py-1.5 text-xs font-medium text-green-400',
                        'transition-colors hover:bg-green-500/25 hover:text-green-300',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                        'disabled:opacity-40',
                        'min-h-[36px]',
                      )}
                    >
                      {addMutation.isPending && addMutation.variables?.playlistId === pl.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        'Add'
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Create new playlist section — only when connected and write scope available */}
            {!isLoading && status?.connected && !status?.needs_reauth && (
              showCreate ? (
                <div className="mt-3 space-y-2">
                  <label htmlFor="new-spotify-playlist-name" className="text-xs font-medium text-caption">
                    New playlist name
                  </label>
                  <input
                    id="new-spotify-playlist-name"
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
                        'flex-1 rounded-lg bg-green-600 py-2 text-sm font-semibold text-white',
                        'transition-colors hover:bg-green-500',
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
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className={cn(
                    'flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-primary)] py-3',
                    'text-sm font-medium text-caption transition-colors',
                    'hover:border-green-500/50 hover:text-green-400',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                    'mt-2',
                  )}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Create new Spotify playlist
                </button>
              )
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
