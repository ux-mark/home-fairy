import { useState } from 'react'

/**
 * Returns a monotonically-incrementing session key that advances each time
 * `open` transitions from false → true. Pass this as the `key` prop on the
 * inner content component so it remounts (and resets local state) each time
 * the overlay opens.
 */
export function useOverlaySessionKey(open: boolean): number {
  const [sessionKey, setSessionKey] = useState(0)
  const [prevOpen, setPrevOpen] = useState(open)

  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setSessionKey(k => k + 1)
    }
  }

  return sessionKey
}
