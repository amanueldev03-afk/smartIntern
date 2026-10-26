import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { MapPin, Briefcase, Calendar, Heart, ExternalLink, AlertCircle, X, Building2, CheckCircle2, ArrowLeft, Send } from 'lucide-react'
import { useAppSelector } from '@/store/hooks'
import { getInternshipDetail, getSavedInternships, saveInternship, unsaveInternship, trackApplication } from '@/services/internshipApi'
import { validateApplicationUrl, normalizeApplicationUrl, isPlaceholderUrl } from '@/utils/urlValidation'
import type { Internship } from '@/types'
import { Button } from '@/components/ui/button'
import DirectApplyModal from '@/components/internships/DirectApplyModal'

export default function InternshipDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAuthenticated, role } = useAppSelector((state) => state.auth)

  const [internship, setInternship] = useState<Internship | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSaved, setIsSaved] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [isApplied, setIsApplied] = useState(false)
  const [showDirectApply, setShowDirectApply] = useState(false)

  useEffect(() => {
    if (!isAuthenticated || role?.toLowerCase() !== 'student') {
      navigate('/login')
      return
    }

    const fetchInternship = async () => {
      setIsLoading(true)
      setError(null)
      setSaveError(null)
      setApplyError(null)

      try {
        const [data, savedData] = await Promise.all([
          getInternshipDetail(Number(id)),
          getSavedInternships().catch(() => []),
        ])
        setInternship(data)
        if (Array.isArray(savedData)) {
          setIsSaved(savedData.some((s) => s.internship === Number(id)))
        }
      } catch (err: any) {
        if (err.response?.status === 404) {
          setError('Internship not found')
        } else {
          setError(err.response?.data?.detail || err.message || 'Failed to load internship details')
        }
        console.error('Failed to load internship:', err)
      } finally {
        setIsLoading(false)
      }
    }

    if (id) {
      fetchInternship()
    }
  }, [id, isAuthenticated, role, navigate])

  const handleSave = async () => {
    if (!internship || isSaving) return

    setIsSaving(true)
    setSaveError(null)

    try {
      if (isSaved) {
        await unsaveInternship(internship.id)
        setIsSaved(false)
      } else {
        await saveInternship(internship.id)
        setIsSaved(true)
      }
    } catch (err: any) {
      setSaveError(isSaved ? 'Failed to unsave internship' : 'Failed to save internship')
      console.error('Save error:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleApply = () => {
    setApplyError(null)
    if (!internship) return

    const rawUrl = internship.application_url || internship.source_url
    if (!rawUrl || isPlaceholderUrl(rawUrl)) {
      setShowDirectApply(true)
      return
    }

    const validation = validateApplicationUrl(internship)
    if (!validation.isValid) {
      setShowDirectApply(true)
      return
    }

    const targetUrl = normalizeApplicationUrl(rawUrl) || rawUrl
    if (!targetUrl) {
      setShowDirectApply(true)
      return
    }

    // Fire-and-forget background tracking (non-blocking with short timeout)
    trackApplication(internship.id).catch((err) => {
      console.warn('Background application tracking failed (non-blocking):', err)
    })

    // Immediately redirect student to external employer portal
    window.open(targetUrl, '_blank', 'noopener,noreferrer')
    setIsApplied(true)
  }


  const formatDate = (dateString?: string) => {
    if (!dateString) return 'No deadline specified'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    })
  }

  const location = internship?.city && internship?.country
    ? `${internship.city}, ${internship.country}`
    : internship?.city || internship?.country || internship?.location_text || 'Location not specified'

  if (isLoading) {
    return (
      <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8 animate-fade-in">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="card-gradient p-10 rounded-3xl animate-pulse space-y-6">
            <div className="h-8 bg-neutral-200 dark:bg-neutral-800 rounded-2xl w-3/4"></div>
            <div className="h-6 bg-neutral-200 dark:bg-neutral-800 rounded-2xl w-1/2"></div>
            <div className="h-36 bg-neutral-100 dark:bg-neutral-800/60 rounded-2xl"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !internship) {
    return (
      <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8 animate-fade-in">
        <div className="max-w-xl mx-auto card-gradient p-10 rounded-3xl text-center space-y-6 shadow-card">
          <AlertCircle className="w-16 h-16 text-error-500 mx-auto" />
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">
            {error === 'Internship not found' ? 'Internship Not Found' : 'Error Loading Internship'}
          </h2>
          <p className="text-sm text-neutral-500">
            {error === 'Internship not found'
              ? 'The opportunity may have expired or been archived.'
              : 'An error occurred while loading opportunity details.'}
          </p>
          <Link to="/recommendations">
            <Button className="rounded-2xl shadow-glow">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Recommendations
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  const hasApplicationUrl = internship.application_url && internship.application_url.trim() !== ''

  return (
    <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8 animate-fade-in pb-16">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 text-xs font-bold text-neutral-400 uppercase tracking-wider">
          <Link to="/internships" className="text-primary-600 dark:text-primary-400 hover:underline">
            Internships
          </Link>
          <span>/</span>
          <span className="text-neutral-700 dark:text-neutral-300 truncate max-w-xs">{internship.title}</span>
        </div>

        {/* Main Card */}
        <div className="card-gradient rounded-3xl overflow-hidden shadow-card border border-neutral-200/80 dark:border-neutral-800">
          {/* Header Banner */}
          <div className="p-6 sm:p-10 border-b border-neutral-200/80 dark:border-neutral-800 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
              <div className="flex-1 space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-primary-500/10 text-primary-600 dark:text-primary-400 text-xs font-bold">
                  <Building2 className="w-3.5 h-3.5" />
                  {internship.organization_name}
                </div>
                <h1 className="text-2xl sm:text-4xl font-black text-neutral-900 dark:text-white tracking-tight leading-tight">
                  {internship.title}
                </h1>
              </div>

              {/* Save Button */}
              <button
                onClick={handleSave}
                disabled={isSaving}
                className={`px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm transition-all duration-300 flex items-center gap-2 ${
                  isSaved
                    ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800 shadow-soft'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 border border-neutral-200/80 dark:border-neutral-700'
                } disabled:opacity-50`}
                aria-label={isSaved ? 'Unsave' : 'Save'}
              >
                <Heart className={`w-4 h-4 ${isSaved ? 'fill-current text-rose-500' : ''}`} />
                <span>{isSaved ? 'Saved' : 'Save'}</span>
              </button>
            </div>

            {/* Meta Tags */}
            <div className="flex flex-wrap gap-3 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-100/90 dark:bg-neutral-800/90">
                <MapPin className="w-3.5 h-3.5 text-neutral-400" />
                {location}
              </span>
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-100/90 dark:bg-neutral-800/90">
                <Briefcase className="w-3.5 h-3.5 text-neutral-400" />
                {internship.internship_type ? internship.internship_type.charAt(0).toUpperCase() + internship.internship_type.slice(1) : 'Internship'}
              </span>
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-100/90 dark:bg-neutral-800/90">
                <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                Deadline: {formatDate(internship.application_deadline)}
              </span>
            </div>
          </div>

          {/* Description Section */}
          <div className="p-6 sm:p-10 border-b border-neutral-200/80 dark:border-neutral-800 space-y-4">
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white">Role Description & Responsibilities</h2>
            <div className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-line leading-relaxed">
              {internship.description}
            </div>
          </div>

          {/* Required Skills Section */}
          {internship.required_skills && internship.required_skills.length > 0 && (
            <div className="p-6 sm:p-10 border-b border-neutral-200/80 dark:border-neutral-800 space-y-4">
              <h2 className="text-lg font-bold text-neutral-900 dark:text-white">Required Skills & Technologies</h2>
              <div className="flex flex-wrap gap-2">
                {internship.required_skills.map((skill, index) => (
                  <span
                    key={index}
                    className="px-3 py-1.5 rounded-xl bg-primary-50 dark:bg-primary-950/50 text-primary-700 dark:text-primary-300 border border-primary-200/70 dark:border-primary-800/80 text-xs font-bold"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Save Error Alert */}
          {saveError && (
            <div className="p-4 bg-error-50 dark:bg-error-950/50 text-error-700 dark:text-error-300 text-xs font-medium border-t border-error-200 dark:border-error-800 flex items-center justify-between">
              <span>{saveError}</span>
              <button onClick={() => setSaveError(null)}>
                <X className="w-4 h-4 text-error-500" />
              </button>
            </div>
          )}

          {/* Apply Error Alert */}
          {applyError && (
            <div className="p-4 bg-error-50 dark:bg-error-950/50 text-error-700 dark:text-error-300 text-xs font-medium border-t border-error-200 dark:border-error-800 flex items-center justify-between">
              <span>{applyError}</span>
              <button onClick={() => setApplyError(null)}>
                <X className="w-4 h-4 text-error-500" />
              </button>
            </div>
          )}

          {/* Bottom Action Footer */}
          <div className="p-6 sm:p-10 bg-neutral-50/70 dark:bg-neutral-900/50 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <Button
                onClick={() => setShowDirectApply(true)}
                disabled={isApplied}
                size="lg"
                className="w-full sm:w-auto rounded-2xl shadow-glow text-sm font-bold bg-primary-600 hover:bg-primary-700"
              >
                <Send className="w-4 h-4 mr-2" />
                {isApplied ? 'Application Submitted ✓' : 'Apply Directly On Platform'}
              </Button>

              {hasApplicationUrl && !isPlaceholderUrl(internship.application_url) && (
                <Button
                  onClick={handleApply}
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto rounded-2xl text-sm font-bold"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Apply on External Portal
                </Button>
              )}

              {isApplied && (
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Application tracked
                </span>
              )}
            </div>

            <Link to="/internships">
              <Button variant="ghost" size="sm" className="rounded-xl text-xs font-bold">
                <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to Search
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {showDirectApply && internship && (
        <DirectApplyModal
          internship={internship}
          onClose={() => setShowDirectApply(false)}
          onSuccess={() => setIsApplied(true)}
        />
      )}
    </div>
  )
}
