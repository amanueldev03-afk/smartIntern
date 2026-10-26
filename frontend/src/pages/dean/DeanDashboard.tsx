import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { 
  Award, 
  CheckCircle2, 
  Clock, 
  ShieldCheck, 
  Search, 
  Loader2, 
  Building,
  QrCode,
  FileSpreadsheet,
  Calendar,
  Sparkles,
  Check,
  X,
  Eye,
  Phone,
  Mail,
  PenTool,
  FileText,
  Send,
  AlertTriangle,
  Utensils,
  ArrowLeft,
  MessageSquare,
  LayoutDashboard,
  Printer,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Edit3
} from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { ensureBase64DataUri } from '@/utils/qrUtils'
import NotificationBell from '@/components/common/NotificationBell'
import { DeanVerificationAnalyticsChart } from '@/components/charts/DashboardCharts'
import { useAppSelector } from '@/hooks/redux'

interface Track1Student {
  id: string
  student_id_number: string
  full_name: string
  email: string
  phone?: string
  university_name?: string
  department: string
  campus_city: string
  academic_year: number
  gpa: string | null
  bio?: string
  skills?: string[]
  interests?: string[]
  github_url?: string
  linkedin_url?: string
  is_eligible: boolean
  eligibility_reason: string
  is_verified_by_dean: boolean
  dean_verified_at: string | null
  dean_signature_hash?: string
  dean_letter_title?: string
  dean_letter_notes?: string
  dean_allow_dorm?: boolean
  dean_allow_food?: boolean
  dean_allow_internship?: boolean
  dean_valid_from?: string | null
  dean_valid_until?: string | null
  dean_unique_qr?: string
  dean_letter_qr?: string
  dean_verification_letter_qr?: string
  dean_dorm_food_letter_qr?: string
  internship_letter_sent?: boolean
  internship_letter_sent_at?: string | null
  dorm_food_letter_title?: string
  dorm_food_letter_notes?: string
  dorm_food_letter_sent?: boolean
  dorm_food_letter_sent_at?: string | null
  score_letter_notes?: string
  score_letter_sent?: boolean
  score_letter_sent_at?: string | null
  score_roster_data?: {
    advisor_score?: number | string
    uil_score?: number | string
    doc_score?: number | string
    pres_score?: number | string
    defense_score?: number | string
    total_score?: number | string
    notes?: string
    remarks?: string
  }
  has_score_roster: boolean
  roster_download_url?: string
  forwarded_to_uil: boolean
  emergency_contact?: {
    contact_name: string
    relationship: string
    primary_phone: string
    insurance_policy_number?: string
  } | null
}

interface ChatMessage {
  id: string
  sender_id: string
  sender_name: string
  sender_role: string
  is_mine: boolean
  message: string
  created_at: string
}

interface SquadTeam {
  id: string
  team_name: string
  project_title: string
  cohort_name?: string
  advisor_name?: string
  srs_status: string
  is_coding_unlocked: boolean
  defense_date?: string
  defense_venue?: string
  defense_scheduled: boolean
  advisor_score?: number
  uil_score?: number
  documentation_score?: number
  presentation_score?: number
  composite_score?: number
  composite_grade?: string
  score_sheet_unsealed?: boolean
}

export default function DeanDashboard() {
  const user = useAppSelector((state) => state.auth.user)
  const [showDeanVerifiedAlert, setShowDeanVerifiedAlert] = useState(true)
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab') || 'overview'
  const activeTab: 'overview' | 'students' | 'defense' =
    rawTab === 'students' ? 'students' : rawTab === 'defense' ? 'defense' : 'overview'

  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved'>(
    rawTab === 'pending' ? 'pending' : rawTab === 'approved' ? 'approved' : 'all'
  )

  useEffect(() => {
    if (rawTab === 'pending' || rawTab === 'approved') {
      setStatusFilter(rawTab)
    } else if (rawTab === 'students' || rawTab === 'all') {
      setStatusFilter('all')
    }
  }, [rawTab])

  const setActiveTab = (tab: 'overview' | 'students' | 'defense') => {
    setSearchParams({ tab })
  }

  // Students list state
  const [students, setStudents] = useState<Track1Student[]>([])
  const [deanDepartment, setDeanDepartment] = useState<string>('')
  const [deanTitle, setDeanTitle] = useState<string>('')
  const [deanQrCode, setDeanQrCode] = useState<string>('')
  const [isLoadingStudents, setIsLoadingStudents] = useState(true)
  const [verifyingStudentId, setVerifyingStudentId] = useState<string | null>(null)
  const [searchStudent, setSearchStudent] = useState('')

  // Student Inspection Dossier Modal State
  const [inspectingStudent, setInspectingStudent] = useState<Track1Student | null>(null)

  // Direct Dean-Student Chat Modal & Trigger State
  const [isChatAppOpen, setIsChatAppOpen] = useState(false)
  const [chatStudent, setChatStudent] = useState<Track1Student | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [chatSearchQuery, setChatSearchQuery] = useState('')
  const [totalUnreadCount, setTotalUnreadCount] = useState(0)
  const [unreadByStudent, setUnreadByStudent] = useState<Record<string, number>>({})
  const [incomingMessageAlert, setIncomingMessageAlert] = useState<{
    student: Track1Student
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
      const res = await api.get('/v1/uil-profiles/dean/chat/unread-count/')
      if (res.data) {
        const count = res.data.total_unread || 0
        const byStu = res.data.by_student || {}
        setTotalUnreadCount(count)
        setUnreadByStudent(byStu)

        if (count > prevUnreadRef.current && prevUnreadRef.current !== 0) {
          const studentWithUnread = students.find((s) => (byStu[s.id] || 0) > 0)
          if (studentWithUnread && (!isChatAppOpen || chatStudent?.id !== studentWithUnread.id)) {
            setIncomingMessageAlert({
              student: studentWithUnread,
              message: 'Sent an inquiry regarding clearance or track requirements.',
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
  }, [students, isChatAppOpen, chatStudent])

  const fetchChatMessages = async (studentId: string) => {
    try {
      const res = await api.get(`/v1/uil-profiles/dean/chat/${studentId}/?mark_read=true`)
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
      const res = await api.post(`/v1/uil-profiles/dean/chat/${chatStudent.id}/send/`, {
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

  // Direct redirection and modal opening from notification clicks or query params
  useEffect(() => {
    const inspectParam = searchParams.get('inspect')
    const studentParam = searchParams.get('student')
    const chatParam = searchParams.get('chat')

    if (inspectParam && students.length > 0) {
      const match = students.find(
        (s) => s.id === inspectParam || String(s.student_id_number) === inspectParam
      )
      if (match) setInspectingStudent(match)
    }

    if (chatParam === 'true' && studentParam && students.length > 0) {
      const match = students.find(
        (s) => s.id === studentParam || String(s.student_id_number) === studentParam
      )
      if (match && match.is_verified_by_dean) {
        setActiveTab('students')
        setChatStudent(match)
        setIsChatAppOpen(true)
      }
    }
  }, [searchParams, students])

  useEffect(() => {
    const handleNotificationAction = (event: Event) => {
      const customEvent = event as CustomEvent<any>
      const notif = customEvent.detail
      if (!notif) return

      let matchedStudent: Track1Student | undefined
      if (notif.link) {
        const urlParams = new URLSearchParams(notif.link.split('?')[1] || '')
        const studentId = urlParams.get('student')
        if (studentId && students.length > 0) {
          matchedStudent = students.find(
            (s) => s.id === studentId || String(s.student_id_number) === studentId
          )
        }
      }

      if (!matchedStudent && notif.actor_name && students.length > 0) {
        matchedStudent = students.find((s) =>
          s.full_name.toLowerCase().includes(notif.actor_name.toLowerCase())
        )
      }

      if (notif.notification_type === 'CHAT' || (notif.link && notif.link.includes('chat=true'))) {
        setActiveTab('students')
        if (matchedStudent && matchedStudent.is_verified_by_dean) {
          setChatStudent(matchedStudent)
        }
        setIsChatAppOpen(true)
      } else if (
        notif.notification_type === 'CLEARANCE_LETTER' ||
        notif.notification_type === 'VERIFICATION' ||
        notif.notification_type === 'LOGISTICS'
      ) {
        setActiveTab('students')
        if (matchedStudent) {
          setInspectingStudent(matchedStudent)
        }
      } else if (notif.notification_type === 'DEFENSE') {
        setActiveTab('defense')
      }
    }

    window.addEventListener('smartintern:notification-action', handleNotificationAction)
    return () => {
      window.removeEventListener('smartintern:notification-action', handleNotificationAction)
    }
  }, [students])

  // Teams & Grading state
  const [teams, setTeams] = useState<SquadTeam[]>([])
  const [schedulingTeam, setSchedulingTeam] = useState<SquadTeam | null>(null)
  const [defenseDate, setDefenseDate] = useState('')
  const [defenseVenue, setDefenseVenue] = useState('Conference Hall B, AAU Campus')
  const [gradingTeam, setGradingTeam] = useState<SquadTeam | null>(null)
  const [gradeInputs, setGradeInputs] = useState({
    advisor_score: 85,
    uil_score: 90,
    documentation_score: 88,
    presentation_score: 92,
  })
  const [actionLoading, setActionLoading] = useState(false)

  const fetchStudents = async () => {
    setIsLoadingStudents(true)
    try {
      const res = await api.get('/v1/uil-profiles/dean/students/')
      const data = res.data
      setStudents(data.students || [])
      setDeanDepartment(data.dean_department || '')
      if (data.dean_title) setDeanTitle(data.dean_title)
      if (data.dean_qr_code) setDeanQrCode(data.dean_qr_code)
    } catch {
      // silent
    } finally {
      setIsLoadingStudents(false)
    }
  }


  const fetchTeams = async () => {
    try {
      const res = await api.get('/v1/projects/dean/squads/')
      setTeams(res.data.squads || [])
    } catch {
      // silent
    }
  }

  useEffect(() => {
    fetchStudents()
    fetchTeams()
  }, [])

  // Clearance Letter Modal State & Alerts
  const [letterModalStudent, setLetterModalStudent] = useState<Track1Student | null>(null)
  const [selectedLetterTab, setSelectedLetterTab] = useState<'internship' | 'dorm_food' | 'score'>('internship')
  const [letterForm, setLetterForm] = useState({
    internship_title: 'Official Internship Program Clearance Letter',
    internship_notes: '',
    allow_internship: true,
    valid_from: new Date().toISOString().split('T')[0],
    valid_until: new Date(Date.now() + 120 * 86400000).toISOString().split('T')[0],

    dorm_food_title: 'Campus Dormitory & Cafeteria Clearance Permit',
    dorm_food_notes: '',
    allow_dormitory: true,
    allow_cafeteria: true,

    score_notes: '',
    advisor_score: 25,
    uil_score: 25,
    doc_score: 25,
    pres_score: 25,
    gpa: '3.90',
  })
  const [isSubmittingLetter, setIsSubmittingLetter] = useState(false)
  const [verifyAlert, setVerifyAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const openLetterModal = (stu: Track1Student, tab: 'internship' | 'dorm_food' | 'score' = 'internship') => {
    if (!stu.is_verified_by_dean) {
      setVerifyAlert({
        type: 'error',
        message: `Clearance letters cannot be composed for ${stu.full_name} until the student is officially verified by the Dean.`,
      })
      return
    }
    setLetterModalStudent(stu)
    setSelectedLetterTab(tab)
    setInspectingStudent(null) // Cleanly close inspect modal when transitioning to 3-letter page
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', 'students')
      next.set('dispatch', stu.id)
      next.set('letter', tab)
      return next
    }, { replace: true })

    const rosterData = stu.score_roster_data || {}
    setLetterForm({
      internship_title: stu.dean_letter_title || 'OFFICIAL INTERNSHIP PROGRAM CLEARANCE LETTER',
      internship_notes: stu.dean_letter_notes ||
        `This official clearance certifies that ${stu.full_name} (${stu.student_id_number || 'STU'}) has satisfactorily completed 3rd-year prerequisite coursework in good academic standing and is officially approved and cleared for Track 1 In-House Internship placement under University Industry Linkage.`,
      allow_internship: stu.dean_allow_internship ?? true,
      valid_from: stu.dean_valid_from || new Date().toISOString().split('T')[0],
      valid_until: stu.dean_valid_until || new Date(Date.now() + 120 * 86400000).toISOString().split('T')[0],

      dorm_food_title: stu.dorm_food_letter_title || 'CAMPUS DORMITORY & CAFETERIA CLEARANCE PERMIT',
      dorm_food_notes: stu.dorm_food_letter_notes ||
        `This campus logistics clearance certifies that ${stu.full_name} (${stu.student_id_number || 'STU'}) is in full compliance with university residency regulations and is hereby granted official authorization for campus dormitory accommodation and dining hall meal card access.`,
      allow_dormitory: stu.dean_allow_dorm ?? true,
      allow_cafeteria: stu.dean_allow_food ?? true,

      score_notes: stu.score_letter_notes || stu.score_roster_data?.notes || stu.score_roster_data?.remarks ||
        `Official composite evaluation and academic score roster for student ${stu.full_name}. Approved with distinction by the Department Dean.`,
      advisor_score: Number(rosterData.advisor_score ?? 25),
      uil_score: Number(rosterData.uil_score ?? 25),
      doc_score: Number(rosterData.doc_score ?? 25),
      pres_score: Number(rosterData.pres_score ?? (rosterData.defense_score ?? 25)),
      gpa: stu.gpa || '3.90',
    })
  }

  const closeLetterModal = () => {
    setLetterModalStudent(null)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('dispatch')
      next.delete('letter')
      return next
    }, { replace: true })
  }

  const [mobileLetterView, setMobileLetterView] = useState<'editor' | 'preview'>('editor')
  const letterPreviewScrollRef = useRef<HTMLDivElement>(null)

  const scrollToLetterTop = () => {
    if (letterPreviewScrollRef.current) {
      letterPreviewScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const scrollToLetterBottom = () => {
    if (letterPreviewScrollRef.current) {
      letterPreviewScrollRef.current.scrollTo({
        top: letterPreviewScrollRef.current.scrollHeight,
        behavior: 'smooth',
      })
    }
  }

  const switchLetterTab = (tab: 'internship' | 'dorm_food' | 'score') => {
    setSelectedLetterTab(tab)
    if (letterPreviewScrollRef.current) {
      letterPreviewScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('letter', tab)
      return next
    }, { replace: true })
  }

  const handlePrevLetter = () => {
    if (selectedLetterTab === 'score') switchLetterTab('dorm_food')
    else if (selectedLetterTab === 'dorm_food') switchLetterTab('internship')
  }

  const handleNextLetter = () => {
    if (selectedLetterTab === 'internship') switchLetterTab('dorm_food')
    else if (selectedLetterTab === 'dorm_food') switchLetterTab('score')
  }

  // URL Deep-linking for Dispatch Center
  useEffect(() => {
    const dispatchParam = searchParams.get('dispatch')
    const letterParam = searchParams.get('letter') as 'internship' | 'dorm_food' | 'score' | null
    if (dispatchParam && students.length > 0) {
      const match = students.find(
        (s) => s.id === dispatchParam || String(s.student_id_number) === dispatchParam
      )
      if (match && match.is_verified_by_dean && letterModalStudent?.id !== match.id) {
        openLetterModal(match, letterParam || 'internship')
      }
    }
  }, [searchParams, students, letterModalStudent])

  const totalScore = Math.min(
    100,
    Math.max(
      0,
      Number(letterForm.advisor_score || 0) +
        Number(letterForm.uil_score || 0) +
        Number(letterForm.doc_score || 0) +
        Number(letterForm.pres_score || 0)
    )
  )

  const getScoreClassification = (score: number) => {
    if (score >= 90) return { grade: 'A+', points: '4.00', honors: 'Great Distinction (Dean’s High Honors)', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' }
    if (score >= 85) return { grade: 'A', points: '4.00', honors: 'Distinction (Dean’s Honors)', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' }
    if (score >= 80) return { grade: 'A-', points: '3.75', honors: 'Very Good Standing', badge: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300' }
    if (score >= 75) return { grade: 'B+', points: '3.50', honors: 'Good Standing', badge: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' }
    if (score >= 70) return { grade: 'B', points: '3.00', honors: 'Satisfactory Standing', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' }
    if (score >= 65) return { grade: 'C+', points: '2.50', honors: 'Passing Standing', badge: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300' }
    return { grade: 'F', points: '0.00', honors: 'Academic Deficiency / Re-examination Required', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' }
  }

  const handleSendIndividualLetter = async (letterType: 'internship' | 'dorm_food' | 'score') => {
    if (!letterModalStudent || isSubmittingLetter) return
    setIsSubmittingLetter(true)
    try {
      let payload: any = { letter_type: letterType }
      if (letterType === 'internship') {
        payload = {
          ...payload,
          letter_title: letterForm.internship_title,
          notes: letterForm.internship_notes,
          allow_internship: letterForm.allow_internship,
          valid_from: letterForm.valid_from,
          valid_until: letterForm.valid_until,
        }
      } else if (letterType === 'dorm_food') {
        payload = {
          ...payload,
          letter_title: letterForm.dorm_food_title,
          notes: letterForm.dorm_food_notes,
          allow_dormitory: letterForm.allow_dormitory,
          allow_cafeteria: letterForm.allow_cafeteria,
          valid_from: letterForm.valid_from,
          valid_until: letterForm.valid_until,
        }
      } else if (letterType === 'score') {
        payload = {
          ...payload,
          notes: letterForm.score_notes,
          advisor_score: letterForm.advisor_score,
          uil_score: letterForm.uil_score,
          doc_score: letterForm.doc_score,
          defense_score: letterForm.pres_score,
          pres_score: letterForm.pres_score,
          gpa: letterForm.gpa,
        }
      }

      const res = await api.post(`/v1/uil-profiles/dean/issue-letter/${letterModalStudent.id}/`, payload)
      const data = res.data
      const docName = letterType === 'internship'
        ? 'Official Internship Clearance Letter'
        : letterType === 'dorm_food'
        ? 'Campus Dormitory & Cafeteria Permit'
        : 'Official Academic Score Sheet & Excel Roster'

      setVerifyAlert({ type: 'success', message: `${docName} successfully confirmed and dispatched to student!` })

      setStudents((prev) =>
        prev.map((s) => (s.id === letterModalStudent.id ? { ...s, ...data } : s))
      )
      setLetterModalStudent((curr) => (curr ? { ...curr, ...data } : null))
      setInspectingStudent((curr) =>
        curr && curr.id === letterModalStudent.id ? { ...curr, ...data } : curr
      )
    } catch (err: any) {
      setVerifyAlert({
        type: 'error',
        message: err?.response?.data?.detail || 'Failed to issue letter.',
      })
    } finally {
      setIsSubmittingLetter(false)
    }
  }

  const handleSendAllLetters = async () => {
    if (!letterModalStudent || isSubmittingLetter) return
    setIsSubmittingLetter(true)
    try {
      const payload = {
        letter_type: 'all',
        letter_title: letterForm.internship_title,
        notes: letterForm.internship_notes,
        allow_internship: letterForm.allow_internship,
        valid_from: letterForm.valid_from,
        valid_until: letterForm.valid_until,

        dorm_food_title: letterForm.dorm_food_title,
        dorm_food_notes: letterForm.dorm_food_notes,
        allow_dormitory: letterForm.allow_dormitory,
        allow_cafeteria: letterForm.allow_cafeteria,

        score_notes: letterForm.score_notes,
        advisor_score: letterForm.advisor_score,
        uil_score: letterForm.uil_score,
        doc_score: letterForm.doc_score,
        defense_score: letterForm.pres_score,
        pres_score: letterForm.pres_score,
        gpa: letterForm.gpa,
      }

      const res = await api.post(`/v1/uil-profiles/dean/issue-letter/${letterModalStudent.id}/`, payload)
      const data = res.data
      setVerifyAlert({
        type: 'success',
        message: 'All 3 Official Clearance Letters (Internship, Dorm/Cafeteria & Score Sheet) confirmed and dispatched to student!',
      })

      setStudents((prev) =>
        prev.map((s) => (s.id === letterModalStudent.id ? { ...s, ...data } : s))
      )
      setLetterModalStudent((curr) => (curr ? { ...curr, ...data } : null))
      setInspectingStudent((curr) =>
        curr && curr.id === letterModalStudent.id ? { ...curr, ...data } : curr
      )
    } catch (err: any) {
      setVerifyAlert({
        type: 'error',
        message: err?.response?.data?.detail || 'Failed to dispatch clearance letters.',
      })
    } finally {
      setIsSubmittingLetter(false)
    }
  }

  // 1-Click Verify Student
  const handleVerifyStudent = async (studentId: string) => {
    setVerifyingStudentId(studentId)
    try {
      const res = await api.post(`/v1/uil-profiles/dean/verify-student/${studentId}/`)
      const successMsg = res.data.message || 'Student officially verified successfully by Department Dean!'
      setVerifyAlert({ type: 'success', message: successMsg })
      if (res.data.dean_unique_qr) {
        setDeanQrCode(res.data.dean_unique_qr)
      }
      if (res.data.dean_title) {
        setDeanTitle(res.data.dean_title)
      }
      const updatedStu: Partial<Track1Student> = {
        is_verified_by_dean: true,
        dean_unique_qr: res.data.dean_unique_qr,
        dean_verification_letter_qr: res.data.dean_verification_letter_qr,
        dean_dorm_food_letter_qr: res.data.dean_dorm_food_letter_qr,
        dean_letter_qr: res.data.dean_letter_qr,
        dean_letter_title: res.data.dean_letter_title,
        dean_letter_notes: res.data.dean_letter_notes,
        dean_allow_dorm: res.data.dean_allow_dorm,
        dean_allow_food: res.data.dean_allow_food,
        dean_allow_internship: res.data.dean_allow_internship,
        dean_valid_from: res.data.valid_from,
        dean_valid_until: res.data.valid_until,
        internship_letter_sent: res.data.internship_letter_sent,
        dorm_food_letter_sent: res.data.dorm_food_letter_sent,
        score_letter_sent: res.data.score_letter_sent,
        score_roster_data: res.data.score_roster_data,
        roster_download_url: res.data.roster_download_url,
        has_score_roster: true,
      }
      setStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, ...updatedStu } : s))
      )
      setInspectingStudent((curr) =>
        curr && curr.id === studentId ? { ...curr, ...updatedStu } : curr
      )
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Verification failed. Student must complete 3rd year (academic_year >= 4).')
    } finally {
      setVerifyingStudentId(null)
    }
  }

  // Unseal UIL Score Sheet
  const handleUnseal = async (teamId: string) => {
    try {
      await api.post(`/v1/uil-profiles/dean/unseal-score-sheet/${teamId}/`)
      alert('UIL Score Sheet officially unsealed via QR verification!')
      fetchTeams()
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Unseal failed.')
    }
  }

  // Schedule Defense
  const handleScheduleDefense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!schedulingTeam) return
    setActionLoading(true)
    try {
      await api.post(`/v1/uil-profiles/dean/schedule-defense/${schedulingTeam.id}/`, {
        defense_date: defenseDate,
        defense_venue: defenseVenue,
      })
      alert(`Final defense scheduled for ${defenseDate}!`)
      setSchedulingTeam(null)
      fetchTeams()
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Schedule defense failed.')
    } finally {
      setActionLoading(false)
    }
  }

  // Submit Final Composite Grade
  const handleSubmitFinalGrade = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!gradingTeam) return
    setActionLoading(true)
    try {
      const res = await api.post(`/v1/uil-profiles/dean/submit-final-grade/${gradingTeam.id}/`, gradeInputs)
      alert(`Final Composite Grade calculated: ${res.data.composite_score}% (${res.data.composite_grade})!`)
      setGradingTeam(null)
      fetchTeams()
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Grade submission failed.')
    } finally {
      setActionLoading(false)
    }
  }

  const eligibleCount = students.filter((s) => s.is_eligible).length
  const verifiedCount = students.filter((s) => s.is_verified_by_dean).length

  const filteredStudents = students.filter((s) => {
    if (statusFilter === 'pending' && s.is_verified_by_dean) return false
    if (statusFilter === 'approved' && !s.is_verified_by_dean) return false
    const q = searchStudent.toLowerCase()
    return (
      s.full_name?.toLowerCase().includes(q) ||
      s.student_id_number?.toLowerCase().includes(q) ||
      s.department?.toLowerCase().includes(q)
    )
  })

  const previewComposite = (
    gradeInputs.advisor_score * 0.25 +
    gradeInputs.uil_score * 0.25 +
    gradeInputs.documentation_score * 0.25 +
    gradeInputs.presentation_score * 0.25
  ).toFixed(1)

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-[#0c0c0e] py-8 px-4 sm:px-6 lg:px-8 animate-fade-in">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 mb-2">
              <Award className="w-3.5 h-3.5" />
              Department Dean Portal • {deanDepartment || 'Scoped Department View'}
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white tracking-tight">
              Track 1 Clearance, QR Letters & Defense Grading
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
          </div>
        </div>

        {/* Verified by Admin Official Banner */}
        {showDeanVerifiedAlert && (user?.is_approved ?? true) && (
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
                  Your credentials as Department Dean {user?.department ? `for ${user.department}` : ''} {user?.university_name ? `(${user.university_name})` : ''} have been officially verified and approved. You have full operational authority to issue digital clearance letters, sign cryptographic rosters, and schedule defense panels.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowDeanVerifiedAlert(false)}
              className="p-1 rounded-lg hover:bg-emerald-200/50 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Verification Success / Error Alert */}
        {verifyAlert && (
          <div
            className={`p-4 rounded-2xl border text-sm font-semibold flex items-center justify-between shadow-sm animate-fade-in ${
              verifyAlert.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{verifyAlert.message}</span>
            </div>
            <button
              onClick={() => setVerifyAlert(null)}
              className="p-1 rounded-lg hover:bg-neutral-200/50 dark:hover:bg-neutral-800/40 text-neutral-500"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-neutral-200/80 dark:border-neutral-800 pb-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('students')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'students'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Student Clearance & QR ({students.length})
          </button>
          <button
            onClick={() => setActiveTab('defense')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'defense'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <Calendar className="w-4 h-4" />
            Defense & Composite Grading ({teams.length})
          </button>
        </div>

        {/* TAB 0: DASHBOARD OVERVIEW (METRICS & ANALYTICS) */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-fade-in">
            {/* Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="card-gradient p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 shadow-soft">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-500">Department Candidates</span>
                  <Building className="w-5 h-5 text-amber-600" />
                </div>
                <div className="mt-2 text-2xl font-black text-neutral-900 dark:text-white">{students.length}</div>
                <div className="mt-1 text-[11px] text-neutral-400">{deanDepartment || 'Department View'}</div>
              </div>

              <div className="card-gradient p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 shadow-soft">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-500">3rd Year Completed (Year 4+)</span>
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                </div>
                <div className="mt-2 text-2xl font-black text-neutral-900 dark:text-white">{eligibleCount}</div>
                <div className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">Academically eligible</div>
              </div>

              <div className="card-gradient p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 shadow-soft">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-500">Officially Verified</span>
                  <ShieldCheck className="w-5 h-5 text-indigo-500" />
                </div>
                <div className="mt-2 text-2xl font-black text-neutral-900 dark:text-white">{verifiedCount}</div>
                <div className="mt-1 text-[11px] text-indigo-600 dark:text-indigo-400">QR letters authorized</div>
              </div>
            </div>

            {/* Department Clearance Analytics SVG Chart & Detailed Breakdown */}
            <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 p-5 shadow-soft">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                    All Department Clearance Analytics
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Real-time verification distribution and academic gate compliance for {deanDepartment || 'Department'}.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    {students.length > 0 ? Math.round((verifiedCount / students.length) * 100) : 0}% Cleared
                  </span>
                </div>
              </div>

              <DeanVerificationAnalyticsChart
                totalStudents={students.length}
                verifiedStudents={verifiedCount}
                eligiblePending={eligibleCount - verifiedCount > 0 ? eligibleCount - verifiedCount : 0}
                ineligibleStudents={students.length - eligibleCount > 0 ? students.length - eligibleCount : 0}
                departmentName={deanDepartment || 'Department View'}
              />

              {/* 3 Metric Breakdown Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-800">
                <div className="p-3.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                  <div className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                    <span>Verified & Cleared</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  <div className="text-xl font-black text-emerald-900 dark:text-emerald-100 mt-1">{verifiedCount}</div>
                  <div className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                    {students.length > 0 ? Math.round((verifiedCount / students.length) * 100) : 0}% of department candidates
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <div className="text-[11px] font-bold text-amber-800 dark:text-amber-300 flex items-center justify-between">
                    <span>Eligible Awaiting Verification</span>
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  <div className="text-xl font-black text-amber-900 dark:text-amber-100 mt-1">
                    {Math.max(0, eligibleCount - verifiedCount)}
                  </div>
                  <div className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">
                    Ready for 1-Click Verification
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800">
                  <div className="text-[11px] font-bold text-rose-800 dark:text-rose-300 flex items-center justify-between">
                    <span>Ineligible (&lt; 4th Year)</span>
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                  </div>
                  <div className="text-xl font-black text-rose-900 dark:text-rose-100 mt-1">
                    {Math.max(0, students.length - eligibleCount)}
                  </div>
                  <div className="text-[10px] text-rose-700 dark:text-rose-400 mt-0.5">
                    Gate blocked: Has not finished 3rd Year
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation Shortcuts to Clearance & Defense */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div
                onClick={() => setActiveTab('students')}
                className="p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-soft hover:border-amber-400 dark:hover:border-amber-600 cursor-pointer transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 border border-amber-200 dark:border-amber-800">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-amber-600 group-hover:translate-x-1 transition-transform">
                    Go to Clearance & QR →
                  </span>
                </div>
                <h4 className="font-bold text-sm text-neutral-900 dark:text-white mt-3">
                  Student Clearance & QR Management
                </h4>
                <p className="text-xs text-neutral-500 mt-1">
                  Inspect student dossiers, execute 1-Click Verification, dispatch 3 official clearance letters, and chat with verified students.
                </p>
              </div>

              <div
                onClick={() => setActiveTab('defense')}
                className="p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-soft hover:border-amber-400 dark:hover:border-amber-600 cursor-pointer transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 border border-purple-200 dark:border-purple-800">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-purple-600 group-hover:translate-x-1 transition-transform">
                    Go to Defense Grading →
                  </span>
                </div>
                <h4 className="font-bold text-sm text-neutral-900 dark:text-white mt-3">
                  Defense & Composite Grading
                </h4>
                <p className="text-xs text-neutral-500 mt-1">
                  Schedule final defense presentations, compute 4-factor composite scores (Advisor 25%, UIL 25%, Report 25%, Defense 25%), and seal grades.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 1: TRACK 1 CANDIDATES & 1-CLICK VERIFICATION */}
        {activeTab === 'students' && (
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 overflow-hidden shadow-soft space-y-4 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                  Department Candidates (Strict 3rd-Year Completion Gate)
                </h3>
                <p className="text-xs text-neutral-500">
                  Only students with Year 4 or higher (completed 3rd year) qualify for official Dean verification.
                </p>
              </div>
              <div className="relative max-w-xs w-full">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search student or ID..."
                  value={searchStudent}
                  onChange={(e) => setSearchStudent(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs focus:outline-none"
                />
              </div>
            </div>

            {/* Candidate Filter Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-neutral-100 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  statusFilter === 'all'
                    ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-sm'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                }`}
              >
                All Candidates ({students.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('pending')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  statusFilter === 'pending'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/60'
                }`}
              >
                Pending Sign-Off ({students.filter((s) => !s.is_verified_by_dean).length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('approved')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  statusFilter === 'approved'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
                }`}
              >
                Digitally Signed ({students.filter((s) => s.is_verified_by_dean).length})
              </button>
            </div>

            {isLoadingStudents ? (
              <div className="py-12 text-center text-xs text-neutral-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                Loading department students...
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="py-12 text-center text-xs text-neutral-500">
                No students found for department: {deanDepartment || 'Current Department'}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 dark:bg-neutral-800/50 text-[11px] font-bold text-neutral-400 uppercase">
                    <tr>
                      <th className="py-3 px-4">Student</th>
                      <th className="py-3 px-4">University ID</th>
                      <th className="py-3 px-4">Academic Year</th>
                      <th className="py-3 px-4">GPA</th>
                      <th className="py-3 px-4">Eligibility</th>
                      <th className="py-3 px-4">Dean Verification</th>
                      <th className="py-3 px-4 text-center">Score Letter</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {filteredStudents.map((stu) => (
                      <tr key={stu.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/40">
                        <td className="py-3 px-4">
                          <span className="font-bold text-neutral-900 dark:text-white block">{stu.full_name}</span>
                          <span className="text-[11px] text-neutral-400">{stu.email}</span>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
                          {stu.student_id_number}
                        </td>
                        <td className="py-3 px-4 font-semibold text-neutral-700 dark:text-neutral-300">
                          Year {stu.academic_year}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-neutral-800 dark:text-neutral-200">
                          {stu.gpa || '—'}
                        </td>
                        <td className="py-3 px-4">
                          {stu.is_eligible ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Eligible (Year 4+)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 inline-flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Ineligible (Year {stu.academic_year})
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {stu.is_verified_by_dean ? (
                            <div className="space-y-0.5">
                              <span className="text-emerald-600 font-bold flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                              </span>
                              <span className="text-[10px] text-neutral-400 block">
                                {stu.forwarded_to_uil ? 'Forwarded to UIL' : 'Pending student forward'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-neutral-400 flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" /> Unverified
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {stu.is_verified_by_dean ? (
                            <a
                              href={stu.roster_download_url || `/api/v1/uil/departments/roster-excel/?student_id=${stu.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 shadow-xs transition-colors whitespace-nowrap"
                              title="Download & Print Excel Score Letter"
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Download & Print Excel</span>
                            </a>
                          ) : (
                            <span className="text-neutral-400 text-[10px]">Verify to unlock</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setInspectingStudent(stu)}
                              className="text-xs h-7 px-2 border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                              title="Review & Inspect Profile"
                            >
                              <Eye className="w-3.5 h-3.5 mr-1" /> Inspect
                            </Button>
                            {/* Chat with Student: Active ONLY after verification */}
                            {stu.is_verified_by_dean ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setChatStudent(stu)
                                  setIsChatAppOpen(true)
                                }}
                                className="text-xs h-7 px-2.5 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 font-bold"
                                title="Open Direct Chat with Student"
                              >
                                <MessageSquare className="w-3.5 h-3.5 mr-1" /> Chat
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled
                                className="text-xs h-7 px-2.5 border-neutral-200 dark:border-neutral-800 text-neutral-400 bg-neutral-100 dark:bg-neutral-800/60 opacity-50 cursor-not-allowed"
                                title="Chat unlocks after Dean verification"
                              >
                                <MessageSquare className="w-3.5 h-3.5 mr-1" /> Chat
                              </Button>
                            )}
                            {/* Dispatch Letters (3): Active ONLY after verification */}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!stu.is_verified_by_dean}
                              onClick={() => openLetterModal(stu)}
                              className={`text-xs h-7 px-2.5 font-bold transition-all ${
                                stu.is_verified_by_dean
                                  ? 'border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 bg-indigo-50/60 dark:bg-indigo-950/40 hover:bg-indigo-100'
                                  : 'opacity-50 cursor-not-allowed border-neutral-200 dark:border-neutral-800 text-neutral-400 bg-neutral-100 dark:bg-neutral-800'
                              }`}
                              title={
                                stu.is_verified_by_dean
                                  ? 'Dispatch 3 Official Clearance Letters (Internship, Logistics, Score)'
                                  : 'Must verify student first before clearance letters become active'
                              }
                            >
                              <PenTool className="w-3 h-3 mr-1" /> Dispatch Letters (3)
                            </Button>
                            {!stu.is_verified_by_dean ? (
                              <Button
                                size="sm"
                                disabled={!stu.is_eligible || verifyingStudentId === stu.id}
                                onClick={() => handleVerifyStudent(stu.id)}
                                className="text-xs h-7 bg-amber-600 hover:bg-amber-700 text-white font-bold"
                              >
                                {verifyingStudentId === stu.id ? 'Verifying...' : '1-Click Verify'}
                              </Button>
                            ) : (
                              <span className="text-emerald-600 font-bold text-[11px] flex items-center gap-0.5 ml-1" title="Officially Verified">
                                <Check className="w-3.5 h-3.5" />
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: DEFENSE SCHEDULING & COMPOSITE GRADING */}
        {activeTab === 'defense' && (
          <div className="space-y-6">
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between">
              <div>
                <span className="font-bold block">Dean 4-Factor Composite Grading Formula:</span>
                <span>Final Score = (Advisor Score × 25%) + (UIL Score × 25%) + (Documentation Score × 25%) + (Presentation Score × 25%) = 100%</span>
              </div>
              <Sparkles className="w-5 h-5 text-amber-600" />
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
                        <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">
                          Squad Defense
                        </span>
                        <h4 className="text-base font-bold text-neutral-900 dark:text-white mt-0.5">
                          {team.team_name}
                        </h4>
                        <p className="text-xs text-neutral-500">Project: {team.project_title}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        team.composite_grade ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-neutral-100 text-neutral-700'
                      }`}>
                        {team.composite_grade ? `Final Grade: ${team.composite_grade}` : 'Pending Grading'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs py-2 border-y border-neutral-100 dark:border-neutral-800">
                      <div>
                        <span className="text-neutral-400">Advisor Score (25%):</span>{' '}
                        <span className="font-bold text-neutral-900 dark:text-white">
                          {team.advisor_score !== undefined ? `${team.advisor_score}%` : 'Pending'}
                        </span>
                      </div>
                      <div>
                        <span className="text-neutral-400">UIL Score (25%):</span>{' '}
                        <span className="font-bold text-neutral-900 dark:text-white">
                          {team.uil_score !== undefined ? `${team.uil_score}%` : 'Pending'}
                        </span>
                      </div>
                      <div>
                        <span className="text-neutral-400">Defense Scheduled:</span>{' '}
                        <span className="font-bold text-neutral-900 dark:text-white">
                          {team.defense_date || 'Not Scheduled'}
                        </span>
                      </div>
                      <div>
                        <span className="text-neutral-400">Composite Score:</span>{' '}
                        <span className="font-bold text-amber-600">
                          {team.composite_score ? `${team.composite_score}%` : 'Pending'}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUnseal(team.id)}
                        className="text-xs h-8"
                      >
                        <QrCode className="w-3.5 h-3.5 mr-1" /> Unseal Score Sheet
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSchedulingTeam(team)}
                        className="text-xs h-8"
                      >
                        <Calendar className="w-3.5 h-3.5 mr-1" /> Schedule Defense
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setGradingTeam(team)}
                        className="text-xs h-8 bg-amber-600 hover:bg-amber-700 text-white font-bold"
                      >
                        <Award className="w-3.5 h-3.5 mr-1" /> Compute Final Grade
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}


      </div>

      {/* SCHEDULE DEFENSE MODAL */}
      {schedulingTeam && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl max-w-md w-full p-6 space-y-4 border border-neutral-200 dark:border-neutral-800 shadow-xl">
            <h3 className="text-base font-bold text-neutral-900 dark:text-white">
              Schedule Final Project Defense
            </h3>
            <p className="text-xs text-neutral-500">
              Squad: <span className="font-bold">{schedulingTeam.team_name}</span> • Project: {schedulingTeam.project_title}
            </p>
            <form onSubmit={handleScheduleDefense} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Defense Date & Time *
                </label>
                <input
                  required
                  type="datetime-local"
                  value={defenseDate}
                  onChange={(e) => setDefenseDate(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Venue / Meeting Hall *
                </label>
                <input
                  required
                  type="text"
                  value={defenseVenue}
                  onChange={(e) => setDefenseVenue(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs focus:outline-none"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setSchedulingTeam(null)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={actionLoading} className="bg-amber-600 hover:bg-amber-700 text-white font-bold">
                  {actionLoading ? 'Scheduling...' : 'Confirm Schedule'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* COMPOSITE GRADING MODAL */}
      {gradingTeam && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl max-w-md w-full p-6 space-y-4 border border-neutral-200 dark:border-neutral-800 shadow-xl">
            <h3 className="text-base font-bold text-neutral-900 dark:text-white">
              Dean Final Composite Grading Calculation
            </h3>
            <p className="text-xs text-neutral-500">
              Squad: <span className="font-bold">{gradingTeam.team_name}</span>
            </p>

            <form onSubmit={handleSubmitFinalGrade} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Advisor Score (25%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={gradeInputs.advisor_score}
                    onChange={(e) => setGradeInputs((p) => ({ ...p, advisor_score: Number(e.target.value) }))}
                    className="w-full p-2 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    UIL Score (25%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={gradeInputs.uil_score}
                    onChange={(e) => setGradeInputs((p) => ({ ...p, uil_score: Number(e.target.value) }))}
                    className="w-full p-2 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Documentation (25%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={gradeInputs.documentation_score}
                    onChange={(e) => setGradeInputs((p) => ({ ...p, documentation_score: Number(e.target.value) }))}
                    className="w-full p-2 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Presentation (25%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={gradeInputs.presentation_score}
                    onChange={(e) => setGradeInputs((p) => ({ ...p, presentation_score: Number(e.target.value) }))}
                    className="w-full p-2 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
                  />
                </div>
              </div>

              {/* Calculated composite preview */}
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-between">
                <span className="text-xs font-bold text-amber-800 dark:text-amber-300">Composite Total:</span>
                <span className="text-base font-black text-amber-700 dark:text-amber-200">{previewComposite}%</span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setGradingTeam(null)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={actionLoading} className="bg-amber-600 hover:bg-amber-700 text-white font-bold">
                  {actionLoading ? 'Calculating...' : 'Seal & Submit Final Grade'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STUDENT DOSSIER INSPECTION MODAL */}
      {inspectingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-neutral-100 dark:border-neutral-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-600 to-amber-400 text-white font-black text-lg flex items-center justify-center shadow-md">
                  {inspectingStudent.full_name?.charAt(0) || 'S'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                      {inspectingStudent.full_name}
                    </h2>
                    {inspectingStudent.is_verified_by_dean ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 inline-flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" /> Officially Verified
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Pending Verification
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500 font-mono">
                    {inspectingStudent.student_id_number} • {inspectingStudent.university_name || 'Addis Ababa University'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setInspectingStudent(null)}
                className="p-1 rounded-xl text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Academic Overview Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-100 dark:border-neutral-800">
                <span className="text-[10px] uppercase font-bold text-neutral-400 block">Department</span>
                <span className="text-xs font-bold text-neutral-900 dark:text-white mt-1 block">
                  {inspectingStudent.department}
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-100 dark:border-neutral-800">
                <span className="text-[10px] uppercase font-bold text-neutral-400 block">Academic Year</span>
                <span className="text-xs font-bold text-neutral-900 dark:text-white mt-1 block">
                  Year {inspectingStudent.academic_year}
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-100 dark:border-neutral-800">
                <span className="text-[10px] uppercase font-bold text-neutral-400 block">Cumulative GPA</span>
                <span className="text-xs font-black text-amber-600 dark:text-amber-400 mt-1 block">
                  {inspectingStudent.gpa ? `${inspectingStudent.gpa} / 4.00` : 'Not recorded'}
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-100 dark:border-neutral-800">
                <span className="text-[10px] uppercase font-bold text-neutral-400 block">Campus City</span>
                <span className="text-xs font-bold text-neutral-900 dark:text-white mt-1 block">
                  {inspectingStudent.campus_city || 'Addis Ababa'}
                </span>
              </div>
            </div>

            {/* Contact Information */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Contact & Identity</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300">
                  <Mail className="w-4 h-4 text-neutral-400" />
                  <span>{inspectingStudent.email || 'No email provided'}</span>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300">
                  <Phone className="w-4 h-4 text-neutral-400" />
                  <span>{inspectingStudent.phone || 'No phone number'}</span>
                </div>
              </div>
            </div>

            {/* Skills & Technical Proficiencies */}
            {inspectingStudent.skills && inspectingStudent.skills.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Academic & Technical Skills</h4>
                <div className="flex flex-wrap gap-1.5">
                  {inspectingStudent.skills.map((skill, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Bio Summary */}
            {inspectingStudent.bio && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Student Bio</h4>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed bg-neutral-50 dark:bg-neutral-800/40 p-3 rounded-2xl border border-neutral-100 dark:border-neutral-800">
                  {inspectingStudent.bio}
                </p>
              </div>
            )}

            {/* Emergency Contact */}
            {inspectingStudent.emergency_contact && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Emergency Contact Details</h4>
                <div className="p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800 text-xs text-neutral-700 dark:text-neutral-300 grid grid-cols-2 gap-2">
                  <div><span className="text-neutral-400">Contact Person:</span> {inspectingStudent.emergency_contact.contact_name}</div>
                  <div><span className="text-neutral-400">Relationship:</span> {inspectingStudent.emergency_contact.relationship}</div>
                  <div><span className="text-neutral-400">Phone:</span> {inspectingStudent.emergency_contact.primary_phone}</div>
                  {inspectingStudent.emergency_contact.insurance_policy_number && (
                    <div><span className="text-neutral-400">Insurance Ref:</span> {inspectingStudent.emergency_contact.insurance_policy_number}</div>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-neutral-100 dark:border-neutral-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setInspectingStudent(null)}
                className="text-xs"
              >
                Close
              </Button>
              <div className="flex items-center gap-2">
                {inspectingStudent.is_verified_by_dean ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const s = inspectingStudent
                        setInspectingStudent(null)
                        setChatStudent(s)
                        setIsChatAppOpen(true)
                      }}
                      className="text-xs font-bold flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100"
                    >
                      <MessageSquare className="w-3.5 h-3.5" /> Chat with Student
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openLetterModal(inspectingStudent, 'internship')}
                      className="text-xs font-bold flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/40"
                    >
                      <PenTool className="w-3.5 h-3.5" /> Dispatch Letters (3)
                    </Button>
                    <a
                      href={inspectingStudent.roster_download_url || `/api/v1/uil/departments/roster-excel/?student_id=${inspectingStudent.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 shadow-xs transition-colors"
                      title="Download & Print Excel Score Letter"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Download & Print Excel</span>
                    </a>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled
                      className="text-xs opacity-50 cursor-not-allowed border-neutral-300 text-neutral-400 bg-neutral-100 dark:bg-neutral-800 flex items-center gap-1.5"
                      title="Clearance letters activate automatically after student is verified by Dean"
                    >
                      <PenTool className="w-3.5 h-3.5" /> Compose Clearance Letter (Locked)
                    </Button>
                    <Button
                      size="sm"
                      disabled={!inspectingStudent.is_eligible || verifyingStudentId === inspectingStudent.id}
                      onClick={() => handleVerifyStudent(inspectingStudent.id)}
                      className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold flex items-center gap-1.5"
                    >
                      {verifyingStudentId === inspectingStudent.id ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Verifying...
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-3.5 h-3.5" /> 1-Click Verify
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}



      {/* DEAN 3-LETTER CLEARANCE & SCORE ROSTER DISPATCH CENTER */}
      {letterModalStudent && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-neutral-950/80 backdrop-blur-md p-2 sm:p-4 lg:p-6 flex items-center justify-center animate-fade-in print:p-0 print:bg-white print:overflow-visible print:static">
          {/* Custom Scrollbar and Print Isolation Styles */}
          <style>{`
            .custom-letter-scroll::-webkit-scrollbar {
              width: 7px;
              height: 7px;
            }
            .custom-letter-scroll::-webkit-scrollbar-track {
              background: rgba(0, 0, 0, 0.04);
              border-radius: 9999px;
            }
            .custom-letter-scroll::-webkit-scrollbar-thumb {
              background: rgba(156, 163, 175, 0.5);
              border-radius: 9999px;
            }
            .custom-letter-scroll::-webkit-scrollbar-thumb:hover {
              background: rgba(107, 114, 128, 0.8);
            }
            @media print {
              body * {
                visibility: hidden !important;
              }
              #printable-official-letter, #printable-official-letter * {
                visibility: visible !important;
              }
              #printable-official-letter {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                margin: 0 !important;
                padding: 15mm 20mm !important;
                box-shadow: none !important;
                border: none !important;
              }
            }
          `}</style>

          <div className="max-w-7xl w-full h-[94vh] max-h-[94vh] bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-2xl flex flex-col overflow-hidden print:border-none print:shadow-none print:h-auto print:max-h-none print:overflow-visible">
            {/* Top Bar with Toggle Back & Quick Actions */}
            <div className="shrink-0 p-3.5 sm:p-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/95 dark:bg-neutral-900/95 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={closeLetterModal}
                  className="rounded-xl text-xs font-bold gap-1.5 border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Toggle Back to Dashboard</span>
                </Button>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white">
                      Dean 3-Letter Clearance & Dispatch Center
                    </h2>
                    <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                      Live Dynamic Page
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 font-mono">
                    Candidate: <span className="font-bold text-neutral-800 dark:text-neutral-200">{letterModalStudent.full_name}</span> ({letterModalStudent.student_id_number}) • {letterModalStudent.department} • Year {letterModalStudent.academic_year}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.print()}
                  className="rounded-xl text-xs font-bold gap-1.5 border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  title="Print active letterhead document"
                >
                  <Printer className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />
                  <span className="hidden sm:inline">Print Letter</span>
                </Button>
                <button
                  onClick={closeLetterModal}
                  className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                  title="Close Dispatch Center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Document Selection Tabs */}
            <div className="shrink-0 flex items-center border-b border-neutral-200 dark:border-neutral-800 bg-neutral-100/60 dark:bg-neutral-950/40 px-4 sm:px-6 pt-2.5 gap-2 overflow-x-auto print:hidden">
              <button
                type="button"
                onClick={() => switchLetterTab('internship')}
                className={`pb-2.5 px-3.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 shrink-0 ${
                  selectedLetterTab === 'internship'
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>1. Internship Clearance Letter</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  letterModalStudent.internship_letter_sent
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300'
                }`}>
                  {letterModalStudent.internship_letter_sent ? 'Sent ✓' : 'Draft'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => switchLetterTab('dorm_food')}
                className={`pb-2.5 px-3.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 shrink-0 ${
                  selectedLetterTab === 'dorm_food'
                    ? 'border-teal-600 text-teal-600 dark:text-teal-400'
                    : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                }`}
              >
                <Building className="w-4 h-4" />
                <span>2. Dorm & Cafeteria Permit</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  letterModalStudent.dorm_food_letter_sent
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300'
                }`}>
                  {letterModalStudent.dorm_food_letter_sent ? 'Sent ✓' : 'Draft'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => switchLetterTab('score')}
                className={`pb-2.5 px-3.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 shrink-0 ${
                  selectedLetterTab === 'score'
                    ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                    : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>3. Academic Score Sheet & Excel Roster</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  letterModalStudent.score_letter_sent
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300'
                }`}>
                  {letterModalStudent.score_letter_sent ? 'Released ✓' : 'Draft'}
                </span>
              </button>
            </div>

            {/* Mobile View Switcher (Visible on mobile/tablets only) */}
            <div className="lg:hidden shrink-0 flex items-center justify-center p-2 bg-neutral-100/90 dark:bg-neutral-800/90 border-b border-neutral-200 dark:border-neutral-700 gap-2 print:hidden">
              <button
                type="button"
                onClick={() => setMobileLetterView('editor')}
                className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  mobileLetterView === 'editor'
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-xs'
                    : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>1. Write & Edit Form</span>
              </button>
              <button
                type="button"
                onClick={() => setMobileLetterView('preview')}
                className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  mobileLetterView === 'preview'
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-xs'
                    : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>2. Preview Official Letter</span>
              </button>
            </div>

            {/* 2-Column Responsive Body */}
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden print:overflow-visible print:block">
              {/* LEFT COLUMN: Interactive Form Editor (Instant Two-Way Binding) */}
              <div className={`lg:col-span-5 h-full flex flex-col min-h-0 bg-neutral-50/40 dark:bg-neutral-900/20 border-r border-neutral-200 dark:border-neutral-800 print:hidden ${mobileLetterView === 'preview' ? 'hidden lg:flex' : 'flex'}`}>
                {/* Scrollable Form Area */}
                <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4 custom-letter-scroll">
                {selectedLetterTab === 'internship' && (
                  <div className="space-y-4 bg-neutral-50/50 dark:bg-neutral-800/20 p-4 sm:p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800">
                    <div className="p-3.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-900 dark:text-indigo-200 flex items-center justify-between">
                      <div>
                        <span className="font-bold block text-sm">Document 1: Official Internship Program Clearance Letter</span>
                        <span className="text-[11px] opacity-80">Customized specifically for Track 1 In-House Software House placement.</span>
                      </div>
                      {letterModalStudent.internship_letter_sent && (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 shrink-0">
                          Dispatched ✓
                        </span>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                        Official Document Title
                      </label>
                      <input
                        type="text"
                        value={letterForm.internship_title}
                        onChange={(e) => setLetterForm({ ...letterForm, internship_title: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-medium"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                          Placement Valid From
                        </label>
                        <input
                          type="date"
                          value={letterForm.valid_from}
                          onChange={(e) => setLetterForm({ ...letterForm, valid_from: e.target.value })}
                          className="w-full px-3.5 py-2 rounded-xl text-xs bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                          Placement Valid Until
                        </label>
                        <input
                          type="date"
                          value={letterForm.valid_until}
                          onChange={(e) => setLetterForm({ ...letterForm, valid_until: e.target.value })}
                          className="w-full px-3.5 py-2 rounded-xl text-xs bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                        Clearance Remarks & Placement Directives (Live Dynamic Text)
                      </label>
                      <textarea
                        rows={4}
                        value={letterForm.internship_notes}
                        onChange={(e) => setLetterForm({ ...letterForm, internship_notes: e.target.value })}
                        placeholder="Enter specific internship placement authorization terms..."
                        className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none leading-relaxed"
                        required
                      />
                    </div>

                    <label className="p-3 rounded-xl border text-xs font-semibold cursor-pointer flex items-center gap-2.5 bg-white dark:bg-neutral-800 border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 transition-all hover:bg-indigo-50/50">
                      <input
                        type="checkbox"
                        checked={letterForm.allow_internship}
                        onChange={(e) => setLetterForm({ ...letterForm, allow_internship: e.target.checked })}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <Award className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      <span>Authorize Track 1 In-House Internship Placement</span>
                    </label>

                    <div>
                      <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                        Cumulative GPA Recorded
                      </label>
                      <input
                        type="text"
                        value={letterForm.gpa}
                        onChange={(e) => setLetterForm({ ...letterForm, gpa: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-xl text-xs bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-mono"
                      />
                    </div>

                    {/* Prominent Confirm and Send Button */}
                    <div className="pt-2 space-y-2">
                      <Button
                        type="button"
                        disabled={isSubmittingLetter}
                        onClick={() => handleSendIndividualLetter('internship')}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-11 rounded-xl flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.99]"
                      >
                        {isSubmittingLetter ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        <span>
                          {letterModalStudent.internship_letter_sent
                            ? 'Confirm & Re-send Official Internship Clearance Letter'
                            : 'Confirm and Send Official Internship Clearance Letter'}
                        </span>
                      </Button>
                      {letterModalStudent.internship_letter_sent && (
                        <div className="flex items-center justify-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Dispatched to candidate digital portal & email inbox ✓</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {selectedLetterTab === 'dorm_food' && (
                  <div className="space-y-4 bg-neutral-50/50 dark:bg-neutral-800/20 p-4 sm:p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800">
                    <div className="p-3.5 rounded-2xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-xs text-teal-900 dark:text-teal-200 flex items-center justify-between">
                      <div>
                        <span className="font-bold block text-sm">Document 2: Campus Dormitory & Cafeteria Permit</span>
                        <span className="text-[11px] opacity-80">Separately issued for campus housing and dining hall pass.</span>
                      </div>
                      {letterModalStudent.dorm_food_letter_sent && (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 shrink-0">
                          Dispatched ✓
                        </span>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                        Official Document Title
                      </label>
                      <input
                        type="text"
                        value={letterForm.dorm_food_title}
                        onChange={(e) => setLetterForm({ ...letterForm, dorm_food_title: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-teal-500/30 font-medium"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-2">
                        Authorized Campus Logistics Services
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <label className={`p-3 rounded-xl border text-xs font-semibold cursor-pointer flex items-center gap-2.5 transition-all ${
                          letterForm.allow_dormitory
                            ? 'bg-teal-50 dark:bg-teal-950/40 border-teal-300 dark:border-teal-800 text-teal-900 dark:text-teal-200'
                            : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-400'
                        }`}>
                          <input
                            type="checkbox"
                            checked={letterForm.allow_dormitory}
                            onChange={(e) => setLetterForm({ ...letterForm, allow_dormitory: e.target.checked })}
                            className="rounded text-teal-600 focus:ring-teal-500"
                          />
                          <Building className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                          <span>Dormitory Housing Clearance</span>
                        </label>

                        <label className={`p-3 rounded-xl border text-xs font-semibold cursor-pointer flex items-center gap-2.5 transition-all ${
                          letterForm.allow_cafeteria
                            ? 'bg-teal-50 dark:bg-teal-950/40 border-teal-300 dark:border-teal-800 text-teal-900 dark:text-teal-200'
                            : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-400'
                        }`}>
                          <input
                            type="checkbox"
                            checked={letterForm.allow_cafeteria}
                            onChange={(e) => setLetterForm({ ...letterForm, allow_cafeteria: e.target.checked })}
                            className="rounded text-teal-600 focus:ring-teal-500"
                          />
                          <Utensils className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                          <span>Cafeteria Dining Pass</span>
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                          Logistics Valid From
                        </label>
                        <input
                          type="date"
                          value={letterForm.valid_from}
                          onChange={(e) => setLetterForm({ ...letterForm, valid_from: e.target.value })}
                          className="w-full px-3.5 py-2 rounded-xl text-xs bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                          Logistics Valid Until
                        </label>
                        <input
                          type="date"
                          value={letterForm.valid_until}
                          onChange={(e) => setLetterForm({ ...letterForm, valid_until: e.target.value })}
                          className="w-full px-3.5 py-2 rounded-xl text-xs bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                        Housing & Meal Pass Directives (Live Dynamic Text)
                      </label>
                      <textarea
                        rows={4}
                        value={letterForm.dorm_food_notes}
                        onChange={(e) => setLetterForm({ ...letterForm, dorm_food_notes: e.target.value })}
                        placeholder="Enter housing block instructions, meal card validation terms..."
                        className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-teal-500/30 resize-none leading-relaxed"
                        required
                      />
                    </div>

                    {/* Prominent Confirm and Send Button */}
                    <div className="pt-2 space-y-2">
                      <Button
                        type="button"
                        disabled={isSubmittingLetter}
                        onClick={() => handleSendIndividualLetter('dorm_food')}
                        className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs h-11 rounded-xl flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.99]"
                      >
                        {isSubmittingLetter ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        <span>
                          {letterModalStudent.dorm_food_letter_sent
                            ? 'Confirm & Re-send Campus Dorm & Cafeteria Permit'
                            : 'Confirm and Send Campus Dorm & Cafeteria Permit'}
                        </span>
                      </Button>
                      {letterModalStudent.dorm_food_letter_sent && (
                        <div className="flex items-center justify-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Dispatched to candidate digital portal & logistics registry ✓</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {selectedLetterTab === 'score' && (
                  <div className="space-y-4 bg-neutral-50/50 dark:bg-neutral-800/20 p-4 sm:p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800">
                    <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex items-center justify-between">
                      <div>
                        <span className="font-bold block text-sm">Document 3: Official Score Sheet & Excel Roster</span>
                        <span className="text-[11px] opacity-80">Edit composite 4-factor scores and export official Excel roster.</span>
                      </div>
                      {letterModalStudent.score_letter_sent && (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 shrink-0">
                          Released ✓
                        </span>
                      )}
                    </div>

                    {/* Scores Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                      <div className="p-2.5 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-center">
                        <span className="text-[10px] font-bold text-neutral-400 block uppercase">Advisor (25%)</span>
                        <input
                          type="number"
                          min="0"
                          max="25"
                          step="0.5"
                          value={letterForm.advisor_score}
                          onChange={(e) => setLetterForm({ ...letterForm, advisor_score: Number(e.target.value) })}
                          className="w-full text-center font-bold text-sm bg-transparent border-b border-neutral-300 dark:border-neutral-600 focus:outline-none focus:border-emerald-500 py-1"
                        />
                      </div>
                      <div className="p-2.5 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-center">
                        <span className="text-[10px] font-bold text-neutral-400 block uppercase">UIL Officer (25%)</span>
                        <input
                          type="number"
                          min="0"
                          max="25"
                          step="0.5"
                          value={letterForm.uil_score}
                          onChange={(e) => setLetterForm({ ...letterForm, uil_score: Number(e.target.value) })}
                          className="w-full text-center font-bold text-sm bg-transparent border-b border-neutral-300 dark:border-neutral-600 focus:outline-none focus:border-emerald-500 py-1"
                        />
                      </div>
                      <div className="p-2.5 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-center">
                        <span className="text-[10px] font-bold text-neutral-400 block uppercase">Doc Report (25%)</span>
                        <input
                          type="number"
                          min="0"
                          max="25"
                          step="0.5"
                          value={letterForm.doc_score}
                          onChange={(e) => setLetterForm({ ...letterForm, doc_score: Number(e.target.value) })}
                          className="w-full text-center font-bold text-sm bg-transparent border-b border-neutral-300 dark:border-neutral-600 focus:outline-none focus:border-emerald-500 py-1"
                        />
                      </div>
                      <div className="p-2.5 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-center">
                        <span className="text-[10px] font-bold text-neutral-400 block uppercase">Defense Pres (25%)</span>
                        <input
                          type="number"
                          min="0"
                          max="25"
                          step="0.5"
                          value={letterForm.pres_score}
                          onChange={(e) => setLetterForm({ ...letterForm, pres_score: Number(e.target.value) })}
                          className="w-full text-center font-bold text-sm bg-transparent border-b border-neutral-300 dark:border-neutral-600 focus:outline-none focus:border-emerald-500 py-1"
                        />
                      </div>
                      <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-center col-span-2 sm:col-span-1">
                        <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 block uppercase">Total Score</span>
                        <div className="font-black text-base text-emerald-700 dark:text-emerald-300 py-1">
                          {totalScore}%
                        </div>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 flex items-center justify-between text-xs">
                      <span className="text-neutral-500">Academic Standing Grade:</span>
                      <span className={`px-2.5 py-0.5 rounded-full font-black ${getScoreClassification(totalScore).badge}`}>
                        {getScoreClassification(totalScore).grade} • {getScoreClassification(totalScore).honors}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                          Cumulative GPA
                        </label>
                        <input
                          type="text"
                          value={letterForm.gpa}
                          onChange={(e) => setLetterForm({ ...letterForm, gpa: e.target.value })}
                          className="w-full px-3.5 py-2 rounded-xl text-xs bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 font-mono"
                        />
                      </div>
                      <div className="flex items-end">
                        <a
                          href={letterModalStudent.roster_download_url || `/api/v1/uil/departments/roster-excel/?student_id=${letterModalStudent.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-neutral-100 hover:bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 border border-neutral-300 dark:border-neutral-700 h-9 transition-colors shadow-xs"
                        >
                          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                          <span>Download Excel (.xlsx)</span>
                        </a>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                        Official Academic Standing Remarks (Live Dynamic Text)
                      </label>
                      <textarea
                        rows={3}
                        value={letterForm.score_notes}
                        onChange={(e) => setLetterForm({ ...letterForm, score_notes: e.target.value })}
                        placeholder="Enter academic standing remarks or honors..."
                        className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 resize-none leading-relaxed"
                      />
                    </div>

                    {/* Prominent Confirm and Send Button */}
                    <div className="pt-2 space-y-2">
                      <Button
                        type="button"
                        disabled={isSubmittingLetter}
                        onClick={() => handleSendIndividualLetter('score')}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-11 rounded-xl flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.99]"
                      >
                        {isSubmittingLetter ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        <span>
                          {letterModalStudent.score_letter_sent
                            ? 'Confirm & Re-send Official Academic Score Sheet & Roster'
                            : 'Confirm and Send Official Academic Score Sheet & Roster'}
                        </span>
                      </Button>
                      {letterModalStudent.score_letter_sent && (
                        <div className="flex items-center justify-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Released & published to candidate digital records ✓</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                </div>

                {/* Sticky Submit Panel at the base of the Left Editor Pane */}
                <div className="shrink-0 p-3.5 sm:p-4 bg-white/95 dark:bg-neutral-900/95 border-t border-neutral-200 dark:border-neutral-800 backdrop-blur-xs space-y-2 shadow-sm">
                  <Button
                    type="button"
                    disabled={isSubmittingLetter}
                    onClick={() => handleSendIndividualLetter(selectedLetterTab)}
                    className={`w-full font-bold text-xs h-11 rounded-xl flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.99] text-white ${
                      selectedLetterTab === 'internship'
                        ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20'
                        : selectedLetterTab === 'dorm_food'
                        ? 'bg-teal-600 hover:bg-teal-700 shadow-teal-500/20'
                        : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20'
                    }`}
                  >
                    {isSubmittingLetter ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>
                      {selectedLetterTab === 'internship' && (
                        letterModalStudent.internship_letter_sent
                          ? 'Confirm & Re-send Official Internship Clearance Letter'
                          : 'Confirm and Send Official Internship Clearance Letter'
                      )}
                      {selectedLetterTab === 'dorm_food' && (
                        letterModalStudent.dorm_food_letter_sent
                          ? 'Confirm & Re-send Campus Dorm & Cafeteria Permit'
                          : 'Confirm and Send Campus Dorm & Cafeteria Permit'
                      )}
                      {selectedLetterTab === 'score' && (
                        letterModalStudent.score_letter_sent
                          ? 'Confirm & Re-send Official Academic Score Sheet & Roster'
                          : 'Confirm and Send Official Academic Score Sheet & Roster'
                      )}
                    </span>
                  </Button>
                  <div className="flex items-center justify-between text-[11px] px-1">
                    <span className="text-neutral-500 dark:text-neutral-400 font-medium">Document Status:</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      {(selectedLetterTab === 'internship' && letterModalStudent.internship_letter_sent) ||
                       (selectedLetterTab === 'dorm_food' && letterModalStudent.dorm_food_letter_sent) ||
                       (selectedLetterTab === 'score' && letterModalStudent.score_letter_sent) ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Dispatched & Active ✓
                        </>
                      ) : (
                        <span className="text-neutral-400 font-normal">Draft • Ready to Dispatch</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: Live Official Letterhead Document Preview (Scrolls independently without moving background) */}
              <div className={`lg:col-span-7 h-full flex flex-col min-h-0 bg-neutral-100/70 dark:bg-neutral-950/60 relative print:block print:h-auto ${mobileLetterView === 'editor' ? 'hidden lg:flex' : 'flex'}`}>
                {/* Top Preview Controls Bar */}
                <div className="shrink-0 px-4 py-2.5 bg-white/90 dark:bg-neutral-900/90 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-300 print:hidden backdrop-blur-xs">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span className="font-bold text-neutral-900 dark:text-white">
                      Official Letterhead Document
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                      {selectedLetterTab === 'internship' && 'Document 1 of 3 (Internship)'}
                      {selectedLetterTab === 'dorm_food' && 'Document 2 of 3 (Dorm & Meal)'}
                      {selectedLetterTab === 'score' && 'Document 3 of 3 (Score & Roster)'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="hidden sm:inline-flex text-[11px] text-neutral-400 font-medium mr-1">
                      ↕ Scroll letter up & down
                    </span>
                    <button
                      type="button"
                      onClick={scrollToLetterTop}
                      title="Scroll letter to top"
                      className="p-1 px-2 text-[10px] font-semibold text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 rounded-lg transition-colors flex items-center gap-1"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Top</span>
                    </button>
                    <button
                      type="button"
                      onClick={scrollToLetterBottom}
                      title="Scroll letter to Dean Signature & QR"
                      className="p-1 px-2 text-[10px] font-semibold text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 rounded-lg transition-colors flex items-center gap-1"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">QR Code</span>
                    </button>
                  </div>
                </div>

                {/* Scrollable Letter Document Area - SCROLLS UP AND DOWN FREELY WITHOUT MOVING BACKGROUND */}
                <div
                  ref={letterPreviewScrollRef}
                  className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-letter-scroll scroll-smooth print:overflow-visible print:p-0"
                >
                  <div
                    id="printable-official-letter"
                    className="bg-white text-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-3xl p-6 sm:p-10 shadow-xl space-y-6 font-serif text-xs leading-relaxed select-text max-w-4xl mx-auto print:border-none print:shadow-none print:p-0 animate-in fade-in zoom-in-98 duration-200"
                  >
                  {/* Official Letterhead Header */}
                  <div className="text-center space-y-1.5 pb-4 border-b-2 border-neutral-900">
                    <div className="flex items-center justify-center mb-1.5">
                      <div className="w-10 h-10 rounded-full bg-amber-50 border-2 border-amber-600/50 flex items-center justify-center shadow-xs">
                        <Award className="w-6 h-6 text-amber-700" />
                      </div>
                    </div>
                    <div className="font-bold text-xs uppercase tracking-widest text-neutral-700">
                      Federal Democratic Republic of Ethiopia
                    </div>
                    <div className="font-black text-sm uppercase tracking-wider text-neutral-950">
                      University Industry Linkage Directorate
                    </div>
                    <div className="font-bold text-xs text-neutral-700">
                      Office of the Department Dean • {letterModalStudent.department || deanDepartment || 'Engineering'}
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-neutral-600 pt-2 border-t border-neutral-200 mt-2">
                      <span className="font-semibold">
                        Ref:{' '}
                        {selectedLetterTab === 'internship' && `FDRE-AAU-UIL-${letterModalStudent.student_id_number || '2026'}-CL`}
                        {selectedLetterTab === 'dorm_food' && `FDRE-AAU-LOGISTICS-${letterModalStudent.student_id_number || '2026'}-CL`}
                        {selectedLetterTab === 'score' && `FDRE-AAU-ACAD-EVAL-${letterModalStudent.student_id_number || '2026'}-ROSTER`}
                      </span>
                      <span>Date: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                    </div>
                  </div>

                  {/* Recipient & Subject Header */}
                  <div className="space-y-2 border-b border-neutral-200 pb-3">
                    <div className="text-[11px] font-sans text-neutral-600 space-y-0.5">
                      {selectedLetterTab === 'internship' && (
                        <p><strong>TO:</strong> Directorate of University-Industry Linkage (UIL), Host Enterprise Supervisors & Industrial Liaison Officers</p>
                      )}
                      {selectedLetterTab === 'dorm_food' && (
                        <p><strong>TO:</strong> Campus Housing Administration, Student Welfare Directorate & University Food Services Management</p>
                      )}
                      {selectedLetterTab === 'score' && (
                        <p><strong>TO:</strong> Department Academic Council, Faculty Board of Examiners & Office of the Registrar</p>
                      )}
                    </div>
                    <div className="pt-1">
                      <h3 className="font-black text-sm uppercase tracking-wider text-neutral-900 underline underline-offset-4">
                        {selectedLetterTab === 'internship' && (letterForm.internship_title || 'OFFICIAL INTERNSHIP PROGRAM CLEARANCE LETTER')}
                        {selectedLetterTab === 'dorm_food' && (letterForm.dorm_food_title || 'CAMPUS DORMITORY & CAFETERIA CLEARANCE PERMIT')}
                        {selectedLetterTab === 'score' && 'OFFICIAL ACADEMIC EVALUATION & 4-FACTOR COMPOSITE SCORE ROSTER'}
                      </h3>
                    </div>
                  </div>

                  {/* Candidate Dossier Credentials Pill */}
                  <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-3.5 grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-[11px] font-sans">
                    <div>
                      <span className="text-neutral-500 block text-[10px] uppercase font-bold">Candidate Name</span>
                      <span className="font-bold text-neutral-950 text-xs">{letterModalStudent.full_name}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block text-[10px] uppercase font-bold">University ID</span>
                      <span className="font-mono font-bold text-neutral-900">{letterModalStudent.student_id_number}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block text-[10px] uppercase font-bold">Standing & Year</span>
                      <span className="font-bold text-neutral-900">Year {letterModalStudent.academic_year} (Prerequisites Completed)</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block text-[10px] uppercase font-bold">Cumulative GPA</span>
                      <span className="font-mono font-bold text-amber-700 text-xs">{letterForm.gpa || letterModalStudent.gpa || '3.90'}</span>
                    </div>
                  </div>

                  {/* Complete Document Body Content for ALL 3 Letter Types */}
                  <div className="space-y-4 text-neutral-800 text-xs leading-relaxed">
                    {/* DOCUMENT 1: INTERNSHIP CLEARANCE LETTER */}
                    {selectedLetterTab === 'internship' && (
                      <div className="space-y-3.5">
                        <p className="text-justify italic text-neutral-600">
                          Pursuant to Federal Higher Education Directives and Senate Academic Regulations governing University-Industry Linkage (UIL), this clearance certificate is officially issued by the Office of the Department Dean.
                        </p>

                        <div className="space-y-1">
                          <h4 className="font-bold text-neutral-900 font-sans text-xs">
                            ARTICLE I: PREREQUISITE COURSEWORK COMPLETION & DEPARTMENTAL CLEARANCE
                          </h4>
                          <p className="text-justify">
                            It is hereby officially certified that the above-named candidate, <strong>{letterModalStudent.full_name}</strong> (ID: {letterModalStudent.student_id_number}), has satisfactorily completed all prescribed 3rd-year academic prerequisites, practical engineering labs, and coursework credits in good academic and disciplinary standing.
                          </p>
                        </div>

                        <div className="space-y-1">
                          <h4 className="font-bold text-neutral-900 font-sans text-xs">
                            ARTICLE II: TRACK 1 IN-HOUSE SOFTWARE HOUSE PLACEMENT AUTHORIZATION
                          </h4>
                          <p className="text-justify">
                            Under the authority vested in the Department Dean, the candidate is formally authorized and cleared for deployment into <strong>Track 1: In-House Software Incubation / Institutional Enterprise Track</strong>. Placement Status:{' '}
                            <strong className={letterForm.allow_internship ? 'text-emerald-700' : 'text-neutral-500'}>
                              {letterForm.allow_internship ? 'OFFICIALLY AUTHORIZED & GRANTED' : 'PENDING DEAN APPROVAL'}
                            </strong>.
                          </p>
                        </div>

                        <div className="space-y-1">
                          <h4 className="font-bold text-neutral-900 font-sans text-xs">
                            ARTICLE III: TERM & AUTHORIZED PLACEMENT DURATION
                          </h4>
                          <p className="text-justify">
                            This institutional clearance remains valid effective from <strong>{letterForm.valid_from}</strong> through <strong>{letterForm.valid_until}</strong> (120 Academic Calendar Days). The candidate shall remain subject to regular faculty mentorship and performance evaluations throughout this period.
                          </p>
                        </div>

                        <div className="space-y-1">
                          <h4 className="font-bold text-neutral-900 font-sans text-xs">
                            ARTICLE IV: PROFESSIONAL UNDERTAKING & CODE OF CONDUCT
                          </h4>
                          <p className="text-justify">
                            The candidate is bound by institutional nondisclosure covenants, software repository governance standards, and professional engineering ethics. Any breach will be submitted to the Academic Council for review.
                          </p>
                        </div>

                        <div className="space-y-1">
                          <h4 className="font-bold text-neutral-900 font-sans text-xs">
                            ARTICLE V: DEAN DIRECTIVES & CLEARANCE REMARKS
                          </h4>
                          <div className="p-3 bg-neutral-50 border-l-4 border-indigo-600 rounded-r-xl italic text-neutral-800 font-serif">
                            {letterForm.internship_notes || 'Candidate is cleared with distinction for full-time Track 1 In-House placement.'}
                          </div>
                        </div>

                        {/* Authorized Institutional Services Schedule */}
                        <div className="border border-neutral-300 rounded-xl overflow-hidden font-sans text-[11px] mt-2">
                          <div className="bg-neutral-100 p-2 font-bold text-neutral-700 border-b border-neutral-300">
                            Authorized University Services & Clearance Matrix
                          </div>
                          <table className="w-full text-left">
                            <tbody className="divide-y divide-neutral-200">
                              <tr>
                                <td className="p-2 font-semibold text-neutral-700">Track 1 In-House Placement:</td>
                                <td className="p-2 text-right">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${letterForm.allow_internship ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-500'}`}>
                                    {letterForm.allow_internship ? 'AUTHORIZED & ENROLLED ✓' : 'NOT AUTHORIZED'}
                                  </span>
                                </td>
                              </tr>
                              <tr>
                                <td className="p-2 font-semibold text-neutral-700">Campus Dormitory Housing:</td>
                                <td className="p-2 text-right">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${letterForm.allow_dormitory ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-500'}`}>
                                    {letterForm.allow_dormitory ? 'AUTHORIZED & GRANTED ✓' : 'NOT APPLICABLE'}
                                  </span>
                                </td>
                              </tr>
                              <tr>
                                <td className="p-2 font-semibold text-neutral-700">Student Cafeteria Meal Access:</td>
                                <td className="p-2 text-right">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${letterForm.allow_cafeteria ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-500'}`}>
                                    {letterForm.allow_cafeteria ? 'ACTIVE MEAL PASS ✓' : 'NOT APPLICABLE'}
                                  </span>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* DOCUMENT 2: CAMPUS DORMITORY & CAFETERIA PERMIT */}
                    {selectedLetterTab === 'dorm_food' && (
                      <div className="space-y-3.5">
                        <p className="text-justify italic text-neutral-600">
                          In accordance with University Student Welfare regulations and UIL logistics support protocols, this clearance permit is issued to facilitate campus residency and nutrition support for full-time internship duties.
                        </p>

                        <div className="space-y-1">
                          <h4 className="font-bold text-neutral-900 font-sans text-xs">
                            ARTICLE I: STUDENT RESIDENCY ELIGIBILITY & DEPARTMENTAL VERIFICATION
                          </h4>
                          <p className="text-justify">
                            The Department Dean certifies that candidate <strong>{letterModalStudent.full_name}</strong> (ID: {letterModalStudent.student_id_number}) is an active, verified intern under the Department of {letterModalStudent.department || deanDepartment || 'Engineering'} requiring on-campus housing and dining hall accommodations during the designated internship period.
                          </p>
                        </div>

                        <div className="space-y-1">
                          <h4 className="font-bold text-neutral-900 font-sans text-xs">
                            ARTICLE II: DORMITORY HOUSING ENTITLEMENT & BLOCK ALLOCATION
                          </h4>
                          <p className="text-justify">
                            Clearance Status:{' '}
                            <strong className={letterForm.allow_dormitory ? 'text-emerald-700' : 'text-neutral-500'}>
                              {letterForm.allow_dormitory ? 'AUTHORIZED & RESIDENCY GRANTED ✓' : 'NOT APPLICABLE / OFF-CAMPUS'}
                            </strong>.
                            Upon presentation of this permit bearing the Canonical Dean QR Code, the Campus Housing Directorate is authorized to allocate dormitory accommodation in designated university blocks for the duration of the internship.
                          </p>
                        </div>

                        <div className="space-y-1">
                          <h4 className="font-bold text-neutral-900 font-sans text-xs">
                            ARTICLE III: STUDENT UNION CAFETERIA MEAL ACCESS & DIGITAL CARD PROVISION
                          </h4>
                          <p className="text-justify">
                            Clearance Status:{' '}
                            <strong className={letterForm.allow_cafeteria ? 'text-emerald-700' : 'text-neutral-500'}>
                              {letterForm.allow_cafeteria ? 'AUTHORIZED & ACTIVE MEAL PASS ✓' : 'NOT APPLICABLE / SELF-CATERED'}
                            </strong>.
                            The University Food Services Administration is authorized to activate full-board digital meal privileges (Breakfast, Lunch, Dinner) on the candidate's institutional card throughout the validity window.
                          </p>
                        </div>

                        <div className="space-y-1">
                          <h4 className="font-bold text-neutral-900 font-sans text-xs">
                            ARTICLE IV: HOUSING & DINING PROTOCOLS & DEAN DIRECTIVES
                          </h4>
                          <div className="p-3 bg-neutral-50 border-l-4 border-teal-600 rounded-r-xl italic text-neutral-800 font-serif">
                            {letterForm.dorm_food_notes || 'Student is cleared for campus residency and dining hall privileges under standard university conduct regulations.'}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <h4 className="font-bold text-neutral-900 font-sans text-xs">
                            ARTICLE V: VALIDITY SCHEDULE & CHECKPOINT SECURITY INSPECTION
                          </h4>
                          <p className="text-justify">
                            This logistics permit remains in effect from <strong>{letterForm.valid_from}</strong> to <strong>{letterForm.valid_until}</strong>. Campus security officers, dormitory proctors, and cafeteria inspectors are authorized to scan the embedded Dean Canonical QR code to authenticate residency rights.
                          </p>
                        </div>

                        {/* Authorized Logistics Services Schedule */}
                        <div className="border border-neutral-300 rounded-xl overflow-hidden font-sans text-[11px] mt-2">
                          <div className="bg-neutral-100 p-2 font-bold text-neutral-700 border-b border-neutral-300">
                            Logistics Entitlements & Verification Schedule
                          </div>
                          <table className="w-full text-left">
                            <tbody className="divide-y divide-neutral-200">
                              <tr>
                                <td className="p-2 font-semibold text-neutral-700">Dormitory Housing Clearance:</td>
                                <td className="p-2 text-right">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${letterForm.allow_dormitory ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-500'}`}>
                                    {letterForm.allow_dormitory ? 'AUTHORIZED & ALLOCATED ✓' : 'NOT APPLICABLE'}
                                  </span>
                                </td>
                              </tr>
                              <tr>
                                <td className="p-2 font-semibold text-neutral-700">Cafeteria Dining Pass:</td>
                                <td className="p-2 text-right">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${letterForm.allow_cafeteria ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-500'}`}>
                                    {letterForm.allow_cafeteria ? 'ACTIVE DIGITAL MEAL PASS ✓' : 'NOT APPLICABLE'}
                                  </span>
                                </td>
                              </tr>
                              <tr>
                                <td className="p-2 font-semibold text-neutral-700">Campus Security & Gate Access:</td>
                                <td className="p-2 text-right">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                    ACTIVE & SCANNABLE VIA QR ✓
                                  </span>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* DOCUMENT 3: OFFICIAL ACADEMIC SCORE SHEET & EXCEL ROSTER */}
                    {selectedLetterTab === 'score' && (
                      <div className="space-y-3.5">
                        <p className="text-justify italic text-neutral-600">
                          Pursuant to Senate Academic Regulations and the Faculty Board of Examiners, this official academic evaluation certifies the continuous assessment and final defense marks awarded to the candidate.
                        </p>

                        <div className="space-y-1">
                          <h4 className="font-bold text-neutral-900 font-sans text-xs">
                            ARTICLE I: 4-FACTOR EVALUATION METHODOLOGY & SENATE GRADING PROTOCOL
                          </h4>
                          <p className="text-justify">
                            Final academic grading for the Track 1 In-House Internship is synthesized across four equally weighted academic pillars (25% each) evaluated by faculty advisors, industry liaison officers, and the defense examining committee.
                          </p>
                        </div>

                        <div className="space-y-1">
                          <h4 className="font-bold text-neutral-900 font-sans text-xs">
                            ARTICLE II: WEIGHTED 4-FACTOR ASSESSMENT MATRIX
                          </h4>
                          <div className="border border-neutral-300 rounded-xl overflow-hidden font-sans text-[11px]">
                            <table className="w-full text-left">
                              <thead className="bg-neutral-100 font-bold text-neutral-700">
                                <tr>
                                  <th className="p-2 border-b">Evaluation Component</th>
                                  <th className="p-2 border-b text-center">Weight</th>
                                  <th className="p-2 border-b text-right">Awarded Score</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-neutral-200">
                                <tr>
                                  <td className="p-2">Academic Advisor Assessment</td>
                                  <td className="p-2 text-center text-neutral-500">25%</td>
                                  <td className="p-2 text-right font-mono font-bold">{letterForm.advisor_score}%</td>
                                </tr>
                                <tr>
                                  <td className="p-2">UIL Officer Industry Review</td>
                                  <td className="p-2 text-center text-neutral-500">25%</td>
                                  <td className="p-2 text-right font-mono font-bold">{letterForm.uil_score}%</td>
                                </tr>
                                <tr>
                                  <td className="p-2">Documentation & SRS Technical Report</td>
                                  <td className="p-2 text-center text-neutral-500">25%</td>
                                  <td className="p-2 text-right font-mono font-bold">{letterForm.doc_score}%</td>
                                </tr>
                                <tr>
                                  <td className="p-2">Final Defense & Oral Presentation</td>
                                  <td className="p-2 text-center text-neutral-500">25%</td>
                                  <td className="p-2 text-right font-mono font-bold">{letterForm.pres_score}%</td>
                                </tr>
                                <tr className="bg-emerald-50 font-bold text-emerald-900">
                                  <td className="p-2">Composite Academic Total</td>
                                  <td className="p-2 text-center">100%</td>
                                  <td className="p-2 text-right font-mono text-sm">
                                    {totalScore}%
                                  </td>
                                </tr>
                                <tr className="bg-neutral-50 text-[10px]">
                                  <td className="p-2 font-bold text-neutral-700" colSpan={2}>
                                    Equivalent Letter Grade & Classification:
                                  </td>
                                  <td className="p-2 text-right font-bold text-emerald-800">
                                    {getScoreClassification(totalScore).grade} ({getScoreClassification(totalScore).honors})
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <h4 className="font-bold text-neutral-900 font-sans text-xs">
                            ARTICLE III: ACADEMIC STANDING & DEAN HONORS REMARKS
                          </h4>
                          <div className="p-3 bg-neutral-50 border-l-4 border-emerald-600 rounded-r-xl italic text-neutral-800 font-serif">
                            {letterForm.score_notes || 'Student demonstrated high technical diligence and fulfilled all prerequisite UIL milestones with distinction.'}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <h4 className="font-bold text-neutral-900 font-sans text-xs">
                            ARTICLE IV: DIGITAL ARCHIVAL & EXCEL COMPOSITE ROSTER VERIFICATION
                          </h4>
                          <p className="text-justify">
                            This evaluation has been committed to the departmental academic records. An official spreadsheet (<code>Track1_Student_Score_Roster.xlsx</code>) has been generated and validated for transmission to the University Registrar.
                          </p>
                          <div className="pt-1 print:hidden">
                            <a
                              href={letterModalStudent.roster_download_url || `/api/v1/uil/departments/roster-excel/?student_id=${letterModalStudent.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 transition-colors shadow-xs"
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Download & Print Official Department Excel Roster (.xlsx)</span>
                            </a>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* BOTTOM FOOTER: Canonical Dean QR Code on ALL 3 Documents */}
                  <div className="pt-5 border-t-2 border-neutral-900 flex items-center justify-between gap-4 font-sans">
                    <div className="space-y-1.5">
                      <div className="font-serif italic text-xs text-neutral-700">
                        Officially Signed, Sealed & Certified by:
                      </div>
                      <div className="font-black text-sm text-neutral-950">
                        {deanTitle || 'Department Dean Dr.'}
                      </div>
                      <div className="text-[11px] text-neutral-600">
                        Department Dean • University Industry Linkage Directorate
                      </div>
                      <div className="text-[10px] text-neutral-500">
                        Department of {letterModalStudent.department || deanDepartment || 'Engineering'}
                      </div>
                      <div className="inline-flex items-center gap-1.5 text-[9px] font-mono text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 mt-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Canonical Signature Verified</span>
                      </div>
                      <div className="text-[9px] font-mono text-neutral-400 block pt-0.5">
                        HMAC: {letterModalStudent.dean_signature_hash ? `${letterModalStudent.dean_signature_hash.slice(0, 28)}...` : 'HMAC-SHA256-DEAN-AUTHENTICATED'}
                      </div>
                    </div>

                    <div className="flex flex-col items-center text-center">
                      <div className="w-24 h-24 bg-white p-1 rounded-2xl border-2 border-neutral-400 shadow-xs flex items-center justify-center">
                        {(letterModalStudent.dean_unique_qr || deanQrCode) ? (
                          <img
                            src={ensureBase64DataUri(letterModalStudent.dean_unique_qr || deanQrCode)}
                            alt="Dean Canonical QR Signature"
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <QrCode className="w-12 h-12 text-neutral-400" />
                        )}
                      </div>
                      <span className="text-[9px] font-mono text-neutral-500 mt-1 font-bold">
                        Dean Canonical QR
                      </span>
                      <span className="text-[8px] font-mono text-emerald-600">
                        Direct Phone Scannable
                      </span>
                    </div>
                  </div>

                  {/* Document Dispatch State Pill */}
                  <div className="pt-2 border-t border-dashed border-neutral-200 flex items-center justify-between text-[10px] font-mono text-neutral-500">
                    <span>Authentic Institutional Clearance Record</span>
                    <span className="font-bold">
                      {selectedLetterTab === 'internship' && (letterModalStudent.internship_letter_sent ? 'STATUS: OFFICIALLY DISPATCHED ✓' : 'STATUS: DRAFT • PENDING CONFIRMATION')}
                      {selectedLetterTab === 'dorm_food' && (letterModalStudent.dorm_food_letter_sent ? 'STATUS: OFFICIALLY DISPATCHED ✓' : 'STATUS: DRAFT • PENDING CONFIRMATION')}
                      {selectedLetterTab === 'score' && (letterModalStudent.score_letter_sent ? 'STATUS: OFFICIALLY RELEASED ✓' : 'STATUS: DRAFT • PENDING CONFIRMATION')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Footer Action Bar: Prominent Confirm and Send Buttons Everywhere */}
            <div className="shrink-0 p-3.5 sm:p-4 border-t border-neutral-200 dark:border-neutral-800 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-3 print:hidden z-10">
              <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                <span className="text-xs text-neutral-500 font-mono flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Current Document:{' '}
                    <strong className="text-neutral-800 dark:text-neutral-200">
                      {selectedLetterTab === 'internship' && (letterModalStudent.internship_letter_sent ? 'Dispatched to Student ✓' : 'Draft (Ready to Confirm & Send)')}
                      {selectedLetterTab === 'dorm_food' && (letterModalStudent.dorm_food_letter_sent ? 'Dispatched to Student ✓' : 'Draft (Ready to Confirm & Send)')}
                      {selectedLetterTab === 'score' && (letterModalStudent.score_letter_sent ? 'Released to Student ✓' : 'Draft (Ready to Confirm & Release)')}
                    </strong>
                  </span>
                </span>

                {/* Quick Letter Navigation */}
                <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-xl border border-neutral-200 dark:border-neutral-700">
                  <button
                    type="button"
                    disabled={selectedLetterTab === 'internship'}
                    onClick={handlePrevLetter}
                    className="px-2 py-1 text-[11px] font-bold rounded-lg text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white disabled:opacity-40 disabled:hover:text-neutral-600 transition-colors flex items-center gap-1"
                    title="Previous Letter"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Prev Letter</span>
                  </button>
                  <div className="h-3 w-px bg-neutral-300 dark:bg-neutral-700" />
                  <button
                    type="button"
                    disabled={selectedLetterTab === 'score'}
                    onClick={handleNextLetter}
                    className="px-2 py-1 text-[11px] font-bold rounded-lg text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white disabled:opacity-40 disabled:hover:text-neutral-600 transition-colors flex items-center gap-1"
                    title="Next Letter"
                  >
                    <span className="hidden sm:inline">Next Letter</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
                {/* Print Current Official Document */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => window.print()}
                  className="text-xs font-bold gap-1.5 border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <Printer className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-300" />
                  <span>Print Document</span>
                </Button>

                {/* Primary: Confirm and Send Current Letter */}
                <Button
                  type="button"
                  disabled={isSubmittingLetter}
                  onClick={() => handleSendIndividualLetter(selectedLetterTab)}
                  className={`text-xs font-bold gap-1.5 h-9 px-4 rounded-xl text-white shadow-sm transition-all ${
                    selectedLetterTab === 'internship'
                      ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20'
                      : selectedLetterTab === 'dorm_food'
                      ? 'bg-teal-600 hover:bg-teal-700 shadow-teal-500/20'
                      : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20'
                  }`}
                >
                  {isSubmittingLetter ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>
                    Confirm and Send {
                      selectedLetterTab === 'internship'
                        ? 'Internship Letter'
                        : selectedLetterTab === 'dorm_food'
                        ? 'Dorm & Cafeteria Permit'
                        : 'Score Sheet & Roster'
                    }
                  </span>
                </Button>

                {/* Secondary: Batch Confirm & Dispatch All 3 Letters */}
                <Button
                  type="button"
                  disabled={isSubmittingLetter}
                  variant="outline"
                  onClick={handleSendAllLetters}
                  className="text-xs font-bold gap-1.5 h-9 px-3.5 rounded-xl border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 bg-amber-50/70 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                  title="Confirm and dispatch all 3 clearance documents in one step"
                >
                  <PenTool className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Confirm & Dispatch All 3 Letters</span>
                </Button>

                {/* Toggle Back to Dashboard */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={closeLetterModal}
                  className="text-xs font-bold text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                >
                  <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                  <span>Toggle Back</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DIRECT DEAN-STUDENT CHAT APP MODAL */}
      {isChatAppOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-[#14151a] rounded-2xl max-w-xl w-full border border-neutral-200 dark:border-neutral-800 shadow-2xl flex flex-col h-[600px] max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {chatStudent ? (
              <>
                {/* Active Conversation Header */}
                <div className="p-4 bg-neutral-50/90 dark:bg-neutral-900/90 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => setChatStudent(null)}
                      className="p-1.5 -ml-1 rounded-lg text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-200/50 dark:hover:bg-neutral-800 transition-colors flex items-center gap-1 text-xs font-semibold shrink-0 cursor-pointer"
                      title="Back to All Students"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span className="hidden sm:inline">All Students</span>
                    </button>
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold text-sm shrink-0">
                      {chatStudent.full_name?.charAt(0) || 'S'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm text-neutral-900 dark:text-white truncate">
                          {chatStudent.full_name}
                        </h3>
                        {chatStudent.is_verified_by_dean && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1 shrink-0">
                            <CheckCircle2 className="w-3 h-3" /> Verified
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-neutral-400 truncate">
                        ID: {chatStudent.student_id_number} • Year {chatStudent.academic_year} • {chatStudent.department}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsChatAppOpen(false)
                      setChatStudent(null)
                    }}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/50 dark:hover:bg-neutral-800 transition-colors shrink-0 ml-2 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Messages Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-neutral-50/30 dark:bg-neutral-950/20">
                  {chatLoading && chatMessages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-neutral-400 gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                      Loading communication channel...
                    </div>
                  ) : chatMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-neutral-400 space-y-2">
                      <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center mb-1">
                        <MessageSquare className="w-6 h-6" />
                      </div>
                      <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                        Communication Channel Active
                      </p>
                      <p className="text-[11px] max-w-xs text-neutral-500">
                        Send an official message to {chatStudent.full_name} regarding clearance, defense, or track requirements.
                      </p>
                    </div>
                  ) : (
                    chatMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${msg.is_mine ? 'items-end' : 'items-start'}`}
                      >
                        <div className="flex items-center gap-1.5 mb-1 px-1">
                          <span className="text-[10px] font-bold text-neutral-500">
                            {msg.is_mine ? (deanTitle || 'Department Dean') : msg.sender_name}
                          </span>
                          <span className="text-[9px] text-neutral-400">
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-xs ${
                            msg.is_mine
                              ? 'bg-amber-600 text-white rounded-br-xs'
                              : 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 border border-neutral-200/80 dark:border-neutral-700/80 rounded-bl-xs'
                          }`}
                        >
                          {msg.message}
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={chatMessagesEndRef} />
                </div>

                {/* Input Form */}
                <form
                  onSubmit={handleSendChatMessage}
                  className="p-3 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 flex items-center gap-2 shrink-0"
                >
                  <input
                    type="text"
                    placeholder={`Message ${chatStudent.full_name}...`}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    className="flex-1 px-3.5 py-2 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-amber-500/30 text-neutral-900 dark:text-white"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={sendingMessage || !chatInput.trim()}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-9 px-4 shrink-0"
                  >
                    {sendingMessage ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5 mr-1" /> Send
                      </>
                    )}
                  </Button>
                </form>
              </>
            ) : (
              <>
                {/* Student Channel Directory Header */}
                <div className="p-4 bg-neutral-50/90 dark:bg-neutral-900/90 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm text-neutral-900 dark:text-white">
                          Student Consultation Channels
                        </h3>
                        {totalUnreadCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
                            {totalUnreadCount} unread
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-neutral-400">
                        Select a student to open direct communication channel
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsChatAppOpen(false)}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/50 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Search Bar */}
                <div className="p-3 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-neutral-400" />
                    <input
                      type="text"
                      placeholder="Search students by name, ID number, or department..."
                      value={chatSearchQuery}
                      onChange={(e) => setChatSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-amber-500/30 text-neutral-900 dark:text-white"
                    />
                  </div>
                </div>

                {/* Directory List */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-neutral-50/30 dark:bg-neutral-950/20">
                  {(() => {
                    const filteredStudents = students
                      .filter((s) => {
                        const query = chatSearchQuery.toLowerCase()
                        return (
                          s.full_name?.toLowerCase().includes(query) ||
                          s.student_id_number?.toLowerCase().includes(query) ||
                          s.department?.toLowerCase().includes(query)
                        )
                      })
                      .sort((a, b) => {
                        const unreadA = unreadByStudent[a.id] || 0
                        const unreadB = unreadByStudent[b.id] || 0
                        if (unreadA !== unreadB) return unreadB - unreadA
                        if (a.is_verified_by_dean !== b.is_verified_by_dean) {
                          return a.is_verified_by_dean ? -1 : 1
                        }
                        return a.full_name.localeCompare(b.full_name)
                      })

                    if (filteredStudents.length === 0) {
                      return (
                        <div className="h-full flex flex-col items-center justify-center text-center p-6 text-neutral-400 space-y-2">
                          <MessageSquare className="w-8 h-8 text-neutral-300 dark:text-neutral-700" />
                          <p className="text-xs font-medium">No students found matching your search</p>
                        </div>
                      )
                    }

                    return filteredStudents.map((s) => {
                      const unreadCount = unreadByStudent[s.id] || 0
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setChatStudent(s)}
                          className="w-full text-left p-3 rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white dark:bg-neutral-900 hover:border-amber-500/50 hover:bg-amber-50/30 dark:hover:bg-amber-950/10 transition-all flex items-center justify-between group cursor-pointer"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="relative">
                              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold text-sm shrink-0">
                                {s.full_name?.charAt(0) || 'S'}
                              </div>
                              {unreadCount > 0 && (
                                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-600 rounded-full ring-2 ring-white dark:ring-neutral-900 animate-pulse" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-xs text-neutral-900 dark:text-white truncate">
                                  {s.full_name}
                                </h4>
                                {s.is_verified_by_dean ? (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                    Verified
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                                    Pending
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-neutral-400 truncate">
                                ID: {s.student_id_number} • Year {s.academic_year} • {s.department}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-3">
                            {unreadCount > 0 && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-600 text-white animate-pulse">
                                {unreadCount} new
                              </span>
                            )}
                            <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-all" />
                          </div>
                        </button>
                      )
                    })
                  })()}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* FLOATING DEAN CHAT TRIGGER (ACCESSIBLE ACROSS ALL TABS) */}
      <button
        type="button"
        onClick={() => setIsChatAppOpen(true)}
        className="fixed bottom-6 right-6 z-40 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-bold text-xs py-3 px-4 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-200 flex items-center gap-2 group cursor-pointer"
        title="Chat with Students"
      >
        <div className="relative">
          <MessageSquare className="w-5 h-5 group-hover:scale-110 transition-transform" />
          {totalUnreadCount > 0 && (
            <span className="absolute -top-2 -right-2 min-w-4 h-4 px-1 bg-red-600 text-white text-[10px] font-black rounded-full flex items-center justify-center animate-pulse">
              {totalUnreadCount}
            </span>
          )}
        </div>
        <span>Chat with Students</span>
      </button>

      {/* REAL-TIME INCOMING STUDENT MESSAGE ALERT TOAST */}
      {incomingMessageAlert && (
        <div className="fixed bottom-24 right-6 z-50 max-w-sm w-full bg-white dark:bg-neutral-900 border-2 border-amber-500/80 rounded-2xl p-4 shadow-2xl animate-bounce flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center flex-shrink-0">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-900 dark:text-white truncate">
                {incomingMessageAlert.student.full_name}
              </span>
              <button
                type="button"
                onClick={() => setIncomingMessageAlert(null)}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-300 line-clamp-2 mt-0.5">
              {incomingMessageAlert.message}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setChatStudent(incomingMessageAlert.student)
                  setIsChatAppOpen(true)
                  setIncomingMessageAlert(null)
                }}
                className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold cursor-pointer"
              >
                Reply Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
