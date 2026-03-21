import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  createElement,
  type ReactNode,
} from 'react'
import { api } from '@/lib/api'

// ── Types ────────────────────────────────────────────────────────────────────

export type Theme = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

interface ThemeContextValue {
  /** The user's stored preference */
  theme: Theme
  /** The actual theme applied to the page */
  resolvedTheme: ResolvedTheme
  /** Update the theme preference (persists to API) */
  setTheme: (theme: Theme) => void
}

// ── Context ──────────────────────────────────────────────────────────────────

const ThemeContext = createContext<ThemeContextValue | null>(null)

// ── Helpers ──────────────────────────────────────────────────────────────────

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === 'system' ? getSystemTheme() : theme
}

function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement
  if (resolved === 'dark') {
    root.classList.add('dark')
    root.classList.remove('light')
  } else {
    root.classList.add('light')
    root.classList.remove('dark')
  }
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system')
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => getSystemTheme())
  const initialised = useRef(false)

  // Apply resolved theme to <html> whenever it changes
  useEffect(() => {
    applyTheme(resolvedTheme)
  }, [resolvedTheme])

  // On mount, fetch the stored preference from the API
  useEffect(() => {
    let cancelled = false
    api.system.getPreferences()
      .then(prefs => {
        if (cancelled) return
        const stored = prefs?.theme as Theme | undefined
        const pref = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
        setThemeState(pref)
        setResolvedTheme(resolveTheme(pref))
        initialised.current = true
      })
      .catch(() => {
        // If API fails, stay with system default
        initialised.current = true
      })
    return () => { cancelled = true }
  }, [])

  // Listen for OS theme changes when preference is 'system'
  useEffect(() => {
    if (theme !== 'system') return

    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      setResolvedTheme(e.matches ? 'dark' : 'light')
    }
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [theme])

  // Exposed setter: update state + persist to API
  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    setResolvedTheme(resolveTheme(next))

    // Fire-and-forget save to API
    api.system.setPreference('theme', next).catch(() => {
      // Silently fail — the UI already reflects the change
    })
  }, [])

  return createElement(
    ThemeContext.Provider,
    { value: { theme, resolvedTheme, setTheme } },
    children,
  )
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
