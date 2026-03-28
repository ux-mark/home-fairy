import { cn } from '@/lib/utils'

/**
 * Shared skeleton primitives for consistent loading states across the app.
 *
 * Usage:
 *   <Skeleton className="h-5 w-32" />           — single bar
 *   <SkeletonText lines={3} />                   — paragraph placeholder
 *   <SkeletonCard>...</SkeletonCard>             — card wrapper with pulse
 */

// ── Base skeleton bar ────────────────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded bg-[var(--bg-tertiary)]',
        className,
      )}
    />
  )
}

// ── Multi-line text placeholder ──────────────────────────────────────────────

export function SkeletonText({
  lines = 3,
  className,
  lastWidth = 'w-1/2',
}: {
  lines?: number
  className?: string
  lastWidth?: string
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            'h-4',
            i === lines - 1 ? lastWidth : i === lines - 2 ? 'w-3/4' : 'w-full',
          )}
        />
      ))}
    </div>
  )
}

// ── Card skeleton wrapper ────────────────────────────────────────────────────

export function SkeletonCard({
  children,
  className,
}: {
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('card animate-pulse rounded-xl border p-5', className)}>
      {children ?? (
        <div className="space-y-3">
          <Skeleton className="h-5 w-32" />
          <SkeletonText />
        </div>
      )}
    </div>
  )
}

// ── Page-level detail skeleton (back link + title + badge + sections) ────────

export function DetailPageSkeleton({
  sections = 3,
  label = 'Loading',
}: {
  sections?: number
  label?: string
}) {
  return (
    <div className="space-y-6" role="status" aria-label={label}>
      <div className="space-y-3">
        <Skeleton className="h-8 w-24 rounded-lg" />
        <Skeleton className="h-7 w-48 rounded-lg" />
        <Skeleton className="h-5 w-32 rounded-full" />
      </div>
      {Array.from({ length: sections }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}

// ── List skeleton (repeated rows) ────────────────────────────────────────────

export function SkeletonList({
  count = 4,
  height = 'h-16',
  className,
}: {
  count?: number
  height?: string
  className?: string
}) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={cn(height, 'w-full rounded-xl')} />
      ))}
    </div>
  )
}

// ── Grid skeleton (card placeholders in grid) ────────────────────────────────

export function SkeletonGrid({
  count = 6,
  className,
  children,
}: {
  count?: number
  className?: string
  children?: (index: number) => React.ReactNode
}) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {Array.from({ length: count }).map((_, i) => (
        children ? children(i) : (
          <div key={i} className="card animate-pulse rounded-xl border p-4">
            <div className="space-y-3">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-20" />
              <div className="flex gap-2">
                <Skeleton className="h-8 w-16 rounded-lg" />
                <Skeleton className="h-8 w-16 rounded-lg" />
              </div>
            </div>
          </div>
        )
      ))}
    </div>
  )
}

// ── Accordion skeleton ───────────────────────────────────────────────────────

export function SkeletonAccordion({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card animate-pulse rounded-xl border">
          <div className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="ml-auto h-4 w-4" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Summary strip skeleton (stat pills) ──────────────────────────────────────

export function SkeletonSummaryStrip({ count = 4 }: { count?: number }) {
  return (
    <div className={cn('grid gap-3', count <= 3 ? 'grid-cols-3' : 'grid-cols-2 md:grid-cols-4')}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card animate-pulse rounded-xl border p-4">
          <Skeleton className="mb-2 h-3 w-16" />
          <Skeleton className="h-6 w-20" />
        </div>
      ))}
    </div>
  )
}
