import { Navigate, useLocation } from 'react-router-dom'
import { authClient } from '@/lib/auth-client'
import { Skeleton, SkeletonList } from '@/components/ui/Skeleton'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: session, isPending, error } = authClient.useSession()
  const location = useLocation()

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="w-full max-w-sm space-y-4">
          <Skeleton className="h-7 w-40 rounded-lg" />
          <SkeletonList count={3} height="h-12" />
        </div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
