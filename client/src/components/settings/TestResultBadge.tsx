import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import type { SettingsTestResult } from '@/lib/api'

/**
 * Inline pass/fail badge for the "Test connection" button on each settings
 * section. Renders the success detail (devicesCount, lightsCount, sample,
 * etc.) provided by the result-renderer.
 */
export function TestResultBadge({
  result,
  loading,
  renderOk,
}: {
  result: SettingsTestResult | null
  loading: boolean
  renderOk: (r: SettingsTestResult) => string
}) {
  if (loading) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-caption">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Testing…
      </span>
    )
  }
  if (!result) return null
  if (result.ok) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-green-400" role="status">
        <CheckCircle className="h-4 w-4" aria-hidden="true" />
        {renderOk(result)}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-sm text-red-400" role="alert">
      <XCircle className="h-4 w-4" aria-hidden="true" />
      {result.error ?? 'Test failed'}
    </span>
  )
}
