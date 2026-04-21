import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Loader2, Pin, Sparkles, X } from 'lucide-react'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'

interface PinSpotifyPlaylistDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PinSpotifyPlaylistDialog({
  open,
  onOpenChange,
}: PinSpotifyPlaylistDialogProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [input, setInput] = useState('')

  function handleOpenChange(next: boolean) {
    if (!next) setInput('')
    onOpenChange(next)
  }

  const pinMutation = useMutation({
    mutationFn: (value: string) => api.spotify.pinPlaylist(value),
    onSuccess: pinned => {
      queryClient.invalidateQueries({ queryKey: ['spotify-pinned'] })
      toast({ message: `Pinned "${pinned.name}"` })
      handleOpenChange(false)
    },
    onError: (err: Error) => {
      toast({ message: err.message || 'Could not pin that playlist', type: 'error' })
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return
    pinMutation.mutate(trimmed)
  }

  const isPending = pinMutation.isPending

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
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
          aria-describedby="pin-spotify-description"
        >
          {/* Header */}
          <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-[var(--border-primary)] bg-[var(--bg-primary)] px-4 py-4">
            <div className="flex items-center gap-2.5">
              <Pin className="h-5 w-5 text-fairy-400" aria-hidden="true" />
              <Dialog.Title className="text-base font-semibold text-heading">
                Pin a Spotify playlist
              </Dialog.Title>
            </div>
            <Dialog.Close
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-lg',
                'text-caption transition-colors hover:bg-[var(--bg-secondary)] hover:text-body',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              )}
              aria-label="Close"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Dialog.Close>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit} className="space-y-4 px-4 py-5">
            <p id="pin-spotify-description" className="text-sm text-body">
              Paste a Spotify playlist link — even for{' '}
              <span className="font-medium text-heading">Discover Weekly</span>,{' '}
              <span className="font-medium text-heading">Release Radar</span>, or any
              playlist Spotify hides from third-party apps. We'll queue it up on your
              speakers.
            </p>

            <div className="rounded-lg border border-fairy-400/20 bg-fairy-400/5 p-3 text-xs text-caption">
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fairy-400" aria-hidden="true" />
                <div className="space-y-1">
                  <p className="font-medium text-heading">How to copy a link</p>
                  <p>
                    In Spotify → tap the ⋯ menu on a playlist → <span className="font-medium">Share</span> →{' '}
                    <span className="font-medium">Copy link</span>.
                  </p>
                </div>
              </div>
            </div>

            <label htmlFor="pin-playlist-input" className="block">
              <span className="mb-1.5 block text-xs font-medium text-body">
                Playlist link or URI
              </span>
              <input
                id="pin-playlist-input"
                type="url"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="https://open.spotify.com/playlist/…"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                disabled={isPending}
                className={cn(
                  'w-full rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)]',
                  'px-3 py-2.5 text-sm text-heading placeholder:text-caption/60',
                  'focus:border-fairy-400 focus:outline-none focus:ring-2 focus:ring-fairy-400/20',
                  'disabled:opacity-50',
                )}
              />
            </label>

            {pinMutation.isError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{(pinMutation.error as Error)?.message ?? 'Could not pin that playlist.'}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                disabled={isPending}
                className={cn(
                  'rounded-lg px-4 py-2 text-sm font-medium text-body',
                  'transition-colors hover:bg-[var(--bg-secondary)]',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                  'min-h-[44px]',
                )}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || !input.trim()}
                className={cn(
                  'flex min-h-[44px] items-center gap-2 rounded-lg bg-fairy-500 px-4 py-2',
                  'text-sm font-medium text-white transition-colors hover:bg-fairy-400',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                  'disabled:opacity-50',
                )}
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>Pinning…</span>
                  </>
                ) : (
                  <>
                    <Pin className="h-4 w-4" aria-hidden="true" />
                    <span>Pin playlist</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
