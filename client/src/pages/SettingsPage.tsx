import { useState, useEffect } from 'react'
import { ModesList } from '@/components/modes/ModesList'
import ModeDetail from '@/components/modes/ModeDetail'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import {
  Settings,
  X,
  RefreshCw,
  Timer,
  FileText,
  CheckCircle,
  AlertCircle,
  Sun,
  Moon,
  Monitor,
  ChevronDown,
  Plug,
  Trash2,
  SlidersHorizontal,
  Headphones,
  CalendarClock,
  TrainFront,
  CloudSun,
  HardDrive,
  LogOut,
  UserPlus,
  Users,
  KeyRound,
  Shield,
  ShieldOff,
} from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { useTheme } from '@/hooks/useTheme'
import type { Theme } from '@/hooks/useTheme'
import { Section } from '@/components/settings/Section'
import { NightModeSection } from '@/components/settings/NightModeSection'
import { SubwaySection } from '@/components/settings/SubwaySection'
import { IndicatorSection } from '@/components/settings/IndicatorSection'
import { WeatherIndicatorSection } from '@/components/settings/WeatherIndicatorSection'
import { DataManagementSection } from '@/components/settings/DataManagementSection'
import { MusicSection } from '@/components/settings/MusicSection'
import { authClient } from '@/lib/auth-client'
import { AccessLinksSection } from '@/components/settings/AccessLinksSection'

// ── Theme section ───────────────────────────────────────────────────────────

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

function ThemeSection() {
  const { theme, setTheme } = useTheme()

  return (
    <Section title="Appearance">
      <div className="flex items-center justify-between">
        <span className="text-heading text-sm">Theme</span>
        <div className="surface flex rounded-lg border" style={{ borderColor: 'var(--border-secondary)' }}>
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              aria-pressed={theme === value}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors',
                theme === value
                  ? 'bg-fairy-500 text-white'
                  : 'text-caption hover:text-[var(--text-primary)]',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>
    </Section>
  )
}

// ── General section ─────────────────────────────────────────────────────────

function GeneralSection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: prefs } = useQuery({
    queryKey: ['system', 'preferences'],
    queryFn: api.system.getPreferences,
  })

  const mutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api.system.setPreference(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'preferences'] })
      toast({ message: 'Preference saved' })
    },
    onError: () => toast({ message: 'Failed to save preference', type: 'error' }),
  })

  const tempUnit = prefs?.temp_unit ?? 'C'
  const [energyRateInput, setEnergyRateInput] = useState(prefs?.energy_rate ?? '')
  const [currencyInput, setCurrencyInput] = useState(prefs?.currency_symbol ?? '')

  // Sync local state when prefs load/change from server
  useEffect(() => {
    setEnergyRateInput(prefs?.energy_rate ?? '')
  }, [prefs?.energy_rate])

  useEffect(() => {
    setCurrencyInput(prefs?.currency_symbol ?? '')
  }, [prefs?.currency_symbol])

  return (
    <Section title="General">
      <div className="flex items-center justify-between">
        <span className="text-heading text-sm">Temperature unit</span>
        <div className="surface flex rounded-lg border" style={{ borderColor: 'var(--border-secondary)' }}>
          {(['C', 'F'] as const).map(unit => (
            <button
              key={unit}
              onClick={() => mutation.mutate({ key: 'temp_unit', value: unit })}
              className={cn(
                'px-4 py-2 text-sm font-medium transition-colors',
                tempUnit === unit
                  ? 'bg-fairy-500 text-white'
                  : 'text-caption hover:text-[var(--text-primary)]',
              )}
            >
              °{unit}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <span className="text-heading text-sm">Energy rate</span>
          <p className="text-caption text-xs">Cost per kWh for energy estimates</p>
        </div>
        <input
          type="number"
          step="0.01"
          min="0"
          placeholder="0.30"
          value={energyRateInput}
          onChange={(e) => setEnergyRateInput(e.target.value)}
          onBlur={(e) => {
            if (e.target.value !== (prefs?.energy_rate ?? '')) {
              mutation.mutate({ key: 'energy_rate', value: e.target.value })
            }
          }}
          className="w-24 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-secondary)] px-3 py-2 text-right text-sm text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          aria-label="Energy rate per kWh"
        />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <span className="text-heading text-sm">Currency symbol</span>
          <p className="text-caption text-xs">Used for energy cost displays</p>
        </div>
        <input
          type="text"
          maxLength={3}
          placeholder="$"
          value={currencyInput}
          onChange={(e) => setCurrencyInput(e.target.value)}
          onBlur={(e) => {
            if (e.target.value !== (prefs?.currency_symbol ?? '')) {
              mutation.mutate({ key: 'currency_symbol', value: e.target.value })
            }
          }}
          className="w-16 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-secondary)] px-3 py-2 text-center text-sm text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          aria-label="Currency symbol"
        />
      </div>
    </Section>
  )
}

// ── Modes section (uses new ModesList/ModeDetail components) ────────────────

function ModesSection() {
  const [selectedMode, setSelectedMode] = useState<string | null>(null)

  if (selectedMode) {
    return (
      <ModeDetail
        modeName={selectedMode}
        onBack={() => setSelectedMode(null)}
      />
    )
  }

  return (
    <ModesList onSelectMode={setSelectedMode} />
  )
}

// ── Devices section ─────────────────────────────────────────────────────────

function DevicesSection() {
  const { toast } = useToast()

  const { data: lights, isLoading: lifxLoading } = useQuery({
    queryKey: ['lifx', 'lights'],
    queryFn: api.lifx.getLights,
    retry: false,
  })

  const syncMutation = useMutation({
    mutationFn: api.hubitat.syncDevices,
    onSuccess: () => toast({ message: 'Hubitat devices synced' }),
    onError: () => toast({ message: 'Sync failed', type: 'error' }),
  })

  return (
    <Section title="Devices">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-heading text-sm">Hubitat</p>
            <p className="text-caption text-xs">Sync devices from Hubitat hub</p>
          </div>
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="surface flex items-center gap-1.5 rounded-lg px-3 py-2 text-heading text-sm transition-colors hover:brightness-95 dark:hover:brightness-110 disabled:opacity-50"
          >
            <RefreshCw
              className={cn('h-4 w-4', syncMutation.isPending && 'animate-spin')}
            />
            Sync Devices
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-heading text-sm">LIFX</p>
            <p className="text-caption text-xs">
              {lifxLoading
                ? 'Checking...'
                : lights
                  ? `${lights.length} light${lights.length !== 1 ? 's' : ''} connected`
                  : 'Unable to connect'}
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            {lifxLoading ? (
              <RefreshCw className="h-4 w-4 animate-spin text-caption" />
            ) : lights ? (
              <CheckCircle className="h-4 w-4 text-green-400" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-400" />
            )}
          </div>
        </div>

        <Link
          to="/settings/kasa"
          className="surface flex items-center gap-2 rounded-lg px-3 py-2.5 text-heading text-sm transition-colors hover:brightness-95 dark:hover:brightness-110"
        >
          <Plug className="h-4 w-4" />
          Manage Kasa devices
        </Link>
      </div>
    </Section>
  )
}

// ── Timers section ──────────────────────────────────────────────────────────

function TimersSection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: timers } = useQuery({
    queryKey: ['system', 'timers'],
    queryFn: api.system.getTimers,
    refetchInterval: 1000,
  })

  const cancelMutation = useMutation({
    mutationFn: api.system.cancelTimer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'timers'] })
      toast({ message: 'Timer cancelled' })
    },
    onError: () => toast({ message: 'Failed to cancel timer', type: 'error' }),
  })

  const cancelAllMutation = useMutation({
    mutationFn: api.system.cancelAllTimers,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'timers'] })
      toast({ message: 'All timers cancelled' })
    },
    onError: () => toast({ message: 'Failed to cancel timers', type: 'error' }),
  })

  const formatRemaining = (startedAt: number, durationMs: number) => {
    const remaining = Math.max(0, startedAt + durationMs - Date.now())
    const secs = Math.ceil(remaining / 1000)
    const mins = Math.floor(secs / 60)
    const s = secs % 60
    return `${mins}:${String(s).padStart(2, '0')}`
  }

  return (
    <Section title="Timers">
      {timers && timers.length > 0 ? (
        <div className="space-y-3">
          {timers.map(timer => (
            <div
              key={timer.id}
              className="surface flex items-center justify-between rounded-lg px-3 py-2"
            >
              <div>
                <p className="text-heading text-sm">
                  {timer.sceneName} → {timer.targetScene}
                </p>
                <p className="font-mono text-xs text-fairy-400">
                  {formatRemaining(timer.startedAt, timer.durationMs)}
                </p>
              </div>
              <button
                onClick={() => cancelMutation.mutate(timer.id)}
                disabled={cancelMutation.isPending}
                aria-label={`Cancel timer: ${timer.sceneName}`}
                className="rounded-lg p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-red-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            onClick={() => cancelAllMutation.mutate()}
            disabled={cancelAllMutation.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/20"
          >
            <Trash2 className="h-4 w-4" />
            Cancel All
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-caption">
          <Timer className="h-4 w-4" />
          No active timers
        </div>
      )}
    </Section>
  )
}

// ── System section ──────────────────────────────────────────────────────────

function SystemSection() {
  const { data: health } = useQuery({
    queryKey: ['system', 'health'],
    queryFn: api.system.health,
  })

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  return (
    <Section title="System">
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--text-secondary)]">Version</span>
          <span className="text-heading">3.0.0</span>
        </div>
        {health && (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Uptime</span>
              <span className="text-heading">{formatUptime(health.uptime)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Database</span>
              <span
                className={cn(
                  'text-sm',
                  health.db === 'connected' ? 'text-green-400' : 'text-red-400',
                )}
              >
                {health.db}
              </span>
            </div>
          </>
        )}
        <div className="pt-2">
          <Link
            to="/settings/logs"
            className="surface flex items-center gap-2 rounded-lg px-3 py-2.5 text-heading text-sm transition-colors hover:brightness-95 dark:hover:brightness-110"
          >
            <FileText className="h-4 w-4" />
            View System Logs
          </Link>
        </div>
      </div>
    </Section>
  )
}

// ── Category accordion ───────────────────────────────────────────────────────

type CategoryId = 'account' | 'preferences' | 'music' | 'modes-and-schedule' | 'public-transport' | 'weather' | 'system'

function CategoryAccordion({
  categoryId,
  label,
  icon: Icon,
  isOpen,
  onToggle,
  children,
}: {
  categoryId: CategoryId
  label: string
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  const headingId = `category-heading-${categoryId}`
  const panelId = `category-panel-${categoryId}`

  return (
    <div>
      <button
        id={headingId}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        }}
        className={cn(
          'flex w-full items-center justify-between py-3 text-left transition-colors',
          'min-h-[44px]',
          !isOpen && 'border-b border-[var(--border-secondary)]',
        )}
      >
        <span className="flex items-center gap-2">
          {Icon && <Icon className="h-5 w-5 text-fairy-400" aria-hidden="true" />}
          <span className="text-heading text-base font-semibold">{label}</span>
        </span>
        <ChevronDown
          className={cn(
            'h-5 w-5 text-[var(--text-secondary)] transition-transform duration-300',
            isOpen && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      <div
        id={panelId}
        role="region"
        aria-labelledby={headingId}
        className="grid transition-all duration-300"
        style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="space-y-4 pt-3 pb-2">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Role helpers ────────────────────────────────────────────────────────────

function roleLabel(role: string): string {
  if (role === 'admin') return 'Manager'
  if (role === 'user') return 'Resident'
  return 'Guest'
}

function roleBadgeClass(role: string): string {
  if (role === 'admin') return 'bg-fairy-500/15 text-fairy-400'
  if (role === 'user') return 'bg-blue-500/15 text-blue-400'
  return 'bg-yellow-500/15 text-yellow-400'
}

// ── Account section ────────────────────────────────────────────────────────

function AccountSection() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data: session } = authClient.useSession()
  const isAdmin = session?.user?.role === 'admin'

  // Change own password
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newOwnPassword, setNewOwnPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  // Add user
  const [showAddUser, setShowAddUser] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [addingUser, setAddingUser] = useState(false)

  // Admin reset password
  const [resetUserId, setResetUserId] = useState<string | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resettingPassword, setResettingPassword] = useState(false)

  const { data: usersData, refetch: refetchUsers } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const result = await authClient.admin.listUsers({ query: { limit: 100 } })
      return result.data
    },
    enabled: isAdmin,
  })

  const users = usersData?.users ?? []

  async function handleSignOut() {
    await authClient.signOut()
    navigate('/login', { replace: true })
  }

  async function handleChangePassword() {
    if (!currentPassword || !newOwnPassword) return
    if (newOwnPassword !== confirmPassword) {
      toast({ message: 'Passwords do not match', type: 'error' })
      return
    }
    if (newOwnPassword.length < 8) {
      toast({ message: 'Password must be at least 8 characters', type: 'error' })
      return
    }
    setChangingPassword(true)
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword: newOwnPassword,
      })
      if (result.error) {
        toast({ message: result.error.message || 'Failed to change password', type: 'error' })
      } else {
        toast({ message: 'Password changed' })
        setCurrentPassword('')
        setNewOwnPassword('')
        setConfirmPassword('')
        setShowChangePassword(false)
      }
    } catch {
      toast({ message: 'Failed to change password', type: 'error' })
    } finally {
      setChangingPassword(false)
    }
  }

  async function handleAddUser() {
    if (!newEmail || !newName || !newPassword) return
    setAddingUser(true)
    try {
      const result = await authClient.admin.createUser({
        email: newEmail,
        name: newName,
        password: newPassword,
        role: 'user',
      })
      if (result.error) {
        toast({ message: result.error.message || 'Failed to create user', type: 'error' })
      } else {
        toast({ message: `User ${newName} created` })
        setNewEmail('')
        setNewName('')
        setNewPassword('')
        setShowAddUser(false)
        refetchUsers()
      }
    } catch {
      toast({ message: 'Failed to create user', type: 'error' })
    } finally {
      setAddingUser(false)
    }
  }

  async function handleResetPassword(userId: string, userName: string) {
    if (!resetPassword) return
    if (resetPassword.length < 8) {
      toast({ message: 'Password must be at least 8 characters', type: 'error' })
      return
    }
    setResettingPassword(true)
    try {
      const result = await authClient.admin.setUserPassword({
        userId,
        newPassword: resetPassword,
      })
      if (result.error) {
        toast({ message: result.error.message || 'Failed to reset password', type: 'error' })
      } else {
        toast({ message: `Password reset for ${userName}` })
        setResetPassword('')
        setResetUserId(null)
      }
    } catch {
      toast({ message: 'Failed to reset password', type: 'error' })
    } finally {
      setResettingPassword(false)
    }
  }

  async function handleRemoveUser(userId: string, userName: string) {
    if (userId === session?.user?.id) return
    try {
      await authClient.admin.removeUser({ userId })
      toast({ message: `${userName} removed` })
      refetchUsers()
    } catch {
      toast({ message: 'Failed to remove user', type: 'error' })
    }
  }

  async function handleSetRole(userId: string, userName: string, newRole: string) {
    const action = newRole === 'admin' ? 'promote' : 'demote'
    const label = newRole === 'admin' ? 'Manager' : 'Resident'
    if (!window.confirm(`${action === 'promote' ? 'Promote' : 'Demote'} ${userName} to ${label}?`)) return
    try {
      const result = await authClient.admin.setRole({ userId, role: newRole })
      if (result.error) {
        toast({ message: result.error.message || `Failed to ${action} user`, type: 'error' })
      } else {
        toast({ message: `${userName} is now a ${label}` })
        refetchUsers()
      }
    } catch {
      toast({ message: `Failed to ${action} user`, type: 'error' })
    }
  }

  return (
    <Section title="Account">
      <div className="space-y-4">
        {session?.user && (
          <div className="flex items-center justify-between text-sm">
            <div>
              <p className="text-heading font-medium">{session.user.name}</p>
              <p className="text-caption text-xs">{session.user.email}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/10"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        )}

        {/* Change own password */}
        <div className="border-t pt-4" style={{ borderColor: 'var(--border-secondary)' }}>
          <button
            onClick={() => setShowChangePassword(!showChangePassword)}
            className="flex items-center gap-2 text-sm text-heading transition-colors hover:text-fairy-400"
          >
            <KeyRound className="h-4 w-4 text-fairy-400" aria-hidden="true" />
            <span className="font-medium">Change password</span>
          </button>

          {showChangePassword && (
            <div className="mt-3 space-y-3 rounded-lg p-3" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
              <input
                type="password"
                placeholder="Current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                className="text-body w-full rounded-lg border px-3 py-2 text-sm"
                style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)' }}
              />
              <input
                type="password"
                placeholder="New password"
                value={newOwnPassword}
                onChange={(e) => setNewOwnPassword(e.target.value)}
                autoComplete="new-password"
                className="text-body w-full rounded-lg border px-3 py-2 text-sm"
                style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)' }}
              />
              <input
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="text-body w-full rounded-lg border px-3 py-2 text-sm"
                style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)' }}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleChangePassword}
                  disabled={changingPassword || !currentPassword || !newOwnPassword || !confirmPassword}
                  className="rounded-lg bg-fairy-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-fairy-600 disabled:opacity-50"
                >
                  {changingPassword ? 'Saving...' : 'Update password'}
                </button>
                <button
                  onClick={() => {
                    setShowChangePassword(false)
                    setCurrentPassword('')
                    setNewOwnPassword('')
                    setConfirmPassword('')
                  }}
                  className="rounded-lg px-3 py-2 text-sm text-caption transition-colors hover:bg-[var(--bg-secondary)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {isAdmin && (
          <>
          <div className="border-t pt-4" style={{ borderColor: 'var(--border-secondary)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-fairy-400" aria-hidden="true" />
                <span className="text-heading text-sm font-medium">Household members</span>
              </div>
              <button
                onClick={() => setShowAddUser(!showAddUser)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-fairy-400 transition-colors hover:bg-fairy-500/10"
              >
                <UserPlus className="h-4 w-4" />
                Add
              </button>
            </div>

            {showAddUser && (
              <div className="mb-4 space-y-3 rounded-lg p-3" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                <input
                  type="text"
                  placeholder="Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="text-body w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)' }}
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="text-body w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)' }}
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="text-body w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)' }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleAddUser}
                    disabled={addingUser || !newEmail || !newName || !newPassword}
                    className="rounded-lg bg-fairy-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-fairy-600 disabled:opacity-50"
                  >
                    {addingUser ? 'Creating...' : 'Create user'}
                  </button>
                  <button
                    onClick={() => setShowAddUser(false)}
                    className="rounded-lg px-3 py-2 text-sm text-caption transition-colors hover:bg-[var(--bg-secondary)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {users.map(user => (
                <div key={user.id}>
                  <div className="flex items-center justify-between rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                    <div>
                      <p className="text-heading">{user.name}</p>
                      <p className="text-caption text-xs">
                        {user.email}{' '}
                        <span className={cn('ml-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium', roleBadgeClass(user.role ?? 'user'))}>
                          {roleLabel(user.role ?? 'user')}
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setResetUserId(resetUserId === user.id ? null : user.id)}
                        aria-label={`Reset password for ${user.name}`}
                        className="rounded-lg p-2 text-[var(--text-secondary)] transition-colors hover:bg-fairy-500/10 hover:text-fairy-400"
                      >
                        <KeyRound className="h-4 w-4" />
                      </button>
                      {user.id !== session?.user?.id && user.role !== 'admin' && (
                        <button
                          onClick={() => handleSetRole(user.id, user.name, 'admin')}
                          aria-label={`Promote ${user.name} to Manager`}
                          title="Promote to Manager"
                          className="rounded-lg p-2 text-[var(--text-secondary)] transition-colors hover:bg-fairy-500/10 hover:text-fairy-400"
                        >
                          <Shield className="h-4 w-4" />
                        </button>
                      )}
                      {user.id !== session?.user?.id && user.role === 'admin' && (
                        <button
                          onClick={() => handleSetRole(user.id, user.name, 'user')}
                          aria-label={`Demote ${user.name} to Resident`}
                          title="Demote to Resident"
                          className="rounded-lg p-2 text-[var(--text-secondary)] transition-colors hover:bg-yellow-500/10 hover:text-yellow-400"
                        >
                          <ShieldOff className="h-4 w-4" />
                        </button>
                      )}
                      {user.id !== session?.user?.id && (
                        <button
                          onClick={() => handleRemoveUser(user.id, user.name)}
                          aria-label={`Remove ${user.name}`}
                          className="rounded-lg p-2 text-[var(--text-secondary)] transition-colors hover:bg-red-500/10 hover:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  {resetUserId === user.id && (
                    <div className="mt-2 mb-2 flex gap-2 px-3">
                      <input
                        type="password"
                        placeholder="New password"
                        value={resetPassword}
                        onChange={(e) => setResetPassword(e.target.value)}
                        className="text-body flex-1 rounded-lg border px-3 py-2 text-sm"
                        style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)' }}
                      />
                      <button
                        onClick={() => handleResetPassword(user.id, user.name)}
                        disabled={resettingPassword || !resetPassword}
                        className="rounded-lg bg-fairy-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-fairy-600 disabled:opacity-50"
                      >
                        {resettingPassword ? 'Saving...' : 'Reset'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <AccessLinksSection />
          </>
        )}
      </div>
    </Section>
  )
}

// ── Settings page ───────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [openCategory, setOpenCategory] = useState<CategoryId | null>('preferences')

  const handleToggle = (id: CategoryId) => {
    setOpenCategory(prev => (prev === id ? null : id))
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <Settings className="h-5 w-5 text-fairy-400" aria-hidden="true" />
        <h1 className="text-heading text-lg font-semibold">Settings</h1>
      </div>

      <div className="divide-y divide-[var(--border-secondary)]">
        <CategoryAccordion
          categoryId="account"
          label="Account"
          icon={Users}
          isOpen={openCategory === 'account'}
          onToggle={() => handleToggle('account')}
        >
          <AccountSection />
        </CategoryAccordion>

        <CategoryAccordion
          categoryId="preferences"
          label="Preferences"
          icon={SlidersHorizontal}
          isOpen={openCategory === 'preferences'}
          onToggle={() => handleToggle('preferences')}
        >
          <ThemeSection />
          <GeneralSection />
        </CategoryAccordion>

        <CategoryAccordion
          categoryId="music"
          label="Music"
          icon={Headphones}
          isOpen={openCategory === 'music'}
          onToggle={() => handleToggle('music')}
        >
          <MusicSection />
        </CategoryAccordion>

        <CategoryAccordion
          categoryId="modes-and-schedule"
          label="Modes and schedule"
          icon={CalendarClock}
          isOpen={openCategory === 'modes-and-schedule'}
          onToggle={() => handleToggle('modes-and-schedule')}
        >
          <ModesSection />
          <NightModeSection />
        </CategoryAccordion>

        <CategoryAccordion
          categoryId="public-transport"
          label="Public transport"
          icon={TrainFront}
          isOpen={openCategory === 'public-transport'}
          onToggle={() => handleToggle('public-transport')}
        >
          <SubwaySection />
          <IndicatorSection />
        </CategoryAccordion>

        <CategoryAccordion
          categoryId="weather"
          label="Weather"
          icon={CloudSun}
          isOpen={openCategory === 'weather'}
          onToggle={() => handleToggle('weather')}
        >
          <WeatherIndicatorSection />
        </CategoryAccordion>

        <CategoryAccordion
          categoryId="system"
          label="System"
          icon={HardDrive}
          isOpen={openCategory === 'system'}
          onToggle={() => handleToggle('system')}
        >
          <DevicesSection />
          <TimersSection />
          <DataManagementSection />
          <SystemSection />
        </CategoryAccordion>
      </div>
    </div>
  )
}
