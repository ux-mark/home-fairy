import React, { useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { SearchableSelect } from '@/components/ui/SearchableSelect'

interface HushingSetupPopoverProps {
  open: boolean
  onClose: () => void
  triggerRef?: React.RefObject<HTMLButtonElement | null>
}

export function HushingSetupPopover({ open, onClose, triggerRef }: HushingSetupPopoverProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const panelRef = useRef<HTMLDivElement>(null)

  const { data: scenes, isLoading } = useQuery({
    queryKey: ['scenes'],
    queryFn: api.scenes.getAll,
    enabled: open,
  })

  const mutation = useMutation({
    mutationFn: (scene: string) => api.system.setHushingScene(scene),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'hushing-status'] })
      toast({ message: 'Hushing scene saved' })
      onClose()
    },
    onError: () => toast({ message: 'Failed to save scene', type: 'error' }),
  })

  // Close on click outside
  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: PointerEvent) {
      if (triggerRef?.current && triggerRef.current.contains(e.target as Node)) return
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open, onClose, triggerRef])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  const sceneOptions = (scenes ?? []).map(s => ({ value: s.name, label: s.name }))

  return (
    <div
      ref={panelRef}
      className={cn(
        'absolute left-0 right-0 top-full z-30',
        'bg-[var(--bg-secondary)]',
        'border border-t-0 border-[var(--border-primary)]',
        'rounded-b-xl',
        'shadow-xl',
        'overflow-hidden',
      )}
      role="region"
      aria-label="Hushing scene setup"
    >
      <div className="px-3 py-3 space-y-3">
        <p className="text-xs font-semibold text-heading">Select a Hushing scene</p>
        <p className="text-xs text-caption">
          This scene will run across the home when Hushing is activated.
        </p>

        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-caption" aria-label="Loading scenes" />
          </div>
        ) : sceneOptions.length === 0 ? (
          <p className="py-4 text-center text-sm text-caption">
            No scenes configured yet. Create a scene first.
          </p>
        ) : (
          <SearchableSelect
            id="hushing-scene-selector"
            options={sceneOptions}
            value=""
            onChange={scene => mutation.mutate(scene)}
            placeholder="Search scenes..."
            emptyMessage="No scenes match your search"
            aria-label="Search and select a hushing scene"
          />
        )}

        {mutation.isPending && (
          <div className="flex items-center gap-2 text-xs text-caption">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Saving...
          </div>
        )}
      </div>
    </div>
  )
}
