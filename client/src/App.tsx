import React, { Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import WatchLayout from '@/components/layout/WatchLayout'

const HomePage = React.lazy(() => import('@/pages/HomePage'))
const RoomsPage = React.lazy(() => import('@/pages/RoomsPage'))
const RoomDetailPage = React.lazy(() => import('@/pages/RoomDetailPage'))
const ScenesPage = React.lazy(() => import('@/pages/ScenesPage'))
const SceneEditorPage = React.lazy(() => import('@/pages/SceneEditorPage'))
const LightsPage = React.lazy(() => import('@/pages/LightsPage'))
const WatchPage = React.lazy(() => import('@/pages/WatchPage'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-fairy-500 border-t-transparent" />
        <p className="text-sm text-slate-400">Loading...</p>
      </div>
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
          <Route path="/lights" element={<LightsPage />} />
        </Route>
        <Route element={<WatchLayout />}>
          <Route path="/watch" element={<WatchPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
