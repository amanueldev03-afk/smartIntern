import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Sparkles, Bookmark, Compass, RefreshCw } from 'lucide-react'
import { useAppSelector } from '@/store/hooks'
import { searchInternships, getSavedInternships } from '@/services/internshipApi'
import type { InternshipFilters } from '@/types/filters'
import type { Internship } from '@/types'
import SearchFilterBar from '@/components/search/SearchFilterBar'
import RecommendationCard from '@/components/recommendations/RecommendationCard'
import RecommendationSkeleton from '@/components/recommendations/RecommendationSkeleton'
import RecommendationErrorState from '@/components/recommendations/RecommendationErrorState'
import { Button } from '@/components/ui/button'

export default function InternshipSearch() {
  const navigate = useNavigate()
  const { isAuthenticated, role } = useAppSelector((state) => state.auth)
  
  const [filters, setFilters] = useState<InternshipFilters>({})
  const [internships, setInternships] = useState<Internship[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [savedInternships, setSavedInternships] = useState<Set<number>>(new Set())
  const currentInternshipIds = useRef<number[]>([])
  const loadInternshipsRef = useRef<(excludeIds?: number[]) => Promise<void>>(() => Promise.resolve())

  useEffect(() => {
    if (!isAuthenticated || role?.toLowerCase() !== 'student') {
      navigate('/login')
      return
    }
  }, [isAuthenticated, role, navigate])

  const loadSavedState = useCallback(async () => {
    try {
      const savedData = await getSavedInternships()
      if (Array.isArray(savedData)) {
        setSavedInternships(new Set(savedData.map((s) => s.internship)))
      }
    } catch {
      // Non-critical, ignore
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated && role?.toLowerCase() === 'student') {
      loadSavedState()
    }
  }, [isAuthenticated, role, loadSavedState])

  const loadInternships = useCallback(async (excludeIds: number[] = []) => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await searchInternships({ ...filters, exclude_ids: excludeIds })
      setInternships(response.results)
      currentInternshipIds.current = response.results.map((internship) => internship.id)
      setTotalCount(response.count)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to load internships')
      console.error('Failed to load internships:', err)
    } finally {
      setIsLoading(false)
    }
  }, [filters])

  useEffect(() => {
    loadInternshipsRef.current = loadInternships
  }, [loadInternships])

  useEffect(() => {
    if (isAuthenticated && role?.toLowerCase() === 'student') {
      loadInternships()
    }
  }, [loadInternships, isAuthenticated, role])

  useEffect(() => {
    if (!isAuthenticated || role?.toLowerCase() !== 'student') return

    const refreshEveryDay = window.setInterval(() => {
      loadInternshipsRef.current(currentInternshipIds.current)
    }, 24 * 60 * 60 * 1000)

    return () => window.clearInterval(refreshEveryDay)
  }, [isAuthenticated, role])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await Promise.all([
        loadInternships(currentInternshipIds.current),
        loadSavedState(),
      ])
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleApply = async (internshipId: number) => {
    console.log('Applied to internship:', internshipId)
  }

  const handleSave = useCallback((internshipId: number) => {
    setSavedInternships((prev) => new Set([...prev, internshipId]))
  }, [])

  const handleUnsave = useCallback((internshipId: number) => {
    setSavedInternships((prev) => {
      const next = new Set(prev)
      next.delete(internshipId)
      return next
    })
  }, [])

  const internshipToRecommendation = (internship: Internship) => ({
    id: internship.id,
    match_score: 0,
    internship,
    explanation: null,
    score_breakdown: null,
  })

  return (
    <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8 animate-fade-in pb-16">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="card-gradient p-6 sm:p-8 rounded-3xl shadow-soft">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
                <Link to="/dashboard" className="text-primary-600 dark:text-primary-400 hover:underline">
                  Dashboard
                </Link>
                <span>/</span>
                <span className="text-neutral-700 dark:text-neutral-300">Discover</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white">
                Discover <span className="gradient-text">Internships</span>
              </h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 font-medium">
                Explore real-time tech opportunities • {totalCount} verified role{totalCount !== 1 ? 's' : ''} available
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing || isLoading}
                className="rounded-2xl text-xs font-bold"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} /> {isRefreshing ? 'Refreshing...' : 'Refresh'}
              </Button>
              <Link to="/recommendations">
                <Button size="sm" className="rounded-2xl shadow-glow text-xs font-bold">
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" /> View AI Matches
                </Button>
              </Link>
              <Link to="/saved">
                <Button size="sm" variant="secondary" className="rounded-2xl text-xs font-bold">
                  <Bookmark className="w-3.5 h-3.5 mr-1.5" /> Saved ({savedInternships.size})
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <SearchFilterBar
          filters={filters}
          onFiltersChange={setFilters}
          isLoading={isLoading}
        />

        {/* Results */}
        <div className="animate-slide-up">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <RecommendationSkeleton key={i} />
              ))}
            </div>
          ) : error ? (
            <RecommendationErrorState
              error={error}
              onRetry={loadInternships}
            />
          ) : internships.length === 0 ? (
            <div className="card-gradient rounded-3xl p-12 text-center shadow-card space-y-4">
              <Compass className="w-10 h-10 text-neutral-400 mx-auto" />
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white">No internships match your criteria</h3>
              <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                Try searching for a different keyword or resetting your filter criteria.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setFilters({})}
                className="rounded-2xl text-xs font-bold"
              >
                Reset Filters
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {internships.map((internship) => (
                <RecommendationCard
                  key={internship.id}
                  recommendation={internshipToRecommendation(internship)}
                  isSaved={savedInternships.has(internship.id)}
                  isApplied={false}
                  onApply={handleApply}
                  onSave={handleSave}
                  onUnsave={handleUnsave}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
