import { useSearchParams } from 'react-router-dom'
import { NowPlayingTab } from '@/components/sonos/NowPlayingTab'

export default function SonosPlayingPage() {
  const [searchParams] = useSearchParams()
  const focusSpeaker = searchParams.get('speaker') ?? undefined

  return (
    <>
      <h1 className="sr-only">Now Playing</h1>
      <NowPlayingTab focusSpeaker={focusSpeaker} />
    </>
  )
}
