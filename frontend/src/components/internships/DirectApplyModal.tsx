import { useState } from 'react'
import { X, Send, CheckCircle2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { applyDirectlyToInternship } from '@/services/internshipApi'
import { useAppSelector } from '@/hooks/redux'

interface DirectApplyModalProps {
  internship: {
    id: number
    title: string
    organization_name: string
    location_text?: string
    city?: string
    country?: string
  }
  onClose: () => void
  onSuccess: () => void
}

export default function DirectApplyModal({
  internship,
  onClose,
  onSuccess,
}: DirectApplyModalProps) {
  const user = useAppSelector((state) => state.auth.user)
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)
    try {
      await applyDirectlyToInternship(internship.id, notes.trim())
      setIsSuccess(true)
      setTimeout(() => {
        onSuccess()
        onClose()
      }, 1500)
    } catch (err: any) {
      setError(
        err?.response?.data?.notes?.[0] ||
        err?.response?.data?.non_field_errors?.[0] ||
        err?.response?.data?.detail ||
        'Direct application failed. You may have already applied for this opportunity.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white dark:bg-neutral-900 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 border border-neutral-200 dark:border-neutral-800 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-primary-50 dark:bg-primary-950/60 text-primary-700 dark:text-primary-300 mb-2">
            <ShieldCheck className="w-3.5 h-3.5 text-primary-600" />
            Verified On-Platform Application
          </div>
          <h3 className="text-xl font-black text-neutral-900 dark:text-white tracking-tight">
            Apply to {internship.organization_name}
          </h3>
          <p className="text-xs text-neutral-500 mt-1">
            Position: <span className="font-semibold text-neutral-800 dark:text-neutral-200">{internship.title}</span>
          </p>
        </div>

        {isSuccess ? (
          <div className="py-8 text-center space-y-3">
            <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h4 className="text-lg font-bold text-neutral-900 dark:text-white">Application Submitted!</h4>
            <p className="text-xs text-neutral-500">
              Your verified university credentials and profile have been delivered to the employer.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Student Verified Profile Snapshot */}
            <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200/80 dark:border-neutral-700 space-y-2 text-xs">
              <span className="font-bold text-[11px] text-neutral-400 uppercase tracking-wider block">
                Transmitted Credentials
              </span>
              <div className="grid grid-cols-2 gap-2 text-neutral-700 dark:text-neutral-300">
                <div>
                  <span className="text-neutral-400 block text-[10px]">Applicant:</span>
                  <span className="font-semibold">{user?.first_name ? `${user.first_name} ${user.last_name || ''}` : user?.username}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px]">Email:</span>
                  <span className="font-semibold truncate block">{user?.email}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px]">University ID:</span>
                  <span className="font-semibold font-mono">{(user as any)?.student_id_number || 'Official Student'}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px]">Institutional Clearance:</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">Authenticated ✓</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">
                Application Message / Cover Note (Optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Introduce yourself, your key skills, and your availability for this internship..."
                rows={4}
                className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/40"
              />
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-error-50 dark:bg-error-950/40 text-error-700 dark:text-error-300 text-xs font-semibold border border-error-200 dark:border-error-800">
                {error}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 rounded-xl text-xs font-bold"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 rounded-xl shadow-glow text-xs font-bold flex items-center justify-center gap-1.5"
              >
                {isSubmitting ? (
                  'Submitting...'
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    Submit Application
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
