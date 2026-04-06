import { useEffect, useRef, useState, useCallback } from 'react'
import { Check, ChevronDown, Speaker } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LucideIcon } from '@/components/ui/LucideIcon'
import { useSpeakerSelector } from '@/hooks/useSpeakerSelector'
import type { SpeakerSelectorItem } from '@/hooks/useSpeakerSelector'

// ── Room icon mapping ─────────────────────────────────────────────────────────
// Uses LucideIcon with the DB-stored icon name, falling back by room name.

function RoomIconAvatar({ icon, roomName }: { icon: string | null; roomName: string }) {
  const iconName = icon ?? fallbackIconForRoom(roomName)
  return (
    <span
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
        'bg-[var(--bg-tertiary)]',
      )}
      aria-hidden="true"
    >
      <LucideIcon name={iconName} className="h-4 w-4 text-fairy-400" />
    </span>
  )
}

function fallbackIconForRoom(roomName: string): string {
  const lower = roomName.toLowerCase()
  if (lower.includes('living') || lower.includes('lounge') || lower.includes('sofa')) return 'sofa'
  if (lower.includes('bed') || lower.includes('sleep')) return 'bed'
  if (lower.includes('kitchen') || lower.includes('cook') || lower.includes('dining')) return 'cooking-pot'
  if (lower.includes('office') || lower.includes('study') || lower.includes('desk')) return 'monitor'
  if (lower.includes('bath') || lower.includes('shower')) return 'bath'
  if (lower.includes('garden') || lower.includes('outdoor') || lower.includes('patio')) return 'trees'
  return 'speaker'
}

// ── Status line ───────────────────────────────────────────────────────────────

function StatusLine({ speaker, isActive }: { speaker: SpeakerSelectorItem; isActive: boolean }) {
  if (speaker.status === 'playing') {
    return (
      <p className={cn('truncate text-xs', isActive ? 'text-emerald-400' : 'text-emerald-400/80')}>
        Playing{speaker.currentTrackTitle ? ` — ${speaker.currentTrackTitle}` : ''}
      </p>
    )
  }
  if (speaker.status === 'grouped' && speaker.groupedWith) {
    return (
      <p className="truncate text-xs text-caption">
        Grouped with {speaker.groupedWith}
      </p>
    )
  }
  return <p className="truncate text-xs text-caption">Idle</p>
}

// ── SpeakerSelectorDropdown ───────────────────────────────────────────────────

interface SpeakerSelectorDropdownProps {
  className?: string
}

export function SpeakerSelectorDropdown({ className }: SpeakerSelectorDropdownProps) {
  const { speakers, selectedSpeaker, setSelectedSpeaker, isLoading } = useSpeakerSelector()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listboxRef = useRef<HTMLDivElement>(null)
  const [focusedIndex, setFocusedIndex] = useState(0)

  const activeSpeaker = speakers.find(s => s.speakerName === selectedSpeaker) ?? speakers[0] ?? null

  const openDropdown = useCallback(() => {
    const activeIdx = speakers.findIndex(s => s.speakerName === selectedSpeaker)
    setFocusedIndex(activeIdx >= 0 ? activeIdx : 0)
    setOpen(true)
  }, [speakers, selectedSpeaker])

  // Close on click outside
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !listboxRef.current?.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  function handleSelect(speaker: SpeakerSelectorItem) {
    setSelectedSpeaker(speaker.speakerName)
    setOpen(false)
    triggerRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        openDropdown()
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setFocusedIndex(i => Math.min(i + 1, speakers.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setFocusedIndex(i => Math.max(i - 1, 0))
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (speakers[focusedIndex]) handleSelect(speakers[focusedIndex])
        break
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
        break
    }
  }

  if (isLoading && speakers.length === 0) {
    return (
      <div className={cn('flex items-center gap-2 px-1 py-1 text-sm text-caption', className)}>
        <Speaker className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="animate-pulse text-xs">Loading speakers…</span>
      </div>
    )
  }

  if (speakers.length === 0) return null

  return (
    <div className={cn('relative', className)}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => open ? setOpen(false) : openDropdown()}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Speaker: ${activeSpeaker?.roomName ?? 'Select speaker'}`}
        className={cn(
          'flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          open
            ? 'text-fairy-400'
            : 'text-caption hover:bg-[var(--bg-secondary)] hover:text-body',
        )}
      >
        <Speaker className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="max-w-[140px] truncate">
          {activeSpeaker?.roomName ?? 'Select speaker'}
        </span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          ref={listboxRef}
          role="listbox"
          aria-label="Select speaker"
          onKeyDown={handleKeyDown}
          tabIndex={-1}
          className={cn(
            'absolute left-0 top-full z-50 mt-1 min-w-[220px] rounded-xl',
            'border border-white/10 bg-slate-900/80 backdrop-blur-xl',
            'shadow-xl shadow-black/40',
            'animate-in fade-in-0 zoom-in-95 duration-150',
            'py-1',
          )}
        >
          {speakers.map((speaker, idx) => {
            const isActive = speaker.speakerName === selectedSpeaker
            const isFocused = idx === focusedIndex
            return (
              <button
                key={speaker.speakerName}
                role="option"
                aria-selected={isActive}
                type="button"
                onClick={() => handleSelect(speaker)}
                onMouseEnter={() => setFocusedIndex(idx)}
                className={cn(
                  'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
                  'focus-visible:outline-none',
                  isFocused && !isActive && 'bg-white/5',
                  isActive
                    ? [
                        'bg-emerald-500/10',
                        '[box-shadow:inset_0_0_0_1px_theme(colors.emerald.500)]',
                        'rounded-lg mx-1 w-[calc(100%-8px)]',
                      ]
                    : 'hover:bg-white/5',
                )}
              >
                <RoomIconAvatar icon={speaker.roomIcon} roomName={speaker.roomName} />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-heading">{speaker.roomName}</p>
                  <StatusLine speaker={speaker} isActive={isActive} />
                </div>

                {isActive && (
                  <Check className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
