import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAIMonitoringData, type AdminAIMonitoringData } from '@/services/adminApi'
import { ArrowLeft, Brain, Activity, TrendingUp, Calendar, AlertCircle } from 'lucide-react'

export default function AdminAIMonitoring() {
  const navigate = useNavigate()
  const [data, setData] = useState<AdminAIMonitoringData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isCurrent = true
    getAIMonitoringData()
      .then((d) => { if (isCurrent) setData(d) })
      .catch(() => { if (isCurrent) setError('Failed to load AI monitoring data.') })
      .finally(() => { if (isCurrent) setIsLoading(false) })
    return () => { isCurrent = false }
  }, [])

  const maxDaily = data ? Math.max(...data.recommendations_per_day.map((d) => d.count), 1) : 1
  const totalRecommendations = data
    ? data.score_distribution.reduce((sum, b) => sum + b.count, 0)
    : 0

  return (
    <main className="min-h-screen py-8 px-4 sm:px-6 lg:px-8 animate-fade-in pb-16">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="card-gradient p-6 sm:p-8 rounded-3xl shadow-soft flex flex-wrap items-center justify-between gap-4 animate-slide-up">
          <div>
            <button
              onClick={() => navigate('/admin/dashboard')}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-primary-600 dark:text-primary-400 hover:underline mb-2 transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-primary-600 to-secondary-500 text-white flex items-center justify-center shadow-glow">
                <Brain className="w-5 h-5" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white">
                AI <span className="gradient-text">Monitoring</span>
              </h1>
            </div>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 font-medium">
              Recommendation engine statistics, neural score distribution, and model latency
            </p>
          </div>
        </header>

        {error && (
          <div role="alert" className="rounded-2xl border border-error-200 dark:border-error-800 bg-error-50 dark:bg-error-950/40 p-4 text-error-700 dark:text-error-300 text-xs font-medium flex items-center gap-2 animate-scale-in">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {isLoading ? (
          <div className="card-gradient p-8 rounded-3xl animate-pulse space-y-4 text-center">
            <p className="text-xs font-semibold text-neutral-500">Loading AI monitoring data...</p>
            <div className="h-24 bg-neutral-100 dark:bg-neutral-800/60 rounded-2xl" />
          </div>
        ) : data && (
          <div className="space-y-6 animate-slide-up">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="card-gradient rounded-3xl p-6 shadow-soft hover:shadow-glow transition-all duration-300 transform hover:-translate-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Total Recommendations</p>
                  <div className="w-8 h-8 rounded-xl bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center">
                    <Activity className="w-4 h-4" />
                  </div>
                </div>
                <p className="mt-3 text-3xl font-black gradient-text">{totalRecommendations}</p>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Generated across all students</p>
              </div>

              <div className="card-gradient rounded-3xl p-6 shadow-soft hover:shadow-glow transition-all duration-300 transform hover:-translate-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Average Match Score</p>
                  <div className="w-8 h-8 rounded-xl bg-secondary-500/10 text-secondary-600 dark:text-secondary-400 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
                <p className="mt-3 text-3xl font-black gradient-text">
                  {data.average_match_score !== null ? `${data.average_match_score.toFixed(1)}%` : 'No data'}
                </p>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Cosine semantic similarity</p>
              </div>

              <div className="card-gradient rounded-3xl p-6 shadow-soft hover:shadow-glow transition-all duration-300 transform hover:-translate-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Days with Activity</p>
                  <div className="w-8 h-8 rounded-xl bg-accent-500/10 text-accent-600 dark:text-accent-400 flex items-center justify-center">
                    <Calendar className="w-4 h-4" />
                  </div>
                </div>
                <p className="mt-3 text-3xl font-black gradient-text">{data.recommendations_per_day.length}</p>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Historical telemetry log</p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="card-gradient rounded-3xl p-6 sm:p-8 shadow-card space-y-4">
                <h2 className="text-base font-bold text-neutral-900 dark:text-white">Recommendations Per Day</h2>
                {data.recommendations_per_day.length === 0 ? (
                  <p className="text-xs text-neutral-500 font-medium">No recommendation data available yet.</p>
                ) : (
                  <div className="space-y-3 pt-2">
                    {data.recommendations_per_day.map((day) => (
                      <div key={day.date} className="flex items-center gap-3">
                        <span className="w-24 text-xs font-semibold text-neutral-500 dark:text-neutral-400">{day.date}</span>
                        <div className="flex-1 h-4 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                          <div
                            className="h-4 rounded-full bg-gradient-to-r from-primary-500 to-secondary-500 shadow-glow transition-all duration-500"
                            style={{ width: `${(day.count / maxDaily) * 100}%` }}
                          />
                        </div>
                        <span className="w-8 text-right text-xs font-bold text-neutral-900 dark:text-white">{day.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="card-gradient rounded-3xl p-6 sm:p-8 shadow-card space-y-4">
                <h2 className="text-base font-bold text-neutral-900 dark:text-white">Score Distribution</h2>
                {totalRecommendations === 0 ? (
                  <p className="text-xs text-neutral-500 font-medium">No recommendation data available yet.</p>
                ) : (
                  <div className="space-y-4 pt-2">
                    {data.score_distribution.map((bucket) => {
                      const maxBucket = Math.max(...data.score_distribution.map((b) => b.count), 1)
                      return (
                        <div key={bucket.range} className="space-y-1.5">
                          <div className="flex justify-between text-xs font-bold">
                            <span className="text-neutral-700 dark:text-neutral-300">{bucket.range}</span>
                            <span className="text-neutral-500 dark:text-neutral-400">{bucket.count} matches</span>
                          </div>
                          <div className="h-3 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                            <div
                              className="h-3 rounded-full bg-gradient-to-r from-primary-500 to-secondary-500 shadow-glow transition-all duration-500"
                              style={{ width: `${(bucket.count / maxBucket) * 100}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
