import { Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import WatchLayout from '@/components/layout/WatchLayout'
import HomePage from '@/pages/HomePage'
import { Skeleton, SkeletonList } from '@/components/ui/Skeleton'
import { AuthGuard } from '@/components/auth/AuthGuard'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { PlaybackStateProvider } from '@/contexts/PlaybackStateContext'
import { lazyWithRetry } from '@/lib/lazyWithRetry'

const LoginPage = lazyWithRetry(() => import('@/pages/LoginPage'))
const InvitePage = lazyWithRetry(() => import('@/pages/InvitePage'))
const RoomsPage = lazyWithRetry(() => import('@/pages/RoomsPage'))
const RoomDetailPage = lazyWithRetry(() => import('@/pages/RoomDetailPage'))
const ScenesPage = lazyWithRetry(() => import('@/pages/ScenesPage'))
const SceneEditorPage = lazyWithRetry(() => import('@/pages/SceneEditorPage'))
const DashboardPage = lazyWithRetry(() => import('@/pages/DashboardPage'))
const DevicesPage = lazyWithRetry(() => import('@/pages/DevicesPage'))
const DeviceDetailPage = lazyWithRetry(() => import('@/pages/DeviceDetailPage'))
const LightDetailPage = lazyWithRetry(() => import('@/pages/LightDetailPage'))
const WatchPage = lazyWithRetry(() => import('@/pages/WatchPage'))
const SettingsPage = lazyWithRetry(() => import('@/pages/SettingsPage'))
const LogsPage = lazyWithRetry(() => import('@/pages/LogsPage'))
const KasaSetupPage = lazyWithRetry(() => import('@/pages/KasaSetupPage'))
const LightsPage = lazyWithRetry(() => import('@/pages/LightsPage'))
const SonosSetupPage = lazyWithRetry(() => import('@/pages/SonosSetupPage'))
const SonosDetailPage = lazyWithRetry(() => import('@/pages/SonosDetailPage'))
const SonosPlayingPage = lazyWithRetry(() => import('@/pages/SonosPlayingPage'))
const SonosBrowsePage = lazyWithRetry(() => import('@/pages/SonosBrowsePage'))
const SonosFavouritesPage = lazyWithRetry(() => import('@/pages/SonosFavouritesPage'))
const SpotifyArtistPage = lazyWithRetry(() => import('@/pages/SpotifyArtistPage'))
const SpotifyAlbumPage = lazyWithRetry(() => import('@/pages/SpotifyAlbumPage'))
const SpotifyPlaylistPage = lazyWithRetry(() => import('@/pages/SpotifyPlaylistPage'))
const SpotifyShowPage = lazyWithRetry(() => import('@/pages/SpotifyShowPage'))
const NasArtistPage = lazyWithRetry(() => import('@/pages/NasArtistPage'))
const NasAlbumPage = lazyWithRetry(() => import('@/pages/NasAlbumPage'))
const AccountPage = lazyWithRetry(() => import('@/pages/AccountPage'))
const FairyQueenPage = lazyWithRetry(() => import('@/pages/FairyQueenPage'))

function PageLoader() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      <Skeleton className="h-7 w-40 rounded-lg" />
      <SkeletonList count={4} height="h-20" />
    </div>
  )
}

// Scopes each route's crash + chunk-load failures to its own boundary so
// a detail-page bug does not blank the entire app. The outer boundary in
// main.tsx catches failures that happen above the router (layout etc.).
function RouteShell({ children, scope }: { children: React.ReactNode; scope: string }) {
  return (
    <ErrorBoundary scope={scope}>
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </ErrorBoundary>
  )
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={<RouteShell scope="Login"><LoginPage /></RouteShell>}
      />
      <Route
        path="/invite/:token"
        element={<RouteShell scope="Invite"><InvitePage /></RouteShell>}
      />
      <Route element={<AuthGuard><PlaybackStateProvider><AppLayout /></PlaybackStateProvider></AuthGuard>}>
        <Route path="/" element={<RouteShell scope="Home"><HomePage /></RouteShell>} />
        <Route path="/rooms" element={<RouteShell scope="Rooms"><RoomsPage /></RouteShell>} />
        <Route path="/rooms/:name" element={<RouteShell scope="Room detail"><RoomDetailPage /></RouteShell>} />
        <Route path="/scenes" element={<RouteShell scope="Scenes"><ScenesPage /></RouteShell>} />
        <Route path="/scenes/:name" element={<RouteShell scope="Scene editor"><SceneEditorPage /></RouteShell>} />
        <Route path="/dashboard" element={<RouteShell scope="Insights"><DashboardPage /></RouteShell>} />
        <Route path="/devices" element={<RouteShell scope="Devices"><DevicesPage /></RouteShell>} />
        <Route path="/devices/kasa/:id" element={<RouteShell scope="Kasa device"><DeviceDetailPage /></RouteShell>} />
        <Route path="/devices/:id" element={<RouteShell scope="Device"><DeviceDetailPage /></RouteShell>} />
        <Route path="/lights" element={<RouteShell scope="Lights"><LightsPage /></RouteShell>} />
        <Route path="/lights/:id" element={<RouteShell scope="Light"><LightDetailPage /></RouteShell>} />
        <Route path="/settings" element={<RouteShell scope="Settings"><SettingsPage /></RouteShell>} />
        <Route path="/settings/logs" element={<RouteShell scope="Logs"><LogsPage /></RouteShell>} />
        <Route path="/settings/kasa" element={<RouteShell scope="Kasa setup"><KasaSetupPage /></RouteShell>} />
        <Route path="/account" element={<RouteShell scope="Account"><AccountPage /></RouteShell>} />
        <Route path="/fairy-queen" element={<RouteShell scope="Fairy Queen"><FairyQueenPage /></RouteShell>} />
        <Route path="/sonos" element={<RouteShell scope="Sonos playing"><SonosPlayingPage /></RouteShell>} />
        <Route path="/sonos/playing" element={<RouteShell scope="Sonos playing"><SonosPlayingPage /></RouteShell>} />
        <Route path="/sonos/browse" element={<RouteShell scope="Sonos browse"><SonosBrowsePage /></RouteShell>} />
        <Route path="/sonos/browse/spotify/artist/:id" element={<RouteShell scope="Spotify artist"><SpotifyArtistPage /></RouteShell>} />
        <Route path="/sonos/browse/spotify/album/:id" element={<RouteShell scope="Spotify album"><SpotifyAlbumPage /></RouteShell>} />
        <Route path="/sonos/browse/spotify/playlist/:id" element={<RouteShell scope="Spotify playlist"><SpotifyPlaylistPage /></RouteShell>} />
        <Route path="/sonos/browse/spotify/show/:id" element={<RouteShell scope="Spotify show"><SpotifyShowPage /></RouteShell>} />
        <Route path="/sonos/browse/nas/artist/:name" element={<RouteShell scope="NAS artist"><NasArtistPage /></RouteShell>} />
        <Route path="/sonos/browse/nas/album/:artist/:title" element={<RouteShell scope="NAS album"><NasAlbumPage /></RouteShell>} />
        <Route path="/sonos/favourites" element={<RouteShell scope="Favourites"><SonosFavouritesPage /></RouteShell>} />
        <Route path="/sonos/insights" element={<RouteShell scope="Sonos insights"><DashboardPage /></RouteShell>} />
        <Route path="/sonos/setup" element={<RouteShell scope="Sonos setup"><SonosSetupPage /></RouteShell>} />
        <Route path="/sonos/:speaker" element={<RouteShell scope="Speaker"><SonosDetailPage /></RouteShell>} />
      </Route>
      <Route element={<AuthGuard><WatchLayout /></AuthGuard>}>
        <Route path="/watch" element={<RouteShell scope="Watch"><WatchPage /></RouteShell>} />
      </Route>
    </Routes>
  )
}
