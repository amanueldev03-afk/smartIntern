import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { 
  Building2, 
  Briefcase, 
  Users, 
  Plus, 
  CheckCircle2, 
  Clock, 
  Search, 
  Loader2,
  Sparkles,
  Send,
  MessagesSquare,
  X
} from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'

interface Internship {
  id: number
  title: string
  organization_name: string
  internship_type: string
  work_type?: string
  location_text?: string
  status: string
  is_published?: boolean
  created_at: string
  application_deadline?: string
  required_skills?: string[]
}

interface Application {
  id: number
  internship: number | { id: number; title: string }
  internship_title?: string
  student?: {
    id: string
    email: string
    first_name?: string
    last_name?: string
    full_name?: string
  }
  student_name?: string
  student_email?: string
  status: string
  notes?: string
  created_at: string
}

export default function CompanyDashboard() {
  const [internships, setInternships] = useState<Internship[]>([])
  const [applications, setApplications] = useState<Application[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get('tab') as 'listings' | 'applicants') || 'listings'
  const setActiveTab = (tab: 'listings' | 'applicants') => {
    setSearchParams({ tab })
  }
  const [searchQuery, setSearchQuery] = useState('')

  // New Listing Modal state
  const [isPostModalOpen, setIsPostModalOpen] = useState(false)
  const [postingLoading, setPostingLoading] = useState(false)
  const [newListing, setNewListing] = useState({
    title: '',
    organization_name: '',
    description: '',
    internship_type: 'remote',
    location_text: 'Addis Ababa, Ethiopia',
    required_skills: '',
    application_deadline: '',
  })

  // Status update loading state
  const [updatingAppId, setUpdatingAppId] = useState<number | null>(null)

  // AI Recommended Students State
  const [recommendedInternship, setRecommendedInternship] = useState<Internship | null>(null)
  const [recommendedStudents, setRecommendedStudents] = useState<any[]>([])
  const [loadingRecommendations, setLoadingRecommendations] = useState(false)
  const [invitingStudent, setInvitingStudent] = useState<any | null>(null)
  const [invitationNote, setInvitationNote] = useState('We are impressed by your academic record and would like to invite you for an interview.')
  const [sendingInvite, setSendingInvite] = useState(false)

  // Direct Student-Company Chat State
  const [chatInvitationId, setChatInvitationId] = useState<string | null>(null)
  const [chatStudentName, setChatStudentName] = useState<string>('')
  const [chatMessages, setMessages] = useState<any[]>([])
  const [chatInput, setChatInput] = useState('')
  const [sendingChatMessage, setSendingChatMessage] = useState(false)

  const handleOpenRecommendations = async (internship: Internship) => {
    setRecommendedInternship(internship)
    setLoadingRecommendations(true)
    try {
      const res = await api.get(`/companies/internships/${internship.id}/recommended-students/`)
      setRecommendedStudents(res.data.recommended_students || [])
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to load AI recommended students.')
    } finally {
      setLoadingRecommendations(false)
    }
  }

  const handleSendInvitation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!invitingStudent || !recommendedInternship) return
    setSendingInvite(true)
    try {
      await api.post('/companies/invitations/', {
        internship_id: recommendedInternship.id,
        student_id: invitingStudent.student_id,
        invitation_note: invitationNote,
      })
      alert(`Invitation officially sent to ${invitingStudent.full_name}!`)
      setInvitingStudent(null)
      // refresh recommendations
      handleOpenRecommendations(recommendedInternship)
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to send invitation.')
    } finally {
      setSendingInvite(false)
    }
  }

  const handleOpenChat = async (invitationId: string, studentName: string) => {
    setChatInvitationId(invitationId)
    setChatStudentName(studentName)
    try {
      const res = await api.get(`/companies/chat/${invitationId}/`)
      setMessages(res.data.messages || [])
    } catch {
      // silent
    }
  }

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInvitationId || !chatInput.trim()) return
    setSendingChatMessage(true)
    try {
      const res = await api.post(`/companies/chat/${chatInvitationId}/send/`, {
        message: chatInput.trim(),
      })
      setMessages((prev) => [...prev, res.data])
      setChatInput('')
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to send message.')
    } finally {
      setSendingChatMessage(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [listingsRes, appsRes] = await Promise.allSettled([
        api.get('/companies/my-internships/'),
        api.get('/companies/applications/'),
      ])

      if (listingsRes.status === 'fulfilled') {
        const data = listingsRes.value.data
        setInternships(Array.isArray(data) ? data : data.results || [])
      }
      if (appsRes.status === 'fulfilled') {
        const data = appsRes.value.data
        setApplications(Array.isArray(data) ? data : data.results || [])
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch employer dashboard data')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateListing = async (e: React.FormEvent) => {
    e.preventDefault()
    setPostingLoading(true)
    try {
      const skillsArray = newListing.required_skills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

      const payload = {
        title: newListing.title,
        organization_name: newListing.organization_name || 'Partner Company',
        description: newListing.description,
        internship_type: newListing.internship_type,
        location_text: newListing.location_text,
        required_skills: skillsArray,
        application_deadline: newListing.application_deadline || null,
        work_type: 'full_time',
      }

      const res = await api.post('/companies/my-internships/', payload)
      setInternships((prev) => [res.data, ...prev])
      setIsPostModalOpen(false)
      setNewListing({
        title: '',
        organization_name: '',
        description: '',
        internship_type: 'remote',
        location_text: 'Addis Ababa, Ethiopia',
        required_skills: '',
        application_deadline: '',
      })
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to post internship')
    } finally {
      setPostingLoading(false)
    }
  }

  const handleUpdateStatus = async (appId: number, nextStatus: string) => {
    setUpdatingAppId(appId)
    try {
      await api.patch(`/companies/applications/${appId}/status/`, { status: nextStatus })
      setApplications((prev) =>
        prev.map((a) => (a.id === appId ? { ...a, status: nextStatus } : a))
      )
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to update candidate status')
    } finally {
      setUpdatingAppId(null)
    }
  }

  const activeListingsCount = internships.filter((i) => i.status === 'active').length
  const totalApplicants = applications.length
  const interviewCount = applications.filter((a) => a.status === 'interview').length
  const acceptedCount = applications.filter((a) => a.status === 'accepted').length

  const filteredListings = internships.filter(
    (i) =>
      i.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.organization_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredApplicants = applications.filter((a) => {
    const studentEmail = a.student_email || a.student?.email || ''
    const studentName = a.student_name || a.student?.full_name || ''
    const query = searchQuery.toLowerCase()
    return studentEmail.toLowerCase().includes(query) || studentName.toLowerCase().includes(query)
  })

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-[#0c0c0e] py-8 px-4 sm:px-6 lg:px-8 animate-fade-in">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 mb-2">
              <Building2 className="w-3.5 h-3.5" />
              Employer & Recruiter Portal
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white tracking-tight">
              Internship Management & Candidate Review
            </h1>
            <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-1">
              Publish postings across Ethiopian universities, evaluate matched candidates, and manage your hiring pipeline.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <Button onClick={() => setIsPostModalOpen(true)} className="text-xs font-bold shadow-glow">
              <Plus className="w-4 h-4 mr-1.5" /> Post New Internship
            </Button>
            <Button onClick={fetchData} disabled={isLoading} variant="outline" className="text-xs">
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
              Refresh
            </Button>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 rounded-xl text-xs">
            {error}
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card-gradient p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-500">Active Listings</span>
              <Briefcase className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="mt-2 text-2xl font-black text-neutral-900 dark:text-white">{activeListingsCount}</div>
            <div className="mt-1 text-[11px] text-neutral-400">Total {internships.length} postings</div>
          </div>

          <div className="card-gradient p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-500">Total Applicants</span>
              <Users className="w-5 h-5 text-primary-600" />
            </div>
            <div className="mt-2 text-2xl font-black text-neutral-900 dark:text-white">{totalApplicants}</div>
            <div className="mt-1 text-[11px] text-neutral-400">Submissions received</div>
          </div>

          <div className="card-gradient p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-500">In Interview</span>
              <Clock className="w-5 h-5 text-amber-500" />
            </div>
            <div className="mt-2 text-2xl font-black text-neutral-900 dark:text-white">{interviewCount}</div>
            <div className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">Pipeline active</div>
          </div>

          <div className="card-gradient p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-500">Accepted / Hired</span>
              <CheckCircle2 className="w-5 h-5 text-indigo-500" />
            </div>
            <div className="mt-2 text-2xl font-black text-neutral-900 dark:text-white">{acceptedCount}</div>
            <div className="mt-1 text-[11px] text-indigo-600 dark:text-indigo-400">Internship offers accepted</div>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-2 border-b border-neutral-200/80 dark:border-neutral-800 pb-2">
          <button
            onClick={() => setActiveTab('listings')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'listings'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            My Postings ({internships.length})
          </button>
          <button
            onClick={() => setActiveTab('applicants')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'applicants'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            Applicant Candidates ({applications.length})
          </button>
        </div>

        {/* TAB 1: LISTINGS */}
        {activeTab === 'listings' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search listings..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {filteredListings.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-xs text-neutral-500">
                No internship listings found. Click "Post New Internship" to publish your first opportunity.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredListings.map((item) => (
                  <div
                    key={item.id}
                    className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-soft flex flex-col justify-between space-y-4"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                          {item.organization_name}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.status === 'active'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                          }`}
                        >
                          {item.status.toUpperCase()}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-neutral-900 dark:text-white mt-1">
                        {item.title}
                      </h3>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                        {item.location_text || item.internship_type}
                      </p>

                      {item.required_skills && item.required_skills.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-3">
                          {item.required_skills.slice(0, 4).map((skill, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-[10px] font-medium text-neutral-600 dark:text-neutral-300"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 mt-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          item.is_published
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        }`}
                      >
                        {item.is_published ? '● Live (Admin Published)' : '⏳ Awaiting Admin Review'}
                      </span>
                    </div>

                    <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800/80 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-400">
                      <Button
                        size="sm"
                        onClick={() => handleOpenRecommendations(item)}
                        className="text-xs h-7 bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        AI Matched Students
                      </Button>
                      <button
                        onClick={() => setActiveTab('applicants')}
                        className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline text-xs"
                      >
                        Applicants ({applications.filter(a => typeof a.internship === 'object' ? a.internship.id === item.id : a.internship === item.id).length}) →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: APPLICANTS */}
        {activeTab === 'applicants' && (
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 overflow-hidden shadow-soft">
            <div className="p-4 border-b border-neutral-200/80 dark:border-neutral-800 font-bold text-xs text-neutral-700 dark:text-neutral-300 flex items-center justify-between">
              <span>Student Applicants Pipeline</span>
              <span className="text-[11px] font-normal text-neutral-400">
                Update status to notify candidates
              </span>
            </div>

            {filteredApplicants.length === 0 ? (
              <div className="p-8 text-center text-xs text-neutral-500">
                No candidate applications received yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 dark:bg-neutral-800/50 text-[11px] font-bold text-neutral-400 uppercase">
                    <tr>
                      <th className="py-3 px-4">Candidate</th>
                      <th className="py-3 px-4">Internship</th>
                      <th className="py-3 px-4">Applied Date</th>
                      <th className="py-3 px-4">Current Status</th>
                      <th className="py-3 px-4 text-right">Update Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {filteredApplicants.map((app) => {
                      const studentName = app.student_name || app.student?.full_name || 'Applicant'
                      const studentEmail = app.student_email || app.student?.email || ''
                      const title =
                        typeof app.internship === 'object' && app.internship
                          ? app.internship.title
                          : app.internship_title || `Internship #${app.internship}`

                      return (
                        <tr key={app.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/40">
                          <td className="py-3 px-4 font-medium text-neutral-900 dark:text-white">
                            <div>{studentName}</div>
                            <div className="text-[11px] text-neutral-400">{studentEmail}</div>
                          </td>
                          <td className="py-3 px-4 font-medium text-neutral-700 dark:text-neutral-300">
                            {title}
                          </td>
                          <td className="py-3 px-4 text-neutral-500">
                            {new Date(app.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                                app.status === 'accepted'
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                  : app.status === 'interview'
                                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                                  : app.status === 'rejected'
                                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                  : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                              }`}
                            >
                              {app.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <select
                              value={app.status}
                              disabled={updatingAppId === app.id}
                              onChange={(e) => handleUpdateStatus(app.id, e.target.value)}
                              className="py-1 px-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs font-semibold focus:outline-none"
                            >
                              <option value="applied">Applied</option>
                              <option value="interview">Interview</option>
                              <option value="accepted">Accepted</option>
                              <option value="rejected">Rejected</option>
                            </select>
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
      </div>

      {/* POST NEW INTERNSHIP MODAL */}
      {isPostModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-neutral-900 rounded-3xl max-w-lg w-full p-6 space-y-4 border border-neutral-200 dark:border-neutral-800 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
              Create New Internship Opportunity
            </h3>
            <p className="text-xs text-neutral-500">
              Your listing will be indexed and AI-matched with suitable students.
            </p>

            <form onSubmit={handleCreateListing} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Internship Title *
                </label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Junior Backend Software Engineer Intern"
                  value={newListing.title}
                  onChange={(e) => setNewListing((p) => ({ ...p, title: e.target.value }))}
                  className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Company / Organization Name *
                </label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Ethio Telecom or Commercial Bank of Ethiopia"
                  value={newListing.organization_name}
                  onChange={(e) => setNewListing((p) => ({ ...p, organization_name: e.target.value }))}
                  className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Internship Type
                  </label>
                  <select
                    value={newListing.internship_type}
                    onChange={(e) => setNewListing((p) => ({ ...p, internship_type: e.target.value }))}
                    className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs focus:outline-none"
                  >
                    <option value="remote">Remote</option>
                    <option value="onsite">Onsite</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Location Text
                  </label>
                  <input
                    type="text"
                    value={newListing.location_text}
                    onChange={(e) => setNewListing((p) => ({ ...p, location_text: e.target.value }))}
                    className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Required Skills (comma-separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Python, Django, PostgreSQL, Docker"
                  value={newListing.required_skills}
                  onChange={(e) => setNewListing((p) => ({ ...p, required_skills: e.target.value }))}
                  className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Description & Requirements *
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Describe internship role, responsibilities, prerequisites..."
                  value={newListing.description}
                  onChange={(e) => setNewListing((p) => ({ ...p, description: e.target.value }))}
                  className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsPostModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={postingLoading}
                >
                  {postingLoading ? 'Publishing...' : 'Publish Listing'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 1: AI RECOMMENDED CANDIDATES */}
      {recommendedInternship && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-3xl max-w-2xl w-full p-6 space-y-4 border border-neutral-200 dark:border-neutral-800 shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-100 dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                    AI Matched Students: {recommendedInternship.title}
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    Ranked by semantic skill overlap, GPA, and university academic year
                  </p>
                </div>
              </div>
              <button
                onClick={() => setRecommendedInternship(null)}
                className="text-neutral-400 hover:text-neutral-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {loadingRecommendations ? (
                <div className="py-12 text-center text-xs text-neutral-400 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                  Running AI match ranking algorithm...
                </div>
              ) : recommendedStudents.length === 0 ? (
                <div className="py-12 text-center text-xs text-neutral-500">
                  No matching students found for this posting's skill criteria.
                </div>
              ) : (
                recommendedStudents.map((candidate) => (
                  <div
                    key={candidate.student_id}
                    className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200/80 dark:border-neutral-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-neutral-900 dark:text-white">
                          {candidate.full_name}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                          {candidate.match_score}% Match
                        </span>
                      </div>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {candidate.department} • Year {candidate.academic_year} • GPA: {candidate.gpa || '3.5'}
                      </p>
                      {candidate.matching_skills && candidate.matching_skills.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {candidate.matching_skills.map((s: string, idx: number) => (
                            <span
                              key={idx}
                              className="px-1.5 py-0.5 rounded bg-white dark:bg-neutral-700 text-[9px] font-medium text-neutral-700 dark:text-neutral-300"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {candidate.invitation_status === 'ACCEPTED' ? (
                        <Button
                          size="sm"
                          onClick={() => handleOpenChat(candidate.invitation_id, candidate.full_name)}
                          className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1"
                        >
                          <MessagesSquare className="w-3.5 h-3.5" /> Direct Chat
                        </Button>
                      ) : candidate.invitation_status === 'PENDING' ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          Invite Sent (Pending)
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => setInvitingStudent(candidate)}
                          className="text-xs h-8 bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1"
                        >
                          <Send className="w-3.5 h-3.5" /> Send Invite
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: SEND INVITATION */}
      {invitingStudent && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-3xl max-w-md w-full p-6 space-y-4 border border-neutral-200 dark:border-neutral-800 shadow-xl">
            <h3 className="text-base font-bold text-neutral-900 dark:text-white">
              Invite Candidate to Interview
            </h3>
            <p className="text-xs text-neutral-500">
              Candidate: <span className="font-bold">{invitingStudent.full_name}</span> ({invitingStudent.department})
            </p>

            <form onSubmit={handleSendInvitation} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Invitation Note & Prerequisites *
                </label>
                <textarea
                  required
                  rows={4}
                  value={invitationNote}
                  onChange={(e) => setInvitationNote(e.target.value)}
                  placeholder="We invite you to interview for our internship role. Please accept to begin direct communication..."
                  className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setInvitingStudent(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={sendingInvite}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                >
                  {sendingInvite ? 'Sending...' : 'Confirm & Send Invitation'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: DIRECT CHAT THREAD */}
      {chatInvitationId && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-3xl max-w-lg w-full p-6 space-y-4 border border-neutral-200 dark:border-neutral-800 shadow-xl h-[550px] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-100 dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <MessagesSquare className="w-5 h-5 text-emerald-600" />
                <div>
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                    Direct Chat: {chatStudentName}
                  </h3>
                  <p className="text-[10px] text-neutral-400">Track 1 Direct Employer-Student Channel</p>
                </div>
              </div>
              <button onClick={() => setChatInvitationId(null)} className="text-neutral-400 hover:text-neutral-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 p-2 bg-neutral-50 dark:bg-neutral-950/40 rounded-2xl">
              {chatMessages.length === 0 ? (
                <div className="p-8 text-center text-xs text-neutral-400">
                  Invitation accepted. Start your interview discussion with the candidate here!
                </div>
              ) : (
                chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-2xl text-xs max-w-[80%] ${
                      msg.sender_role === 'company_hr'
                        ? 'ml-auto bg-emerald-600 text-white'
                        : 'mr-auto bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.message}</p>
                    <span className="text-[9px] opacity-75 block text-right mt-1">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleSendChatMessage} className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type interview instructions or response..."
                className="flex-1 p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
              />
              <Button type="submit" size="sm" disabled={sendingChatMessage || !chatInput.trim()} className="bg-emerald-600 text-white font-bold">
                <Send className="w-3.5 h-3.5 mr-1" /> Send
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
