import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { Link2, Trash2, Copy, Check, Plus } from 'lucide-react'
import { api, type AccessLink } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { PillSelect } from '@/components/ui/PillSelect'

// ── Duration options ─────────────────────────────────────────────────────────

const DURATION_OPTIONS = [
  { label: '1 hour', value: 3600 },
  { label: '24 hours', value: 86400 },
  { label: 'Weekend (48h)', value: 172800 },
  { label: '1 week', value: 604800 },
] as const

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatExpiry(link: AccessLink): string {
  if (link.status === 'revoked') return 'Revoked'
  if (link.status === 'consumed') return 'Used up'
  if (!link.expires_at) return ''
  const diff = new Date(link.expires_at).getTime() - Date.now()
  if (diff <= 0) return 'Expired'
  const totalMins = Math.floor(diff / 60000)
  const days = Math.floor(totalMins / 1440)
  const hours = Math.floor((totalMins % 1440) / 60)
  const mins = totalMins % 60
  if (days > 0) return `Expires in ${days}d ${hours}h`
  if (hours > 0) return `Expires in ${hours}h ${mins}m`
  return `Expires in ${mins}m`
}

function statusBadgeClass(status: AccessLink['status']): string {
  switch (status) {
    case 'active': return 'bg-green-500/10 text-green-400'
    case 'expired': return 'bg-yellow-500/10 text-yellow-400'
    case 'revoked': return 'bg-red-500/10 text-red-400'
    case 'consumed': return 'bg-[var(--bg-tertiary)] text-caption'
  }
}

function modeBadgeClass(mode: AccessLink['mode']): string {
  return mode === 'guest'
    ? 'bg-fairy-500/10 text-fairy-400'
    : 'bg-blue-500/10 text-blue-400'
}

// ── Active links list ─────────────────────────────────────────────────────────

function LinksList({
  links,
  onRevoke,
  revokingId,
}: {
  links: AccessLink[]
  onRevoke: (id: string, label: string) => void
  revokingId: string | null
}) {
  if (links.length === 0) {
    return (
      <p className="text-caption text-sm flex items-center gap-2">
        <Link2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        No access links
      </p>
    )
  }

  return (
    <ul className="space-y-2" aria-label="Active access links">
      {links.map((link) => (
        <li
          key={link.id}
          className="flex items-start justify-between gap-3 rounded-lg px-3 py-2.5 text-sm"
          style={{ backgroundColor: 'var(--bg-tertiary)' }}
        >
          <div className="min-w-0 flex-1">
            <p className="text-heading font-medium truncate">{link.label}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', modeBadgeClass(link.mode))}>
                {link.mode === 'guest' ? 'Guest' : 'Resident'}
              </span>
              <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', statusBadgeClass(link.status))}>
                {link.status.charAt(0).toUpperCase() + link.status.slice(1)}
              </span>
              <span className="text-caption text-xs">
                {link.use_count}/{link.max_uses === 0 ? '∞' : link.max_uses} devices
              </span>
            </div>
            {link.mode === 'guest' && link.status === 'active' && link.expires_at && (
              <p className="text-caption text-xs mt-1">{formatExpiry(link)}</p>
            )}
          </div>
          <button
            onClick={() => onRevoke(link.id, link.label)}
            disabled={revokingId === link.id}
            aria-label={`Delete access link for ${link.label}`}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-caption transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  )
}

// ── Created link result ───────────────────────────────────────────────────────

function CreatedLinkResult({ url, name, onDone }: { url: string; name: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API may not be available in all contexts
    }
  }

  return (
    <div
      className="mt-3 space-y-4 rounded-lg p-4"
      style={{ backgroundColor: 'var(--bg-tertiary)' }}
      aria-label="Access link created"
    >
      <div className="text-center">
        <p className="text-heading text-sm font-semibold">Ready for {name}!</p>
        <p className="text-caption text-xs mt-0.5">Share the link or scan the QR code</p>
      </div>

      <div className="flex justify-center">
        <div className="rounded-xl p-3 shadow-sm" style={{ backgroundColor: '#ffffff' }}>
          <QRCodeSVG
            value={url}
            size={180}
            aria-label={`QR code for ${name}'s access link`}
          />
        </div>
      </div>

      <div
        className="break-all rounded-lg border px-3 py-2 text-xs font-mono text-caption select-all"
        style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)' }}
        aria-label="Access link URL"
      >
        {url}
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleCopy}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm text-heading transition-colors hover:brightness-95 dark:hover:brightness-110"
          style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-input)' }}
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 text-green-400" aria-hidden="true" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" aria-hidden="true" />
              Copy link
            </>
          )}
        </button>
        <button
          onClick={onDone}
          className="rounded-lg bg-fairy-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-fairy-600"
        >
          Done
        </button>
      </div>
    </div>
  )
}

// ── Create link form ──────────────────────────────────────────────────────────

function CreateLinkForm({ onDismiss }: { onDismiss: () => void }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [mode, setMode] = useState<'guest' | 'resident'>('guest')
  const [label, setLabel] = useState('')
  const [durationSecs, setDurationSecs] = useState<number>(86400)
  const [maxUses, setMaxUses] = useState(1)
  const [createdUrl, setCreatedUrl] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: api.accessLinks.create,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['access-links'] })
      setCreatedUrl(data.url)
    },
    onError: () => {
      toast({ message: 'Failed to create access link', type: 'error' })
    },
  })

  function handleCreate() {
    if (!label.trim()) return
    createMutation.mutate({
      label: label.trim(),
      mode,
      ...(mode === 'guest' && {
        guestSessionDuration: durationSecs,
        maxUses,
      }),
    })
  }

  if (createdUrl) {
    return (
      <CreatedLinkResult
        url={createdUrl}
        name={label}
        onDone={() => {
          setCreatedUrl(null)
          onDismiss()
        }}
      />
    )
  }

  return (
    <div
      className="mt-3 space-y-3 rounded-lg p-3"
      style={{ backgroundColor: 'var(--bg-tertiary)' }}
    >
      {/* Mode toggle */}
      <div>
        <p className="text-heading mb-1.5 text-xs font-medium">Access type</p>
        <div
          className="surface flex rounded-lg border"
          style={{ borderColor: 'var(--border-secondary)' }}
          role="group"
          aria-label="Access type"
        >
          {(['guest', 'resident'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={cn(
                'flex-1 px-3 py-2 text-sm font-medium transition-colors rounded-lg',
                mode === m
                  ? 'bg-fairy-500 text-white'
                  : 'text-caption hover:text-[var(--text-primary)]',
              )}
            >
              {m === 'guest' ? 'Guest' : 'Resident'}
            </button>
          ))}
        </div>
      </div>

      {/* Name */}
      <div>
        <label htmlFor="access-link-label" className="text-heading mb-1 block text-xs font-medium">
          Name
        </label>
        <input
          id="access-link-label"
          type="text"
          required
          placeholder="First name is fine"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="text-body w-full rounded-lg border px-3 py-2 text-sm"
          style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)' }}
        />
      </div>

      {/* Guest-only extras */}
      {mode === 'guest' && (
        <>
          <div>
            <p className="text-heading mb-1.5 text-xs font-medium">Session duration</p>
            <PillSelect
              id="access-link-duration"
              options={DURATION_OPTIONS.map(opt => ({ value: String(opt.value), label: opt.label }))}
              value={String(durationSecs)}
              onChange={(v) => setDurationSecs(Number(v))}
              aria-label="Session duration"
            />
          </div>

          <div>
            <label htmlFor="access-link-max-uses" className="text-heading mb-1 block text-xs font-medium">
              Device limit
            </label>
            <p className="text-caption mb-1.5 text-xs">Number of devices that can use this link</p>
            <input
              id="access-link-max-uses"
              type="number"
              min={1}
              value={maxUses}
              onChange={(e) => setMaxUses(Math.max(1, Number(e.target.value)))}
              className="text-body w-full rounded-lg border px-3 py-2 text-sm"
              style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)' }}
            />
          </div>
        </>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleCreate}
          disabled={createMutation.isPending || !label.trim()}
          className="rounded-lg bg-fairy-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-fairy-600 disabled:opacity-50"
        >
          {createMutation.isPending ? 'Creating...' : 'Create link'}
        </button>
        <button
          onClick={onDismiss}
          className="rounded-lg px-3 py-2 text-sm text-caption transition-colors hover:bg-[var(--bg-secondary)]"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Main section ─────────────────────────────────────────────────────────────

export function AccessLinksSection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [showCreate, setShowCreate] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const { data: links = [], isLoading } = useQuery({
    queryKey: ['access-links'],
    queryFn: api.accessLinks.list,
  })

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.accessLinks.revoke(id),
    onMutate: (id) => setRevokingId(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['access-links'] })
      toast({ message: 'Access link revoked' })
    },
    onError: () => {
      toast({ message: 'Failed to revoke link', type: 'error' })
    },
    onSettled: () => setRevokingId(null),
  })

  async function handleRevoke(id: string, label: string) {
    if (!window.confirm(`Delete access link "${label}"?`)) return
    revokeMutation.mutate(id)
  }

  return (
    <div className="border-t pt-4" style={{ borderColor: 'var(--border-secondary)' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-fairy-400" aria-hidden="true" />
          <span className="text-heading text-sm font-medium">Access links</span>
        </div>
        {!showCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-fairy-400 transition-colors hover:bg-fairy-500/10"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create
          </button>
        )}
      </div>

      {showCreate && (
        <CreateLinkForm onDismiss={() => setShowCreate(false)} />
      )}

      <div className="mt-3">
        {isLoading ? (
          <div className="space-y-2" aria-label="Loading access links" role="status">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-lg"
                style={{ backgroundColor: 'var(--bg-tertiary)' }}
              />
            ))}
          </div>
        ) : (
          <LinksList
            links={links}
            onRevoke={handleRevoke}
            revokingId={revokingId}
          />
        )}
      </div>
    </div>
  )
}
