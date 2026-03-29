import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { BarChart3 } from 'lucide-react'
import { api } from '@/lib/api'
import AttentionBar from '@/components/dashboard/AttentionBar'
import EnergyCard from '@/components/dashboard/EnergyCard'
import BatteryCard from '@/components/dashboard/BatteryCard'
import EnvironmentCard from '@/components/dashboard/EnvironmentCard'
import SunModeCard from '@/components/dashboard/SunModeCard'
import ActivityCard from '@/components/dashboard/ActivityCard'
import { SkeletonSummaryStrip, SkeletonCard } from '@/components/ui/Skeleton'

function DashboardSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading dashboard">
      <SkeletonSummaryStrip count={4} />
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  )
}

function DashboardError({ message }: { message: string }) {
  const queryClient = useQueryClient()
  return (
    <div className="card rounded-xl border p-5" role="alert">
      <p className="text-sm text-red-400">
        Could not load dashboard data. {message}
      </p>
      <button
        onClick={() => queryClient.invalidateQueries({ queryKey: ['dashboard'] })}
        className="mt-3 rounded-lg bg-fairy-500/15 px-4 py-2 text-sm font-medium text-fairy-400 transition-colors hover:bg-fairy-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
      >
        Retry
      </button>
    </div>
  )
}

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: api.dashboard.getSummary,
    refetchInterval: 30_000,
  })

  // ── Progressive disclosure: per-section open/closed state ─────────────────
  // Auto-open defaults derived from data (recomputed when data changes)
  const autoDefaults = useMemo(() => {
    if (!data) return {} as Record<string, boolean>
    const insights = data.insights
    return {
      attention: insights?.attention.some(i => i.severity === 'critical') ?? false,
      energy: (insights?.energy?.deviceAnomalies?.length ?? 0) > 0,
      environment: (insights?.temperature?.roomOutliers?.length ?? 0) > 0,
      battery:
        (insights?.battery?.fleetHealth.critical ?? 0) > 0 ||
        (insights?.battery?.fleetHealth.low ?? 0) > 0,
      activity: false,
      sun: false,
    }
  }, [data])

  // User overrides — only populated when the user explicitly toggles a section
  const [userOverrides, setUserOverrides] = useState<Record<string, boolean>>({})

  // Merged state: user overrides take precedence over auto-open defaults
  const openSections = useMemo(
    () => ({ ...autoDefaults, ...userOverrides }),
    [autoDefaults, userOverrides],
  )

  const toggle = (key: string) =>
    setUserOverrides(prev => ({ ...prev, [key]: !openSections[key] }))

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-fairy-400" aria-hidden="true" />
        <h1 className="text-heading text-lg font-semibold">Insights</h1>
      </div>

      {isLoading && <DashboardSkeleton />}

      {error && (
        <DashboardError
          message={error instanceof Error ? error.message : 'Please try again.'}
        />
      )}

      {data && (
        <div className="space-y-4">
          {/* Attention bar — only renders when there are items */}
          {data.insights?.attention && data.insights.attention.length > 0 && (
            <AttentionBar
              items={data.insights.attention}
              open={openSections.attention ?? false}
              onToggle={() => toggle('attention')}
            />
          )}

          {/* Detail cards — main column (2/3) + side column (1/3) on desktop */}
          <div className="grid gap-4 md:grid-cols-3">
            {/* Main column */}
            <div className="space-y-4 md:col-span-2">
              <EnergyCard
                power={data.power}
                insights={data.insights?.energy ?? null}
                currencySymbol={data.currencySymbol}
                open={openSections.energy ?? false}
                onToggle={() => toggle('energy')}
              />
              <EnvironmentCard
                weather={data.weather}
                rooms={data.rooms}
                tempInsights={data.insights?.temperature ?? null}
                luxInsights={data.insights?.lux ?? null}
                open={openSections.environment ?? false}
                onToggle={() => toggle('environment')}
              />
              {data.insights?.activity && (
                <ActivityCard
                  activity={data.insights.activity}
                  open={openSections.activity ?? false}
                  onToggle={() => toggle('activity')}
                />
              )}
            </div>
            {/* Side column */}
            <div className="space-y-4">
              <BatteryCard
                battery={data.battery}
                insights={data.insights?.battery ?? null}
                open={openSections.battery ?? false}
                onToggle={() => toggle('battery')}
              />
              <SunModeCard
                mode={data.mode}
                sunSchedule={data.sunSchedule}
                sunPhase={data.sunPhase}
                sunTimes={data.sunTimes}
                open={openSections.sun ?? false}
                onToggle={() => toggle('sun')}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
