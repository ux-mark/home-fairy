import React, { Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import WatchLayout from '@/components/layout/WatchLayout'
import HomePage from '@/pages/HomePage'
import { Skeleton, SkeletonList } from '@/components/ui/Skeleton'

const RoomsPage = React.lazy(() => import('@/pages/RoomsPage'))
const RoomDetailPage = React.lazy(() => import('@/pages/RoomDetailPage'))
const ScenesPage = React.lazy(() => import('@/pages/ScenesPage'))
const SceneEditorPage = React.lazy(() => import('@/pages/SceneEditorPage'))
const DashboardPage = React.lazy(() => import('@/pages/DashboardPage'))
const DevicesPage = React.lazy(() => import('@/pages/DevicesPage'))
const DeviceDetailPage = React.lazy(() => import('@/pages/DeviceDetailPage'))
const LightDetailPage = React.lazy(() => import('@/pages/LightDetailPage'))
const WatchPage = React.lazy(() => import('@/pages/WatchPage'))
const SettingsPage = React.lazy(() => import('@/pages/SettingsPage'))
const LogsPage = React.lazy(() => import('@/pages/LogsPage'))
const KasaSetupPage = React.lazy(() => import('@/pages/KasaSetupPage'))
const LightsPage = React.lazy(() => import('@/pages/LightsPage'))
const SonosSetupPage = React.lazy(() => import('@/pages/SonosSetupPage'))
const SonosDetailPage = React.lazy(() => import('@/pages/SonosDetailPage'))

function PageLoader() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      <Skeleton className="h-7 w-40 rounded-lg" />
      <SkeletonList count={4} height="h-20" />
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/rooms" element={<RoomsPage />} />
          <Route path="/rooms/:name" element={<RoomDetailPage />} />
          <Route path="/scenes" element={<ScenesPage />} />
          <Route path="/scenes/:name" element={<SceneEditorPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/devices" element={<DevicesPage />} />
          <Route path="/devices/kasa/:id" element={<DeviceDetailPage />} />
          <Route path="/devices/:id" element={<DeviceDetailPage />} />
          <Route path="/lights" element={<LightsPage />} />
          <Route path="/lights/:id" element={<LightDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/logs" element={<LogsPage />} />
          <Route path="/settings/kasa" element={<KasaSetupPage />} />
          <Route path="/sonos-setup" element={<SonosSetupPage />} />
          <Route path="/sonos/:speaker" element={<SonosDetailPage />} />
        </Route>
        <Route element={<WatchLayout />}>
          <Route path="/watch" element={<WatchPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
