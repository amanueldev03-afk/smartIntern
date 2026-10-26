import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Utensils, CreditCard, FileText, CheckCircle2, X } from 'lucide-react'
import { useAppSelector } from '@/hooks/redux'
import MealCardTracker from './MealCardTracker'
import ForwardedLettersView from './ForwardedLettersView'

export default function UnionDashboard() {
  const user = useAppSelector((state) => state.auth.user)
  const [showUnionVerifiedAlert, setShowUnionVerifiedAlert] = useState(true)
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = (searchParams.get('tab') as 'cards' | 'letters') || 'cards'
  const [activeTab, setActiveTab] = useState<'cards' | 'letters'>(initialTab)

  const handleTabChange = (tab: 'cards' | 'letters') => {
    setActiveTab(tab)
    setSearchParams({ tab })
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-[#0c0c0e] py-8 px-4 sm:px-6 lg:px-8 animate-fade-in">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 mb-2">
              <Utensils className="w-3.5 h-3.5" />
              Student Union Campus Dining Portal
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white tracking-tight">
              {activeTab === 'cards' ? 'Cafeteria Meal Card Tracker & Activation' : 'Official Forwarded Cafeteria Letters'}
            </h1>
            <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-1">
              {activeTab === 'cards'
                ? 'Activate electronic cafeteria meal cards for Track 1 in-house interns cleared with Dean cryptographic digital signature.'
                : 'Review cryptographically signed Dean clearance letters forwarded directly by students for dining access.'}
            </p>
          </div>

          {/* Tab Navigation */}
          <div className="flex items-center bg-white dark:bg-neutral-800 p-1.5 rounded-2xl border border-neutral-200 dark:border-neutral-700 shadow-xs self-start sm:self-auto">
            <button
              onClick={() => handleTabChange('cards')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'cards'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700/50'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              Meal Cards & Queue
            </button>
            <button
              onClick={() => handleTabChange('letters')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'letters'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700/50'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Forwarded Cafeteria Letters
            </button>
          </div>
        </div>

        {/* Verified by Admin Official Banner */}
        {showUnionVerifiedAlert && (user?.is_approved ?? true) && (
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 shadow-sm flex items-center justify-between animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-emerald-900 dark:text-emerald-100 flex items-center gap-2">
                  Institutional Account Verified by Platform Administrator
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 text-white uppercase tracking-wider">
                    Verified Active
                  </span>
                </h4>
                <p className="text-[11px] sm:text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                  Your credentials as Student Union / Dining Dean {user?.university_name ? `at ${user.university_name}` : ''} {user?.staff_id_number ? `(Staff ID: ${user.staff_id_number})` : ''} have been officially verified and approved. You have full operational authority to issue electronic meal cards and inspect student dining clearance letters.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowUnionVerifiedAlert(false)}
              className="p-1 rounded-lg hover:bg-emerald-200/50 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {activeTab === 'cards' ? (
          <MealCardTracker />
        ) : (
          <ForwardedLettersView
            type="student-dean"
            title="Received Student Cafeteria Letters"
            subtitle="Verified clearance letters forwarded by students with Dean signature hashes & scannable QR seals."
          />
        )}
      </div>
    </div>
  )
}

