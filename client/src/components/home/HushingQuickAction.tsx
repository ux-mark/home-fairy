import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Wrench, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import type { HushingStatus } from '@/lib/api'

export function HushingQuickAction() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const navigate = useNavigate()

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

  const handleToggle = () => {
    if (isActive) {
      deactivateMutation.mutate(undefined)
    } else if (!hasScene) {
      navigate('/settings#hushing-home')
    } else {
      activateMutation.mutate(undefined)
    }
  }

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
          : <Wrench className="h-4.5 w-4.5" aria-hidden="true" />}
        {isPending
          ? (isActive ? 'Deactivating...' : 'Activating...')
          : isActive
            ? 'Home is Hushing'
            : !hasScene
              ? 'Hushing Home — tap to set up'
              : 'Hushing Home'}
      </button>
    </div>
  )
}
