import { useContext } from 'react'
import { PlaybackStateContext } from '@/contexts/PlaybackStateContext'
import type { PlaybackStateContextValue } from '@/contexts/PlaybackStateContext'

export type { PlaybackStateContextValue }

export function usePlaybackState(): PlaybackStateContextValue {
  const ctx = useContext(PlaybackStateContext)
  if (!ctx) {
    throw new Error('usePlaybackState must be used inside <PlaybackStateProvider>')
  }
  return ctx
}
