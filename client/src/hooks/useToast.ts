import {
  createContext,
  useContext,
  useState,
  useCallback,
  createElement,
  type ReactNode,
} from 'react'

export interface ToastMessage {
  id: number
  message: string
  type: 'success' | 'error'
}

interface ToastContextValue {
  toasts: ToastMessage[]
  toast: (opts: { message: string; type?: 'success' | 'error' }) => void
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let nextId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useCallback(
    ({ message, type = 'success' }: { message: string; type?: 'success' | 'error' }) => {
      const id = nextId++
      setToasts(prev => [...prev, { id, message, type }])
      setTimeout(() => dismiss(id), 3000)
    },
    [dismiss],
  )

  return createElement(
    ToastContext.Provider,
    { value: { toasts, toast, dismiss } },
    children,
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
