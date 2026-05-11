import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * TimeMaskedInput — a text-field formatted for HH:MM (24h).
 *
 * Why not <input type="time">? Native time pickers vary wildly across
 * Safari (especially mobile/iOS) and break the visual consistency of
 * surrounding form fields. We control digit-only input, auto-insert the
 * colon, accept common paste formats (0730, 7:30, 07:30), validate on
 * blur, and pass `null` through onChange when empty.
 *
 * Empty input is a valid state — used by the parent to mean "no bound
 * on this side". Validation runs on blur; mid-typing invalid states are
 * tolerated so the user can keep typing.
 */

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/

interface Props {
  value: string | null
  onChange: (next: string | null) => void
  /** Accessible label — passed straight to aria-label on the input. */
  'aria-label'?: string
  /** When true, render an inline error message below the input. */
  invalid?: boolean
  /** Optional placeholder; defaults to HH:MM. */
  placeholder?: string
  /** Optional id for label association. */
  id?: string
}

/** Coerce arbitrary string into a draft mask: at most 4 digits, with colon after the second. */
function maskDraft(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

/** Normalise common paste forms to HH:MM, or empty string if unrecoverable. */
function normalise(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  // Already valid
  if (HHMM_RE.test(trimmed)) return trimmed
  // "7:30" → "07:30"
  const colonMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/)
  if (colonMatch) {
    const h = colonMatch[1].padStart(2, '0')
    const m = colonMatch[2]
    const candidate = `${h}:${m}`
    if (HHMM_RE.test(candidate)) return candidate
  }
  // "0730" / "730" → "07:30"
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length === 4) {
    const candidate = `${digits.slice(0, 2)}:${digits.slice(2)}`
    if (HHMM_RE.test(candidate)) return candidate
  }
  if (digits.length === 3) {
    const candidate = `0${digits.slice(0, 1)}:${digits.slice(1)}`
    if (HHMM_RE.test(candidate)) return candidate
  }
  return ''
}

export function TimeMaskedInput(props: Props) {
  const { value, onChange, invalid, placeholder = 'HH:MM', id } = props
  const ariaLabel = props['aria-label']

  // Local draft state — what's shown in the field while typing. Mirrors
  // `value` from the parent whenever value changes externally.
  const [draft, setDraft] = useState<string>(value ?? '')
  const isFocused = useRef(false)

  useEffect(() => {
    if (!isFocused.current) {
      setDraft(value ?? '')
    }
  }, [value])

  const handleChange = (raw: string) => {
    // If the user is pasting in a longer string, attempt to normalise first.
    if (raw.length > 5) {
      const norm = normalise(raw)
      if (norm) {
        setDraft(norm)
        onChange(norm)
        return
      }
    }
    const masked = maskDraft(raw)
    setDraft(masked)
    // Only commit a valid value mid-type when it fully matches HH:MM.
    if (masked === '') {
      onChange(null)
    } else if (HHMM_RE.test(masked)) {
      onChange(masked)
    }
  }

  const handleBlur = () => {
    isFocused.current = false
    if (draft === '') {
      onChange(null)
      return
    }
    const norm = normalise(draft)
    if (norm) {
      setDraft(norm)
      onChange(norm)
    } else {
      // Keep the user's draft visible so they can fix it; signal invalid via the
      // parent's `invalid` prop if it wants to show an error.
      onChange(null)
    }
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      maxLength={5}
      value={draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      onFocus={() => { isFocused.current = true }}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={handleBlur}
      className={cn(
        'w-[88px] h-11 rounded-lg border surface px-3 text-sm text-heading text-center tabular-nums',
        'placeholder:text-caption',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
        invalid
          ? 'border-red-500/60'
          : 'border-[var(--border-secondary)]',
      )}
    />
  )
}
