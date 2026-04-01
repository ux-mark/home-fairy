import { useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { LucideIcon } from '@/components/ui/LucideIcon'

export function ModeSelector({
  currentMode,
  modes,
  modeIcons,
  onSelect,
  isPending,
}: {
  currentMode: string
  modes: string[]
  modeIcons: Record<string, string | null>
  onSelect: (mode: string) => void
  isPending: boolean
}) {
  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [currentMode])

  return (
    <section aria-label="System mode" className="mb-6">
      <h2 className="text-heading mb-3 text-sm font-semibold">Current Mode</h2>
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {modes.map(mode => (
          <button
            key={mode}
            ref={currentMode === mode ? activeRef : undefined}
            onClick={() => onSelect(mode)}
            disabled={isPending}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-all',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              'min-h-[44px]',
              currentMode === mode
                ? 'bg-fairy-500 text-white shadow-lg shadow-fairy-500/25'
                : 'surface text-body hover:brightness-95 dark:hover:brightness-110',
            )}
          >
            <LucideIcon name={modeIcons[mode]} className="h-4 w-4" aria-hidden="true" />
            {mode}
          </button>
        ))}
      </div>
    </section>
  )
}
