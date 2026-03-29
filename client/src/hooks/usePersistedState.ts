import { useState, useEffect, useRef } from 'react'
import { useNavigationType } from 'react-router-dom'

/**
 * Like useState, but persists to sessionStorage and restores on back/forward navigation.
 * On POP navigation (back/forward), the saved value is used as the initial state.
 * On PUSH/REPLACE navigation, the provided defaultValue is used.
 *
 * Supports primitives and Set<string>.
 */

function serializeValue(value: unknown): string {
  if (value instanceof Set) {
    return JSON.stringify({ __type: 'Set', values: Array.from(value) })
  }
  return JSON.stringify(value)
}

function deserializeValue(json: string): unknown {
  const parsed = JSON.parse(json)
  if (
    parsed &&
    typeof parsed === 'object' &&
    (parsed as Record<string, unknown>).__type === 'Set'
  ) {
    const vals = (parsed as Record<string, unknown>).values
    return new Set(Array.isArray(vals) ? vals : [])
  }
  return parsed
}

export function usePersistedState<T>(
  key: string,
  defaultValue: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const navigationType = useNavigationType()
  const storageKey = `pageState:${key}`

  const [value, setValue] = useState<T>(() => {
    if (navigationType === 'POP') {
      try {
        const saved = sessionStorage.getItem(storageKey)
        if (saved !== null) {
          return deserializeValue(saved) as T
        }
      } catch {
        // sessionStorage unavailable — ignore
      }
    }
    return defaultValue
  })

  // Track the last serialized value to avoid unnecessary writes.
  // This is especially important for Set values which are new object references
  // each render — a standard dep array comparison would always fire.
  const lastSerialized = useRef<string>('')

  // eslint-disable-next-line react-hooks/exhaustive-deps -- serialized comparison handles Set references
  useEffect(() => {
    const serialized = serializeValue(value)
    if (serialized !== lastSerialized.current) {
      lastSerialized.current = serialized
      try {
        sessionStorage.setItem(storageKey, serialized)
      } catch {
        // sessionStorage full or unavailable — ignore
      }
    }
  }, [storageKey, value])

  return [value, setValue]
}
