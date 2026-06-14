import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Loader2, X } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'
import { api, parseApiError } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { FavouriteSelector } from './FavouriteSelector'
import { BrowseTab } from './BrowseTab'
import { FavouritesTab } from './FavouritesTab'

// ── Types ─────────────────────────────────────────────────────────────────────

type MusicTab = 'sonos-favourites' | 'browse' | 'my-favourites'

// ── Props ─────────────────────────────────────────────────────────────────────

export interface SpeakerMusicPickerProps {
  speakerName: string
  roomName: string
  open: boolean
  onClose: () => void
  isPlaying?: boolean
  isPaused?: boolean
}

// ── SpeakerMusicPicker ────────────────────────────────────────────────────────

export function SpeakerMusicPicker({
  speakerName,
  roomName,
  open,
  onClose,
  isPlaying,
  isPaused,
}: SpeakerMusicPickerProps) {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<MusicTab>('sonos-favourites')
  const [selectedFavourite, setSelectedFavourite] = useState('')

  // Reset selected favourite when dialog opens/closes
  function handleOpenChange(val: boolean) {
    if (!val) {
      setSelectedFavourite('')
      setActiveTab('sonos-favourites')
      onClose()
    }
  }

  const playFavouriteMutation = useMutation({
    mutationFn: (name: string) => api.sonos.playFavourite(speakerName, name),
    onSuccess: (_data, name) => {
      onClose()
      setSelectedFavourite('')
      toast({ message: `Playing ${name} on ${roomName}` })
    },
    onError: (err, name) => {
      const serverMsg = parseApiError(err)
      toast({ message: serverMsg ?? `Couldn't play ${name} on ${roomName}`, type: 'error' })
    },
  })

  function handlePlayFavourite() {
    if (selectedFavourite && selectedFavourite !== '__continue__') {
      playFavouriteMutation.mutate(selectedFavourite)
    }
  }

  const tabs: Array<{ id: MusicTab; label: string }> = [
    { id: 'sonos-favourites', label: 'Sonos' },
    { id: 'browse', label: 'Browse' },
    { id: 'my-favourites', label: 'Saved' },
  ]

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl',
            'bg-[var(--bg-primary)] p-6 shadow-xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
            'focus:outline-none',
          )}
          aria-describedby={undefined}
        >
          {/* Header */}
          <div className="mb-4 flex items-center justify-between gap-2">
            <Dialog.Title className="text-base font-semibold text-heading">
              Choose music for {roomName}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg text-caption transition-colors',
                  'hover:bg-[var(--bg-secondary)]',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                )}
                aria-label="Close"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          {/* Tab bar */}
          <div
            role="tablist"
            aria-label="Music source"
            className="mb-4 flex gap-2"
          >
            {tabs.map(tab => {
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  id={`music-tab-${tab.id}`}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`music-panel-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                    'min-h-[44px]',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                    isActive
                      ? 'bg-fairy-500 text-white'
                      : 'text-caption hover:text-body',
                  )}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* Tab panels */}
          <div
            id={`music-panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`music-tab-${activeTab}`}
          >
            {/* Sonos Favourites tab */}
            {activeTab === 'sonos-favourites' && (
              <div>
                <FavouriteSelector
                  id={`fav-selector-picker-${speakerName}`}
                  value={selectedFavourite}
                  onChange={setSelectedFavourite}
                  includeContinue={isPlaying || isPaused}
                />

                <div className="mt-4 flex gap-2">
                  <Dialog.Close asChild>
                    <button
                      className={cn(
                        'flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
                        'surface text-body hover:brightness-95 dark:hover:brightness-110',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                        'min-h-[44px]',
                      )}
                    >
                      Cancel
                    </button>
                  </Dialog.Close>
                  <button
                    onClick={handlePlayFavourite}
                    disabled={
                      !selectedFavourite ||
                      selectedFavourite === '__continue__' ||
                      playFavouriteMutation.isPending
                    }
                    className={cn(
                      'flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors',
                      'bg-fairy-500 text-white hover:bg-fairy-600 active:bg-fairy-700',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                      'disabled:opacity-50 min-h-[44px]',
                    )}
                  >
                    {playFavouriteMutation.isPending ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        Playing...
                      </span>
                    ) : (
                      'Play'
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Browse tab */}
            {activeTab === 'browse' && (
              <BrowseTab targetSpeaker={speakerName} />
            )}

            {/* My Favourites tab */}
            {activeTab === 'my-favourites' && (
              <FavouritesTab
                targetSpeaker={speakerName}
                onNavigateToBrowse={() => setActiveTab('browse')}
              />
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
