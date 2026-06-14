import { useState } from 'react'
import { Play, Search, Heart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NowPlayingTab } from '@/components/sonos/NowPlayingTab'
import { BrowseTab } from '@/components/sonos/BrowseTab'
import { FavouritesTab } from '@/components/sonos/FavouritesTab'

// ── Tab definition ────────────────────────────────────────────────────────────

type TabId = 'now-playing' | 'browse' | 'favourites'

const TABS: Array<{ id: TabId; label: string; Icon: React.ElementType }> = [
  { id: 'now-playing', label: 'Now Playing', Icon: Play },
  { id: 'browse', label: 'Browse', Icon: Search },
  { id: 'favourites', label: 'Favourites', Icon: Heart },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SonosPage() {
  const [activeTab, setActiveTab] = useState<TabId>('now-playing')

  return (
    <div className="flex min-h-[calc(100svh-57px)] flex-col">
      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto px-4 pb-24 pt-4">
        <h1 className="sr-only">Sonos</h1>

        {/* Tab content */}
        <div role="tabpanel" aria-labelledby={`tab-${activeTab}`} id={`panel-${activeTab}`}>
          {activeTab === 'now-playing' && <NowPlayingTab />}
          {activeTab === 'browse' && <BrowseTab />}
          {activeTab === 'favourites' && (
            <FavouritesTab onNavigateToBrowse={() => setActiveTab('browse')} />
          )}
        </div>
      </div>

      {/* Bottom tab bar — fixed to viewport bottom */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--border-primary)] bg-[var(--bg-primary)]"
        aria-label="Sonos navigation"
      >
        {/* Safe area inset for home-indicator on iOS */}
        <div
          className="flex"
          role="tablist"
          aria-label="Sonos sections"
        >
          {TABS.map(({ id, label, Icon }) => {
            const isActive = activeTab === id
            return (
              <button
                key={id}
                id={`tab-${id}`}
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${id}`}
                onClick={() => setActiveTab(id)}
                className={cn(
                  'flex flex-1 flex-col items-center justify-center gap-1 pb-safe pt-3 pb-3',
                  'min-h-[56px] text-[10px] font-medium transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-fairy-500',
                  isActive
                    ? 'text-fairy-400'
                    : 'text-caption hover:text-body',
                )}
              >
                <Icon
                  className={cn('h-5 w-5', isActive ? 'text-fairy-400' : 'text-caption')}
                  aria-hidden="true"
                />
                <span>{label}</span>
                {isActive && (
                  <span className="absolute bottom-0 h-0.5 w-8 rounded-t-full bg-fairy-500" aria-hidden="true" />
                )}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
