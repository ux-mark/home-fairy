import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MoonStar, X, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { authClient } from '@/lib/auth-client'
import { HushingSetupPopover } from './HushingSetupPopover'
import type { HushingStatus } from '@/lib/api'

export function HushingQuickAction() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [setupOpen, setSetupOpen] = useState(false)
  const setupButtonRef = useRef<HTMLButtonElement>(null)

  const { data: session } = authClient.useSession()
  const isAdmin = session?.user?.role === 'admin'

  const { data: hushingStatus, isLoading } = useQuery({
    queryKey: ['system', 'hushing-status'],
    queryFn: api.system.getHushingStatus,
    refetchInterval: 10_000,
  })

  const activateMutation = useMutation({
    mutationFn: api.system.activateHushing,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['system', 'hushing-status'] })
      const previous = queryClient.getQueryData<HushingStatus>(['system', 'hushing-status'])
      queryClient.setQueryData(['system', 'hushing-status'], (old: HushingStatus | undefined) =>
        old ? { ...old, active: true } : { active: true, sceneName: null }
      )
      return { previous }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'hushing-status'] })
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      toast({ message: 'Home is Hushing' })
    },
    onError: (_err: unknown, _vars: unknown, context: { previous: HushingStatus | undefined } | undefined) => {
      if (context?.previous) queryClient.setQueryData(['system', 'hushing-status'], context.previous)
      toast({ message: 'Failed to activate Hushing Home', type: 'error' })
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: api.system.deactivateHushing,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['system', 'hushing-status'] })
      const previous = queryClient.getQueryData<HushingStatus>(['system', 'hushing-status'])
      queryClient.setQueryData(['system', 'hushing-status'], (old: HushingStatus | undefined) =>
        old ? { ...old, active: false } : { active: false, sceneName: null }
      )
      return { previous }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'hushing-status'] })
      toast({ message: 'Hushing Home deactivated' })
    },
    onError: (_err: unknown, _vars: unknown, context: { previous: HushingStatus | undefined } | undefined) => {
      if (context?.previous) queryClient.setQueryData(['system', 'hushing-status'], context.previous)
      toast({ message: 'Failed to deactivate Hushing Home', type: 'error' })
    },
  })

  if (isLoading) return null

  const isActive = hushingStatus?.active ?? false
  const hasScene = Boolean(hushingStatus?.sceneName)
  const isPending = activateMutation.isPending || deactivateMutation.isPending

  // No scene configured and not an admin — hide entirely
  if (!hasScene && !isActive && !isAdmin) return null

  const handleToggle = () => {
    if (isActive) {
      deactivateMutation.mutate(undefined)
    } else {
      activateMutation.mutate(undefined)
    }
  }

  // Setup mode: no scene configured, admin user
  if (!hasScene && !isActive) {
    return (
      <div className="relative mt-4 mb-6">
        <button
          ref={setupButtonRef}
          onClick={() => setSetupOpen(o => !o)}
          aria-expanded={setupOpen}
          className={cn(
            'flex w-full min-h-[52px] items-center justify-center gap-2 px-4 py-3 text-sm font-semibold transition-all active:scale-[0.97]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500',
            setupOpen
              ? 'rounded-t-xl rounded-b-none bg-[var(--bg-tertiary)] text-amber-400'
              : 'rounded-xl bg-amber-500/10 text-amber-500 hover:bg-amber-500/20',
          )}
        >
          {setupOpen ? (
            <>
              <span>Close setup</span>
              <X className="h-4.5 w-4.5" aria-hidden="true" />
            </>
          ) : (
            <>
              <MoonStar className="h-4.5 w-4.5" aria-hidden="true" />
              <span>Setup Hushing Home</span>
            </>
          )}
        </button>
        <HushingSetupPopover
          open={setupOpen}
          onClose={() => setSetupOpen(false)}
          triggerRef={setupButtonRef}
        />
      </div>
    )
  }

  // Configured or active: show the activate/deactivate toggle
  return (
    <div className="mt-4 mb-6">
      <button
        onClick={handleToggle}
        disabled={isPending}
        aria-pressed={isActive}
        className={cn(
          'flex w-full min-h-[52px] items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all active:scale-[0.97]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500',
          'disabled:opacity-50',
          isActive
            ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30'
            : 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20',
        )}
      >
        {isPending
          ? <Loader2 className="h-4.5 w-4.5 animate-spin" aria-hidden="true" />
          : <MoonStar className="h-4.5 w-4.5" aria-hidden="true" />}
        {isPending
          ? (isActive ? 'Deactivating...' : 'Activating...')
          : isActive
            ? 'Home is Hushing'
            : 'Hushing Home'}
      </button>
    </div>
  )
}
