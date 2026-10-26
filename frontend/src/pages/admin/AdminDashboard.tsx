import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Briefcase, Database, Brain, Sparkles, LogOut, ChevronRight, ShieldCheck, Check, Loader2, KeyRound, X, Lock, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { logoutUser } from '@/features/auth/authSlice'
import { getAdminAnalytics, type AdminAnalytics } from '@/services/adminAnalyticsApi'
import * as authApi from '@/services/authApi'
import api from '@/services/api'
import { Button } from '@/components/ui/button'

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card-gradient rounded-3xl p-6 shadow-card hover:shadow-glow transition-all duration-300 transform hover:-translate-y-1">
      <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider">{label}</p>
      <p className="mt-2 text-3xl font-black gradient-text">{value}</p>
    </div>
  )
}

export default function AdminDashboard() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const user = useAppSelector((state) => state.auth.user)
  const { isLoading: authLoading } = useAppSelector((state) => state.auth)
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Institutional Staff Approval Queue
  const [pendingStaff, setPendingStaff] = useState<any[]>([])
  const [isLoadingStaff, setIsLoadingStaff] = useState(false)
  const [approvingStaffId, setApprovingStaffId] = useState<string | number | null>(null)
  const [adminAlert, setAdminAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [staffFilter, setStaffFilter] = useState<'all' | 'pending' | 'approved'>('all')

  // Change Password Modal State
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)

  useEffect(() => {
    let isCurrent = true
    getAdminAnalytics()
      .then((data) => {
        if (isCurrent) setAnalytics(data)
      })
      .catch(() => {
        if (isCurrent) setError('Unable to load administrator analytics.')
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false)
      })

    fetchPendingStaff()

    return () => {
      isCurrent = false
    }
  }, [])

  const fetchPendingStaff = async () => {
    setIsLoadingStaff(true)
    try {
      const res = await api.get('/v1/auth/admin/pending-staff/')
      setPendingStaff(Array.isArray(res.data) ? res.data : [])
    } catch {
      // silent
    } finally {
      setIsLoadingStaff(false)
    }
  }

  const formatRole = (role: string) => {
    const r = (role || '').toLowerCase()
    switch (r) {
      case 'dept_dean':
        return 'Department Dean'
      case 'uil_officer':
        return 'UIL Officer'
      case 'student_union':
        return 'Student Union'
      case 'dorm_admin':
        return 'Dormitory Admin'
      case 'finance_officer':
        return 'Finance Officer'
      case 'advisor':
        return 'Academic Advisor'
      default:
        return role
    }
  }

  const getRoleBadgeClasses = (role: string) => {
    const r = (role || '').toLowerCase()
    switch (r) {
      case 'dept_dean':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-800'
      case 'uil_officer':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300 dark:border-blue-800'
      case 'student_union':
        return 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-300 dark:border-rose-800'
      case 'dorm_admin':
        return 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300 border-violet-300 dark:border-violet-800'
      case 'finance_officer':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300 border-yellow-300 dark:border-yellow-800'
      default:
        return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800'
    }
  }

  const handleApproveStaff = async (staffId: string | number) => {
    setApprovingStaffId(staffId)
    setAdminAlert(null)
    try {
      await api.post(`/v1/auth/admin/approve-staff/${staffId}/`)
      const target = pendingStaff.find((s) => s.id === staffId)
      const name = target?.full_name || `${target?.first_name || ''} ${target?.last_name || ''}`.trim() || target?.email || 'Staff member'
      const roleTitle = formatRole(target?.role)
      setAdminAlert({
        type: 'success',
        message: `Successfully verified and approved ${name} (${roleTitle})! Account credentials and dashboard login access are now active.`
      })
      // Update row in place - KEEP ON DASHBOARD!
      setPendingStaff((prev) =>
        prev.map((s) => (s.id === staffId ? { ...s, is_approved: true } : s))
      )
    } catch (err: any) {
      setAdminAlert({
        type: 'error',
        message: err?.response?.data?.detail || err?.response?.data?.message || 'Verification approval failed.'
      })
    } finally {
      setApprovingStaffId(null)
    }
  }

  const handleLogout = async () => {
    await dispatch(logoutUser(localStorage.getItem('refresh_token')))
    navigate('/login')
  }

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
      setPasswordSuccess('Password changed successfully! Please use your new password next time you sign in.')
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

  const navLinks = [
    { label: 'User Management', path: '/admin/students', icon: Users, desc: 'Manage students & admins' },
    { label: 'Internship Review', path: '/admin/internships/review', icon: Briefcase, desc: 'Review & approve jobs' },
    { label: 'Data Sources', path: '/admin/data-sources', icon: Database, desc: 'Scraper health & logs' },
    { label: 'AI Monitoring', path: '/admin/ai-monitoring', icon: Brain, desc: 'Embeddings & model latency' },
  ]

  return (
    <main className="min-h-screen py-8 px-4 sm:px-6 lg:px-8 animate-fade-in pb-16">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="card-gradient p-6 sm:p-8 rounded-3xl shadow-soft flex flex-wrap items-center justify-between gap-4 animate-slide-up">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-primary-500/10 text-primary-600 dark:text-primary-400 text-xs font-bold uppercase tracking-wider mb-2">
              <Sparkles className="w-3.5 h-3.5" /> Operations Central
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white">
              Admin <span className="gradient-text">Dashboard</span>
            </h1>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 font-medium">
              Live platform analytics & intelligence overview for {user?.email}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPasswordModal(true)}
              className="rounded-2xl text-xs font-bold"
            >
              <KeyRound className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
              Change Password
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleLogout}
              disabled={authLoading}
              className="rounded-2xl text-xs font-bold"
            >
              <LogOut className="w-3.5 h-3.5 mr-1.5" />
              {authLoading ? 'Logging out...' : 'Logout'}
            </Button>
          </div>
        </header>

        <nav className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {navLinks.map((link) => {
            const Icon = link.icon
            return (
              <button
                key={link.path}
                onClick={() => navigate(link.path)}
                className="card-gradient flex items-center justify-between p-5 rounded-3xl shadow-card hover:shadow-glow hover:border-primary-400/60 text-left transition-all duration-300 group"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="block text-sm font-bold text-neutral-900 dark:text-white">{link.label}</span>
                    <span className="block text-[11px] text-neutral-500 dark:text-neutral-400">{link.desc}</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:translate-x-1 transition-transform" />
              </button>
            )
          })}
        </nav>

        {isLoading && (
          <div className="card-gradient p-8 rounded-3xl animate-pulse space-y-4 text-center">
            <p className="text-xs font-semibold text-neutral-500">Loading analytics...</p>
            <div className="h-20 bg-neutral-100 dark:bg-neutral-800/60 rounded-2xl" />
          </div>
        )}
        {error && (
          <div role="alert" className="rounded-2xl border border-error-200 dark:border-error-800 bg-error-50 dark:bg-error-950/40 p-4 text-error-700 dark:text-error-300 text-xs font-medium animate-scale-in">
            {error}
          </div>
        )}

        {/* In-dashboard Alert for Administrator Actions */}
        {adminAlert && (
          <div
            className={`p-4 rounded-2xl border text-xs sm:text-sm font-semibold flex items-center justify-between shadow-sm animate-fade-in ${
              adminAlert.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {adminAlert.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
              )}
              <span>{adminAlert.message}</span>
            </div>
            <button
              onClick={() => setAdminAlert(null)}
              className="p-1 rounded-lg hover:bg-neutral-200/50 dark:hover:bg-neutral-800/40 text-neutral-500"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* INSTITUTIONAL STAFF APPROVAL & MANAGEMENT QUEUE */}
        <section aria-labelledby="staff-approvals" className="card-gradient rounded-3xl p-6 sm:p-8 shadow-card border border-neutral-200/80 dark:border-neutral-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h2 id="staff-approvals" className="text-base font-bold text-neutral-900 dark:text-white">
                  Institutional Staff Directory & Approvals
                </h2>
              </div>
              <p className="text-xs text-neutral-500 mt-1">
                UIL Officers, Department Deans, Student Union, and Dormitory Admins require platform administrator verification before operational login access is activated.
              </p>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchPendingStaff}
                disabled={isLoadingStaff}
                className="text-xs"
              >
                {isLoadingStaff ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                Refresh Staff Directory
              </Button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-2 border-b border-neutral-200/80 dark:border-neutral-800 pb-2">
            <button
              onClick={() => setStaffFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                staffFilter === 'all'
                  ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              All Staff ({pendingStaff.length})
            </button>
            <button
              onClick={() => setStaffFilter('pending')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                staffFilter === 'pending'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              Pending Approval ({pendingStaff.filter((s) => !s.is_approved).length})
            </button>
            <button
              onClick={() => setStaffFilter('approved')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                staffFilter === 'approved'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              Verified Staff ({pendingStaff.filter((s) => s.is_approved).length})
            </button>
          </div>

          {isLoadingStaff ? (
            <div className="p-8 text-center text-xs text-neutral-400">Loading institutional staff directory...</div>
          ) : pendingStaff.length === 0 ? (
            <div className="p-6 text-center text-xs text-neutral-500 bg-neutral-50 dark:bg-neutral-900 rounded-2xl border border-neutral-200/60 dark:border-neutral-800">
              <Check className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
              No institutional staff registrations found in directory.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 dark:bg-neutral-800/50 text-[11px] font-bold text-neutral-400 uppercase">
                  <tr>
                    <th className="py-3 px-4">Staff Member</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Department / Office</th>
                    <th className="py-3 px-4">University</th>
                    <th className="py-3 px-4 text-right">Verification Status & Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {pendingStaff
                    .filter((staff) => {
                      if (staffFilter === 'pending') return !staff.is_approved
                      if (staffFilter === 'approved') return !!staff.is_approved
                      return true
                    })
                    .map((staff) => (
                      <tr key={staff.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/40">
                        <td className="py-3 px-4">
                          <span className="font-bold text-neutral-900 dark:text-white block">
                            {staff.full_name || `${staff.first_name || ''} ${staff.last_name || ''}`.trim() || staff.email}
                          </span>
                          <span className="text-[11px] text-neutral-400">
                            {staff.email}
                            {staff.staff_id_number ? ` • ID: ${staff.staff_id_number}` : ''}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getRoleBadgeClasses(staff.role)}`}>
                            {formatRole(staff.role)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-neutral-700 dark:text-neutral-300">
                          {staff.department || 'General Administration'}
                        </td>
                        <td className="py-3 px-4 text-neutral-700 dark:text-neutral-300">
                          {staff.university_name || 'Addis Ababa University'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {staff.is_approved ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-xs border border-emerald-500/20">
                              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                              Verified by Admin
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              disabled={approvingStaffId === staff.id}
                              onClick={() => handleApproveStaff(staff.id)}
                              className="text-xs h-7 bg-emerald-600 hover:bg-emerald-700 text-white font-bold inline-flex items-center gap-1 shadow-sm"
                            >
                              {approvingStaffId === staff.id ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                  Verifying...
                                </>
                              ) : (
                                <>
                                  <Check className="w-3 h-3 mr-1" />
                                  Verify & Approve
                                </>
                              )}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {analytics && !error && (
          <div className="space-y-8 animate-slide-up">
            <section aria-labelledby="user-statistics">
              <h2 id="user-statistics" className="mb-4 text-lg font-bold text-neutral-900 dark:text-white">
                User Demographics
              </h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard label="Total Users" value={analytics.users.total} />
                <StatCard label="Students" value={analytics.users.students} />
                <StatCard label="Administrators" value={analytics.users.admins} />
              </div>
            </section>

            <section aria-labelledby="internship-statistics">
              <h2 id="internship-statistics" className="mb-4 text-lg font-bold text-neutral-900 dark:text-white">
                Internship Inventory
              </h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard label="Total Internships" value={analytics.internships.total} />
                <StatCard label="Active Listings" value={analytics.internships.active} />
                <StatCard label="Needs Review" value={analytics.internships.needs_review} />
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <section aria-labelledby="skills-heading" className="card-gradient rounded-3xl p-6 sm:p-8 shadow-card">
                <h2 id="skills-heading" className="text-base font-bold text-neutral-900 dark:text-white mb-4">
                  Most-Requested Technical Skills
                </h2>
                {analytics.most_requested_skills.length === 0 ? (
                  <p className="text-xs text-neutral-500 font-medium">No internship skill demand recorded yet.</p>
                ) : (
                  <div className="space-y-4">
                    {analytics.most_requested_skills.map((item) => {
                      const maximum = analytics.most_requested_skills[0]?.count || 1
                      const pct = Math.round((item.count / maximum) * 100)
                      return (
                        <div key={item.skill} className="space-y-1">
                          <div className="flex justify-between text-xs font-bold">
                            <span className="text-neutral-700 dark:text-neutral-300">{item.skill}</span>
                            <span className="text-primary-600 dark:text-primary-400">{item.count} roles</span>
                          </div>
                          <div className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-primary-500 to-secondary-500 rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>

              <section aria-labelledby="recommendation-statistics" className="card-gradient rounded-3xl p-6 sm:p-8 shadow-card space-y-4">
                <h2 id="recommendation-statistics" className="text-base font-bold text-neutral-900 dark:text-white">
                  Recommendation Performance
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                  <StatCard label="Total Matches Generated" value={analytics.recommendations.total} />
                  <StatCard
                    label="Average Match Score"
                    value={analytics.recommendations.average_match_score === null ? 'No data' : `${analytics.recommendations.average_match_score.toFixed(1)}%`}
                  />
                </div>
              </section>
            </div>
          </div>
        )}
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
                  <h3 className="text-base font-black text-neutral-900 dark:text-white">Change Admin Password</h3>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Update your administrator sign-in password</p>
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
                    placeholder="Enter current password (e.g. Admin@1234)"
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
    </main>
  )
}
