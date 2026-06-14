import { useQueryClient, useMutation } from '@tanstack/react-query'
import { Power, Moon, Users, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import type { Room } from '@/lib/api'

export function QuickActions() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const allOffMutation = useMutation({
    mutationFn: api.system.allOff,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['rooms'] })
      const previous = queryClient.getQueryData<Room[]>(['rooms'])
      queryClient.setQueryData<Room[]>(['rooms'], old =>
        old?.map(r => ({ ...r, current_scene: null }))
      )
      return { previous }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['system'] })
      queryClient.invalidateQueries({ queryKey: ['lifx'] })
      toast({ message: 'All devices turned off' })
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['rooms'], context.previous)
      toast({ message: 'Failed to turn off devices', type: 'error' })
    },
  })

  const nighttimeMutation = useMutation({
    mutationFn: api.system.nighttime,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['rooms'] })
      const previous = queryClient.getQueryData<Room[]>(['rooms'])
      queryClient.setQueryData<Room[]>(['rooms'], old =>
        old?.map(r => ({ ...r, current_scene: null }))
      )
      return { previous }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['system'] })
      queryClient.invalidateQueries({ queryKey: ['lifx'] })
      toast({ message: 'Nighttime mode activated' })
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['rooms'], context.previous)
      toast({ message: 'Failed to set nighttime', type: 'error' })
    },
  })

  const guestNightMutation = useMutation({
    mutationFn: api.system.guestNight,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['rooms'] })
      const previous = queryClient.getQueryData<Room[]>(['rooms'])
      queryClient.setQueryData<Room[]>(['rooms'], old =>
        old?.map(r => ({ ...r, current_scene: null }))
      )
      return { previous }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['system'] })
      queryClient.invalidateQueries({ queryKey: ['lifx'] })
      toast({ message: 'Guest night mode activated' })
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['rooms'], context.previous)
      toast({ message: 'Failed to set guest night', type: 'error' })
    },
  })

  const anyPending = allOffMutation.isPending || nighttimeMutation.isPending || guestNightMutation.isPending

  return (
    <section className="mb-6" aria-label="Quick actions">
      <div className="flex gap-2">
        <button
          onClick={() => allOffMutation.mutate()}
          disabled={anyPending}
          className={cn(
            'flex flex-1 min-h-[52px] items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition-all',
            'bg-red-500/15 text-red-400 active:scale-[0.97]',
            'hover:bg-red-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500',
            'disabled:opacity-50',
          )}
        >
          {allOffMutation.isPending
            ? <Loader2 className="h-4.5 w-4.5 animate-spin" />
            : <Power className="h-4.5 w-4.5" />}
          {allOffMutation.isPending ? 'Turning off...' : 'All Off'}
        </button>
        <button
          onClick={() => nighttimeMutation.mutate()}
          disabled={anyPending}
          className={cn(
            'flex flex-1 min-h-[52px] items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition-all',
            'bg-indigo-500/15 text-indigo-400 active:scale-[0.97]',
            'hover:bg-indigo-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500',
            'disabled:opacity-50',
          )}
        >
          {nighttimeMutation.isPending
            ? <Loader2 className="h-4.5 w-4.5 animate-spin" />
            : <Moon className="h-4.5 w-4.5" />}
          {nighttimeMutation.isPending ? 'Activating...' : 'Nighttime'}
        </button>
        <button
          onClick={() => guestNightMutation.mutate()}
          disabled={anyPending}
          className={cn(
            'flex flex-1 min-h-[52px] items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition-all',
            'bg-purple-500/15 text-purple-400 active:scale-[0.97]',
            'hover:bg-purple-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500',
            'disabled:opacity-50',
          )}
        >
          {guestNightMutation.isPending
            ? <Loader2 className="h-4.5 w-4.5 animate-spin" />
            : <><Moon className="h-4 w-4" /><Users className="h-4 w-4" /></>}
          {guestNightMutation.isPending ? 'Activating...' : 'Guest'}
        </button>
      </div>
    </section>
  )
}
