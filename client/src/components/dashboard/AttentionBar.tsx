import { useState } from 'react'
import { AlertTriangle, AlertCircle, Info } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import type { AttentionItem } from '@/lib/api'
import { Accordion } from '@/components/ui/Accordion'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AttentionBarProps {
  items: AttentionItem[]
  open: boolean
  onToggle: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<AttentionItem['severity'], number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

function sortBySeverity(items: AttentionItem[]): AttentionItem[] {
  return [...items].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  )
}

// ── Attention item card ───────────────────────────────────────────────────────

interface ItemCardProps {
  item: AttentionItem
  onDeactivate: (itemId: string, type: string, id: string, label?: string) => void
  onReactivate: (itemId: string, type: string, id: string, label?: string) => void
}

function ItemCard({ item, onDeactivate, onReactivate }: ItemCardProps) {
  const isCritical = item.severity === 'critical'

  // Border colour by severity — always paired with icon so colour is not sole indicator
  const borderClass = {
    critical: 'border-l-red-500',
    warning: 'border-l-amber-500',
    info: 'border-l-blue-500',
  }[item.severity]

  // Icon and its colour by severity
  const iconProps = {
    critical: {
      Icon: AlertTriangle,
      className: 'h-5 w-5 shrink-0 text-red-400',
      label: 'Critical alert',
    },
    warning: {
      Icon: AlertCircle,
      className: 'h-5 w-5 shrink-0 text-amber-400',
      label: 'Warning',
    },
    info: {
      Icon: Info,
      className: 'h-5 w-5 shrink-0 text-blue-400',
      label: 'Information',
    },
  }[item.severity]

  const { Icon, className: iconClass, label: iconLabel } = iconProps

  return (
    <li
      role={isCritical ? 'alert' : 'status'}
      aria-label={`${iconLabel}: ${item.title}`}
      className={cn(
        'card rounded-xl p-4 flex items-start gap-3',
        'border-l-4',
        borderClass,
      )}
    >
      {/* Severity icon — paired with title text so colour is not the sole indicator */}
      <Icon
        className={cn('mt-0.5', iconClass)}
        aria-hidden="true"
      />

      {/* Message + actions in the text column */}
      <div className="min-w-0 flex-1">
        <p className="text-heading text-sm font-medium leading-snug">
          {item.title}
        </p>
        <p className="text-caption mt-0.5 text-xs leading-snug">
          {item.description}
        </p>

        {/* Action buttons below description — stay in the text column so the label never gets squeezed */}
        {item.deviceId !== null && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Link
              to={item.deviceSource === 'kasa'
                ? `/devices/kasa/${item.deviceId}`
                : item.deviceSource === 'lifx'
                  ? `/lights/${item.deviceId}`
                  : `/devices/${item.deviceId}`}
              aria-label={`View device: ${item.deviceLabel ?? 'device'}`}
              className={cn(
                'text-sm text-fairy-400',
                'hover:bg-fairy-500/10 rounded-lg px-3 py-2',
                'min-h-[44px] flex items-center transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              )}
            >
              View device
            </Link>

            {/* Deactivate action for unreachable devices */}
            {item.action === 'deactivate' && item.deviceType && item.deviceId && (
              <button
                onClick={() => onDeactivate(item.id, String(item.deviceType), String(item.deviceId), item.deviceLabel ?? undefined)}
                className={cn(
                  'text-sm text-amber-400',
                  'hover:bg-amber-500/10 rounded-lg px-3 py-2',
                  'min-h-[44px] flex items-center transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500',
                )}
              >
                Deactivate
              </button>
            )}

            {/* Reactivate action for devices that came back online */}
            {item.action === 'reactivate' && item.deviceType && item.deviceId && (
              <button
                onClick={() => onReactivate(item.id, String(item.deviceType), String(item.deviceId), item.deviceLabel ?? undefined)}
                className={cn(
                  'text-sm text-emerald-400',
                  'hover:bg-emerald-500/10 rounded-lg px-3 py-2',
                  'min-h-[44px] flex items-center transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500',
                )}
              >
                Reactivate
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

// ── AttentionBar ──────────────────────────────────────────────────────────────

const INITIAL_VISIBLE = 5

// ── Severity summary badges ────────────────────────────────────────────────────

interface SeveritySummaryProps {
  criticalCount: number
  warningCount: number
  infoCount: number
}

function SeveritySummary({ criticalCount, warningCount, infoCount }: SeveritySummaryProps) {
  return (
    <span className="flex items-center gap-1.5" aria-hidden="true">
      {criticalCount > 0 && (
        <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-400">
          {criticalCount}
        </span>
      )}
      {warningCount > 0 && (
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">
          {warningCount}
        </span>
      )}
      {infoCount > 0 && (
        <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold text-blue-400">
          {infoCount}
        </span>
      )}
    </span>
  )
}

// ── AttentionBar ───────────────────────────────────────────────────────────────

/**
 * Stacked list of attention items (critical, warning, info) wrapped in an accordion.
 * Returns null when items is empty — absence means everything is fine.
 */
export default function AttentionBar({ items, open, onToggle }: AttentionBarProps) {
  const [expanded, setExpanded] = useState(false)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    queryClient.invalidateQueries({ queryKey: ['devices'] })
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  const deactivateMutation = useMutation({
    mutationFn: ({ itemId, type, id, label }: { itemId: string; type: string; id: string; label?: string }) => {
      setDismissedIds(prev => new Set(prev).add(itemId))
      return api.devices.deactivate(type, id).then(() => label)
    },
    onSuccess: (label) => {
      toast({ message: `${label ?? 'Device'} deactivated` })
      invalidateAll()
    },
    onError: (_err, { itemId }) => {
      setDismissedIds(prev => { const next = new Set(prev); next.delete(itemId); return next })
      toast({ message: 'Failed to deactivate device', type: 'error' })
    },
  })

  const reactivateMutation = useMutation({
    mutationFn: ({ itemId, type, id, label }: { itemId: string; type: string; id: string; label?: string }) => {
      setDismissedIds(prev => new Set(prev).add(itemId))
      return api.devices.reactivate(type, id).then(() => label)
    },
    onSuccess: (label) => {
      toast({ message: `${label ?? 'Device'} reactivated` })
      invalidateAll()
    },
    onError: (_err, { itemId }) => {
      setDismissedIds(prev => { const next = new Set(prev); next.delete(itemId); return next })
      toast({ message: 'Failed to reactivate device', type: 'error' })
    },
  })

  const handleDeactivate = (itemId: string, type: string, id: string, label?: string) =>
    deactivateMutation.mutate({ itemId, type, id, label })
  const handleReactivate = (itemId: string, type: string, id: string, label?: string) =>
    reactivateMutation.mutate({ itemId, type, id, label })

  const visibleItems = items.filter(item => !dismissedIds.has(item.id))

  // Nothing to show — silence is the success state here
  if (visibleItems.length === 0) return null

  const sorted = sortBySeverity(visibleItems)
  const hasMore = sorted.length > INITIAL_VISIBLE
  const visible = expanded ? sorted : sorted.slice(0, INITIAL_VISIBLE)
  const hiddenCount = sorted.length - INITIAL_VISIBLE

  const criticalCount = sorted.filter(i => i.severity === 'critical').length
  const warningCount = sorted.filter(i => i.severity === 'warning').length
  const infoCount = sorted.filter(i => i.severity === 'info').length

  const accordionTitle = (
    <>
      <AlertTriangle className="h-4 w-4 text-amber-400" aria-hidden="true" />
      Needs attention
    </>
  )

  const severitySummary = (
    <SeveritySummary
      criticalCount={criticalCount}
      warningCount={warningCount}
      infoCount={infoCount}
    />
  )

  return (
    <Accordion
      id="attention-card"
      title={accordionTitle}
      open={open}
      onToggle={onToggle}
      trailing={!open ? severitySummary : undefined}
    >
      <ul role="list" className="space-y-2">
        {visible.map(item => (
          <ItemCard key={item.id} item={item} onDeactivate={handleDeactivate} onReactivate={handleReactivate} />
        ))}
      </ul>

      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded(prev => !prev)}
          aria-expanded={expanded}
          className={cn(
            'mt-2 w-full rounded-lg px-3 py-2 text-sm font-medium',
            'text-body hover:bg-[var(--bg-tertiary)] transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            'min-h-[44px] flex items-center justify-center',
          )}
        >
          {expanded
            ? 'Show fewer items'
            : `Show ${hiddenCount} more ${hiddenCount === 1 ? 'item' : 'items'}`}
        </button>
      )}
    </Accordion>
  )
}
