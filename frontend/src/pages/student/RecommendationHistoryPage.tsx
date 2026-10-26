import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import { getRecommendationHistory } from '@/services/recommendationApi'
import type { RecommendationHistoryEntry } from '@/types'
import { Button } from '@/components/ui/button'

export default function RecommendationHistoryPage() {
  const [entries, setEntries] = useState<RecommendationHistoryEntry[]>([])
  const [page, setPage] = useState(1)
  const [count, setCount] = useState(0)
  const [hasNext, setHasNext] = useState(false)
  const [hasPrevious, setHasPrevious] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    getRecommendationHistory(page)
      .then((response) => {
        if (!active) return
        setEntries(response.results)
        setCount(response.count)
        setHasNext(Boolean(response.next))
        setHasPrevious(Boolean(response.previous))
      })
      .catch((requestError: any) => {
        if (active) setError(requestError.response?.data?.detail || 'Unable to load recommendation history.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [page])

  return (
    <main className="min-h-screen py-8 px-4 sm:px-6 lg:px-8 animate-fade-in pb-16">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="card-gradient p-6 sm:p-8 rounded-3xl shadow-soft">
          <div className="flex items-center gap-2 text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
            <Link to="/recommendations" className="text-primary-600 dark:text-primary-400 hover:underline">
              AI Matches
            </Link>
            <span>/</span>
            <span className="text-neutral-700 dark:text-neutral-300">History Log</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white">
                Recommendation <span className="gradient-text">History</span>
              </h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 font-medium">
                {count} historical recommendation{count === 1 ? '' : 's'} recorded by the matching engine
              </p>
            </div>
            <Link to="/recommendations">
              <Button size="sm" className="rounded-2xl shadow-glow text-xs font-bold">
                <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Current Matches
              </Button>
            </Link>
          </div>
        </div>

        {loading && (
          <div className="card-gradient p-8 rounded-3xl animate-pulse space-y-3">
            <div className="h-6 w-48 bg-neutral-200 dark:bg-neutral-800 rounded" />
            <div className="h-4 w-96 bg-neutral-100 dark:bg-neutral-800/60 rounded" />
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-error-200 dark:border-error-800 bg-error-50 dark:bg-error-950/40 p-4 text-error-700 dark:text-error-300 text-xs font-medium">
            {error}
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="card-gradient rounded-3xl p-12 text-center shadow-card space-y-4">
            <div className="w-16 h-16 mx-auto bg-gradient-to-tr from-primary-600 to-secondary-500 rounded-2xl flex items-center justify-center text-white shadow-glow">
              <Sparkles className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-neutral-900 dark:text-white">No Recommendation History Logged</h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto leading-relaxed">
              As you interact with new recommendation batches, your historical match records will populate here.
            </p>
            <Link to="/recommendations">
              <Button size="sm" className="rounded-2xl shadow-glow text-xs font-bold">
                Go to AI Recommendations
              </Button>
            </Link>
          </div>
        )}

        {!loading && !error && entries.length > 0 && (
          <div className="space-y-4 animate-slide-up">
            {entries.map((entry) => {
              const internshipId = typeof entry.internship === 'number'
                ? entry.internship
                : (entry.internship as any)?.id || entry.id
              return (
                <Link
                  key={entry.id}
                  to={`/internships/${internshipId}`}
                  className="card-gradient block p-5 sm:p-6 rounded-3xl shadow-card hover:shadow-glow hover:border-primary-400/60 transition-all duration-300 group"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base font-bold text-neutral-900 dark:text-white group-hover:text-primary-600 transition-colors">
                          {entry.internship_title}
                        </h2>
                        {entry.overall_score !== undefined && entry.overall_score !== null && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary-500/10 text-primary-600 dark:text-primary-400">
                            {Math.round(entry.overall_score)}% Match
                          </span>
                        )}
                        {entry.status && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                            {entry.status}
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                        {entry.organization_name}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-medium text-neutral-400 shrink-0">
                      <Clock className="w-3.5 h-3.5" />
                      <time dateTime={entry.recommendation_date || entry.created_at}>
                        {new Date(entry.recommendation_date || entry.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        {(hasNext || hasPrevious) && (
          <div className="flex justify-center gap-3 pt-4">
            <Button
              variant="secondary"
              size="sm"
              disabled={!hasPrevious}
              onClick={() => setPage((current) => current - 1)}
              className="rounded-2xl text-xs font-bold"
            >
              <ChevronLeft className="w-4 h-4 mr-1" /> Previous
            </Button>
            <Button
              size="sm"
              disabled={!hasNext}
              onClick={() => setPage((current) => current + 1)}
              className="rounded-2xl shadow-glow text-xs font-bold"
            >
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}
      </div>
    </main>
  )
}