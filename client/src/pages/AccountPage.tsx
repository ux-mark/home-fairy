import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, KeyRound, LogOut } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { useToast } from '@/hooks/useToast'
import { Section } from '@/components/settings/Section'

export default function AccountPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data: session } = authClient.useSession()

  const [showChangePassword, setShowChangePassword] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  async function handleSignOut() {
    await authClient.signOut()
    navigate('/login', { replace: true })
  }

  async function handleChangePassword() {
    if (!currentPassword || !newPassword) return
    if (newPassword !== confirmPassword) {
      toast({ message: 'Passwords do not match', type: 'error' })
      return
    }
    if (newPassword.length < 8) {
      toast({ message: 'Password must be at least 8 characters', type: 'error' })
      return
    }
    setChangingPassword(true)
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
      })
      if (result.error) {
        toast({ message: result.error.message || 'Failed to change password', type: 'error' })
      } else {
        toast({ message: 'Password changed' })
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setShowChangePassword(false)
      }
    } catch {
      toast({ message: 'Failed to change password', type: 'error' })
    } finally {
      setChangingPassword(false)
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <User className="h-5 w-5 text-fairy-400" aria-hidden="true" />
        <h1 className="text-heading text-lg font-semibold">Account</h1>
      </div>

      <Section title="Your account">
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
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Sign out
              </button>
            </div>
          )}

          <div className="border-t pt-4" style={{ borderColor: 'var(--border-secondary)' }}>
            <button
              onClick={() => setShowChangePassword(!showChangePassword)}
              className="flex items-center gap-2 text-sm text-heading transition-colors hover:text-fairy-400"
            >
              <KeyRound className="h-4 w-4 text-fairy-400" aria-hidden="true" />
              <span className="font-medium">Change password</span>
            </button>

            {showChangePassword && (
              <div
                className="mt-3 space-y-3 rounded-lg p-3"
                style={{ backgroundColor: 'var(--bg-tertiary)' }}
              >
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
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
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
                    disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
                    className="rounded-lg bg-fairy-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-fairy-600 disabled:opacity-50"
                  >
                    {changingPassword ? 'Saving...' : 'Update password'}
                  </button>
                  <button
                    onClick={() => {
                      setShowChangePassword(false)
                      setCurrentPassword('')
                      setNewPassword('')
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
        </div>
      </Section>
    </div>
  )
}
