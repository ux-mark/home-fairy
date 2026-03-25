import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import AttentionBar from '@/components/dashboard/AttentionBar'
import HomeSummaryStrip from '@/components/dashboard/HomeSummaryStrip'
import EnergyCard from '@/components/dashboard/EnergyCard'
import BatteryCard from '@/components/dashboard/BatteryCard'
import EnvironmentCard from '@/components/dashboard/EnvironmentCard'
import SunModeCard from '@/components/dashboard/SunModeCard'
import ActivityCard from '@/components/dashboard/ActivityCard'

function DashboardSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading dashboard">
      {/* Summary strip skeleton */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card animate-pulse rounded-xl border p-4">
            <div className="mb-2 h-3 w-16 rounded bg-[var(--bg-tertiary)]" />
            <div className="h-6 w-20 rounded bg-[var(--bg-tertiary)]" />
          </div>
        ))}
      </div>
      {/* Card skeletons */}
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="card animate-pulse rounded-xl border p-5">
          <div className="mb-4 h-5 w-32 rounded bg-[var(--bg-tertiary)]" />
          <div className="space-y-3">
            <div className="h-4 w-full rounded bg-[var(--bg-tertiary)]" />
            <div className="h-4 w-3/4 rounded bg-[var(--bg-tertiary)]" />
            <div className="h-4 w-1/2 rounded bg-[var(--bg-tertiary)]" />
          </div>
        </div>
      ))}
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

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-heading text-sm font-semibold">Insights</h2>
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
            <AttentionBar items={data.insights.attention} />
          )}

          {/* Home summary strip — 4 stat pills */}
          {data.insights && (
            <HomeSummaryStrip insights={data.insights} />
          )}

          {/* Detail cards — main column (2/3) + side column (1/3) on desktop */}
          <div className="grid gap-4 md:grid-cols-3">
            {/* Main column */}
            <div className="space-y-4 md:col-span-2">
              <EnergyCard
                power={data.power}
                insights={data.insights?.energy ?? null}
                currencySymbol={data.currencySymbol}
              />
              <EnvironmentCard
                weather={data.weather}
                rooms={data.rooms}
                tempInsights={data.insights?.temperature ?? null}
                luxInsights={data.insights?.lux ?? null}
              />
              {data.insights?.activity && (
                <ActivityCard activity={data.insights.activity} />
              )}
            </div>
            {/* Side column */}
            <div className="space-y-4">
              <BatteryCard
                battery={data.battery}
                insights={data.insights?.battery ?? null}
              />
              <SunModeCard
                mode={data.mode}
                sunSchedule={data.sunSchedule}
                sunPhase={data.sunPhase}
                sunTimes={data.sunTimes}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
