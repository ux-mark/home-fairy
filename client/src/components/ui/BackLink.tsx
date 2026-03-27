import { ArrowLeft } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface BackLinkProps {
  /** Fallback route if there's no browser history to go back to */
  to: string
  /** Label text (default: "Back") */
  label?: string
  /** Additional className */
  className?: string
}

export function BackLink({ to, label = 'Back', className }: BackLinkProps) {
  const navigate = useNavigate()

  // Use browser history if available, fall back to the `to` prop
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate(to)
    }
  }

  return (
    <Link
      to={to}
      onClick={handleClick}
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
