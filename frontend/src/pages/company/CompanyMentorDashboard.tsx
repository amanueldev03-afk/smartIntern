import { useState, useEffect } from 'react'
import { 
  FileText, 
  CheckCircle2, 
  Clock, 
  Search, 
  Loader2, 
  Building
} from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'

interface WeeklyLogbook {
  id: string
  week_number: number
  student_email?: string
  student_name?: string
  similarity_score: number
  advisor_approved: boolean
  advisor_feedback: string
  submitted_at: string
}

export default function CompanyMentorDashboard() {
  const [logbooks, setLogbooks] = useState<WeeklyLogbook[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchLogbooks()
  }, [])

  const fetchLogbooks = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await api.get('/v1/projects/logbooks/')
      const data = res.data
      setLogbooks(Array.isArray(data) ? data : data.results || [])
    } catch (err: any) {
      setError(err?.message || 'Failed to load logbooks')
    } finally {
      setIsLoading(false)
    }
  }

  const filteredLogbooks = logbooks.filter((l) => {
    const student = l.student_name || l.student_email || ''
    return student.toLowerCase().includes(searchQuery.toLowerCase())
  })

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-[#0c0c0e] py-8 px-4 sm:px-6 lg:px-8 animate-fade-in">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-teal-100 dark:bg-teal-950/80 text-teal-800 dark:text-teal-300 mb-2">
              <Building className="w-3.5 h-3.5" />
              Company Mentor Portal
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white tracking-tight">
              Intern Mentorship & Progress Verification
            </h1>
            <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-1">
              Track your assigned interns, inspect weekly sprint achievements, and verify workplace contribution milestones.
            </p>
          </div>
          <Button onClick={fetchLogbooks} disabled={isLoading} variant="outline" className="text-xs self-start md:self-auto">
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
            Refresh Feed
          </Button>
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 rounded-xl text-xs">
            {error}
          </div>
        )}

        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card-gradient p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-500">Mentored Submissions</span>
              <FileText className="w-5 h-5 text-teal-600" />
            </div>
            <div className="mt-2 text-2xl font-black text-neutral-900 dark:text-white">{logbooks.length}</div>
            <div className="mt-1 text-[11px] text-neutral-400">Sprint logbooks submitted</div>
          </div>

          <div className="card-gradient p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-500">Verified by Advisor</span>
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            </div>
            <div className="mt-2 text-2xl font-black text-neutral-900 dark:text-white">
              {logbooks.filter((l) => l.advisor_approved).length}
            </div>
            <div className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">Approved records</div>
          </div>

          <div className="card-gradient p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-500">Pending Approvals</span>
              <Clock className="w-5 h-5 text-amber-500" />
            </div>
            <div className="mt-2 text-2xl font-black text-neutral-900 dark:text-white">
              {logbooks.filter((l) => !l.advisor_approved).length}
            </div>
            <div className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">Under evaluation</div>
          </div>
        </div>

        {/* Logbooks Table */}
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 overflow-hidden shadow-soft">
          <div className="p-4 border-b border-neutral-200/80 dark:border-neutral-800 flex items-center justify-between gap-4">
            <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300">
              Mentored Intern Weekly Logbooks
            </span>
            <div className="relative max-w-xs w-full">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search intern..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs focus:outline-none"
              />
            </div>
          </div>

          {filteredLogbooks.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-500">
              No mentored intern logbooks found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 dark:bg-neutral-800/50 text-[11px] font-bold text-neutral-400 uppercase">
                  <tr>
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Sprint Week</th>
                    <th className="py-3 px-4">Similarity Score</th>
                    <th className="py-3 px-4">Advisor Review</th>
                    <th className="py-3 px-4">Submission Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {filteredLogbooks.map((log) => (
                    <tr key={log.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/40">
                      <td className="py-3 px-4 font-medium text-neutral-900 dark:text-white">
                        {log.student_name || log.student_email || 'Student'}
                      </td>
                      <td className="py-3 px-4">Week {log.week_number}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded font-bold text-[11px] bg-neutral-100 dark:bg-neutral-800">
                          {(log.similarity_score || 0).toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {log.advisor_approved ? (
                          <span className="text-emerald-600 font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                          </span>
                        ) : (
                          <span className="text-amber-600 font-bold flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" /> Pending
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-neutral-500">
                        {log.submitted_at ? new Date(log.submitted_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
