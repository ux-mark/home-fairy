import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { BackLink } from '@/components/ui/BackLink'
import { Crown, Sparkles, Wand2, Home, Moon, Sun, Star } from 'lucide-react'
import { api } from '@/lib/api'
import type { UserAction } from '@/lib/api'
import { formatRelativeTime } from '@/lib/scene-utils'

// ── Helpers ───────────────────────────────────────────────────────────────────

function actionVerb(action: string): string {
  switch (action) {
    case 'create': return 'Conjured'
    case 'update': return 'Enchanted'
    case 'delete': return 'Vanished'
    case 'activate': return 'Awakened'
    case 'deactivate': return 'Hushed'
    default: return action
  }
}

function countActions(actions: UserAction[], type: string): number {
  return actions.filter(a => a.action === type).length
}

function latestAction(actions: UserAction[]): UserAction | null {
  if (!actions.length) return null
  return actions.reduce((latest, a) =>
    new Date(a.created_at) > new Date(latest.created_at) ? a : latest
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="card rounded-xl border p-4 text-center"
      style={{ borderColor: 'var(--border-primary)' }}
    >
      <p
        className="text-2xl font-bold"
        style={{
          background: 'linear-gradient(135deg, var(--fairy-400, #34d399), #2dd4bf)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-caption">{label}</p>
    </div>
  )
}

function FunFactCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div
      className="card rounded-xl border p-4"
      style={{ borderColor: 'var(--border-primary)' }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="text-fairy-400">{icon}</span>
        <p className="text-sm font-semibold text-heading">{title}</p>
      </div>
      <p className="text-xs text-caption leading-relaxed">{description}</p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FairyQueenPage() {
  const { data: actions, isLoading, isError } = useQuery({
    queryKey: ['fairy-queen-actions'],
    queryFn: () => api.userActions.get({ user_id: 'fairy-queen', limit: 100 }),
  })

  const created = actions ? countActions(actions, 'create') : 0
  const activated = actions ? countActions(actions, 'activate') : 0
  const latest = actions ? latestAction(actions) : null
  const hasActions = Boolean(actions && actions.length > 0)

  return (
    <>
      {/* CSS-only sparkle animation */}
      <style>{`
        @keyframes fairy-shimmer {
          0%, 100% { opacity: 1; transform: scale(1) rotate(0deg); }
          25% { opacity: 0.7; transform: scale(1.08) rotate(6deg); }
          50% { opacity: 0.9; transform: scale(0.95) rotate(-4deg); }
          75% { opacity: 0.75; transform: scale(1.05) rotate(3deg); }
        }
        @keyframes fairy-pulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.15); }
        }
        @keyframes fairy-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        .fairy-crown { animation: fairy-shimmer 4s ease-in-out infinite; }
        .fairy-star-1 { animation: fairy-pulse 2.8s ease-in-out infinite; }
        .fairy-star-2 { animation: fairy-pulse 3.4s ease-in-out infinite 0.6s; }
        .fairy-star-3 { animation: fairy-pulse 2.2s ease-in-out infinite 1.1s; }
        .fairy-float { animation: fairy-float 5s ease-in-out infinite; }
      `}</style>

      <div className="mx-auto max-w-xl space-y-8 pb-12">
        <BackLink to="/scenes" label="Back" />

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <section className="text-center" aria-labelledby="fairy-queen-heading">
          {/* Icon cluster */}
          <div className="relative mb-6 inline-block fairy-float" aria-hidden="true">
            <Crown
              className="fairy-crown h-16 w-16 text-fairy-400"
              strokeWidth={1.5}
            />
            <Star
              className="fairy-star-1 absolute -top-1 -right-3 h-4 w-4 text-teal-300"
              fill="currentColor"
            />
            <Star
              className="fairy-star-2 absolute top-1 -left-3 h-3 w-3 text-fairy-300"
              fill="currentColor"
            />
            <Sparkles
              className="fairy-star-3 absolute -bottom-1 right-0 h-4 w-4 text-teal-400"
            />
          </div>

          <h1
            id="fairy-queen-heading"
            className="text-4xl font-bold tracking-tight"
            style={{
              background: 'linear-gradient(135deg, #34d399 0%, #2dd4bf 50%, #34d399 100%)',
              backgroundSize: '200% auto',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Fairy Queen
          </h1>

          <p className="mt-3 text-sm text-caption tracking-wide">
            Guardian of the Home, Keeper of Scenes
          </p>
        </section>

        {/* ── About ─────────────────────────────────────────────────────────── */}
        <section
          className="card rounded-xl border p-6 space-y-3"
          style={{ borderColor: 'var(--border-primary)' }}
          aria-labelledby="fairy-queen-about-heading"
        >
          <div className="flex items-center gap-2 mb-1">
            <Wand2 className="h-4 w-4 text-fairy-400" aria-hidden="true" />
            <h2 id="fairy-queen-about-heading" className="text-sm font-semibold text-heading">
              Who is the Fairy Queen?
            </h2>
          </div>
          <p className="text-sm text-body leading-relaxed">
            The Fairy Queen is the original spirit of this home. She set up every scene before
            anyone else arrived, and she still watches over the automations that run while you sleep.
          </p>
          <p className="text-sm text-body leading-relaxed">
            When motion stirs in a dark room, it's the Fairy Queen who decides which lights to wake.
            When night falls and the house settles, she's the one who dims the last lamp.
          </p>
          <p className="text-sm text-caption italic leading-relaxed">
            She doesn't have a login. She doesn't need one.
          </p>
        </section>

        {/* ── Stats ─────────────────────────────────────────────────────────── */}
        <section aria-labelledby="fairy-queen-stats-heading">
          <div className="flex items-center gap-2 mb-3">
            <Star className="h-4 w-4 text-fairy-400" aria-hidden="true" fill="currentColor" />
            <h2 id="fairy-queen-stats-heading" className="text-sm font-semibold text-heading">
              Her legacy
            </h2>
          </div>

          {isError ? (
            <div
              className="card rounded-xl border border-red-500/20 p-5 text-center"
            >
              <p className="text-sm text-red-400">
                Could not load activity. Try refreshing the page.
              </p>
            </div>
          ) : isLoading ? (
            <div
              className="grid grid-cols-3 gap-3"
              role="status"
              aria-label="Loading Fairy Queen stats"
            >
              {[1, 2, 3].map(i => (
                <div
                  key={i}
                  className="card rounded-xl border p-4 h-20 animate-pulse"
                  style={{ borderColor: 'var(--border-primary)' }}
                  aria-hidden="true"
                />
              ))}
            </div>
          ) : hasActions ? (
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Scenes conjured" value={String(created)} />
              <StatCard label="Awakenings" value={String(activated)} />
              <StatCard
                label="Last seen"
                value={latest ? formatRelativeTime(latest.created_at) : '—'}
              />
            </div>
          ) : (
            <div
              className="card rounded-xl border p-5 text-center"
              style={{ borderColor: 'var(--border-primary)' }}
            >
              <Sparkles className="mx-auto mb-2 h-5 w-5 text-fairy-400" aria-hidden="true" />
              <p className="text-sm text-caption italic">
                The Fairy Queen's story is just beginning...
              </p>
            </div>
          )}
        </section>

        {/* ── Recent activity ───────────────────────────────────────────────── */}
        {hasActions && actions && (
          <section aria-labelledby="fairy-queen-activity-heading">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-fairy-400" aria-hidden="true" />
              <h2 id="fairy-queen-activity-heading" className="text-sm font-semibold text-heading">
                Recent enchantments
              </h2>
            </div>

            <ol
              className="card rounded-xl border divide-y divide-[var(--border-primary)]"
              aria-label="Recent Fairy Queen activity"
            >
              {actions.slice(0, 10).map(action => (
                <li
                  key={action.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <span className="shrink-0 text-xs font-medium text-fairy-400">
                    {actionVerb(action.action)}
                  </span>
                  <Link
                    to={`/scenes/${encodeURIComponent(action.entity_id)}`}
                    className="min-w-0 flex-1 truncate text-sm text-heading hover:text-fairy-400 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 rounded"
                    title={action.entity_id}
                  >
                    {action.entity_id}
                  </Link>
                  <span className="shrink-0 text-xs text-caption">
                    {formatRelativeTime(action.created_at)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* ── Fun facts ─────────────────────────────────────────────────────── */}
        <section aria-labelledby="fairy-queen-facts-heading">
          <div className="flex items-center gap-2 mb-3">
            <Crown className="h-4 w-4 text-fairy-400" aria-hidden="true" />
            <h2 id="fairy-queen-facts-heading" className="text-sm font-semibold text-heading">
              What they say about her
            </h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <FunFactCard
              icon={<Moon className="h-4 w-4" aria-hidden="true" />}
              title="She never sleeps"
              description="Automations run 24/7, even when the whole house is dark."
            />
            <FunFactCard
              icon={<Home className="h-4 w-4" aria-hidden="true" />}
              title="She knows every room"
              description="Every room in the home was first configured by the Fairy Queen."
            />
            <FunFactCard
              icon={<Sun className="h-4 w-4" aria-hidden="true" />}
              title="She follows the sun"
              description="Mode transitions happen automatically based on the sun's position."
            />
          </div>
        </section>
      </div>
    </>
  )
}
