import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAppSelector } from '@/hooks/redux'
import * as authApi from '@/services/authApi'
import * as studentApi from '@/services/studentApi'
import type { StudentProfile } from '@/services/studentApi'
import type { User } from '@/types'
import {
  EDUCATION_LEVEL_LABELS,
  FIELD_OF_STUDY_LABELS,
  WORK_MODE_LABELS,
  INTERNSHIP_TYPE_LABELS,
  COMPENSATION_LABELS,
  labelFor,
} from '@/constants/profileChoices'
import PersonalEducationSection from './PersonalEducationSection'
import SkillsInterestsSection from './SkillsInterestsSection'
import PreferencesSection from './PreferencesSection'
import ResumeSection from './ResumeSection'
import StudentRecommendations from './StudentRecommendations'
import InternshipSearch from './InternshipSearch'
import { Camera, RefreshCw, KeyRound, Lock, X, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

type TabId = 'overview' | 'personal' | 'skills' | 'preferences' | 'resume' | 'recommendations' | 'search'

const TABS: Array<{ id: TabId; label: string; category?: string }> = [
  { id: 'overview', label: 'Overview', category: 'basic' },
  { id: 'personal', label: 'Personal & Education', category: 'basic' },
  { id: 'skills', label: 'Skills & Interests', category: 'professional' },
  { id: 'preferences', label: 'Preferences', category: 'professional' },
  { id: 'resume', label: 'Resume & CV', category: 'professional' },
  { id: 'recommendations', label: 'AI Matches', category: 'internships' },
  { id: 'search', label: 'Search Internships', category: 'internships' },
]

const SECTION_LABELS: Record<string, string> = {
  personal: 'Personal',
  education: 'Education',
  skills: 'Skills',
  interests: 'Interests',
  preferences: 'Preferences',
  resume: 'Resume',
}

export default function ProfilePage() {
  const authUser = useAppSelector((state) => state.auth.user)
  const [user, setUser] = useState<User | null>(authUser)
  const [profile, setProfile] = useState<StudentProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') as TabId | null
  const [activeTab, setActiveTab] = useState<TabId>(
    initialTab && TABS.some((t) => t.id === initialTab) ? initialTab : 'overview'
  )
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null)

  // Password Change Modal State
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(null)

    if (!passwordForm.oldPassword) {
      setPasswordError('Current password is required.')
      return
    }
    if (!passwordForm.newPassword) {
      setPasswordError('New password is required.')
      return
    }
    if (passwordForm.newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long.')
      return
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match.')
      return
    }
    if (passwordForm.oldPassword === passwordForm.newPassword) {
      setPasswordError('New password must be different from your current password.')
      return
    }

    setPasswordLoading(true)
    try {
      await authApi.changePassword({
        old_password: passwordForm.oldPassword,
        new_password: passwordForm.newPassword,
        new_password_confirm: passwordForm.confirmPassword,
      })
      setPasswordSuccess('Password changed successfully!')
      setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' })
      setTimeout(() => {
        setShowPasswordModal(false)
        setPasswordSuccess(null)
      }, 2000)
    } catch (err: any) {
      const respData = err?.response?.data
      if (typeof respData === 'string') {
        setPasswordError(respData)
      } else if (respData?.old_password) {
        setPasswordError(`Current password: ${Array.isArray(respData.old_password) ? respData.old_password[0] : respData.old_password}`)
      } else if (respData?.new_password) {
        setPasswordError(`New password: ${Array.isArray(respData.new_password) ? respData.new_password[0] : respData.new_password}`)
      } else if (respData?.new_password_confirm) {
        setPasswordError(`Confirm password: ${Array.isArray(respData.new_password_confirm) ? respData.new_password_confirm[0] : respData.new_password_confirm}`)
      } else if (respData?.detail) {
        setPasswordError(Array.isArray(respData.detail) ? respData.detail[0] : respData.detail)
      } else {
        setPasswordError('Failed to change password. Please check your credentials and try again.')
      }
    } finally {
      setPasswordLoading(false)
    }
  }

  useEffect(() => {
    const tabFromUrl = searchParams.get('tab') as TabId | null
    if (tabFromUrl && TABS.some((t) => t.id === tabFromUrl)) {
      setActiveTab(tabFromUrl)
    }
  }, [searchParams])

  const handleTabChange = (tabId: TabId) => {
    setActiveTab(tabId)
    setSearchParams({ tab: tabId })
  }

  const fetchProfileData = async () => {
    setError(null)
    try {
      const currentUser = await authApi.getCurrentUser().catch(() => null)
      if (currentUser) {
        setUser(currentUser)
      }
      const currentRole = (currentUser?.role || authUser?.role || '').toLowerCase()
      const isStudent = !currentRole || currentRole === 'student'
      if (isStudent) {
        const studentProf = await studentApi.getStudentProfile()
        setProfile(studentProf)
      }
    } catch {
      // If student profile fails
      setProfile(null)
      setError('Failed to load student profile details.')
    }
  }

  useEffect(() => {
    fetchProfileData()
  }, [])

  const fullName = user?.first_name || user?.last_name
    ? `${user?.first_name || ''} ${user?.last_name || ''}`.trim()
    : user?.username || 'Student'

  const completionPct = profile?.completion?.percent ?? null
  const sections = profile?.completion?.sections

  const getProfilePhotoUrl = (user: User | null) => {
    if (user?.profile_photo_url) return user.profile_photo_url
    if (user?.profile_photo) {
      if (user.profile_photo.startsWith('http://') || user.profile_photo.startsWith('https://')) {
        return user.profile_photo
      }
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api'
      const baseUrl = apiBaseUrl.replace('/api', '')
      return `${baseUrl}/media/${user.profile_photo}`
    }
    return null
  }

  const handlePhotoUpload = async (file: File): Promise<void> => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setPhotoUploadError('Profile photo must be a JPEG, PNG, GIF, or WebP image.')
      return
    }

    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      setPhotoUploadError('Profile photo must be less than 5MB.')
      return
    }

    setIsUploadingPhoto(true)
    setPhotoUploadError(null)

    try {
      const updatedUser = await authApi.updateUser({ profile_photo: file })
      setUser(updatedUser)
      await fetchProfileData()
    } catch (err: any) {
      console.error('Photo upload error:', err)
      setPhotoUploadError(err.response?.data?.detail || err.message || 'Failed to upload profile photo. Please try again.')
    } finally {
      setIsUploadingPhoto(false)
    }
  }

  return (
    <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8 animate-fade-in pb-16">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="card-gradient p-6 sm:p-8 rounded-3xl shadow-soft flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
              <Link to="/dashboard" className="text-primary-600 dark:text-primary-400 hover:underline">
                Dashboard
              </Link>
              <span>/</span>
              <span className="text-neutral-700 dark:text-neutral-300">Profile & Career Settings</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white">
              Student <span className="gradient-text">Profile</span>
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 font-medium">
              Manage your personal background, verified skill tags, CV extraction, and career preferences.
            </p>
          </div>

          <Button
            onClick={fetchProfileData}
            variant="secondary"
            size="sm"
            className="rounded-2xl text-xs font-bold shrink-0 self-start sm:self-center"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
        </div>

        {error && (
          <div className="rounded-2xl bg-error-50 dark:bg-error-950/40 p-4 border border-error-200 dark:border-error-800 animate-scale-in" role="alert">
            <p className="text-xs font-medium text-error-700 dark:text-error-300">{error}</p>
          </div>
        )}

        {/* Main Layout: Sidebar + Content */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar Navigation */}
          <div className="lg:w-72 flex-shrink-0 animate-slide-up">
            <div className="card-gradient p-6 rounded-3xl sticky top-24 space-y-6 shadow-card">
              {/* Profile Card Header in Sidebar */}
              <div className="flex flex-col items-center text-center pb-6 border-b border-neutral-200/80 dark:border-neutral-800">
                <div className="relative mb-3 group">
                  {getProfilePhotoUrl(user) ? (
                    <>
                      <img
                        src={getProfilePhotoUrl(user)}
                        alt="Profile"
                        className="w-20 h-20 rounded-2xl object-cover border-2 border-white dark:border-neutral-700 shadow-glow transition-all duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                        <label htmlFor="photo-upload" className="cursor-pointer">
                          <Camera className="w-5 h-5 text-white" />
                        </label>
                      </div>
                    </>
                  ) : (
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-primary-600 to-secondary-500 flex items-center justify-center text-white text-2xl font-black shadow-glow group-hover:scale-105 transition-all cursor-pointer">
                      <label htmlFor="photo-upload" className="cursor-pointer flex items-center justify-center">
                        {isUploadingPhoto ? (
                          <RefreshCw className="w-5 h-5 animate-spin" />
                        ) : (
                          fullName.charAt(0).toUpperCase()
                        )}
                      </label>
                    </div>
                  )}
                  <input
                    id="photo-upload"
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handlePhotoUpload(file)
                    }}
                    disabled={isUploadingPhoto}
                  />
                </div>
                {photoUploadError && (
                  <p className="text-[11px] font-bold text-error-600 mb-2">{photoUploadError}</p>
                )}
                <h2 className="text-base font-bold text-neutral-900 dark:text-white leading-tight">{fullName}</h2>
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400 mt-1">
                  {user?.role || 'student'}
                </span>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 truncate max-w-[200px]">{user?.email}</p>
                {profile?.city && profile?.country && (
                  <span className="text-[11px] font-semibold text-neutral-500 mt-1.5 block">
                    📍 {profile.city}, {profile.country}
                  </span>
                )}
              </div>

              {/* Profile Completion Meter */}
              <div className="pb-6 border-b border-neutral-200/80 dark:border-neutral-800 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-neutral-500 uppercase tracking-wider">Profile Strength</span>
                  <span className="font-extrabold gradient-text">
                    {completionPct === null ? '—' : `${completionPct}%`}
                  </span>
                </div>
                <div className="w-full bg-neutral-100 dark:bg-neutral-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-primary-500 to-secondary-500 h-2 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${completionPct === null ? 0 : Math.min(100, Math.max(0, completionPct))}%` }}
                  />
                </div>
                {sections && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {Object.entries(sections).map(([key, complete]) => (
                      <span
                        key={key}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all ${
                          complete 
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20' 
                            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400'
                        }`}
                      >
                        {SECTION_LABELS[key] ?? key}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Side Navigation Tabs */}
              <nav className="space-y-4">
                <div>
                  <h4 className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2">Core Profile</h4>
                  <div className="space-y-1">
                    {TABS.filter(tab => tab.category === 'basic').map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => handleTabChange(tab.id)}
                        className={`w-full text-left px-3.5 py-2 rounded-2xl text-xs font-bold transition-all ${
                          activeTab === tab.id
                            ? 'bg-gradient-to-r from-primary-600 to-secondary-600 text-white shadow-glow'
                            : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2">Career & Skills</h4>
                  <div className="space-y-1">
                    {TABS.filter(tab => tab.category === 'professional').map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => handleTabChange(tab.id)}
                        className={`w-full text-left px-3.5 py-2 rounded-2xl text-xs font-bold transition-all ${
                          activeTab === tab.id
                            ? 'bg-gradient-to-r from-primary-600 to-secondary-600 text-white shadow-glow'
                            : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2">Opportunities</h4>
                  <div className="space-y-1">
                    {TABS.filter(tab => tab.category === 'internships').map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => handleTabChange(tab.id)}
                        className={`w-full text-left px-3.5 py-2 rounded-2xl text-xs font-bold transition-all ${
                          activeTab === tab.id
                            ? 'bg-gradient-to-r from-primary-600 to-secondary-600 text-white shadow-glow'
                            : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              </nav>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 min-w-0 animate-slide-up">
            <div className="card-gradient p-6 sm:p-8 rounded-3xl shadow-card">
              {/* Tab 1: Overview */}
              {activeTab === 'overview' && (
                <div className="space-y-6 animate-fade-in">
                  <div className="p-6 rounded-2xl bg-white/90 dark:bg-neutral-900/90 border border-neutral-200/80 dark:border-neutral-800 space-y-4">
                    <h3 className="text-base font-bold text-neutral-900 dark:text-white border-b border-neutral-200/80 dark:border-neutral-800 pb-3">
                      Personal Information
                    </h3>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60">
                        <dt className="font-bold text-neutral-400 uppercase mb-1">Username</dt>
                        <dd className="font-bold text-neutral-900 dark:text-white">{user?.username || '—'}</dd>
                      </div>
                      <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60">
                        <dt className="font-bold text-neutral-400 uppercase mb-1">Email</dt>
                        <dd className="font-bold text-neutral-900 dark:text-white">{user?.email}</dd>
                      </div>
                      <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60">
                        <dt className="font-bold text-neutral-400 uppercase mb-1">Phone</dt>
                        <dd className="font-bold text-neutral-900 dark:text-white">{profile?.phone || 'Not provided'}</dd>
                      </div>
                      <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60">
                        <dt className="font-bold text-neutral-400 uppercase mb-1">Bio</dt>
                        <dd className="font-medium text-neutral-700 dark:text-neutral-300">{profile?.bio || 'No bio provided yet.'}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="p-6 rounded-2xl bg-white/90 dark:bg-neutral-900/90 border border-neutral-200/80 dark:border-neutral-800 space-y-4">
                    <h3 className="text-base font-bold text-neutral-900 dark:text-white border-b border-neutral-200/80 dark:border-neutral-800 pb-3">
                      {user?.role && user.role !== 'student' ? 'Institutional Profile' : 'Academic & Career Snapshot'}
                    </h3>
                    {user?.role && user.role !== 'student' ? (
                      <div className="space-y-4">
                        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60">
                          <dt className="font-bold text-neutral-400 uppercase mb-1">University</dt>
                          <dd className="font-bold text-neutral-900 dark:text-white">
                            {user.university_name || 'Addis Ababa University'}
                          </dd>
                        </div>
                        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60">
                          <dt className="font-bold text-neutral-400 uppercase mb-1">Staff / Employee ID</dt>
                          <dd className="font-bold text-neutral-900 dark:text-white font-mono">
                            {user.staff_id_number || 'Not registered'}
                          </dd>
                        </div>
                        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60">
                          <dt className="font-bold text-neutral-400 uppercase mb-1">Department / Unit</dt>
                          <dd className="font-bold text-neutral-900 dark:text-white">
                            {user.department || 'General Administration'}
                          </dd>
                        </div>
                        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60">
                          <dt className="font-bold text-neutral-400 uppercase mb-1">Role Title</dt>
                          <dd className="font-bold text-neutral-900 dark:text-white">
                            {user.role}
                          </dd>
                        </div>
                        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60">
                          <dt className="font-bold text-neutral-400 uppercase mb-1">Verification Status</dt>
                          <dd className="font-bold text-emerald-600 dark:text-emerald-400">
                            {user.is_approved ? 'Verified by Administrator' : 'Pending Verification'}
                          </dd>
                        </div>
                        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60">
                          <dt className="font-bold text-neutral-400 uppercase mb-1">Account Active</dt>
                          <dd className="font-bold text-neutral-900 dark:text-white">
                            {user.is_email_verified ? 'Active & Confirmed' : 'Email Pending'}
                          </dd>
                        </div>
                      </dl>
                      <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-800 flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowPasswordModal(true)}
                          className="rounded-xl text-xs font-bold"
                        >
                          <KeyRound className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
                          Change Account Password
                        </Button>
                      </div>
                    </div>
                    ) : (
                      <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60">
                          <dt className="font-bold text-neutral-400 uppercase mb-1">University</dt>
                          <dd className="font-bold text-neutral-900 dark:text-white">
                            {profile?.university || labelFor(EDUCATION_LEVEL_LABELS, profile?.education_level) || 'Not specified'}
                          </dd>
                        </div>
                        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60">
                          <dt className="font-bold text-neutral-400 uppercase mb-1">Field of Study</dt>
                          <dd className="font-bold text-neutral-900 dark:text-white">
                            {labelFor(FIELD_OF_STUDY_LABELS, profile?.field_of_study) || 'Not specified'}
                          </dd>
                        </div>
                        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60">
                          <dt className="font-bold text-neutral-400 uppercase mb-1">Education Level</dt>
                          <dd className="font-bold text-neutral-900 dark:text-white">
                            {labelFor(EDUCATION_LEVEL_LABELS, profile?.education_level) || 'Not specified'}
                          </dd>
                        </div>
                        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60">
                          <dt className="font-bold text-neutral-400 uppercase mb-1">Work Mode</dt>
                          <dd className="font-bold text-neutral-900 dark:text-white">
                            {labelFor(WORK_MODE_LABELS, profile?.work_type) || 'Not specified'}
                          </dd>
                        </div>
                        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60">
                          <dt className="font-bold text-neutral-400 uppercase mb-1">Internship Type</dt>
                          <dd className="font-bold text-neutral-900 dark:text-white">
                            {labelFor(INTERNSHIP_TYPE_LABELS, profile?.internship_type) || 'Not specified'}
                          </dd>
                        </div>
                        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60">
                          <dt className="font-bold text-neutral-400 uppercase mb-1">Compensation</dt>
                          <dd className="font-bold text-neutral-900 dark:text-white">
                            {labelFor(COMPENSATION_LABELS, profile?.compensation_preference) || 'Not specified'}
                          </dd>
                        </div>
                      </dl>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 2: Personal & Education */}
              {activeTab === 'personal' && <PersonalEducationSection onSaved={fetchProfileData} />}

              {/* Tab 3: Skills & Interests */}
              {activeTab === 'skills' && <SkillsInterestsSection onSaved={fetchProfileData} />}

              {/* Tab 4: Preferences */}
              {activeTab === 'preferences' && <PreferencesSection onSaved={fetchProfileData} />}

              {/* Tab 5: Resume & CV */}
              {activeTab === 'resume' && (
                <ResumeSection profile={profile} onSaved={fetchProfileData} />
              )}

              {/* Tab 6: Recommendations */}
              {activeTab === 'recommendations' && <StudentRecommendations />}

              {/* Tab 7: Search Internships */}
              {activeTab === 'search' && <InternshipSearch />}
            </div>
          </div>
        </div>
      </div>

      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md card-gradient rounded-3xl p-6 sm:p-8 shadow-2xl border-2 border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 space-y-5 animate-scale-up">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-neutral-900 dark:text-white">Change Password</h3>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Update your account sign-in password</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowPasswordModal(false)
                  setPasswordError(null)
                  setPasswordSuccess(null)
                }}
                className="p-1.5 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {passwordSuccess && (
              <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>{passwordSuccess}</span>
              </div>
            )}

            {passwordError && (
              <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-2">
                <X className="w-4 h-4 shrink-0" />
                <span>{passwordError}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Current Password
                </label>
                <div className="relative flex items-center">
                  <Lock className="w-4 h-4 text-neutral-400 absolute left-3.5 pointer-events-none" />
                  <input
                    type="password"
                    required
                    value={passwordForm.oldPassword}
                    onChange={(e) => setPasswordForm((p) => ({ ...p, oldPassword: e.target.value }))}
                    placeholder="Enter current password"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 border-2 border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-900 dark:text-white focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 mb-1.5">
                  New Password
                </label>
                <div className="relative flex items-center">
                  <Lock className="w-4 h-4 text-neutral-400 absolute left-3.5 pointer-events-none" />
                  <input
                    type="password"
                    required
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))}
                    placeholder="Min. 8 characters"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 border-2 border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-900 dark:text-white focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Confirm New Password
                </label>
                <div className="relative flex items-center">
                  <Lock className="w-4 h-4 text-neutral-400 absolute left-3.5 pointer-events-none" />
                  <input
                    type="password"
                    required
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm((p) => ({ ...p, confirmPassword: e.target.value }))}
                    placeholder="Confirm your new password"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 border-2 border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-900 dark:text-white focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowPasswordModal(false)
                    setPasswordError(null)
                    setPasswordSuccess(null)
                  }}
                  disabled={passwordLoading}
                  className="rounded-xl text-xs font-bold"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={passwordLoading}
                  className="rounded-xl text-xs font-bold shadow-glow"
                >
                  {passwordLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Updating Password...
                    </>
                  ) : (
                    'Save New Password'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}