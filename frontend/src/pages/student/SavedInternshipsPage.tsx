import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bookmark, X, Sparkles, Compass } from 'lucide-react'
import { useAppSelector } from '@/store/hooks'
import { getSavedInternships } from '@/services/internshipApi'
import type { SavedInternship, Recommendation } from '@/types'
import RecommendationCard from '@/components/recommendations/RecommendationCard'
import RecommendationSkeleton from '@/components/recommendations/RecommendationSkeleton'
import RecommendationErrorState from '@/components/recommendations/RecommendationErrorState'
import { Button } from '@/components/ui/button'

export default function SavedInternshipsPage() {
  const navigate = useNavigate()
  const { isAuthenticated, role } = useAppSelector((state) => state.auth)

  const [savedList, setSavedList] = useState<SavedInternship[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const loadSavedInternships = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await getSavedInternships()
      setSavedList(data)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to load saved internships')
      console.error('Failed to load saved internships:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated || role?.toLowerCase() !== 'student') {
      navigate('/login')
      return
    }
    loadSavedInternships()
  }, [isAuthenticated, role, navigate, loadSavedInternships])

  const handleUnsave = (internshipId: number) => {
    setSavedList((prev) => prev.filter((item) => item.internship !== internshipId))
  }

  const savedItemToRecommendation = (item: SavedInternship): Recommendation => {
    if (item.internship_details) {
      return {
        internship: item.internship_details,
        match_score: 0,
        explanation: [],
      }
    }

    return {
      internship: {
        id: item.internship,
        title: item.internship_title,
        organization_name: item.organization_name,
        description: '',
        internship_type: 'remote',
        work_type: 'full_time',
        required_skills: [],
        application_url: item.application_url,
        source_url: item.source_url,
        is_verified: true,
        is_expired: false,
        status: 'active',
        created_at: item.created_at,
        updated_at: item.created_at,
      },
      match_score: 0,
      explanation: [],
    }
  }

  if (!isAuthenticated || role?.toLowerCase() !== 'student') {
    return null
  }

  return (
    <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8 animate-fade-in pb-16">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="card-gradient p-6 sm:p-8 rounded-3xl shadow-soft">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
                <Link to="/dashboard" className="text-primary-600 dark:text-primary-400 hover:underline">
                  Dashboard
                </Link>
                <span>/</span>
                <span className="text-neutral-700 dark:text-neutral-300">Saved</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white">
                Saved <span className="gradient-text">Internships</span>
              </h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 font-medium">
                Bookmarked opportunities ready for review and application • {savedList.length} saved
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Link to="/recommendations">
                <Button size="sm" className="rounded-2xl shadow-glow text-xs font-bold">
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" /> AI Recommendations
                </Button>
              </Link>
              <Link to="/internships">
                <Button size="sm" variant="secondary" className="rounded-2xl text-xs font-bold">
                  <Compass className="w-3.5 h-3.5 mr-1.5" /> Browse All
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {actionError && (
          <div className="bg-error-50 dark:bg-error-950/40 border border-error-200 dark:border-error-800 rounded-2xl p-4 flex items-center justify-between text-error-700 dark:text-error-300 text-xs font-medium">
            <span>{actionError}</span>
            <button onClick={() => setActionError(null)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-slide-up">
            <RecommendationSkeleton />
            <RecommendationSkeleton />
            <RecommendationSkeleton />
          </div>
        ) : error ? (
          <RecommendationErrorState error={error} onRetry={loadSavedInternships} />
        ) : savedList.length === 0 ? (
          <div className="card-gradient p-12 text-center max-w-lg mx-auto rounded-3xl shadow-card space-y-4">
            <div className="w-16 h-16 mx-auto bg-gradient-to-tr from-primary-600 to-secondary-500 rounded-2xl flex items-center justify-center text-white shadow-glow">
              <Bookmark className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-neutral-900 dark:text-white">No Saved Internships</h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto leading-relaxed">
              You haven't saved any internships yet. Explore AI-recommended roles or browse all active internships to bookmark opportunities for later.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
              <Link to="/recommendations">
                <Button size="sm" className="rounded-2xl shadow-glow text-xs font-bold">
                  Explore Matches
                </Button>
              </Link>
              <Link to="/internships">
                <Button size="sm" variant="secondary" className="rounded-2xl text-xs font-bold">
                  Search Listings
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-slide-up">
            {savedList.map((item) => (
              <RecommendationCard
                key={item.internship}
                recommendation={savedItemToRecommendation(item)}
                isSaved={true}
                onUnsave={handleUnsave}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
