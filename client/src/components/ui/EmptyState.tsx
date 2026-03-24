interface EmptyStateProps {
  icon: React.ElementType
  message: string
  sub?: string
  children?: React.ReactNode
}

export function EmptyState({ icon: Icon, message, sub, children }: EmptyStateProps) {
  return (
    <div
      className="rounded-xl border border-dashed py-12 text-center"
      style={{ borderColor: 'var(--border-secondary)' }}
    >
      <Icon className="text-caption mx-auto mb-3 h-8 w-8" aria-hidden="true" />
      <p className="text-body text-sm">{message}</p>
      {sub && <p className="text-caption mt-1 text-xs">{sub}</p>}
      {children}
    </div>
  )
}
