import { useSearchParams } from 'react-router-dom'
import { BrowseTab } from '@/components/sonos/BrowseTab'

export default function SonosBrowsePage() {
  const [searchParams] = useSearchParams()
  const targetSpeaker = searchParams.get('speaker') ?? undefined

  return (
    <>
      <h1 className="sr-only">Browse Music</h1>
      <BrowseTab targetSpeaker={targetSpeaker} />
    </>
  )
}
