import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Briefcase, Calendar, Sparkles, Heart, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'
import type { Recommendation } from '@/types'
import { saveInternship, unsaveInternship, trackApplication } from '@/services/internshipApi'
import { validateApplicationUrl, normalizeApplicationUrl, isPlaceholderUrl } from '@/utils/urlValidation'
import DirectApplyModal from '@/components/internships/DirectApplyModal'

interface RecommendationCardProps {
  recommendation: Recommendation
  isSaved?: boolean
  isApplied?: boolean
  onApply?: (internshipId: number) => void
  onSave?: (internshipId: number) => void
  onUnsave?: (internshipId: number) => void
}

export default function RecommendationCard({
  recommendation,
  isSaved = false,
  isApplied = false,
  onApply,
  onSave,
  onUnsave,
}: RecommendationCardProps) {
  const { internship, match_score, explanation } = recommendation
  const [isSaving, setIsSaving] = useState(false)
  const [localSaved, setLocalSaved] = useState(isSaved)
  const [localApplied, setLocalApplied] = useState(isApplied)
  const [error, setError] = useState<string | null>(null)
  const [isExplanationExpanded, setIsExplanationExpanded] = useState(true)
  const [showDirectApply, setShowDirectApply] = useState(false)

  useEffect(() => {
    setLocalSaved(isSaved)
  }, [isSaved])

  useEffect(() => {
    setLocalApplied(isApplied)
  }, [isApplied])

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'No deadline'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const handleSave = async () => {
    if (isSaving) return
    setIsSaving(true)
    setError(null)

    try {
      if (localSaved) {
        await unsaveInternship(internship.id)
        setLocalSaved(false)
        onUnsave?.(internship.id)
      } else {
        await saveInternship(internship.id)
        setLocalSaved(true)
        onSave?.(internship.id)
      }
    } catch (err: any) {
      setError(localSaved ? 'Failed to unsave internship' : 'Failed to save internship')
      console.error('Save error:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleApply = () => {
    if (localApplied) return
    setError(null)

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

    // Redirect student to external employer portal
    window.open(targetUrl, '_blank', 'noopener,noreferrer')
    setLocalApplied(true)
    onApply?.(internship.id)
  }


  const getMatchScoreStyles = (score: number) => {
    if (score >= 80) return 'text-emerald-700 bg-emerald-50/90 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800'
    if (score >= 60) return 'text-primary-700 bg-primary-50/90 dark:bg-primary-950/40 dark:text-primary-300 border-primary-200/80 dark:border-primary-800'
    if (score >= 40) return 'text-amber-700 bg-amber-50/90 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200/80 dark:border-amber-800'
    return 'text-neutral-700 bg-neutral-50/90 dark:bg-neutral-800 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700'
  }

  const location = internship.city && internship.country
    ? `${internship.city}, ${internship.country}`
    : internship.city || internship.country || internship.location_text || 'Location not specified'

  return (
    <div className="card-gradient rounded-3xl p-6 hover:shadow-glow transition-all duration-300 group flex flex-col justify-between border border-neutral-200/80 dark:border-neutral-800">
      <div>
        {/* Header: Company, Title, Match Score */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1 min-w-0">
            <Link
              to={`/internships/${internship.id}`}
              className="block group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors"
            >
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-1 line-clamp-2 leading-snug">
                {internship.title}
              </h3>
            </Link>
            <p className="text-sm font-semibold text-neutral-500 dark:text-neutral-400 truncate">
              {internship.organization_name}
            </p>
          </div>
          <div className={`shrink-0 px-3 py-1.5 rounded-2xl text-xs font-black border ${getMatchScoreStyles(match_score)} flex items-center gap-1.5 shadow-soft`}>
            <Sparkles className="w-3.5 h-3.5" />
            <span>{Math.round(match_score)}% Match</span>
          </div>
        </div>

        {/* Location, Work Mode, Deadline */}
        <div className="flex flex-wrap gap-3 mb-4 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-neutral-100/80 dark:bg-neutral-800/80">
            <MapPin className="w-3.5 h-3.5 text-neutral-400" />
            <span className="truncate max-w-[140px]">{location}</span>
          </span>
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-neutral-100/80 dark:bg-neutral-800/80">
            <Briefcase className="w-3.5 h-3.5 text-neutral-400" />
            <span>{internship.internship_type ? internship.internship_type.charAt(0).toUpperCase() + internship.internship_type.slice(1) : 'Internship'}</span>
          </span>
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-neutral-100/80 dark:bg-neutral-800/80">
            <Calendar className="w-3.5 h-3.5 text-neutral-400" />
            <span>Deadline: {formatDate(internship.application_deadline)}</span>
          </span>
        </div>

        {/* Required Skills */}
        {internship.required_skills && internship.required_skills.length > 0 && (
          <div className="mb-4">
            <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-2">
              Key Requirements
            </p>
            <div className="flex flex-wrap gap-1.5">
              {internship.required_skills.slice(0, 5).map((skill, index) => (
                <span
                  key={index}
                  className="px-2.5 py-1 bg-primary-50/80 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 border border-primary-200/60 dark:border-primary-800 text-xs rounded-xl font-medium"
                >
                  {skill}
                </span>
              ))}
              {internship.required_skills.length > 5 && (
                <span className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 text-neutral-500 text-xs rounded-xl font-medium">
                  +{internship.required_skills.length - 5}
                </span>
              )}
            </div>
          </div>
        )}

        {/* AI Explanation Box */}
        {explanation && explanation.length > 0 && (
          <div className="mb-4 p-3.5 bg-gradient-to-r from-primary-50/80 to-secondary-50/60 dark:from-primary-950/40 dark:to-neutral-900/60 rounded-2xl border border-primary-200/70 dark:border-primary-800/70">
            <div 
              onClick={() => setIsExplanationExpanded(!isExplanationExpanded)}
              className="flex items-center justify-between cursor-pointer"
            >
              <p className="text-xs font-bold text-primary-800 dark:text-primary-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" />
                Why this matches you
              </p>
              {isExplanationExpanded ? (
                <ChevronUp className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" />
              )}
            </div>
            {isExplanationExpanded && (
              <p className="text-xs text-neutral-700 dark:text-neutral-300 mt-2 leading-relaxed">
                {explanation.join(' ')}
              </p>
            )}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-error-50 dark:bg-error-950/40 text-error-700 dark:text-error-300 text-xs rounded-2xl border border-error-200 dark:border-error-800">
            {error}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-4 border-t border-neutral-200/70 dark:border-neutral-800 mt-2">
        <button
          onClick={handleApply}
          disabled={localApplied}
          aria-label={localApplied ? 'Applied' : 'Apply'}
          className={`flex-1 px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm transition-all duration-300 flex items-center justify-center gap-2 ${
            localApplied
              ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-primary-600 to-secondary-600 text-white hover:opacity-95 shadow-glow hover:scale-[1.02] active:scale-100 disabled:opacity-50'
          }`}
        >
          {localApplied ? (
            'Applied'
          ) : (
            <>
              Apply
              <ExternalLink className="w-4 h-4 ml-0.5" />
            </>
          )}
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className={`px-3.5 py-2.5 rounded-2xl font-bold text-xs sm:text-sm transition-all duration-300 flex items-center gap-1.5 ${
            localSaved
              ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800 shadow-soft'
              : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-primary-50 dark:hover:bg-neutral-700 border border-neutral-200/80 dark:border-neutral-700'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          aria-label={localSaved ? 'Unsave' : 'Save'}
        >
          {isSaving ? (
            '...'
          ) : (
            <>
              <Heart className={`w-4 h-4 ${localSaved ? 'fill-current text-rose-500' : ''}`} />
              <span>{localSaved ? 'Saved' : 'Save'}</span>
            </>
          )}
        </button>
      </div>

      {showDirectApply && (
        <DirectApplyModal
          internship={internship}
          onClose={() => setShowDirectApply(false)}
          onSuccess={() => {
            setLocalApplied(true)
            onApply?.(internship.id)
          }}
        />
      )}
    </div>
  )
}
