import { Link } from 'react-router-dom'
import { Sparkles, Compass, UserCheck, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface RecommendationEmptyStateProps {
  message?: string
  onRefresh?: () => void
  refreshText?: string
}

export default function RecommendationEmptyState({ 
  message, 
  onRefresh, 
  refreshText = 'Refresh Recommendations' 
}: RecommendationEmptyStateProps) {
  return (
    <div className="card-gradient p-10 sm:p-14 rounded-3xl shadow-card text-center flex flex-col items-center justify-center max-w-2xl mx-auto space-y-6 animate-scale-in">
      <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-primary-500/20 via-secondary-500/20 to-accent-500/20 text-primary-600 dark:text-primary-400 flex items-center justify-center shadow-glow">
        <Sparkles className="w-10 h-10" />
      </div>
      
      <div className="space-y-2">
        <h3 className="text-2xl font-black text-neutral-900 dark:text-white tracking-tight">
          Complete Your Profile to 100%
        </h3>
        <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400 max-w-md mx-auto leading-relaxed">
          {message || "AI Recommendations only activate once your student profile is 100% complete with your skills, education, preferences, and resume. Each recommendation is uniquely tailored to your individual profile."}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto pt-2">
        <Link to="/profile" className="w-full sm:w-auto">
          <Button className="w-full sm:w-auto rounded-2xl shadow-glow text-xs sm:text-sm font-bold">
            <UserCheck className="w-4 h-4 mr-2" /> Complete Profile (100%) <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        </Link>
        <Link to="/internships" className="w-full sm:w-auto">
          <Button variant="secondary" className="w-full sm:w-auto rounded-2xl text-xs sm:text-sm font-bold">
            <Compass className="w-4 h-4 mr-2" /> Browse All Internships
          </Button>
        </Link>
        {onRefresh && (
          <Button variant="ghost" onClick={onRefresh} className="rounded-2xl text-xs font-semibold">
            {refreshText}
          </Button>
        )}
      </div>
    </div>
  )
}
