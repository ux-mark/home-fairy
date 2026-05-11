import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A password-style input with a show/hide eye toggle and a "currently set"
 * hint state for secrets the server reports as redacted ('<set>').
 *
 * Usage: track the editable value yourself; pass `isStoredSecret` if the
 * server returned '<set>' for this field and the user hasn't started
 * editing yet. When the user types anything, the parent treats `value` as
 * the new secret; when they leave it blank, the parent should omit the
 * field from the PUT body (preserves the stored value).
 */
export function SecretInput({
  id,
  label,
  value,
  onChange,
  isStoredSecret,
  disabled,
  describedBy,
  autoComplete = 'off',
}: {
  id: string
  label: string
  value: string
  onChange: (next: string) => void
  isStoredSecret: boolean
  disabled?: boolean
  describedBy?: string
  autoComplete?: string
}) {
  const [reveal, setReveal] = useState(false)
  const hintId = `${id}-hint`
  const showHint = isStoredSecret && value === ''
  const ariaDescribedBy = [describedBy, showHint ? hintId : null].filter(Boolean).join(' ') || undefined

  return (
    <div>
      <label htmlFor={id} className="text-heading text-sm mb-1.5 block">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={reveal ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          autoComplete={autoComplete}
          spellCheck={false}
          aria-describedby={ariaDescribedBy}
          placeholder={isStoredSecret ? '••••••••' : ''}
          className={cn(
            'input-field h-11 w-full rounded-lg border pl-3 pr-11 text-sm focus:border-fairy-500 focus:outline-none',
          )}
        />
        <button
          type="button"
          onClick={() => setReveal((r) => !r)}
          aria-label={reveal ? `Hide ${label}` : `Show ${label}`}
          aria-pressed={reveal}
          tabIndex={-1}
          className="absolute right-1 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-md text-caption hover:text-heading hover:bg-[var(--bg-tertiary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        >
          {reveal ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
      {showHint && (
        <p id={hintId} className="text-caption text-xs mt-1">
          Currently set — leave blank to keep
        </p>
      )}
    </div>
  )
}
