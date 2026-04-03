import { useNavigate } from 'react-router-dom'
import { FavouritesTab } from '@/components/sonos/FavouritesTab'

export default function SonosFavouritesPage() {
  const navigate = useNavigate()

  return (
    <>
      <h1 className="sr-only">Favourites</h1>
      <FavouritesTab onNavigateToBrowse={() => navigate('/sonos/browse')} />
    </>
  )
}
