import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { 
  School, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  Users, 
  Clock, 
  Bell, 
  Loader2, 
  Search,
  MessagesSquare,
  Video,
  Star
} from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import TeamCommunicationHub from '@/components/communication/TeamCommunicationHub'

interface SquadMember {
  id: string
  student_id: string
  student_name: string
  student_email: string
  skill_tags: string[]
  is_leader: boolean
  assigned_role: string
}

interface ProjectTeam {
  id: string
  team_name: string
  project_title: string
  cohort_name: string
  advisor_name?: string
  srs_document?: string
  srs_status: 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'
  srs_feedback?: string
  srs_revision_deadline?: string
  is_coding_unlocked: boolean
  members: SquadMember[]
}

interface WeeklyLogbook {
  id: string
  week_number: number
  student_email?: string
  student_name?: string
  similarity_score: number
  advisor_approved: boolean
  advisor_feedback: string
  submitted_at: string
  tasks_completed?: string
  git_commits_count?: number
}

interface LogbookAlert {
  id: string
  week_number: number
  alert_type: string
  title: string
  message: string
  is_read: boolean
  created_at: string
}

export default function AdvisorDashboard() {
  const [teams, setTeams] = useState<ProjectTeam[]>([])
  const [logbooks, setLogbooks] = useState<WeeklyLogbook[]>([])
  const [alerts, setAlerts] = useState<LogbookAlert[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get('tab') as 'squads' | 'docgate' | 'logbooks' | 'alerts' | 'channel') || 'squads'
  const setActiveTab = (tab: 'squads' | 'docgate' | 'logbooks' | 'alerts' | 'channel') => {
    setSearchParams({ tab })
  }
  const [selectedSquadId, setSelectedSquadId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Modal for reviewing SRS
  const [reviewTeam, setReviewTeam] = useState<ProjectTeam | null>(null)
  const [srsAction, setSrsAction] = useState<'APPROVED' | 'REJECTED'>('APPROVED')
  const [srsFeedback, setSrsFeedback] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)

  // Feedback for Logbook
  const [reviewLogbook, setReviewLogbook] = useState<WeeklyLogbook | null>(null)
  const [logbookApproved, setLogbookApproved] = useState(true)
  const [logbookFeedback, setLogbookFeedback] = useState('')
  const [submittingLogbook, setSubmittingLogbook] = useState(false)

  // Implementation Verification State
  const [verifyingTeam, setVerifyingTeam] = useState<ProjectTeam | null>(null)
  const [advisorRating, setAdvisorRating] = useState<number>(5)
  const [advisorScore, setAdvisorScore] = useState<number>(90)
  const [advisorNotes, setAdvisorNotes] = useState<string>('Exceptional architecture, robust tests, and clean code quality.')
  const [submittingVerification, setSubmittingVerification] = useState<boolean>(false)

  const handleVerifyImplementation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!verifyingTeam) return
    setSubmittingVerification(true)
    try {
      await api.post(`/v1/teams/${verifyingTeam.id}/advisor-verify/`, {
        rating: advisorRating,
        score: advisorScore,
        notes: advisorNotes,
      })
      alert('Project implementation successfully verified and submitted to UIL!')
      setVerifyingTeam(null)
      fetchData()
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Verification submission failed.')
    } finally {
      setSubmittingVerification(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [teamsRes, logbooksRes, alertsRes] = await Promise.allSettled([
        api.get('/v1/projects/teams/'),
        api.get('/v1/projects/logbooks/'),
        api.get('/v1/projects/alerts/'),
      ])

      if (teamsRes.status === 'fulfilled') {
        const data = teamsRes.value.data
        const teamsList: ProjectTeam[] = Array.isArray(data) ? data : data.results || []
        setTeams(teamsList)
        if (teamsList.length > 0) {
          setSelectedSquadId((prev) => prev || teamsList[0].id)
        }
      }
      if (logbooksRes.status === 'fulfilled') {
        const data = logbooksRes.value.data
        setLogbooks(Array.isArray(data) ? data : data.results || [])
      }
      if (alertsRes.status === 'fulfilled') {
        const data = alertsRes.value.data
        setAlerts(Array.isArray(data) ? data : data.results || [])
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load advisor dashboard data')
    } finally {
      setIsLoading(false)
    }
  }

  const handleReviewSRS = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reviewTeam) return

    setSubmittingReview(true)
    try {
      const res = await api.post(`/v1/projects/teams/${reviewTeam.id}/srs/review/`, {
        srs_status: srsAction,
        srs_feedback: srsFeedback,
      })
      setTeams((prev) =>
        prev.map((t) => (t.id === reviewTeam.id ? { ...t, ...res.data } : t))
      )
      setReviewTeam(null)
      setSrsFeedback('')
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to submit review')
    } finally {
      setSubmittingReview(false)
    }
  }

  const handleApproveLogbook = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reviewLogbook) return

    setSubmittingLogbook(true)
    try {
      const res = await api.patch(`/v1/projects/logbooks/${reviewLogbook.id}/approve/`, {
        advisor_approved: logbookApproved,
        advisor_feedback: logbookFeedback,
      })
      setLogbooks((prev) =>
        prev.map((l) => (l.id === reviewLogbook.id ? { ...l, ...res.data } : l))
      )
      setReviewLogbook(null)
      setLogbookFeedback('')
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to update logbook status')
    } finally {
      setSubmittingLogbook(false)
    }
  }

  const markAlertRead = async (alertId: string) => {
    try {
      await api.patch(`/v1/projects/alerts/${alertId}/read/`)
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, is_read: true } : a))
      )
    } catch {
      // silent
    }
  }

  const pendingSRSCount = teams.filter((t) => t.srs_status === 'SUBMITTED').length
  const pendingLogbooksCount = logbooks.filter((l) => !l.advisor_approved).length
  const unreadAlertsCount = alerts.filter((a) => !a.is_read).length

  const filteredTeams = teams.filter(
    (t) =>
      t.team_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.project_title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const docgateTeams = filteredTeams.filter(
    (t) => t.srs_status === 'SUBMITTED' || t.srs_status === 'REJECTED' || t.srs_status === 'PENDING'
  )

  const renderSquadCard = (team: ProjectTeam) => {
    const isApproved = team.srs_status === 'APPROVED'
    const isSubmitted = team.srs_status === 'SUBMITTED'
    const isRejected = team.srs_status === 'REJECTED'

    return (
      <div
        key={team.id}
        className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 space-y-4 shadow-soft"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-primary-600">
              {team.cohort_name || 'In-House Software House'}
            </span>
            <h3 className="text-base font-bold text-neutral-900 dark:text-white mt-0.5">
              {team.team_name}
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Project: {team.project_title}
            </p>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
              isApproved
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                : isSubmitted
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                : isRejected
                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
            }`}
          >
            SRS {team.srs_status}
          </span>
        </div>

        {/* Members */}
        <div>
          <div className="text-[11px] font-bold text-neutral-400 mb-1.5">Squad Members:</div>
          <div className="flex flex-wrap gap-1.5">
            {team.members.map((m) => (
              <span
                key={m.id}
                className="px-2 py-0.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-[11px] font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-1"
              >
                <span>{m.student_name || m.student_email}</span>
                {m.is_leader && (
                  <span className="text-[9px] bg-primary-500 text-white px-1 rounded font-bold">
                    Lead
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>

        {/* Documentation Gate status */}
        <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            {isApproved ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            ) : (
              <Clock className="w-4 h-4 text-amber-500" />
            )}
            <span className="font-semibold text-neutral-600 dark:text-neutral-300">
              Coding Phase: {isApproved ? 'UNLOCKED' : 'LOCKED (SRS Gate)'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open('https://meet.google.com/new', '_blank')}
              className="text-xs h-8 flex items-center gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:hover:bg-emerald-950"
              title="Launch Advisory Google Meet Video Call"
            >
              <Video className="w-3.5 h-3.5" />
              Meet Call
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setSelectedSquadId(team.id)
                setActiveTab('channel')
              }}
              className="text-xs h-8 flex items-center gap-1"
            >
              <MessagesSquare className="w-3.5 h-3.5" />
              Squad Chat
            </Button>
            <Button
              size="sm"
              variant={isSubmitted ? 'default' : 'outline'}
              onClick={() => {
                setReviewTeam(team)
                setSrsAction(isApproved ? 'APPROVED' : 'APPROVED')
                setSrsFeedback(team.srs_feedback || '')
              }}
              className="text-xs h-8"
            >
              Evaluate SRS
            </Button>
            <Button
              size="sm"
              onClick={() => setVerifyingTeam(team)}
              className="text-xs h-8 bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1"
              title="Submit Advisor Rating and Score to UIL"
            >
              <Star className="w-3.5 h-3.5" />
              Verify Project
            </Button>
          </div>
        </div>

        {team.srs_revision_deadline && isRejected && (
          <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-[11px] text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            Revision Deadline: {new Date(team.srs_revision_deadline).toLocaleDateString()}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-[#0c0c0e] py-8 px-4 sm:px-6 lg:px-8 animate-fade-in">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-primary-100 dark:bg-primary-950/80 text-primary-700 dark:text-primary-300 mb-2">
              <School className="w-3.5 h-3.5" />
              Academic Advisor Portal
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white tracking-tight">
              In-House Squad Supervision & Documentation Gate
            </h1>
            <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-1">
              Review Track 1 Software Requirements Specifications (SRS), unlock sprint implementation, and grade weekly progress.
            </p>
          </div>
          <Button onClick={fetchData} disabled={isLoading} variant="outline" className="self-start md:self-auto text-xs">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card-gradient p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-500">Supervised Squads</span>
              <Users className="w-5 h-5 text-primary-600" />
            </div>
            <div className="mt-2 text-2xl font-black text-neutral-900 dark:text-white">{teams.length}</div>
            <div className="mt-1 text-[11px] text-neutral-400">Track 1 In-House teams</div>
          </div>

          <div className="card-gradient p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-500">Pending SRS Reviews</span>
              <FileText className="w-5 h-5 text-amber-500" />
            </div>
            <div className="mt-2 text-2xl font-black text-neutral-900 dark:text-white">{pendingSRSCount}</div>
            <div className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">Requires advisor evaluation</div>
          </div>

          <div className="card-gradient p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-500">Pending Logbooks</span>
              <Clock className="w-5 h-5 text-blue-500" />
            </div>
            <div className="mt-2 text-2xl font-black text-neutral-900 dark:text-white">{pendingLogbooksCount}</div>
            <div className="mt-1 text-[11px] text-neutral-400">Weekly sprint submissions</div>
          </div>

          <div className="card-gradient p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-500">Supervisory Alerts</span>
              <Bell className="w-5 h-5 text-rose-500" />
            </div>
            <div className="mt-2 text-2xl font-black text-neutral-900 dark:text-white">{unreadAlertsCount}</div>
            <div className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">Plagiarism / missed logbooks</div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-neutral-200/80 dark:border-neutral-800 pb-2">
          <button
            onClick={() => setActiveTab('squads')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'squads'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            Project Squads ({teams.length})
          </button>
          <button
            onClick={() => setActiveTab('docgate')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'docgate'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Documentation Gate
            {pendingSRSCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-white">
                {pendingSRSCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('logbooks')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'logbooks'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            Weekly Sprint Logbooks ({logbooks.length})
          </button>
          <button
            onClick={() => setActiveTab('alerts')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'alerts'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            Alerts & Warnings ({unreadAlertsCount} new)
          </button>
          <button
            onClick={() => setActiveTab('channel')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'channel'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <MessagesSquare className="w-3.5 h-3.5" />
            Communication Hub
          </button>
        </div>

        {/* TAB 1: SQUADS & SRS GATE */}
        {activeTab === 'squads' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search squad or project title..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-xs focus:outline-none focus:border-primary-500"
                />
              </div>
            </div>

            {filteredTeams.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-xs text-neutral-500">
                No project squads found.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredTeams.map((team) => renderSquadCard(team))}
              </div>
            )}
          </div>
        )}

        {/* TAB: DOCUMENTATION GATE (SRS REVIEW QUEUE) */}
        {activeTab === 'docgate' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  <h2 className="text-sm font-bold text-neutral-900 dark:text-white">
                    Track 1 Documentation Gate (SRS Review)
                  </h2>
                </div>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                  Enforces the two-stage gate: In-House teams cannot unlock repository coding until their Software Requirements Specification is reviewed and signed off.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 self-start sm:self-auto shrink-0">
                {pendingSRSCount} Pending Evaluation
              </span>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter squads by title or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-xs focus:outline-none focus:border-primary-500"
                />
              </div>
            </div>

            {docgateTeams.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-xs text-neutral-500 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                <p className="font-bold text-neutral-800 dark:text-neutral-200">No Pending SRS Submissions</p>
                <p className="text-neutral-400">All squad SRS documents have been evaluated and approved.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {docgateTeams.map((team) => renderSquadCard(team))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: LOGBOOKS */}
        {activeTab === 'logbooks' && (
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 overflow-hidden shadow-soft">
            <div className="p-4 border-b border-neutral-200/80 dark:border-neutral-800 font-bold text-xs text-neutral-700 dark:text-neutral-300">
              Weekly Sprint Logbook Submissions
            </div>
            {logbooks.length === 0 ? (
              <div className="p-8 text-center text-xs text-neutral-500">No logbook submissions yet.</div>
            ) : (
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 dark:bg-neutral-800/50 text-[11px] font-bold text-neutral-400 uppercase">
                    <tr>
                      <th className="py-3 px-4">Student</th>
                      <th className="py-3 px-4">Week</th>
                      <th className="py-3 px-4">Similarity Score</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {logbooks.map((log) => {
                      const isHighSim = (log.similarity_score || 0) > 30
                      return (
                        <tr key={log.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/40">
                          <td className="py-3 px-4 font-medium text-neutral-900 dark:text-white">
                            {log.student_name || log.student_email || 'Student'}
                          </td>
                          <td className="py-3 px-4">Week {log.week_number}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                                isHighSim
                                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                              }`}
                            >
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
                                <Clock className="w-3.5 h-3.5" /> Pending Review
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setReviewLogbook(log)
                                setLogbookApproved(log.advisor_approved)
                                setLogbookFeedback(log.advisor_feedback || '')
                              }}
                              className="text-xs h-7"
                            >
                              Review & Grade
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: ALERTS */}
        {activeTab === 'alerts' && (
          <div className="space-y-3">
            {alerts.length === 0 ? (
              <div className="p-8 text-center bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 text-xs text-neutral-500">
                No alerts at this time.
              </div>
            ) : (
              alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-4 rounded-2xl border transition-all ${
                    alert.is_read
                      ? 'bg-white dark:bg-neutral-900 border-neutral-200/80 dark:border-neutral-800 text-neutral-600'
                      : 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                      <div>
                        <div className="text-xs font-bold">{alert.title}</div>
                        <div className="text-xs mt-0.5">{alert.message}</div>
                        <div className="text-[10px] text-neutral-400 mt-1">
                          {new Date(alert.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    {!alert.is_read && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => markAlertRead(alert.id)}
                        className="text-[11px] h-7"
                      >
                        Mark as read
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 4: COMMUNICATION HUB */}
        {activeTab === 'channel' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 shadow-soft">
              <div className="flex items-center gap-2">
                <MessagesSquare className="w-5 h-5 text-primary-600" />
                <div>
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Active Squad Channel</h3>
                  <p className="text-xs text-neutral-500">Select a project squad to supervise and post direct advisory feedback.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-neutral-600 dark:text-neutral-300">Select Squad:</label>
                <select
                  value={selectedSquadId || ''}
                  onChange={(e) => setSelectedSquadId(e.target.value)}
                  className="px-3 py-1.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-xs font-semibold border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white focus:outline-none focus:border-primary-500"
                >
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.team_name} — {t.project_title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedSquadId ? (
              <TeamCommunicationHub
                teamId={selectedSquadId}
                teamName={teams.find((t) => t.id === selectedSquadId)?.team_name}
                projectTitle={teams.find((t) => t.id === selectedSquadId)?.project_title}
                advisorName="You (Academic Advisor)"
              />
            ) : (
              <div className="p-8 text-center bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 text-xs text-neutral-500">
                No squad available to communicate with.
              </div>
            )}
          </div>
        )}
      </div>

      {/* SRS REVIEW MODAL */}
      {reviewTeam && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl max-w-lg w-full p-6 space-y-4 border border-neutral-200 dark:border-neutral-800 shadow-xl">
            <h3 className="text-base font-bold text-neutral-900 dark:text-white">
              Evaluate SRS Document — {reviewTeam.team_name}
            </h3>
            <p className="text-xs text-neutral-500">
              Project: {reviewTeam.project_title}
            </p>

            <form onSubmit={handleReviewSRS} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  SRS Approval Decision
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSrsAction('APPROVED')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                      srsAction === 'APPROVED'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700'
                    }`}
                  >
                    ✓ Approve (Unlock Coding)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSrsAction('REJECTED')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                      srsAction === 'REJECTED'
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700'
                    }`}
                  >
                    ✗ Reject (2-Wk Revision)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Advisor Feedback Notes
                </label>
                <textarea
                  rows={4}
                  value={srsFeedback}
                  onChange={(e) => setSrsFeedback(e.target.value)}
                  placeholder="Provide detailed feedback on requirements, architecture, or corrections required..."
                  className="w-full p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs focus:outline-none focus:border-primary-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setReviewTeam(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={submittingReview}
                >
                  {submittingReview ? 'Submitting...' : 'Submit Evaluation'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LOGBOOK REVIEW MODAL */}
      {reviewLogbook && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl max-w-lg w-full p-6 space-y-4 border border-neutral-200 dark:border-neutral-800 shadow-xl">
            <h3 className="text-base font-bold text-neutral-900 dark:text-white">
              Grade Week {reviewLogbook.week_number} Logbook
            </h3>
            <p className="text-xs text-neutral-500">
              Student: {reviewLogbook.student_name || reviewLogbook.student_email}
            </p>

            <form onSubmit={handleApproveLogbook} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Grade / Approval
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setLogbookApproved(true)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                      logbookApproved
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700'
                    }`}
                  >
                    ✓ Approve Logbook
                  </button>
                  <button
                    type="button"
                    onClick={() => setLogbookApproved(false)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                      !logbookApproved
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700'
                    }`}
                  >
                    Needs Revision
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Advisor Feedback
                </label>
                <textarea
                  rows={3}
                  value={logbookFeedback}
                  onChange={(e) => setLogbookFeedback(e.target.value)}
                  placeholder="Feedback on sprint tasks, commit logs, or code quality..."
                  className="w-full p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs focus:outline-none focus:border-primary-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setReviewLogbook(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={submittingLogbook}
                >
                  {submittingLogbook ? 'Saving...' : 'Save Feedback'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: VERIFY PROJECT IMPLEMENTATION */}
      {verifyingTeam && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-3xl max-w-lg w-full p-6 space-y-4 border border-neutral-200 dark:border-neutral-800 shadow-xl animate-scale-in">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-600">
                Track 1 Academic Verification
              </span>
              <h3 className="text-base font-bold text-neutral-900 dark:text-white mt-0.5">
                Verify Project Implementation: {verifyingTeam.team_name}
              </h3>
              <p className="text-xs text-neutral-500">Project: {verifyingTeam.project_title}</p>
            </div>

            <form onSubmit={handleVerifyImplementation} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Faculty Rating (1 - 5 Stars) *
                  </label>
                  <select
                    value={advisorRating}
                    onChange={(e) => setAdvisorRating(Number(e.target.value))}
                    className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
                  >
                    <option value={5}>⭐⭐⭐⭐⭐ (5 Stars - Exceptional)</option>
                    <option value={4}>⭐⭐⭐⭐ (4 Stars - Very Good)</option>
                    <option value={3}>⭐⭐⭐ (3 Stars - Satisfactory)</option>
                    <option value={2}>⭐⭐ (2 Stars - Needs Improvement)</option>
                    <option value={1}>⭐ (1 Star - Inadequate)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Advisor Score (0 - 100) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    required
                    value={advisorScore}
                    onChange={(e) => setAdvisorScore(Number(e.target.value))}
                    className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Supervisory Evaluation & UIL Recommendations
                </label>
                <textarea
                  rows={3}
                  required
                  value={advisorNotes}
                  onChange={(e) => setAdvisorNotes(e.target.value)}
                  placeholder="Detail sprint velocity, architectural soundess, code review findings..."
                  className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setVerifyingTeam(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={submittingVerification}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                >
                  {submittingVerification ? 'Submitting...' : 'Submit Verification to UIL'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
