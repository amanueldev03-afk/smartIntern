import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { 
  Building, 
  Users, 
  Cpu, 
  Plus, 
  CheckCircle2, 
  Calendar, 
  Loader2, 
  UserCheck, 
  FileCheck, 
  QrCode, 
  School, 
  Check, 
  X,
  Search,
  GraduationCap,
  Send,
  Edit3,
  Trash2,
  Eye,
  EyeOff,
  MessageSquare,
  ArrowLeft,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Award,
  Phone,
  Mail,
  Sparkles,
  Info
} from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { useAppSelector } from '@/hooks/redux'
import NotificationBell from '@/components/common/NotificationBell'

interface InHouseCohort {
  id: string
  title?: string
  department?: string
  university_name: string
  academic_year: string
  start_date: string
  end_date: string
  capacity_k: number
  enrolled_count: number
  is_open: boolean
  requirements?: string
  opportunities?: string
  min_gpa?: number
  student_count: number
  teams_count: number
}

interface VerifiedStudent {
  id: string
  student_id_number: string
  full_name: string
  email: string
  phone?: string
  bio?: string
  department: string
  campus_city?: string
  university?: string
  academic_year: string
  gpa?: string | null
  github_url?: string
  linkedin_url?: string
  skills?: string[]
  interests?: string[]
  invited_cohort_ids?: string[]
  accepted_cohort_ids?: string[]
  is_verified_by_dean: boolean
  dean_verified_at?: string
  forwarded_to_uil?: boolean
}

interface FormulatedTeam {
  id: string
  team_name: string
  project_title: string
  members: any[]
}

interface PendingAdvisor {
  id: number
  email: string
  first_name: string
  last_name: string
  full_name: string
  department?: string
  university_name?: string
  created_at: string
}

interface Track1Team {
  id: string
  team_name: string
  project_title: string
  advisor_name?: string
  srs_status: string
  documentation_deadline?: string
  implementation_deadline?: string
  documentation_submission?: string
  implementation_submission?: string
  advisor_rating?: number
  advisor_score?: number
  advisor_notes?: string
  uil_score?: number
  is_uil_sealed?: boolean
  uil_qr_code?: string
}

export default function UILOfficerDashboard() {
  const user = useAppSelector((state) => state.auth.user)
  const [showVerifiedAlert, setShowVerifiedAlert] = useState(true)
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get('tab') as 'cohorts' | 'balancer' | 'advisors' | 'sealing') || 'cohorts'
  const setActiveTab = (tab: 'cohorts' | 'balancer' | 'advisors' | 'sealing') => {
    setSearchParams({ tab })
  }
  const [cohorts, setCohorts] = useState<InHouseCohort[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [balancingCohortId, setBalancingCohortId] = useState<string | null>(null)
  const [balancedTeams, setBalancedTeams] = useState<FormulatedTeam[]>([])
  const [squadSize, setSquadSize] = useState(5)
  const [selectedCohortId, setSelectedCohortId] = useState<string>('')

  // Advisor Approvals
  const [pendingAdvisors, setPendingAdvisors] = useState<PendingAdvisor[]>([])
  const [isLoadingAdvisors, setIsLoadingAdvisors] = useState(false)
  const [approvingAdvisorId, setApprovingAdvisorId] = useState<number | null>(null)

  // Teams & Sealing
  const [teams, setTeams] = useState<Track1Team[]>([])
  const [sealingTeam, setSealingTeam] = useState<Track1Team | null>(null)
  const [uilScoreInput, setUilScoreInput] = useState(88)
  const [uilNotesInput, setUilNotesInput] = useState('Excellent full-stack architecture, comprehensive tests and clean implementation.')
  const [qrModalSeal, setQrModalSeal] = useState<{ title: string; qrBase64: string } | null>(null)

  // Create Cohort Modal
  const [isCohortModalOpen, setIsCohortModalOpen] = useState(false)
  const [creatingCohort, setCreatingCohort] = useState(false)
  const [newCohort, setNewCohort] = useState({
    title: 'AAU Software Engineering In-House Track 1',
    university_name: 'Addis Ababa University',
    department: 'Software Engineering',
    academic_year: '2023/2024',
    start_date: '2026-10-01',
    end_date: '2027-01-31',
    capacity_k: 50,
    requirements: 'Completed Year 3 or 4 in Software Engineering or related discipline. Department Dean clearance verified.',
    opportunities: 'Enterprise software architecture, code reviews, deployment, agile sprints, and on-campus food/housing logistics stipend.',
    min_gpa: 2.5,
  })

  // Dean-Verified Students Selection & Invitations
  const [verifiedStudents, setVerifiedStudents] = useState<VerifiedStudent[]>([])
  const [isLoadingStudents, setIsLoadingStudents] = useState(false)
  const [selectedCohortForInvite, setSelectedCohortForInvite] = useState<string>('')
  const [invitingStudentId, setInvitingStudentId] = useState<string | null>(null)
  const [studentSearch, setStudentSearch] = useState('')
  const [inspectingStudent, setInspectingStudent] = useState<VerifiedStudent | null>(null)

  // Cohort Hiding (local view only)
  const [hiddenCohortIds, setHiddenCohortIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('uil_hidden_cohorts') || '[]')
    } catch {
      return []
    }
  })
  const [showHiddenCohorts, setShowHiddenCohorts] = useState(false)

  const handleToggleHideCohort = (cohortId: string) => {
    let updated: string[]
    if (hiddenCohortIds.includes(cohortId)) {
      updated = hiddenCohortIds.filter((id) => id !== cohortId)
    } else {
      updated = [...hiddenCohortIds, cohortId]
    }
    setHiddenCohortIds(updated)
    try {
      localStorage.setItem('uil_hidden_cohorts', JSON.stringify(updated))
    } catch {}
  }

  // Cohort Editing
  const [editingCohort, setEditingCohort] = useState<InHouseCohort | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editFormData, setEditFormData] = useState<any>({})

  const handleOpenEditCohort = (cohort: InHouseCohort) => {
    setEditingCohort(cohort)
    setEditFormData({
      title: cohort.title || '',
      university_name: cohort.university_name,
      department: cohort.department || '',
      academic_year: cohort.academic_year,
      start_date: cohort.start_date,
      end_date: cohort.end_date,
      capacity_k: cohort.capacity_k,
      requirements: cohort.requirements || '',
      opportunities: cohort.opportunities || '',
      min_gpa: cohort.min_gpa || 2.5,
    })
    setIsEditModalOpen(true)
  }

  const handleSaveEditCohort = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingCohort) return
    setSavingEdit(true)
    try {
      const res = await api.patch(`/v1/projects/cohorts/${editingCohort.id}/`, editFormData)
      alert('Cohort updated successfully!')
      setCohorts((prev) => prev.map((c) => (c.id === editingCohort.id ? res.data : c)))
      setIsEditModalOpen(false)
      setEditingCohort(null)
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to update cohort.')
    } finally {
      setSavingEdit(false)
    }
  }

  // Cohort Deleting
  const [deletingCohortId, setDeletingCohortId] = useState<string | null>(null)
  const handleDeleteCohort = async (cohortId: string) => {
    if (!confirm('Are you sure you want to permanently delete this cohort? This cannot be undone.')) return
    setDeletingCohortId(cohortId)
    try {
      await api.delete(`/v1/projects/cohorts/${cohortId}/`)
      alert('Cohort deleted successfully.')
      setCohorts((prev) => prev.filter((c) => c.id !== cohortId))
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to delete cohort.')
    } finally {
      setDeletingCohortId(null)
    }
  }

  // Direct UIL-Student Chat Modal & Trigger State
  const [isChatAppOpen, setIsChatAppOpen] = useState(false)
  const [chatStudent, setChatStudent] = useState<VerifiedStudent | null>(null)
  const [chatMessages, setChatMessages] = useState<any[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [chatSearchQuery, setChatSearchQuery] = useState('')
  const [totalUnreadCount, setTotalUnreadCount] = useState(0)
  const [unreadByStudent, setUnreadByStudent] = useState<Record<string, number>>({})
  const [incomingMessageAlert, setIncomingMessageAlert] = useState<{
    student: VerifiedStudent
    message: string
  } | null>(null)
  const prevUnreadRef = useRef<number>(0)
  const chatMessagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToChatBottom = () => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToChatBottom()
  }, [chatMessages])

  const fetchUnreadCounts = async () => {
    try {
      const res = await api.get('/v1/uil-profiles/uil/chat/unread-count/')
      if (res.data) {
        const count = res.data.total_unread || 0
        const byStu = res.data.by_student || {}
        setTotalUnreadCount(count)
        setUnreadByStudent(byStu)

        if (count > prevUnreadRef.current && prevUnreadRef.current !== 0) {
          const studentWithUnread = verifiedStudents.find((s) => (byStu[s.id] || 0) > 0)
          if (studentWithUnread && (!isChatAppOpen || chatStudent?.id !== studentWithUnread.id)) {
            setIncomingMessageAlert({
              student: studentWithUnread,
              message: 'Sent an inquiry regarding cohort placement or logistics.',
            })
          }
        }
        prevUnreadRef.current = count
      }
    } catch {
      // silent
    }
  }

  useEffect(() => {
    fetchUnreadCounts()
    const interval = setInterval(fetchUnreadCounts, 5000)
    return () => clearInterval(interval)
  }, [verifiedStudents, isChatAppOpen, chatStudent])

  const fetchChatMessages = async (studentId: string) => {
    try {
      const res = await api.get(`/v1/uil-profiles/uil/chat/${studentId}/?mark_read=true`)
      setChatMessages(res.data?.messages || [])
      fetchUnreadCounts()
    } catch {
      // silent
    }
  }

  useEffect(() => {
    if (!chatStudent || !isChatAppOpen) return
    setChatLoading(true)
    fetchChatMessages(chatStudent.id).finally(() => setChatLoading(false))
    const interval = setInterval(() => {
      fetchChatMessages(chatStudent.id)
    }, 4000)
    return () => clearInterval(interval)
  }, [chatStudent, isChatAppOpen])

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatStudent || !chatInput.trim() || sendingMessage) return
    setSendingMessage(true)
    try {
      const res = await api.post(`/v1/uil-profiles/uil/chat/${chatStudent.id}/send/`, {
        message: chatInput.trim(),
      })
      if (res.data) {
        setChatMessages((prev) => [...prev, res.data])
      }
      setChatInput('')
      fetchUnreadCounts()
    } catch {
      // silent
    } finally {
      setSendingMessage(false)
    }
  }

  useEffect(() => {
    const handleNotificationAction = (event: Event) => {
      const customEvent = event as CustomEvent<any>
      const notif = customEvent.detail
      if (!notif) return

      if (notif.notification_type === 'COHORT' || notif.link?.includes('tab=cohorts')) {
        setActiveTab('cohorts')
        fetchCohorts()
        fetchVerifiedStudents()
      } else if (notif.notification_type === 'CHAT' || (notif.link && notif.link.includes('chat=true'))) {
        setActiveTab('cohorts')
        let matchedStudent: VerifiedStudent | undefined
        if (notif.link) {
          const urlParams = new URLSearchParams(notif.link.split('?')[1] || '')
          const studentId = urlParams.get('student')
          if (studentId && verifiedStudents.length > 0) {
            matchedStudent = verifiedStudents.find((s) => s.id === studentId)
          }
        }
        if (matchedStudent) {
          setChatStudent(matchedStudent)
        }
        setIsChatAppOpen(true)
      }
    }

    window.addEventListener('smartintern:notification-action', handleNotificationAction)
    return () => {
      window.removeEventListener('smartintern:notification-action', handleNotificationAction)
    }
  }, [verifiedStudents])

  useEffect(() => {
    fetchCohorts()
    fetchPendingAdvisors()
    fetchTeams()
    fetchVerifiedStudents()
  }, [])

  const fetchCohorts = async () => {
    setIsLoading(true)
    try {
      const res = await api.get('/v1/projects/cohorts/')
      const data = res.data
      const list = Array.isArray(data) ? data : data.results || []
      setCohorts(list)
      if (list.length > 0) {
        setSelectedCohortId((prev) => prev || list[0].id)
        setSelectedCohortForInvite((prev) => prev || list[0].id)
      }
    } catch {
      // silent
    } finally {
      setIsLoading(false)
    }
  }

  const fetchVerifiedStudents = async () => {
    setIsLoadingStudents(true)
    try {
      const res = await api.get('/v1/projects/cohorts/verified-students/')
      const data = res.data
      setVerifiedStudents(Array.isArray(data.students) ? data.students : [])
    } catch {
      // silent
    } finally {
      setIsLoadingStudents(false)
    }
  }

  const handleInviteStudent = async (studentId: string) => {
    const targetCohortId = selectedCohortForInvite || selectedCohortId || (cohorts[0] ? cohorts[0].id : '')
    if (!targetCohortId) {
      alert('Please select a target cohort first.')
      return
    }
    setInvitingStudentId(studentId)
    try {
      const res = await api.post(`/v1/projects/cohorts/${targetCohortId}/invite-student/`, {
        student_id: studentId,
      })
      alert(res.data.message || 'Student invited to cohort successfully!')
      setVerifiedStudents((prev) =>
        prev.map((s) =>
          s.id === studentId
            ? {
                ...s,
                invited_cohort_ids: Array.from(new Set([...(s.invited_cohort_ids || []), targetCohortId])),
              }
            : s
        )
      )
      if (inspectingStudent && inspectingStudent.id === studentId) {
        setInspectingStudent((prev) =>
          prev
            ? {
                ...prev,
                invited_cohort_ids: Array.from(new Set([...(prev.invited_cohort_ids || []), targetCohortId])),
              }
            : null
        )
      }
      fetchCohorts()
    } catch (err: any) {
      alert(err?.response?.data?.detail || err?.response?.data?.error || 'Failed to invite student to cohort.')
    } finally {
      setInvitingStudentId(null)
    }
  }

  const fetchPendingAdvisors = async () => {
    setIsLoadingAdvisors(true)
    try {
      const res = await api.get('/v1/auth/uil/pending-advisors/')
      setPendingAdvisors(Array.isArray(res.data) ? res.data : [])
    } catch {
      // silent
    } finally {
      setIsLoadingAdvisors(false)
    }
  }

  const fetchTeams = async () => {
    try {
      const res = await api.get('/v1/teams/')
      setTeams(Array.isArray(res.data) ? res.data : res.data.results || [])
    } catch {
      // silent
    }
  }

  const handleApproveAdvisor = async (advisorId: number) => {
    setApprovingAdvisorId(advisorId)
    try {
      await api.post(`/v1/auth/uil/approve-advisor/${advisorId}/`)
      alert('Academic Advisor approved successfully! Login access unlocked.')
      setPendingAdvisors((prev) => prev.filter((a) => a.id !== advisorId))
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Approval failed.')
    } finally {
      setApprovingAdvisorId(null)
    }
  }

  const handleCreateCohort = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreatingCohort(true)
    try {
      const res = await api.post('/v1/projects/cohorts/', newCohort)
      setCohorts((prev) => [res.data, ...prev])
      setIsCohortModalOpen(false)
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to create cohort')
    } finally {
      setCreatingCohort(false)
    }
  }

  const handleTriggerBalancer = async (cohortId: string) => {
    setBalancingCohortId(cohortId)
    setBalancedTeams([])
    try {
      const res = await api.post(`/v1/projects/cohorts/${cohortId}/balance/`, {
        squad_size: squadSize,
      })
      setBalancedTeams(Array.isArray(res.data) ? res.data : [])
      fetchCohorts()
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Squad formulation failed')
    } finally {
      setBalancingCohortId(null)
    }
  }

  // Review SRS documentation starting implementation countdown timer
  const handleReviewDoc = async (teamId: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      await api.post(`/v1/teams/${teamId}/review-documentation/`, {
        status,
        feedback: status === 'APPROVED' ? 'SRS documentation meets high software engineering standards. Coding unlocked.' : 'Please revise SRS architecture.',
        implementation_deadline_days: 14,
      })
      alert(`Documentation ${status}! Implementation countdown timer started.`)
      fetchTeams()
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Review failed.')
    }
  }

  // UIL Seal Score Sheet
  const handleSealScoreSheet = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sealingTeam) return
    try {
      const res = await api.post(`/v1/teams/${sealingTeam.id}/uil-score-seal/`, {
        uil_score: uilScoreInput,
        uil_notes: uilNotesInput,
      })
      alert('Score sheet cryptographically sealed with UIL Base64 QR code!')
      setQrModalSeal({
        title: `UIL Official Seal QR - Squad ${sealingTeam.team_name}`,
        qrBase64: res.data.uil_qr_code,
      })
      setSealingTeam(null)
      fetchTeams()
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Score sealing failed.')
    }
  }

  const visibleCohorts = cohorts.filter((c) => showHiddenCohorts || !hiddenCohortIds.includes(c.id))
  const totalCapacity = cohorts.reduce((acc, c) => acc + (c.capacity_k || 0), 0)
  const totalEnrolled = cohorts.reduce((acc, c) => acc + (c.enrolled_count || 0), 0)

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-[#0c0c0e] py-8 px-4 sm:px-6 lg:px-8 animate-fade-in">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-300 mb-2">
              <Building className="w-3.5 h-3.5" />
              University-Industry Linkage (UIL) Portal
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white tracking-tight">
              Track 1 Cohort Capacity, Squad Balancer & Sealing Gate
            </h1>
            <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-1">
              Configure software house cohorts, formulate balanced squads, approve Academic Advisors, and cryptographically seal final score sheets.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <NotificationBell
              onNotificationClick={(notif) => {
                if (notif.notification_type === 'COHORT' || notif.link?.includes('tab=cohorts')) {
                  setActiveTab('cohorts')
                  fetchCohorts()
                  fetchVerifiedStudents()
                } else if (notif.notification_type === 'CHAT' || (notif.link && notif.link.includes('chat=true'))) {
                  if (notif.link) {
                    const urlParams = new URLSearchParams(notif.link.split('?')[1] || '')
                    const studentId = urlParams.get('student')
                    if (studentId && verifiedStudents.length > 0) {
                      const matched = verifiedStudents.find((s) => s.id === studentId)
                      if (matched) setChatStudent(matched)
                    }
                  }
                  setIsChatAppOpen(true)
                }
              }}
            />
            <Button onClick={() => setIsCohortModalOpen(true)} className="text-xs font-bold shadow-glow">
              <Plus className="w-4 h-4 mr-1.5" /> Create Cohort
            </Button>
            <Button onClick={() => { fetchCohorts(); fetchPendingAdvisors(); fetchTeams(); }} disabled={isLoading} variant="outline" className="text-xs">
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
              Refresh
            </Button>
          </div>
        </div>

        {/* Verified by Admin Official Banner */}
        {showVerifiedAlert && (user?.is_approved ?? true) && (
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
                  Your credentials as UIL Head Officer {user?.university_name ? `at ${user.university_name}` : ''} have been officially verified and approved. You have full operational authority to balance squads, oversee cohorts, and seal Track 1 score sheets.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowVerifiedAlert(false)}
              className="p-1 rounded-lg hover:bg-emerald-200/50 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="card-gradient p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-500">Cohort Capacity (K)</span>
              <Users className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="mt-2 text-2xl font-black text-neutral-900 dark:text-white">{totalCapacity}</div>
            <div className="mt-1 text-[11px] text-neutral-400">Target cohort seats</div>
          </div>

          <div className="card-gradient p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-500">Enrolled Students</span>
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            </div>
            <div className="mt-2 text-2xl font-black text-neutral-900 dark:text-white">{totalEnrolled}</div>
            <div className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">Accepted into Track 1</div>
          </div>

          <div className="card-gradient p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-500">Pending Advisors</span>
              <School className="w-5 h-5 text-amber-500" />
            </div>
            <div className="mt-2 text-2xl font-black text-neutral-900 dark:text-white">{pendingAdvisors.length}</div>
            <div className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">Awaiting UIL approval</div>
          </div>

          <div className="card-gradient p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-500">Active Squads</span>
              <Calendar className="w-5 h-5 text-primary-500" />
            </div>
            <div className="mt-2 text-2xl font-black text-neutral-900 dark:text-white">{teams.length}</div>
            <div className="mt-1 text-[11px] text-neutral-400">Software house projects</div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-neutral-200/80 dark:border-neutral-800 pb-2">
          <button
            onClick={() => setActiveTab('cohorts')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'cohorts'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            In-House Cohorts ({cohorts.length})
          </button>
          <button
            onClick={() => setActiveTab('balancer')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'balancer'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            Squad Balancer
          </button>
          <button
            onClick={() => setActiveTab('advisors')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'advisors'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            Advisor Approvals ({pendingAdvisors.length})
          </button>
          <button
            onClick={() => setActiveTab('sealing')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'sealing'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <FileCheck className="w-3.5 h-3.5" />
            Documentation Gate & QR Score Sealing ({teams.length})
          </button>
        </div>

        {/* TAB 1: COHORTS GRID & VERIFIED STUDENT SELECTION */}
        {activeTab === 'cohorts' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                  Active In-House Track 1 Cohorts ({cohorts.length})
                </h3>
                <p className="text-xs text-neutral-500">
                  Manage software house capacity, configure cohort requirements, or edit & archive visibility.
                </p>
              </div>
              {hiddenCohortIds.length > 0 && (
                <button
                  onClick={() => setShowHiddenCohorts(!showHiddenCohorts)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 inline-flex items-center gap-1.5 transition-colors"
                >
                  {showHiddenCohorts ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showHiddenCohorts ? 'Hide Dismissed' : `Show Hidden (${hiddenCohortIds.length})`}
                </button>
              )}
            </div>

            {visibleCohorts.length === 0 ? (
              <div className="p-8 text-center bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 text-xs text-neutral-500">
                {cohorts.length === 0
                  ? 'No in-house cohorts created yet. Click "Create Cohort" to establish a Track 1 cohort.'
                  : 'All cohorts are currently hidden from this dashboard. Click "Show Hidden" above to view them.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {visibleCohorts.map((cohort) => {
                  const isHidden = hiddenCohortIds.includes(cohort.id)
                  return (
                    <div
                      key={cohort.id}
                      className={`p-5 rounded-2xl bg-white dark:bg-neutral-900 border shadow-soft space-y-4 transition-all ${
                        isHidden
                          ? 'border-dashed border-amber-300 dark:border-amber-800/60 bg-amber-50/20 dark:bg-amber-950/10 opacity-75'
                          : 'border-neutral-200/80 dark:border-neutral-800'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                              Year {cohort.academic_year}
                            </span>
                            {cohort.department && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                                {cohort.department}
                              </span>
                            )}
                            {isHidden && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400">
                                Hidden Locally
                              </span>
                            )}
                          </div>
                          <h3 className="text-base font-bold text-neutral-900 dark:text-white mt-0.5">
                            {cohort.title || cohort.university_name}
                          </h3>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">
                            {cohort.university_name} • {cohort.start_date} to {cohort.end_date}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {/* Edit button */}
                          <button
                            onClick={() => handleOpenEditCohort(cohort)}
                            title="Edit Cohort"
                            className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {/* Close / Hide toggle */}
                          <button
                            onClick={() => handleToggleHideCohort(cohort.id)}
                            title={isHidden ? 'Unhide from this Dashboard' : 'Hide from this Dashboard'}
                            className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors"
                          >
                            {isHidden ? <Eye className="w-3.5 h-3.5 text-amber-600" /> : <EyeOff className="w-3.5 h-3.5" />}
                          </button>
                          {/* Delete button */}
                          <button
                            onClick={() => handleDeleteCohort(cohort.id)}
                            disabled={deletingCohortId === cohort.id}
                            title="Permanently Delete Cohort"
                            className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 transition-colors disabled:opacity-50"
                          >
                            {deletingCohortId === cohort.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-xs">
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300">
                          Capacity: {cohort.capacity_k}
                        </span>
                        {cohort.min_gpa && (
                          <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                            Min GPA: {cohort.min_gpa}
                          </div>
                        )}
                      </div>

                      {cohort.requirements && (
                        <div className="text-xs text-neutral-600 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-800/60 p-2.5 rounded-xl border border-neutral-100 dark:border-neutral-800">
                          <span className="font-bold text-neutral-700 dark:text-neutral-200">Requirements: </span>
                          {cohort.requirements}
                        </div>
                      )}

                      {cohort.opportunities && (
                        <div className="text-xs text-neutral-600 dark:text-neutral-300 bg-indigo-50/50 dark:bg-indigo-950/30 p-2.5 rounded-xl border border-indigo-100 dark:border-indigo-900/40">
                          <span className="font-bold text-indigo-700 dark:text-indigo-300">Opportunities: </span>
                          {cohort.opportunities}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2 text-xs py-2 border-y border-neutral-100 dark:border-neutral-800/80">
                        <div>
                          <span className="text-neutral-400">Accepted Students:</span>{' '}
                          <span className="font-bold text-neutral-900 dark:text-white">
                            {cohort.enrolled_count || cohort.student_count || 0}
                          </span>
                        </div>
                        <div>
                          <span className="text-neutral-400">Formed Squads:</span>{' '}
                          <span className="font-bold text-neutral-900 dark:text-white">
                            {cohort.teams_count || 0}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenEditCohort(cohort)}
                          className="text-xs font-bold"
                        >
                          <Edit3 className="w-3.5 h-3.5 mr-1" /> Edit Cohort
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedCohortId(cohort.id)
                            setActiveTab('balancer')
                          }}
                          className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                          <Cpu className="w-3.5 h-3.5 mr-1" /> Form Squads
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* DEAN-VERIFIED STUDENTS SELECTION & INVITATION TABLE */}
            <div className="p-6 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-soft space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600">
                      <GraduationCap className="w-4 h-4" />
                    </span>
                    <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                      Dean-Verified Students for Cohort Selection & Invitation
                    </h3>
                  </div>
                  <p className="text-xs text-neutral-500 mt-1">
                    Select Dean-approved 3rd and 4th-year engineering students with verified GPA and issue 1-click cohort invitations up to capacity K.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                    <input
                      type="text"
                      placeholder="Search students..."
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      className="pl-8 pr-3 py-1.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs w-48"
                    />
                  </div>

                  <select
                    value={selectedCohortForInvite}
                    onChange={(e) => setSelectedCohortForInvite(e.target.value)}
                    className="p-1.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs font-medium"
                  >
                    <option value="">-- Target Cohort ({cohorts.length}) --</option>
                    {cohorts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title || c.university_name} (Cap: {c.capacity_k})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {isLoadingStudents ? (
                <div className="py-8 text-center text-xs text-neutral-400 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> Loading Dean-verified candidates...
                </div>
              ) : verifiedStudents.length === 0 ? (
                <div className="py-8 text-center text-xs text-neutral-400 border border-dashed rounded-xl">
                  No Dean-verified students found yet. Once Department Deans verify students, they will appear here for cohort invitation.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-neutral-200 dark:border-neutral-800 text-neutral-400 font-bold uppercase text-[10px]">
                        <th className="py-2.5 px-3">Student Name & ID</th>
                        <th className="py-2.5 px-3">Department & Year</th>
                        <th className="py-2.5 px-3">GPA</th>
                        <th className="py-2.5 px-3">Dean Clearance</th>
                        <th className="py-2.5 px-3 text-right">Cohort Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                      {verifiedStudents
                        .filter((st) => {
                          const q = studentSearch.toLowerCase()
                          return (
                            st.full_name?.toLowerCase().includes(q) ||
                            st.student_id_number?.toLowerCase().includes(q) ||
                            st.department?.toLowerCase().includes(q)
                          )
                        })
                        .map((st) => {
                          const effectiveCohortId = selectedCohortForInvite || selectedCohortId || (cohorts.length > 0 ? cohorts[0].id : '')
                          const isEnrolled = effectiveCohortId ? (st.accepted_cohort_ids || []).includes(effectiveCohortId) : false
                          const isInvited = effectiveCohortId ? (st.invited_cohort_ids || []).includes(effectiveCohortId) : false
                          const studentUnread = unreadByStudent[st.id] || 0

                          return (
                            <tr key={st.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/40">
                              <td className="py-3 px-3">
                                <div className="font-bold text-neutral-900 dark:text-white flex items-center gap-1.5">
                                  {st.full_name || 'Student'}
                                </div>
                                <div className="text-[11px] text-neutral-400 font-mono">{st.student_id_number}</div>
                              </td>
                              <td className="py-3 px-3">
                                <div>{st.department}</div>
                                <div className="text-[11px] text-neutral-400">Year {st.academic_year}</div>
                              </td>
                              <td className="py-3 px-3">
                                {st.gpa ? (
                                  <span className="px-2 py-0.5 rounded-full font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                                    {st.gpa} / 4.00
                                  </span>
                                ) : (
                                  <span className="text-neutral-400">—</span>
                                )}
                              </td>
                              <td className="py-3 px-3">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Dean Verified
                                </span>
                              </td>
                              <td className="py-3 px-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {/* Inspect Profile Button */}
                                  <button
                                    onClick={() => setInspectingStudent(st)}
                                    className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 inline-flex items-center gap-1 transition-colors"
                                    title="Inspect detailed student portfolio"
                                  >
                                    <Info className="w-3.5 h-3.5 text-neutral-500" />
                                    Inspect
                                  </button>

                                  {/* Direct Chat Button */}
                                  <button
                                    onClick={() => {
                                      setChatStudent(st)
                                      setIsChatAppOpen(true)
                                    }}
                                    className="relative px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 inline-flex items-center gap-1 transition-colors"
                                    title="Open direct messaging thread"
                                  >
                                    <MessageSquare className="w-3.5 h-3.5" />
                                    Chat
                                    {studentUnread > 0 && (
                                      <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-rose-500 text-white leading-none">
                                        {studentUnread}
                                      </span>
                                    )}
                                  </button>

                                  {/* Invite / Invited / Enrolled Button */}
                                  {isEnrolled ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800">
                                      <CheckCircle2 className="w-3 h-3" /> Enrolled
                                    </span>
                                  ) : isInvited ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2.5 py-1 rounded-lg border border-amber-200 dark:border-amber-800 cursor-default">
                                      <Check className="w-3 h-3" /> Invited
                                    </span>
                                  ) : (
                                    <Button
                                      size="sm"
                                      disabled={invitingStudentId === st.id}
                                      onClick={() => handleInviteStudent(st.id)}
                                      className="text-xs h-7 bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                                    >
                                      {invitingStudentId === st.id ? (
                                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                      ) : (
                                        <Send className="w-3 h-3 mr-1" />
                                      )}
                                      Invite
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: SQUAD BALANCER */}
        {activeTab === 'balancer' && (
          <div className="space-y-6">
            <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 space-y-4 shadow-soft">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                Algorithmic Role Balancing (~2 Frontend, ~2 Backend, ~1 DevOps/QA)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Select Target Cohort
                  </label>
                  <select
                    value={selectedCohortId}
                    onChange={(e) => setSelectedCohortId(e.target.value)}
                    className="w-full p-2 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
                  >
                    {cohorts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.university_name} ({c.academic_year})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Squad Size
                  </label>
                  <input
                    type="number"
                    min="3"
                    max="8"
                    value={squadSize}
                    onChange={(e) => setSquadSize(Number(e.target.value))}
                    className="w-full p-2 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    disabled={!selectedCohortId || balancingCohortId === selectedCohortId}
                    onClick={() => selectedCohortId && handleTriggerBalancer(selectedCohortId)}
                    className="w-full text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white h-9"
                  >
                    {balancingCohortId === selectedCohortId ? 'Formulating...' : 'Run Balancer'}
                  </Button>
                </div>
              </div>
            </div>

            {balancedTeams.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {balancedTeams.map((team) => (
                  <div key={team.id} className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 space-y-2">
                    <span className="text-[10px] font-bold text-indigo-600 uppercase">Formulated Squad</span>
                    <h4 className="text-sm font-bold text-neutral-900 dark:text-white">{team.team_name}</h4>
                    <p className="text-xs text-neutral-500">Project: {team.project_title}</p>
                    <span className="text-xs text-emerald-600 font-bold block">Balanced & Saved</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: PENDING ADVISORS APPROVAL */}
        {activeTab === 'advisors' && (
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 overflow-hidden shadow-soft">
            <div className="p-4 border-b border-neutral-200/80 dark:border-neutral-800">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                Academic Advisors Pending UIL Approval Gate
              </h3>
              <p className="text-xs text-neutral-500">
                Institutional security requirement: Faculty Advisors cannot log in or manage squads until officially vetted by UIL Officer.
              </p>
            </div>

            {isLoadingAdvisors ? (
              <div className="p-8 text-center text-xs text-neutral-400">Loading pending advisors...</div>
            ) : pendingAdvisors.length === 0 ? (
              <div className="p-8 text-center text-xs text-neutral-500">
                No academic advisors currently awaiting approval. All advisors are active.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 dark:bg-neutral-800/50 text-[11px] font-bold text-neutral-400 uppercase">
                    <tr>
                      <th className="py-3 px-4">Faculty Advisor</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4">Department</th>
                      <th className="py-3 px-4">University</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {pendingAdvisors.map((adv) => (
                      <tr key={adv.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/40">
                        <td className="py-3 px-4 font-bold text-neutral-900 dark:text-white">
                          {adv.full_name || `${adv.first_name} ${adv.last_name}`}
                        </td>
                        <td className="py-3 px-4 font-mono text-neutral-600 dark:text-neutral-400">
                          {adv.email}
                        </td>
                        <td className="py-3 px-4 text-neutral-700 dark:text-neutral-300">
                          {adv.department || 'Computer Science & Engineering'}
                        </td>
                        <td className="py-3 px-4 text-neutral-700 dark:text-neutral-300">
                          {adv.university_name || 'Addis Ababa University'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            size="sm"
                            disabled={approvingAdvisorId === adv.id}
                            onClick={() => handleApproveAdvisor(adv.id)}
                            className="text-xs h-7 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                          >
                            {approvingAdvisorId === adv.id ? 'Approving...' : 'Approve Advisor'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: SQUAD DOCUMENTATION GATE & QR SCORE SEALING */}
        {activeTab === 'sealing' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-900 dark:text-indigo-200 flex items-center justify-between">
              <div>
                <span className="font-bold block">Documentation Gate & Cryptographic UIL Seal:</span>
                <span>Approving SRS unlocks the 14-day implementation countdown timer. Review Advisor ratings, input UIL score, and generate the HMAC-signed UIL QR Seal.</span>
              </div>
              <QrCode className="w-5 h-5 text-indigo-600" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {teams.length === 0 ? (
                <div className="col-span-2 p-12 text-center bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 text-xs text-neutral-500">
                  No project squads found.
                </div>
              ) : (
                teams.map((team) => (
                  <div
                    key={team.id}
                    className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 space-y-4 shadow-soft"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                          Squad Governance
                        </span>
                        <h4 className="text-base font-bold text-neutral-900 dark:text-white mt-0.5">
                          {team.team_name}
                        </h4>
                        <p className="text-xs text-neutral-500">Project: {team.project_title}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        team.is_uil_sealed ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-neutral-100 text-neutral-700'
                      }`}>
                        {team.is_uil_sealed ? 'UIL Sealed' : 'Unsealed'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs py-2 border-y border-neutral-100 dark:border-neutral-800">
                      <div>
                        <span className="text-neutral-400">SRS Status:</span>{' '}
                        <span className={`font-bold ${team.srs_status === 'APPROVED' ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {team.srs_status}
                        </span>
                      </div>
                      <div>
                        <span className="text-neutral-400">Advisor Rating:</span>{' '}
                        <span className="font-bold text-neutral-900 dark:text-white">
                          {team.advisor_rating ? `${team.advisor_rating}/5 Stars (${team.advisor_score}%)` : 'Pending'}
                        </span>
                      </div>
                      <div>
                        <span className="text-neutral-400">Documentation Timer:</span>{' '}
                        <span className="font-mono text-[11px] text-neutral-700 dark:text-neutral-300">
                          {team.documentation_deadline ? new Date(team.documentation_deadline).toLocaleDateString() : 'Active'}
                        </span>
                      </div>
                      <div>
                        <span className="text-neutral-400">Implementation Timer:</span>{' '}
                        <span className="font-mono text-[11px] text-neutral-700 dark:text-neutral-300">
                          {team.implementation_deadline ? new Date(team.implementation_deadline).toLocaleDateString() : 'Locked'}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {team.srs_status !== 'APPROVED' ? (
                        <Button
                          size="sm"
                          onClick={() => handleReviewDoc(team.id, 'APPROVED')}
                          className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                        >
                          <Check className="w-3.5 h-3.5 mr-1" /> Approve SRS & Start Coding Timer
                        </Button>
                      ) : (
                        <span className="text-emerald-600 font-bold text-xs flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Documentation Approved
                        </span>
                      )}

                      {!team.is_uil_sealed ? (
                        <Button
                          size="sm"
                          onClick={() => setSealingTeam(team)}
                          className="text-xs h-8 bg-indigo-600 hover:bg-indigo-700 text-white font-bold ml-auto"
                        >
                          <QrCode className="w-3.5 h-3.5 mr-1" /> Input Score & Seal Sheet
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setQrModalSeal({
                              title: `UIL QR Seal - ${team.team_name}`,
                              qrBase64: team.uil_qr_code!,
                            })
                          }
                          className="text-xs h-8 ml-auto"
                        >
                          <QrCode className="w-3.5 h-3.5 mr-1" /> View UIL QR Seal
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* CREATE COHORT MODAL */}
      {isCohortModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl max-w-lg w-full p-6 space-y-4 border border-neutral-200 dark:border-neutral-800 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-neutral-900 dark:text-white">
              Launch Track 1 In-House Cohort
            </h3>
            <form onSubmit={handleCreateCohort} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Cohort Title *
                </label>
                <input
                  required
                  type="text"
                  placeholder="e.g. AAU Software Engineering Track 1"
                  value={newCohort.title}
                  onChange={(e) => setNewCohort((p) => ({ ...p, title: e.target.value }))}
                  className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    University Name *
                  </label>
                  <input
                    required
                    type="text"
                    value={newCohort.university_name}
                    onChange={(e) => setNewCohort((p) => ({ ...p, university_name: e.target.value }))}
                    className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Target Department *
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. Software Engineering"
                    value={newCohort.department}
                    onChange={(e) => setNewCohort((p) => ({ ...p, department: e.target.value }))}
                    className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Academic Year *
                  </label>
                  <input
                    required
                    type="text"
                    value={newCohort.academic_year}
                    onChange={(e) => setNewCohort((p) => ({ ...p, academic_year: e.target.value }))}
                    className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Capacity (K) *
                  </label>
                  <input
                    required
                    type="number"
                    min="1"
                    value={newCohort.capacity_k}
                    onChange={(e) => setNewCohort((p) => ({ ...p, capacity_k: Number(e.target.value) }))}
                    className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Minimum GPA
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="4.00"
                    value={newCohort.min_gpa}
                    onChange={(e) => setNewCohort((p) => ({ ...p, min_gpa: Number(e.target.value) }))}
                    className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Start Date *
                  </label>
                  <input
                    required
                    type="date"
                    value={newCohort.start_date}
                    onChange={(e) => setNewCohort((p) => ({ ...p, start_date: e.target.value }))}
                    className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    End Date *
                  </label>
                  <input
                    required
                    type="date"
                    value={newCohort.end_date}
                    onChange={(e) => setNewCohort((p) => ({ ...p, end_date: e.target.value }))}
                    className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Cohort Requirements
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Completed Year 3 or 4 courses in Algorithms, Web, and Database Systems."
                  value={newCohort.requirements}
                  onChange={(e) => setNewCohort((p) => ({ ...p, requirements: e.target.value }))}
                  className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Opportunities Offered
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Production software engineering experience, CI/CD, university logistics stipend."
                  value={newCohort.opportunities}
                  onChange={(e) => setNewCohort((p) => ({ ...p, opportunities: e.target.value }))}
                  className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsCohortModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={creatingCohort} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                  {creatingCohort ? 'Creating...' : 'Establish Cohort'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* UIL SCORE SEAL MODAL */}
      {sealingTeam && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl max-w-md w-full p-6 space-y-4 border border-neutral-200 dark:border-neutral-800 shadow-xl">
            <h3 className="text-base font-bold text-neutral-900 dark:text-white">
              UIL Officer Final Score Sheet Seal
            </h3>
            <p className="text-xs text-neutral-500">
              Squad: <span className="font-bold">{sealingTeam.team_name}</span> • Advisor Score: {sealingTeam.advisor_score || 85}%
            </p>

            <form onSubmit={handleSealScoreSheet} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  UIL Institutional Score (out of 100) *
                </label>
                <input
                  required
                  type="number"
                  min="0"
                  max="100"
                  value={uilScoreInput}
                  onChange={(e) => setUilScoreInput(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Institutional Verification Notes
                </label>
                <textarea
                  rows={3}
                  value={uilNotesInput}
                  onChange={(e) => setUilNotesInput(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setSealingTeam(null)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                  Seal Sheet & Generate UIL QR
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR MODAL PREVIEW */}
      {qrModalSeal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl max-w-sm w-full p-6 space-y-4 border border-neutral-200 dark:border-neutral-800 shadow-xl text-center">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">{qrModalSeal.title}</h3>
              <button onClick={() => setQrModalSeal(null)} className="text-neutral-400 hover:text-neutral-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-white rounded-xl border border-neutral-200 inline-block mx-auto shadow-sm">
              <img
                src={qrModalSeal.qrBase64}
                alt="UIL QR Seal"
                className="w-48 h-48 object-contain mx-auto"
              />
            </div>
            <p className="text-xs text-neutral-500">
              Score sheet cryptographically locked with UIL signature.
            </p>
            <Button size="sm" onClick={() => setQrModalSeal(null)} className="w-full text-xs">
              Done
            </Button>
          </div>
        </div>
      )}

      {/* EDIT COHORT MODAL */}
      {isEditModalOpen && editingCohort && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl max-w-lg w-full p-6 space-y-4 border border-neutral-200 dark:border-neutral-800 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                  Edit Track 1 In-House Cohort
                </h3>
                <p className="text-xs text-neutral-500">Update capacity, dates, requirements, or opportunities.</p>
              </div>
              <button
                onClick={() => {
                  setIsEditModalOpen(false)
                  setEditingCohort(null)
                }}
                className="text-neutral-400 hover:text-neutral-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditCohort} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Cohort Title *
                </label>
                <input
                  type="text"
                  required
                  value={editFormData.title || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                  className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Academic Year *
                  </label>
                  <input
                    type="text"
                    required
                    value={editFormData.academic_year || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, academic_year: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    value={editFormData.department || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, department: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Capacity (K) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editFormData.capacity_k || 50}
                    onChange={(e) => setEditFormData({ ...editFormData, capacity_k: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Minimum GPA Cutoff
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="4.0"
                    value={editFormData.min_gpa || 2.5}
                    onChange={(e) => setEditFormData({ ...editFormData, min_gpa: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={editFormData.start_date || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, start_date: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    End Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={editFormData.end_date || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, end_date: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Requirements
                </label>
                <textarea
                  rows={2}
                  value={editFormData.requirements || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, requirements: e.target.value })}
                  className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Opportunities & Benefits
                </label>
                <textarea
                  rows={2}
                  value={editFormData.opportunities || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, opportunities: e.target.value })}
                  className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsEditModalOpen(false)
                    setEditingCohort(null)
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={savingEdit}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                >
                  {savingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                  Save Changes
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INSPECT STUDENT PROFILE MODAL */}
      {inspectingStudent && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl max-w-lg w-full p-6 space-y-4 border border-neutral-200 dark:border-neutral-800 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-black text-lg border border-indigo-200 dark:border-indigo-800">
                  {inspectingStudent.full_name?.charAt(0) || 'S'}
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                    {inspectingStudent.full_name || 'Student Candidate'}
                  </h3>
                  <div className="text-xs text-neutral-500 font-mono">
                    ID: {inspectingStudent.student_id_number || 'N/A'} • Year {inspectingStudent.academic_year || 'N/A'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setInspectingStudent(null)}
                className="text-neutral-400 hover:text-neutral-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* University & Department */}
            <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200/60 dark:border-neutral-800 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-neutral-400 block text-[10px] uppercase font-bold">Department</span>
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                  {inspectingStudent.department || 'Software Engineering'}
                </span>
              </div>
              <div>
                <span className="text-neutral-400 block text-[10px] uppercase font-bold">Cumulative GPA</span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400">
                  {inspectingStudent.gpa ? `${inspectingStudent.gpa} / 4.00` : 'Not recorded'}
                </span>
              </div>
              {inspectingStudent.university && (
                <div className="col-span-2">
                  <span className="text-neutral-400 block text-[10px] uppercase font-bold">University</span>
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">
                    {inspectingStudent.university}
                  </span>
                </div>
              )}
            </div>

            {/* Clearance status */}
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs">
              <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>Verified and cleared by Department Dean for Track 1 In-House software house internship.</span>
            </div>

            {/* Bio */}
            {inspectingStudent.bio && (
              <div>
                <h4 className="text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">Bio / Statement</h4>
                <p className="text-xs text-neutral-600 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-800/40 p-2.5 rounded-xl border border-neutral-200/60 dark:border-neutral-800">
                  {inspectingStudent.bio}
                </p>
              </div>
            )}

            {/* Technical Skills */}
            {inspectingStudent.skills && (
              <div>
                <h4 className="text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1.5 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-indigo-500" />
                  Engineering & Technical Skills
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {(Array.isArray(inspectingStudent.skills)
                    ? inspectingStudent.skills
                    : typeof inspectingStudent.skills === 'string'
                    ? (inspectingStudent.skills as string).split(',').map((s) => s.trim()).filter(Boolean)
                    : []
                  ).map((skill: string, idx: number) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Interests */}
            {inspectingStudent.interests && (
              <div>
                <h4 className="text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  Interests & Specializations
                </h4>
                <p className="text-xs text-neutral-600 dark:text-neutral-300">
                  {inspectingStudent.interests}
                </p>
              </div>
            )}

            {/* Contact & Social Links */}
            <div className="space-y-1.5 pt-1">
              <h4 className="text-xs font-bold text-neutral-700 dark:text-neutral-300">Contact & Portfolios</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {inspectingStudent.email && (
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200/60 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300">
                    <Mail className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                    <span className="truncate">{inspectingStudent.email}</span>
                  </div>
                )}
                {inspectingStudent.phone && (
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200/60 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300">
                    <Phone className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                    <span>{inspectingStudent.phone}</span>
                  </div>
                )}
                {inspectingStudent.github_url && (
                  <a
                    href={inspectingStudent.github_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 p-2 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200/60 dark:border-neutral-800 text-indigo-600 hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">GitHub Profile</span>
                  </a>
                )}
                {inspectingStudent.linkedin_url && (
                  <a
                    href={inspectingStudent.linkedin_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 p-2 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200/60 dark:border-neutral-800 text-indigo-600 hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">LinkedIn Profile</span>
                  </a>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-neutral-200 dark:border-neutral-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const target = inspectingStudent
                  setInspectingStudent(null)
                  setChatStudent(target)
                  setIsChatAppOpen(true)
                }}
                className="text-xs font-bold"
              >
                <MessageSquare className="w-3.5 h-3.5 mr-1 text-indigo-600" />
                Direct Chat
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInspectingStudent(null)}
                  className="text-xs"
                >
                  Close
                </Button>
                {(() => {
                  const targetCohortId = selectedCohortForInvite || selectedCohortId || (cohorts[0]?.id ?? '')
                  const isInvited = targetCohortId && inspectingStudent.invited_cohort_ids?.includes(targetCohortId)
                  const isEnrolled = targetCohortId && inspectingStudent.accepted_cohort_ids?.includes(targetCohortId)
                  if (isEnrolled) {
                    return (
                      <span className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-100 text-emerald-800 inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Enrolled
                      </span>
                    )
                  }
                  if (isInvited) {
                    return (
                      <span className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-100 text-amber-800 inline-flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Already Invited
                      </span>
                    )
                  }
                  return (
                    <Button
                      size="sm"
                      disabled={invitingStudentId === inspectingStudent.id}
                      onClick={() => handleInviteStudent(inspectingStudent.id)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
                    >
                      {invitingStudentId === inspectingStudent.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                      ) : (
                        <Send className="w-3.5 h-3.5 mr-1" />
                      )}
                      Invite to Cohort
                    </Button>
                  )
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DIRECT STUDENT-UIL CHAT APP MODAL */}
      {isChatAppOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl max-w-xl w-full h-[620px] flex flex-col border border-neutral-200 dark:border-neutral-800 shadow-2xl overflow-hidden animate-fade-in">
            {/* Header */}
            <div className="p-4 bg-gradient-to-r from-indigo-700 via-indigo-800 to-purple-800 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                {chatStudent && (
                  <button
                    onClick={() => setChatStudent(null)}
                    className="p-1 rounded-lg hover:bg-white/10 text-white transition-colors"
                    title="Back to students directory"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}
                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center text-white font-bold">
                  {chatStudent ? chatStudent.full_name?.charAt(0) || 'S' : <MessageSquare className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold leading-tight">
                    {chatStudent ? chatStudent.full_name : 'Direct Student Inquiries & Support'}
                  </h3>
                  <p className="text-[11px] text-indigo-200 leading-tight">
                    {chatStudent
                      ? `${chatStudent.department || 'Student'} • ID: ${chatStudent.student_id_number || 'N/A'}`
                      : 'Track 1 Candidate Communication Channel'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsChatAppOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            {!chatStudent ? (
              /* Directory View */
              <div className="flex-1 flex flex-col overflow-hidden bg-neutral-50 dark:bg-neutral-950">
                <div className="p-3 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                    <input
                      type="text"
                      placeholder="Search students by name, ID or department..."
                      value={chatSearchQuery}
                      onChange={(e) => setChatSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                  {verifiedStudents
                    .filter((st) => {
                      const q = chatSearchQuery.toLowerCase()
                      return (
                        st.full_name?.toLowerCase().includes(q) ||
                        st.student_id_number?.toLowerCase().includes(q) ||
                        st.department?.toLowerCase().includes(q)
                      )
                    })
                    .map((st) => {
                      const unread = unreadByStudent[st.id] || 0
                      return (
                        <div
                          key={st.id}
                          onClick={() => setChatStudent(st)}
                          className="p-3 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200/70 dark:border-neutral-800 hover:border-indigo-500/50 hover:shadow-sm cursor-pointer transition-all flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center text-xs">
                              {st.full_name?.charAt(0) || 'S'}
                            </div>
                            <div>
                              <div className="text-xs font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                                {st.full_name}
                                {unread > 0 && (
                                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-rose-500 text-white">
                                    {unread} new
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-neutral-400">
                                {st.department} • Year {st.academic_year}
                              </div>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-neutral-400" />
                        </div>
                      )
                    })}
                </div>
              </div>
            ) : (
              /* Conversation View */
              <div className="flex-1 flex flex-col overflow-hidden bg-neutral-50 dark:bg-neutral-950">
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {chatLoading ? (
                    <div className="flex items-center justify-center h-full text-xs text-neutral-400 gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> Loading conversation...
                    </div>
                  ) : chatMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-6 text-xs text-neutral-400">
                      <MessageSquare className="w-8 h-8 text-neutral-300 dark:text-neutral-700 mb-2" />
                      <p className="font-semibold text-neutral-600 dark:text-neutral-300">
                        No messages exchanged yet with {chatStudent.full_name}.
                      </p>
                      <p className="text-[11px] text-neutral-400 mt-1 max-w-xs">
                        Start the conversation regarding cohort acceptance, schedule, or prerequisites.
                      </p>
                    </div>
                  ) : (
                    chatMessages.map((msg) => {
                      const isUIL = msg.sender_role === 'UIL_OFFICER' || msg.sender_role === 'UIL' || msg.sender?.id === user?.id
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isUIL ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-xs shadow-xs ${
                              isUIL
                                ? 'bg-indigo-600 text-white rounded-br-none'
                                : 'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-800 dark:text-neutral-200 rounded-bl-none'
                            }`}
                          >
                            <p className="whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                          </div>
                          <span className="text-[9px] text-neutral-400 mt-0.5 px-1 font-mono">
                            {msg.sender_role === 'UIL_OFFICER' ? 'You (UIL)' : chatStudent.full_name} •{' '}
                            {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </div>
                      )
                    })
                  )}
                  <div ref={chatMessagesEndRef} />
                </div>

                {/* Input Bar */}
                <form
                  onSubmit={handleSendChatMessage}
                  className="p-3 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 flex items-center gap-2"
                >
                  <input
                    type="text"
                    placeholder={`Message ${chatStudent.full_name}...`}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={sendingMessage || !chatInput.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-8 px-3 text-xs"
                  >
                    {sendingMessage ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* INCOMING MESSAGE TOAST ALERT */}
      {incomingMessageAlert && (
        <div className="fixed bottom-24 right-6 z-50 p-4 rounded-2xl bg-indigo-900 text-white shadow-xl border border-indigo-700 max-w-sm flex items-start justify-between gap-3 animate-slide-up">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-700 flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4 text-indigo-200" />
            </div>
            <div>
              <div className="text-xs font-bold">New Message from {incomingMessageAlert.student.full_name}</div>
              <p className="text-[11px] text-indigo-200 mt-0.5">{incomingMessageAlert.message}</p>
              <button
                onClick={() => {
                  setChatStudent(incomingMessageAlert.student)
                  setIsChatAppOpen(true)
                  setIncomingMessageAlert(null)
                }}
                className="mt-2 text-[11px] font-bold text-amber-300 hover:underline inline-flex items-center gap-1"
              >
                Open Message Thread <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
          <button
            onClick={() => setIncomingMessageAlert(null)}
            className="p-1 text-indigo-300 hover:text-white rounded-lg"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* PERSISTENT FLOATING CHAT BUTTON */}
      <div className="fixed bottom-6 right-6 z-40">
        <button
          onClick={() => setIsChatAppOpen(true)}
          className="relative group flex items-center gap-2.5 px-4 py-3 rounded-full bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 text-white font-bold shadow-lg hover:shadow-indigo-500/30 hover:scale-105 active:scale-95 transition-all"
        >
          <div className="relative">
            <MessageSquare className="w-5 h-5" />
            {totalUnreadCount > 0 && (
              <span className="absolute -top-1.5 -right-2 px-1.5 py-0.2 rounded-full text-[10px] font-black bg-rose-500 text-white border-2 border-indigo-800 animate-pulse">
                {totalUnreadCount}
              </span>
            )}
          </div>
          <span className="text-xs tracking-wide">Student Chat</span>
        </button>
      </div>
    </div>
  )
}
