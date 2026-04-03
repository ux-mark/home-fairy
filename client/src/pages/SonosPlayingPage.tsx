import { NowPlayingTab } from '@/components/sonos/NowPlayingTab'

export default function SonosPlayingPage() {
  return (
    <>
      <h1 className="sr-only">Now Playing</h1>
      <NowPlayingTab />
    </>
  )
}
