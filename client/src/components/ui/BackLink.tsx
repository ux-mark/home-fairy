import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface BackLinkProps {
  /** The route to navigate to */
  to: string
  /** Label text (default: "Back") */
  label?: string
  /** Additional className */
  className?: string
}

export function BackLink({ to, label = 'Back', className }: BackLinkProps) {
  return (
    <Link
      to={to}
      className={cn(
        'mb-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium',
        'surface text-body transition-colors hover:brightness-95 dark:hover:brightness-110',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
        className,
      )}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {label}
    </Link>
  )
}
