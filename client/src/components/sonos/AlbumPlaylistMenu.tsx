import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useMutation } from '@tanstack/react-query'
import { Heart, ListEnd, ListPlus, ListStart, MoreVertical } from 'lucide-react'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'
import { AddToFairylistDialog } from './AddToFairylistDialog'

interface AlbumPlaylistMenuProps {
  uri: string
  title: string
  artUri?: string
  source: 'spotify' | 'nas'
  speaker: string | null
}

export function AlbumPlaylistMenu({ uri, title, artUri, source, speaker }: AlbumPlaylistMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const [fairylistOpen, setFairylistOpen] = useState(false)
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const { toast } = useToast()

  const addToQueue = useMutation({
    mutationFn: () => api.sonos.addAlbumToQueue(speaker!, uri, source),
    onSuccess: () => toast({ message: `Added "${title}" to queue` }),
    onError: () => toast({ message: 'Failed to add to queue', type: 'error' }),
  })

  const playNext = useMutation({
    mutationFn: () => api.sonos.playAlbumNext(speaker!, uri, source),
    onSuccess: () => toast({ message: `"${title}" will play next` }),
    onError: () => toast({ message: 'Failed to queue next', type: 'error' }),
  })

  const addToFavourites = useMutation({
    mutationFn: () =>
      api.favourites.add({
        source,
        source_uri: uri,
        title,
        album_art_uri: artUri,
      }),
    onSuccess: () => toast({ message: `Added "${title}" to favourites` }),
    onError: () => toast({ message: 'Failed to add to favourites', type: 'error' }),
  })

  const handleOpen = () => {
    if (menuOpen) {
      setMenuOpen(false)
      return
    }
    if (menuBtnRef.current) {
      const rect = menuBtnRef.current.getBoundingClientRect()
      const showAbove = rect.bottom + 200 > window.innerHeight
      setMenuPos({
        top: showAbove ? rect.top - 200 - 4 : rect.bottom + 4,
        right: window.innerWidth - rect.right,
      })
    }
    setMenuOpen(true)
  }

  return (
    <>
      <div className="shrink-0">
        <button
          ref={menuBtnRef}
          type="button"
          disabled={!speaker}
          onClick={handleOpen}
          onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
          aria-label={`More options for ${title}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-lg',
            'text-caption transition-colors hover:bg-[var(--bg-tertiary)] hover:text-body',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            'disabled:opacity-40',
          )}
        >
          <MoreVertical className="h-4 w-4" aria-hidden="true" />
        </button>

        {menuOpen &&
          menuPos &&
          createPortal(
            <ul
              role="menu"
              style={{ position: 'fixed', top: menuPos.top, right: menuPos.right }}
              className="z-[200] min-w-[180px] overflow-hidden rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] py-1 shadow-lg"
            >
              <li role="none">
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    setFairylistOpen(true)
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-body transition-colors hover:bg-[var(--bg-tertiary)] hover:text-heading"
                >
                  <ListPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Add to Fairylist
                </button>
              </li>
              <li role="none">
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    addToFavourites.mutate()
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-body transition-colors hover:bg-[var(--bg-tertiary)] hover:text-heading"
                >
                  <Heart className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Add to favourites
                </button>
              </li>
              <li role="none">
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    playNext.mutate()
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-body transition-colors hover:bg-[var(--bg-tertiary)] hover:text-heading"
                >
                  <ListStart className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Play next
                </button>
              </li>
              <li role="none">
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    addToQueue.mutate()
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-body transition-colors hover:bg-[var(--bg-tertiary)] hover:text-heading"
                >
                  <ListEnd className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Add to queue
                </button>
              </li>
            </ul>,
            document.body,
          )}
      </div>

      <AddToFairylistDialog
        open={fairylistOpen}
        onOpenChange={setFairylistOpen}
        track={{
          source,
          source_uri: uri,
          title,
          album_art_uri: artUri,
        }}
      />
    </>
  )
}
