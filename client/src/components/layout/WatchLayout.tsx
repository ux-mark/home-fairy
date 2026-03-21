import { Outlet } from 'react-router-dom'

export default function WatchLayout() {
  return (
    <div className="flex min-h-svh flex-col" style={{ background: 'var(--bg-primary)' }}>
      <main className="flex-1 p-2">
        <Outlet />
      </main>
    </div>
  )
}
