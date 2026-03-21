import { useToast } from '@/hooks/useToast'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function ToastContainer() {
  const { toasts, dismiss } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2 md:bottom-6">
      {toasts.map(t => (
        <div
          key={t.id}
          role="alert"
          className={cn(
            'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium shadow-lg',
            'animate-[slideUp_200ms_ease-out]',
            t.type === 'success'
              ? 'bg-fairy-600 text-white'
              : 'bg-red-600 text-white',
          )}
        >
          <span>{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            className="ml-2 rounded p-0.5 transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            aria-label="Dismiss notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
