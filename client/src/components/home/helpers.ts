// ── Visual state helpers ──────────────────────────────────────────────────────

export function getLuxIcon(lux: number): { icon: string; className: string; label: string } {
  if (lux >= 1000) return { icon: 'sun', className: 'text-amber-400', label: 'Bright' }
  if (lux >= 400) return { icon: 'sun-dim', className: 'text-yellow-400', label: 'Moderate light' }
  if (lux >= 50) return { icon: 'cloud-sun', className: 'text-slate-400', label: 'Low light' }
  if (lux >= 5) return { icon: 'cloud-moon', className: 'text-slate-500', label: 'Dim' }
  return { icon: 'moon', className: 'text-indigo-400', label: 'Dark' }
}

export function getTempColor(temp: number): string {
  if (temp >= 28) return 'text-red-400'
  if (temp >= 24) return 'text-amber-400'
  if (temp >= 20) return 'text-emerald-400'
  if (temp >= 16) return 'text-sky-400'
  return 'text-blue-400'
}

export function getActivityColor(lastActive: string | null): string {
  if (!lastActive) return 'text-slate-500 dark:text-slate-400'
  const minutesAgo = (Date.now() - new Date(lastActive).getTime()) / 60000
  if (minutesAgo < 5) return 'text-slate-700 dark:text-slate-300'
  if (minutesAgo < 30) return 'text-slate-600 dark:text-slate-400'
  return 'text-slate-500 dark:text-slate-400'
}
