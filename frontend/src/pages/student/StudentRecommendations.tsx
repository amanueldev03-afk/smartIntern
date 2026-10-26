import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Sparkles, SlidersHorizontal, RefreshCw, Compass, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAppSelector } from '@/store/hooks'
import { getRecommendations } from '@/services/recommendationApi'
import { getSavedInternships } from '@/services/internshipApi'
import type { Recommendation } from '@/types'
import RecommendationCard from '@/components/recommendations/RecommendationCard'
import RecommendationSkeleton from '@/components/recommendations/RecommendationSkeleton'
import RecommendationEmptyState from '@/components/recommendations/RecommendationEmptyState'
import RecommendationErrorState from '@/components/recommendations/RecommendationErrorState'
import { Button } from '@/components/ui/button'

export default function StudentRecommendations() {
  const navigate = useNavigate()
  const { isAuthenticated, role } = useAppSelector((state) => state.auth)
  
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savedInternships, setSavedInternships] = useState<Set<number>>(new Set())
  const [appliedInternships, setAppliedInternships] = useState<Set<number>>(new Set())
  const [minMatchThreshold, setMinMatchThreshold] = useState<number>(0)
  const [searchFilter, setSearchFilter] = useState('')
  const [pagination, setPagination] = useState({
    count: 0,
    next: null as string | null,
    previous: null as string | null,
  })

  const [isRefreshing, setIsRefreshing] = useState(false)

  const loadRecommendations = useCallback(async (refresh = false, page = 1) => {
    if (refresh) {
      setIsRefreshing(true)
    } else {
      setIsLoading(true)
    }
    setError(null)
    try {
      const [response, savedData] = await Promise.all([
        getRecommendations(refresh, page),
        getSavedInternships().catch(() => []),
      ])
      
      setRecommendations(response.results)
      if (Array.isArray(savedData)) {
        setSavedInternships(new Set(savedData.map((s) => s.internship)))
      }
      setPagination({
        count: response.count,
        next: response.next,
        previous: response.previous,
      })
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to load recommendations')
      console.error('Failed to load recommendations:', err)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  const currentPage = pagination.next
    ? Number(new URL(pagination.next, window.location.origin).searchParams.get('page') || 2) - 1
    : pagination.previous
      ? Number(new URL(pagination.previous, window.location.origin).searchParams.get('page') || 1) + 1
      : 1
  const totalPages = Math.max(1, Math.ceil(pagination.count / 10))

  useEffect(() => {
    if (!isAuthenticated || role?.toLowerCase() !== 'student') {
      navigate('/login')
      return
    }
    loadRecommendations()
  }, [isAuthenticated, role, navigate, loadRecommendations])

  const handleApply = useCallback((internshipId: number) => {
    setAppliedInternships((prev) => new Set([...prev, internshipId]))
  }, [])

  const handleSave = useCallback((internshipId: number) => {
    setSavedInternships((prev) => new Set([...prev, internshipId]))
  }, [])

  const handleUnsave = useCallback((internshipId: number) => {
    setSavedInternships((prev) => {
      const newSet = new Set(prev)
      newSet.delete(internshipId)
      return newSet
    })
  }, [])

  const filteredRecommendations = useMemo(() => {
    return recommendations
      .filter((rec) => rec.match_score >= minMatchThreshold)
      .filter((rec) => {
        if (!searchFilter.trim()) return true
        const query = searchFilter.toLowerCase()
        return (
          rec.internship.title.toLowerCase().includes(query) ||
          rec.internship.organization_name.toLowerCase().includes(query) ||
          rec.internship.required_skills?.some((s) => s.toLowerCase().includes(query))
        )
      })
      .sort((a, b) => b.match_score - a.match_score)
  }, [recommendations, minMatchThreshold, searchFilter])

  if (!isAuthenticated || role?.toLowerCase() !== 'student') {
    return null
  }

  if (isLoading) {
    return (
      <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8 animate-fade-in">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="card-gradient p-8 rounded-3xl animate-pulse space-y-3">
            <div className="h-8 w-64 bg-neutral-200 dark:bg-neutral-800 rounded-xl" />
            <div className="h-4 w-96 bg-neutral-100 dark:bg-neutral-800/60 rounded-lg" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <RecommendationSkeleton />
            <RecommendationSkeleton />
            <RecommendationSkeleton />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8 animate-fade-in">
        <div className="max-w-7xl mx-auto space-y-6">
          <RecommendationErrorState error={error} onRetry={loadRecommendations} />
        </div>
      </div>
    )
  }

  if (recommendations.length === 0) {
    return (
      <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8 animate-fade-in">
        <div className="max-w-7xl mx-auto">
          <RecommendationEmptyState onRefresh={loadRecommendations} />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8 animate-fade-in pb-16">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header with Title and Quick Filter Pills */}
        <div className="card-gradient p-6 sm:p-8 rounded-3xl shadow-soft">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
                <Link to="/dashboard" className="text-primary-600 dark:text-primary-400 hover:underline">
                  Dashboard
                </Link>
                <span>/</span>
                <span className="text-neutral-700 dark:text-neutral-300">AI Matches</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white">
                Autonomous <span className="gradient-text">AI Recommendations</span>
              </h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 font-medium">
                Personalized matches ranked by semantic skillset, experience, and profile preferences • {pagination.count} available
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => loadRecommendations(true, 1)}
                disabled={isRefreshing}
                className="rounded-2xl text-xs font-bold"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} /> {isRefreshing ? 'Re-scoring...' : 'Refresh'}
              </Button>
              <Link to="/internships">
                <Button size="sm" className="rounded-2xl shadow-glow text-xs font-bold">
                  <Compass className="w-3.5 h-3.5 mr-1.5" /> Browse All Roles
                </Button>
              </Link>
            </div>
          </div>

          {/* Interactive Filters Bar */}
          <div className="mt-6 pt-6 border-t border-neutral-200/80 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-neutral-400 mr-2 flex items-center gap-1">
                <SlidersHorizontal className="w-3.5 h-3.5" /> Fit Filter:
              </span>
              {[
                { label: 'All Matches', value: 0 },
                { label: 'High Fit (80%+)', value: 80 },
                { label: 'Moderate Fit (60%+)', value: 60 },
              ].map((item) => (
                <button
                  key={item.value}
                  onClick={() => setMinMatchThreshold(item.value)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    minMatchThreshold === item.value
                      ? 'bg-gradient-to-r from-primary-600 to-secondary-600 text-white shadow-glow'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="w-full sm:w-64">
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter by role or skill..."
                className="w-full px-3.5 py-1.5 text-xs rounded-xl bg-neutral-100/90 dark:bg-neutral-800/90 border border-neutral-200/80 dark:border-neutral-700 text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-primary-500"
              />
            </div>
          </div>
        </div>

        {pagination.count > 10 && (
          <div className="flex items-center justify-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              disabled={!pagination.previous || isLoading}
              onClick={() => loadRecommendations(false, Math.max(1, currentPage - 1))}
              className="rounded-2xl text-xs font-bold"
            >
              <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Previous
            </Button>
            <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={!pagination.next || isLoading}
              onClick={() => loadRecommendations(false, currentPage + 1)}
              className="rounded-2xl text-xs font-bold"
            >
              Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        )}

        {/* Recommendations Grid */}
        {filteredRecommendations.length === 0 ? (
          <div className="card-gradient rounded-3xl p-12 text-center shadow-card space-y-4">
            <Sparkles className="w-10 h-10 text-primary-500 mx-auto" />
            <h3 className="text-lg font-bold text-neutral-900 dark:text-white">No matches found with this filter</h3>
            <p className="text-xs text-neutral-500 max-w-sm mx-auto">
              Try adjusting your match threshold filter or reset the search query to see more recommended roles.
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setMinMatchThreshold(0)
                setSearchFilter('')
              }}
              className="rounded-2xl text-xs font-bold"
            >
              Reset Filters
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-slide-up">
            {filteredRecommendations.map((recommendation) => (
              <RecommendationCard
                key={recommendation.internship.id}
                recommendation={recommendation}
                isSaved={savedInternships.has(recommendation.internship.id)}
                isApplied={appliedInternships.has(recommendation.internship.id)}
                onApply={handleApply}
                onSave={handleSave}
                onUnsave={handleUnsave}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
