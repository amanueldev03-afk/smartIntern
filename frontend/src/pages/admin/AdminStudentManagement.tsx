import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getAdminStudents,
  deactivateStudent,
  activateStudent,
  getStudentActivity,
  type AdminStudent,
  type StudentActivityResponse,
} from '@/services/adminApi'
import {
  ArrowLeft,
  Users,
  Search,
  Activity,
  UserCheck,
  UserX,
  X,
  ChevronLeft,
  ChevronRight,
  AlertCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'

function Badge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${
        active
          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
          : 'bg-error-500/10 text-error-600 dark:text-error-400 border-error-500/20'
      }`}
    >
      {active ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

export default function AdminStudentManagement() {
  const navigate = useNavigate()
  const [students, setStudents] = useState<AdminStudent[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filterActive, setFilterActive] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedStudent, setSelectedStudent] = useState<AdminStudent | null>(null)
  const [activity, setActivity] = useState<StudentActivityResponse | null>(null)
  const [activityLoading, setActivityLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | number | null>(null)

  const fetchStudents = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params: Record<string, string | number> = { page, page_size: 20 }
      if (search) params.search = search
      if (filterActive) params.is_active = filterActive
      const data = await getAdminStudents(params as any)
      setStudents(data.results)
      setTotalCount(data.count)
    } catch {
      setError('Failed to load students.')
    } finally {
      setIsLoading(false)
    }
  }, [page, search, filterActive])

  useEffect(() => {
    fetchStudents()
  }, [fetchStudents])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchStudents()
  }

  const handleToggleActive = async (student: AdminStudent) => {
    setActionLoading(student.id)
    try {
      if (student.is_active) {
        await deactivateStudent(student.id)
      } else {
        await activateStudent(student.id)
      }
      setStudents((prev) =>
        prev.map((s) => (s.id === student.id ? { ...s, is_active: !s.is_active } : s))
      )
      if (selectedStudent?.id === student.id) {
        setSelectedStudent((prev) => (prev ? { ...prev, is_active: !prev.is_active } : prev))
      }
    } catch {
      setError('Action failed. Please try again.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleViewActivity = async (student: AdminStudent) => {
    setSelectedStudent(student)
    setActivity(null)
    setActivityLoading(true)
    try {
      const data = await getStudentActivity(student.id)
      setActivity(data)
    } catch {
      setError('Failed to load student activity.')
    } finally {
      setActivityLoading(false)
    }
  }

  const totalPages = Math.ceil(totalCount / 20)

  return (
    <main className="min-h-screen py-8 px-4 sm:px-6 lg:px-8 animate-fade-in pb-16">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="card-gradient p-6 sm:p-8 rounded-3xl shadow-soft flex flex-wrap items-center justify-between gap-4 animate-slide-up">
          <div>
            <button
              onClick={() => navigate('/admin/dashboard')}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-primary-600 dark:text-primary-400 hover:underline mb-2 transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-primary-600 to-secondary-500 text-white flex items-center justify-center shadow-glow">
                <Users className="w-5 h-5" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white">
                Student <span className="gradient-text">Management</span>
              </h1>
            </div>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 font-medium">
              {totalCount} registered students across verified cohorts
            </p>
          </div>
        </header>

        {/* Filter Toolbar */}
        <div className="card-gradient p-4 rounded-3xl shadow-card flex flex-wrap items-center gap-3">
          <form onSubmit={handleSearch} className="flex-1 min-w-[260px] relative">
            <Search className="w-4 h-4 text-neutral-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search students by name, email, university..."
              className="w-full pl-11 pr-4 py-2.5 rounded-2xl bg-neutral-100/80 dark:bg-neutral-800/80 border border-neutral-200/80 dark:border-neutral-700 text-xs font-medium text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
            />
          </form>

          <select
            value={filterActive}
            onChange={(e) => { setFilterActive(e.target.value); setPage(1) }}
            className="px-4 py-2.5 rounded-2xl bg-neutral-100/80 dark:bg-neutral-800/80 border border-neutral-200/80 dark:border-neutral-700 text-xs font-bold text-neutral-700 dark:text-neutral-300 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all"
          >
            <option value="">All Statuses</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>

          <Button
            size="sm"
            onClick={() => { setPage(1); fetchStudents() }}
            className="rounded-2xl shadow-glow text-xs font-bold"
          >
            Filter
          </Button>
        </div>

        {error && (
          <div role="alert" className="rounded-2xl border border-error-200 dark:border-error-800 bg-error-50 dark:bg-error-950/40 p-4 text-error-700 dark:text-error-300 text-xs font-medium flex items-center gap-2 animate-scale-in">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {isLoading ? (
          <div className="card-gradient p-8 rounded-3xl animate-pulse space-y-4 text-center">
            <p className="text-xs font-semibold text-neutral-500">Loading students...</p>
            <div className="h-24 bg-neutral-100 dark:bg-neutral-800/60 rounded-2xl" />
          </div>
        ) : students.length === 0 ? (
          <div className="card-gradient p-12 rounded-3xl text-center max-w-lg mx-auto shadow-card space-y-3 animate-scale-in">
            <div className="w-16 h-16 mx-auto bg-primary-500/10 text-primary-600 dark:text-primary-400 rounded-2xl flex items-center justify-center shadow-glow">
              <Users className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-neutral-900 dark:text-white">No students found</h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto">
              Try adjusting your search or filter criteria.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl card-gradient shadow-soft border border-neutral-200/80 dark:border-neutral-800">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200/80 dark:divide-neutral-800">
                <thead className="bg-neutral-50/80 dark:bg-neutral-800/50">
                  <tr>
                    <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-wider text-neutral-400">Student</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-wider text-neutral-400">Status</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-wider text-neutral-400">Joined</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-wider text-neutral-400">Last Login</th>
                    <th className="px-6 py-4 text-right text-[11px] font-bold uppercase tracking-wider text-neutral-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
                  {students.map((student) => (
                    <tr key={student.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/40 transition-colors">
                      <td className="px-6 py-4">
                        <div className="text-xs font-black text-neutral-900 dark:text-white">{student.full_name || student.email}</div>
                        <div className="text-[11px] text-neutral-500 dark:text-neutral-400 font-medium">{student.email}</div>
                        {student.university && <div className="text-[10px] text-primary-600 dark:text-primary-400 font-semibold">{student.university}</div>}
                      </td>
                      <td className="px-6 py-4"><Badge active={student.is_active} /></td>
                      <td className="px-6 py-4 text-xs font-semibold text-neutral-600 dark:text-neutral-400">{new Date(student.date_joined).toLocaleDateString()}</td>
                      <td className="px-6 py-4 text-xs font-semibold text-neutral-600 dark:text-neutral-400">{student.last_login ? new Date(student.last_login).toLocaleDateString() : 'Never'}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleViewActivity(student)}
                            className="rounded-xl text-xs font-bold h-8 px-3"
                          >
                            <Activity className="w-3.5 h-3.5 mr-1" />
                            Activity
                          </Button>
                          <Button
                            size="sm"
                            variant={student.is_active ? 'danger' : 'default'}
                            onClick={() => handleToggleActive(student)}
                            disabled={actionLoading === student.id}
                            className="rounded-xl text-xs font-bold h-8 px-3 shadow-sm"
                          >
                            {actionLoading === student.id ? '...' : student.is_active ? 'Deactivate' : 'Activate'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-800/50 px-6 py-3.5">
                <span className="text-xs text-neutral-500 dark:text-neutral-400 font-bold">Page {page} of {totalPages}</span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="rounded-xl text-xs font-bold"
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" /> Prev
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="rounded-xl text-xs font-bold"
                  >
                    Next <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Activity Modal */}
        {selectedStudent && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fade-in"
            onClick={() => setSelectedStudent(null)}
          >
            <div
              className="w-full max-w-2xl max-h-[85vh] overflow-y-auto card-gradient rounded-3xl p-6 sm:p-8 shadow-glow border border-neutral-200/80 dark:border-neutral-800 space-y-6 animate-scale-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-neutral-200/80 dark:border-neutral-800 pb-4">
                <div>
                  <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                    Student Activity Overview
                  </h2>
                  <p className="text-xs font-bold text-primary-600 dark:text-primary-400">{selectedStudent.full_name || selectedStudent.email}</p>
                </div>
                <button onClick={() => setSelectedStudent(null)} className="text-neutral-400 hover:text-neutral-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {activityLoading ? (
                <div className="p-8 text-center text-xs font-semibold text-neutral-500 animate-pulse">
                  Loading activity telemetry...
                </div>
              ) : activity ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="p-4 rounded-2xl bg-primary-500/10 border border-primary-500/20">
                      <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Applications</p>
                      <p className="text-xl font-black gradient-text mt-1">{activity.activity_counts.total_applications}</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-secondary-500/10 border border-secondary-500/20">
                      <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Bookmarks</p>
                      <p className="text-xl font-black gradient-text mt-1">{activity.activity_counts.total_saves}</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-accent-500/10 border border-accent-500/20">
                      <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">AI Matches</p>
                      <p className="text-xl font-black gradient-text mt-1">{activity.activity_counts.total_recommendations}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Timeline Log</h3>
                    {activity.results.length > 0 ? (
                      <div className="space-y-2">
                        {activity.results.map((entry) => (
                          <div
                            key={entry.id}
                            className="p-3.5 rounded-2xl bg-neutral-50/80 dark:bg-neutral-800/60 border border-neutral-200/60 dark:border-neutral-700/60 flex items-center justify-between gap-4"
                          >
                            <div>
                              <p className="text-xs font-bold text-neutral-900 dark:text-white">{entry.action_display}</p>
                              {entry.description && (
                                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 font-medium mt-0.5">{entry.description}</p>
                              )}
                            </div>
                            <span className="text-[10px] font-semibold text-neutral-400 shrink-0">
                              {new Date(entry.created_at).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-neutral-500 font-medium">No activity recorded yet for this student.</p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
