import React from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  children: React.ReactNode
  /** Optional label shown under the error title for context (e.g. a route name). */
  scope?: string
}

interface State {
  error: Error | null
  /** Increments when we reset, forcing children to remount. */
  resetKey: number
}

/**
 * Top-level error boundary. When a descendant throws, we show a recoverable
 * error card instead of unmounting the whole tree to a blank page.
 *
 * Also detects dynamic-import / chunk-load failures (stale service-worker
 * referencing a hashed chunk that no longer exists on the server) and
 * offers a one-tap reload that bypasses the SW cache.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, resetKey: 0 }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Surface to the browser console so Safari Web Inspector can capture it.
    console.error('[ErrorBoundary]', error, info)
  }

  private isChunkLoadError(err: Error): boolean {
    const msg = `${err.name ?? ''} ${err.message ?? ''}`.toLowerCase()
    return (
      msg.includes('chunkloaderror') ||
      msg.includes('failed to fetch dynamically imported module') ||
      msg.includes('importing a module script failed') ||
      msg.includes('error loading dynamically imported module')
    )
  }

  private reset = () => {
    this.setState(s => ({ error: null, resetKey: s.resetKey + 1 }))
  }

  private reload = () => {
    // Force a bypass of the SW + HTTP cache by appending a cache-buster.
    const url = new URL(window.location.href)
    url.searchParams.set('_r', String(Date.now()))
    window.location.replace(url.toString())
  }

  render() {
    const { error } = this.state
    if (!error) {
      return (
        <React.Fragment key={this.state.resetKey}>
          {this.props.children}
        </React.Fragment>
      )
    }

    const stale = this.isChunkLoadError(error)
    const title = stale ? 'A new version is available' : 'Something went wrong'
    const body = stale
      ? 'Home Fairy has updated in the background. Reload to pick up the latest version.'
      : 'This page hit an unexpected error. You can try again, or reload if it keeps happening.'

    return (
      <div
        role="alert"
        className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 py-12 text-center"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-fairy-500/15">
          <RefreshCw className="h-6 w-6 text-fairy-400" aria-hidden="true" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold text-heading">{title}</h2>
          <p className="text-sm text-body">{body}</p>
          {this.props.scope && (
            <p className="text-xs text-caption">{this.props.scope}</p>
          )}
        </div>
        <details className="w-full max-w-sm text-left text-xs text-caption">
          <summary className="cursor-pointer select-none">Technical details</summary>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--bg-secondary)] p-3 text-[11px] leading-relaxed text-body">
            {error.name}: {error.message}
            {error.stack ? '\n\n' + error.stack : ''}
          </pre>
        </details>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {!stale && (
            <button
              type="button"
              onClick={this.reset}
              className={cn(
                'inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[var(--bg-secondary)] px-4 py-2',
                'text-sm font-medium text-body transition-colors hover:bg-[var(--bg-tertiary)]',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              )}
            >
              Try again
            </button>
          )}
          <button
            type="button"
            onClick={this.reload}
            className={cn(
              'inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-fairy-500 px-4 py-2',
              'text-sm font-medium text-white transition-colors hover:bg-fairy-400',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            )}
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
