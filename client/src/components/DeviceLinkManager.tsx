import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plug, Link2, Unlink } from 'lucide-react'
import { api, type DeviceLink, type KasaDevice } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/hooks/useToast'

interface DeviceLinkManagerProps {
  sourceType: 'sonos' | 'lifx' | 'hub'
  sourceId: string
  description?: string
}

function formatCost(cost: number | null | undefined, symbol: string): string {
  if (cost == null) return '—'
  return `${symbol}${cost.toFixed(2)}`
}

export function DeviceLinkManager({ sourceType, sourceId, description }: DeviceLinkManagerProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [showPlugPicker, setShowPlugPicker] = useState(false)
  const [unlinkConfirmId, setUnlinkConfirmId] = useState<number | null>(null)
  const [plugSearch, setPlugSearch] = useState('')

  const { data: links = [], isLoading: linksLoading } = useQuery({
    queryKey: ['device-links', sourceType, sourceId],
    queryFn: () => api.deviceLinks.getForDevice(sourceType, sourceId),
    staleTime: 30_000,
  })

  const { data: kasaDevices } = useQuery({
    queryKey: ['kasa', 'devices'],
    queryFn: api.kasa.getDevices,
    enabled: showPlugPicker,
    staleTime: 30_000,
  })

  const createLinkMutation = useMutation({
    mutationFn: (kasaId: string) =>
      api.deviceLinks.create({
        source_type: sourceType,
        source_id: sourceId,
        target_type: 'kasa',
        target_id: kasaId,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['device-links', sourceType, sourceId] })
      setShowPlugPicker(false)
      setPlugSearch('')
      toast({ message: 'Smart plug linked as power source' })
    },
    onError: (err: Error) => {
      const msg = err.message.includes('already exists')
        ? 'That plug is already linked to this device.'
        : 'Failed to link plug. Try again.'
      toast({ message: msg, type: 'error' })
    },
  })

  const deleteLinkMutation = useMutation({
    mutationFn: (id: number) => api.deviceLinks.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-links', sourceType, sourceId] })
      setUnlinkConfirmId(null)
      toast({ message: 'Power source unlinked' })
    },
    onError: () => toast({ message: 'Failed to unlink. Try again.', type: 'error' }),
  })

  const powerLinks = (links as DeviceLink[]).filter(l => l.linkType === 'power')
  const linkedIds = new Set(powerLinks.map(l => l.targetId))

  const eligiblePlugs = (kasaDevices ?? []).filter(
    (d: KasaDevice) => d.has_emeter && (d.device_type === 'plug' || d.device_type === 'outlet'),
  )

  const filteredPlugs = plugSearch.trim()
    ? eligiblePlugs.filter((p: KasaDevice) => p.label.toLowerCase().includes(plugSearch.toLowerCase()))
    : eligiblePlugs

  const emptyDesc = description ?? 'No power source linked. Link a smart plug to track the energy cost of this device.'

  return (
    <section aria-labelledby={`power-source-heading-${sourceId}`}>
      {linksLoading ? (
        <Skeleton className="h-14 w-full rounded-lg" />
      ) : powerLinks.length === 0 && !showPlugPicker ? (
        <div className="rounded-lg border border-dashed border-[var(--border-secondary)] p-4">
          <p className="text-sm text-caption">{emptyDesc}</p>
          <button
            onClick={() => setShowPlugPicker(true)}
            className="mt-3 flex min-h-[44px] items-center gap-2 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-heading transition-colors hover:bg-[var(--bg-tertiary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            <Plug className="h-4 w-4 shrink-0 text-fairy-400" aria-hidden="true" />
            Link a smart plug
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {powerLinks.map((link: DeviceLink) => {
            const t = link.target
            const isConfirming = unlinkConfirmId === link.id
            return (
              <div key={link.id} className="card rounded-xl border p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="rounded-full bg-fairy-500/10 p-1.5 text-fairy-400 shrink-0" aria-hidden="true">
                    <Plug className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-heading">
                      {t?.label ?? link.targetId}
                    </p>
                    {t ? (
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-caption">
                        <span>
                          {t.isOnline ? (
                            <span className="text-green-400">Online</span>
                          ) : (
                            <span className="text-slate-400">Offline</span>
                          )}
                        </span>
                        {t.power != null && (
                          <span>{t.power.toFixed(1)} W now</span>
                        )}
                        {t.todayCost != null && (
                          <span>Today: {formatCost(t.todayCost, t.currencySymbol)}</span>
                        )}
                        {t.monthlyCost != null && (
                          <span>This month: {formatCost(t.monthlyCost, t.currencySymbol)}</span>
                        )}
                      </div>
                    ) : (
                      <p className="mt-0.5 text-xs text-caption">Device data unavailable</p>
                    )}
                  </div>
                  {isConfirming ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-body">Remove link?</span>
                      <button
                        onClick={() => deleteLinkMutation.mutate(link.id)}
                        disabled={deleteLinkMutation.isPending}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deleteLinkMutation.isPending ? 'Removing...' : 'Remove'}
                      </button>
                      <button
                        onClick={() => setUnlinkConfirmId(null)}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[var(--border-secondary)] px-3 py-2 text-sm text-heading transition-colors hover:bg-[var(--bg-tertiary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setUnlinkConfirmId(link.id)}
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                      aria-label={`Remove power source link for ${t?.label ?? link.targetId}`}
                    >
                      <Unlink className="h-4 w-4" aria-hidden="true" />
                      Remove
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Plug picker */}
      {showPlugPicker && (
        <div className="mt-3 rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-secondary)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-heading">Select a smart plug</p>
            <button
              onClick={() => { setShowPlugPicker(false); setPlugSearch('') }}
              className="text-xs text-caption hover:text-heading transition-colors"
            >
              Cancel
            </button>
          </div>
          {eligiblePlugs.length > 3 && (
            <input
              type="text"
              value={plugSearch}
              onChange={e => setPlugSearch(e.target.value)}
              placeholder="Search plugs and sockets..."
              className="mb-3 w-full rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-heading placeholder:text-caption focus:border-fairy-500 focus:outline-none"
            />
          )}
          {eligiblePlugs.length === 0 ? (
            <p className="text-sm text-caption">
              No energy-monitoring smart plugs found. Make sure your Kasa devices are discovered and have energy monitoring enabled.
            </p>
          ) : filteredPlugs.length === 0 ? (
            <p className="text-sm text-caption">No plugs match your search.</p>
          ) : (
            <div className="space-y-2">
              {filteredPlugs.map((plug: KasaDevice) => {
                const alreadyLinked = linkedIds.has(plug.id)
                return (
                  <button
                    key={plug.id}
                    onClick={() => !alreadyLinked && createLinkMutation.mutate(plug.id)}
                    disabled={alreadyLinked || createLinkMutation.isPending}
                    className={cn(
                      'flex w-full min-h-[44px] items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                      alreadyLinked
                        ? 'cursor-default border-fairy-500/30 bg-fairy-500/10 text-fairy-400'
                        : 'border-[var(--border-secondary)] text-heading hover:border-fairy-500/50 hover:bg-[var(--bg-tertiary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                      (createLinkMutation.isPending && !alreadyLinked) && 'cursor-not-allowed opacity-50',
                    )}
                    aria-pressed={alreadyLinked}
                  >
                    <Plug className="h-4 w-4 shrink-0 text-fairy-400" aria-hidden="true" />
                    <span className="min-w-0 flex-1">{plug.label}</span>
                    {alreadyLinked && (
                      <span className="ml-auto shrink-0 text-xs text-fairy-400">
                        <Link2 className="inline h-3 w-3 mr-0.5" aria-hidden="true" />
                        Linked
                      </span>
                    )}
                    {!alreadyLinked && !plug.is_online && (
                      <span className="ml-auto shrink-0 text-xs text-slate-400">Offline</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
          <button
            onClick={() => setShowPlugPicker(false)}
            className="mt-3 text-xs text-caption hover:text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Add another plug button (when links exist) */}
      {powerLinks.length > 0 && !showPlugPicker && (
        <button
          onClick={() => setShowPlugPicker(true)}
          className="mt-3 flex min-h-[44px] items-center gap-2 text-xs text-fairy-400 hover:text-fairy-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        >
          <Plug className="h-3 w-3" aria-hidden="true" />
          Link another plug
        </button>
      )}
    </section>
  )
}
