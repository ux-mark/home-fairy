import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ThemeProvider } from '@/hooks/useTheme'
import { ToastProvider } from '@/hooks/useToast'
import { clearChunkReloadFlag } from '@/lib/lazyWithRetry'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      // Live state arrives via Socket.io invalidations; refetching every
      // mounted query on every tab refocus stalls the UI mid-animation and
      // hammers the Pi. Routes that genuinely need on-focus refresh opt back
      // in per-query.
      refetchOnWindowFocus: false,
    },
  },
})

// If an in-flight service-worker update takes over this tab, the running
// module graph still points at the PREVIOUS build's hashed chunks — any
// subsequent lazy route will then fail to import because those files were
// swept from the server. Reload once when control changes so we continue on
// the matching `index.html` + chunks.
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  let reloadedForSwChange = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadedForSwChange) return
    reloadedForSwChange = true
    window.location.reload()
  })
}

// First successful paint means any prior chunk-reload attempt succeeded —
// clear the guard so future failures can reload again if needed.
clearChunkReloadFlag()

// StrictMode double-invokes effects in development to surface bugs but adds
// real cost on a phone CPU during cold-mount. Keep it for dev only.
const tree = (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </ErrorBoundary>
)

ReactDOM.createRoot(document.getElementById('root')!).render(
  import.meta.env.DEV ? <React.StrictMode>{tree}</React.StrictMode> : tree,
)
