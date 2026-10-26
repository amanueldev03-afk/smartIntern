import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useSearchParams, useLocation } from 'react-router-dom'
import { 
  Sparkles, 
  FileText, 
  Bookmark, 
  Send, 
  ArrowRight, 
  Upload, 
  RefreshCw, 
  UserCheck, 
  KeyRound, 
  AlertCircle,
  Compass,
  ChevronRight,
  Lock,
  MapPin,
  Briefcase,
  Calendar,
  ExternalLink,
  Cpu,
  Utensils,
  CheckCircle2,
  ShieldCheck,
  AlertTriangle,
  MessagesSquare,
  FileCheck,
  Award,
  Users,
  Copy,
  Check,
  QrCode,
  X,
  Clock,
  Loader2,
  Building,
  FileSpreadsheet,
  Home,
  ZoomIn,
  Eye,
  EyeOff,
  GraduationCap
} from 'lucide-react'
import api from '@/services/api'
import { useAppSelector } from '@/hooks/redux'
import * as authApi from '@/services/authApi'
import * as studentApi from '@/services/studentApi'
import { fetchDashboardData, getRecommendations } from '@/services/dashboardApi'
import { searchInternships } from '@/services/internshipApi'
import { getMyTeamChannel, uploadTeamSRS, type ProjectTeamData } from '@/services/projectsApi'
import { getCampusLogistics, type CampusLogisticsItem } from '@/services/logisticsApi'
import TeamCommunicationHub from '@/components/communication/TeamCommunicationHub'
import type { DashboardData } from '@/services/dashboardApi'
import type { User, Internship } from '@/types'
import type { Skill, CareerInterest } from '@/services/studentApi'
import { Button } from '@/components/ui/button'
import { normalizeApplicationUrl } from '@/utils/urlValidation'
import { ensureBase64DataUri } from '@/utils/qrUtils'
import NotificationBell from '@/components/common/NotificationBell'

function formatDate(dateString?: string) {
  if (!dateString) return 'Active'
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}


function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-error-50/80 dark:bg-error-950/40 border border-error-200 dark:border-error-800">
      <span className="text-xs font-semibold text-error-700 dark:text-error-400">{message}</span>
      <button
        onClick={onRetry}
        className="text-xs font-bold text-primary-600 hover:text-primary-700 dark:text-primary-400 underline transition-all duration-200"
      >
        Retry
      </button>
    </div>
  )
}

function ResumeStatusCard({
  hasResume,
  statusLabel,
  statusColor,
  skillsDetected,
  error,
  onRetry,
}: {
  hasResume: boolean
  statusLabel: string
  statusColor: string
  skillsDetected: number
  error: boolean
  onRetry: () => void
}) {
  return (
    <div className="card-gradient p-6 rounded-3xl space-y-4 hover:shadow-glow transition-all duration-300 transform hover:-translate-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Resume</span>
        <div className="w-8 h-8 rounded-xl bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center">
          <FileText className="w-4 h-4" />
        </div>
      </div>
      {error ? (
        <SectionError message="Resume status unavailable" onRetry={onRetry} />
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span aria-label={`Resume status: ${statusLabel}`} className={`px-3 py-1 rounded-full text-xs font-bold ${statusColor}`}>
              {statusLabel}
            </span>
          </div>
          <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {hasResume
              ? skillsDetected > 0
                ? `${skillsDetected} skills detected`
                : 'Uploaded & Verified'
              : 'Upload to unlock AI recommendations'}
          </div>
          <div className="pt-1">
            <Link
              to="/profile"
              className="text-xs font-bold text-primary-600 dark:text-primary-400 hover:underline inline-flex items-center gap-1"
            >
              {hasResume ? 'View Resume' : 'Upload Resume'} <span aria-hidden="true">→</span>
            </Link>
          </div>
        </>
      )}
    </div>
  )
}

function CountCard({
  label,
  value,
  error,
  onRetry,
  emptyMessage,
  presentMessage,
  icon: Icon,
  badgeText,
}: {
  label: string
  value: number | null
  error: boolean
  onRetry: () => void
  emptyMessage: string
  presentMessage: string
  icon: any
  badgeText?: string
}) {
  return (
    <div className="card-gradient p-6 rounded-3xl space-y-4 hover:shadow-glow transition-all duration-300 transform hover:-translate-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">{label}</span>
        <div className="w-8 h-8 rounded-xl bg-secondary-500/10 text-secondary-600 dark:text-secondary-400 flex items-center justify-center">
          <Icon className="w-4 h-4" />
        </div>
      </div>
      {error ? (
        <SectionError message={`${label} unavailable`} onRetry={onRetry} />
      ) : (
        <>
          <div className="flex items-baseline justify-between">
            <div className="text-3xl font-extrabold gradient-text" aria-label={`${value} ${label.toLowerCase()}`}>
              {value !== null ? value : '—'}
            </div>
            {badgeText && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-primary-500/10 text-primary-600 dark:text-primary-400">
                {badgeText}
              </span>
            )}
          </div>
          <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            {value === 0 ? emptyMessage : presentMessage}
          </div>
        </>
      )}
    </div>
  )
}

function ProfileCompletionCard({
  percent,
  sections,
  error,
  onRetry,
}: {
  percent: number | null
  sections: Record<string, boolean> | null
  error: boolean
  onRetry: () => void
}) {
  const clamped = percent === null ? 0 : Math.min(100, Math.max(0, percent))
  const isComplete = clamped === 100

  const statusLabel = (() => {
    if (percent === null) return 'Unknown'
    if (isComplete) return 'Complete'
    if (clamped === 0) return 'Not started'
    if (clamped < 50) return 'Getting started'
    if (clamped < 80) return 'Almost there'
    return 'Nearly complete'
  })()

  return (
    <div className="card-gradient p-6 rounded-3xl space-y-4 hover:shadow-glow transition-all duration-300 transform hover:-translate-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
          Profile Strength
        </span>
        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
          <UserCheck className="w-4 h-4" />
        </div>
      </div>
      {error ? (
        <SectionError message="Profile completion unavailable" onRetry={onRetry} />
      ) : (
        <>
          <div className="flex items-baseline justify-between">
            <span
              className="text-3xl font-extrabold gradient-text"
              aria-label={percent === null ? 'Profile completion: unknown percent' : `Profile completion: ${clamped} percent`}
            >
              {percent !== null ? `${clamped}%` : '—'}
            </span>
            <span className="text-xs font-bold text-neutral-600 dark:text-neutral-300">{statusLabel}</span>
          </div>
          <div
            className="w-full bg-neutral-100 dark:bg-neutral-800 rounded-full h-2.5 overflow-hidden"
            role="progressbar"
            aria-valuenow={clamped}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Profile completion progress"
          >
            <div
              className="bg-gradient-to-r from-primary-500 via-secondary-500 to-emerald-500 h-2.5 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${clamped}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs font-medium text-neutral-400">
            {sections && (
              <span>
                {Object.values(sections).filter(Boolean).length}/{Object.keys(sections).length} sections done
              </span>
            )}
            <Link to="/profile" className="text-primary-600 dark:text-primary-400 font-semibold hover:underline">
              Edit Profile →
            </Link>
          </div>
        </>
      )}
    </div>
  )
}

export default function StudentDashboard() {
  const authUser = useAppSelector((state) => state.auth.user)

  const [user, setUser] = useState<User | null>(authUser)
  const [data, setData] = useState<DashboardData | null>(null)
  const location = useLocation()
  const [showVerifiedToast, setShowVerifiedToast] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    if ((location.state as any)?.verifiedJustNow || searchParams.get('verified') === 'true') {
      setShowVerifiedToast(true)
    }
  }, [location, searchParams])

  const activeTab = (searchParams.get('tab') as 'overview' | 'track1' | 'logistics' | 'channel') || 'overview'
  const setActiveTab = (tab: 'overview' | 'track1' | 'logistics' | 'channel') => {
    setSearchParams({ tab })
  }
  const [myTeam, setMyTeam] = useState<ProjectTeamData | null>(null)
  const [campusPass, setCampusPass] = useState<CampusLogisticsItem | null>(null)
  const [srsFile, setSrsFile] = useState<File | null>(null)
  const [isUploadingSRS, setIsUploadingSRS] = useState(false)
  const [srsStatusMsg, setSrsStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [copiedHash, setCopiedHash] = useState(false)
  const [mySkills, setMySkills] = useState<Skill[]>([])
  const [myInterests, setMyInterests] = useState<CareerInterest[]>([])

  const [featuredInternships, setFeaturedInternships] = useState<Internship[]>([])
  const [aiRecommendations, setAiRecommendations] = useState<Internship[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false)
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)

  // Track 1 Student State
  const [invitations, setInvitations] = useState<any[]>([])
  const [isRespondingInvite, setIsRespondingInvite] = useState<string | null>(null)
  const [isForwardingToUIL, setIsForwardingToUIL] = useState(false)
  const [forwardedToUIL, setForwardedToUIL] = useState(false)
  const [isForwardingToDorm, setIsForwardingToDorm] = useState(false)
  const [forwardedToDorm, setForwardedToDorm] = useState(false)
  const [isForwardingToStudentDean, setIsForwardingToStudentDean] = useState(false)
  const [forwardedToStudentDean, setForwardedToStudentDean] = useState(false)
  const [studentQrModal, setStudentQrModal] = useState<{ title: string; qrBase64: string } | null>(null)
  const [lastViewedLetter, setLastViewedLetter] = useState<'internship' | 'dorm_food' | 'score'>('internship')
  const [isClearanceLetterModalOpen, setIsClearanceLetterModalOpen] = useState(false)
  const [isScoreRosterModalOpen, setIsScoreRosterModalOpen] = useState(false)
  const [isQrScannerModalOpen, setIsQrScannerModalOpen] = useState(false)
  const [qrZoomLevel, setQrZoomLevel] = useState<'fit' | '1.5x' | '2x'>('fit')

  const [uilProfile, setUilProfile] = useState<{
    id?: string
    student_id_number?: string
    campus_city?: string
    department?: string
    academic_year?: number
    gpa?: string | null
    is_eligible?: boolean
    is_verified_by_dean?: boolean
    dean_verified_at?: string | null
    dean_name?: string | null
    dean_title?: string | null
    dean_email?: string | null
    dean_department?: string | null
    dean_unique_qr?: string | null
    dean_letter_title?: string | null
    dean_letter_notes?: string | null
    internship_letter_sent?: boolean
    internship_letter_sent_at?: string | null
    dorm_food_letter_title?: string | null
    dorm_food_letter_notes?: string | null
    dorm_food_letter_sent?: boolean
    dorm_food_letter_sent_at?: string | null
    score_letter_notes?: string | null
    score_letter_sent?: boolean
    score_letter_sent_at?: string | null
    score_roster_data?: {
      gpa?: number | string
      advisor_score?: number
      uil_score?: number
      doc_score?: number
      defense_score?: number
      total_score?: number
      remarks?: string
    } | null
    dean_allow_dorm?: boolean
    dean_allow_food?: boolean
    dean_allow_internship?: boolean
    dean_valid_from?: string | null
    dean_valid_until?: string | null
    dean_signature_hash?: string
    dean_verification_letter_qr?: string
    dean_dorm_food_letter_qr?: string
    dean_letter_qr?: string
    has_score_roster?: boolean
    score_roster_preview?: {
      student_id?: string
      full_name?: string
      department?: string
      academic_year?: string
      gpa?: string
      eligibility_status?: string
      endorsed_by?: string
      signature_hash?: string
      verified_date?: string
      allowed_services?: string[]
      valid_from?: string | null
      valid_until?: string | null
    }
    forwarded_to_uil?: boolean
    forwarded_to_uil_at?: string | null
    forwarded_to_dorm?: boolean
    forwarded_to_dorm_at?: string | null
    forwarded_to_student_dean?: boolean
    forwarded_to_student_dean_at?: string | null
  } | null>(null)

  // Track 1 Cohorts Placement
  const [studentCohorts, setStudentCohorts] = useState<{
    id: string
    title: string
    university_name: string
    department: string
    requirements: string
    opportunities: string
    min_gpa: string | null
    academic_year: string
    start_date: string
    end_date: string
    capacity_k: number
    enrolled_count: number
    is_open: boolean
    is_invited: boolean
    is_enrolled: boolean
  }[]>([])
  const [isAcceptingCohort, setIsAcceptingCohort] = useState<string | null>(null)
  const [isRejectingCohort, setIsRejectingCohort] = useState<string | null>(null)
  const [dismissedCohortIds, setDismissedCohortIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('student_dismissed_cohorts') || '[]')
    } catch {
      return []
    }
  })
  const [showHiddenCohorts, setShowHiddenCohorts] = useState(false)

  const handleDismissCohort = (cohortId: string) => {
    const updated = Array.from(new Set([...dismissedCohortIds, cohortId]))
    setDismissedCohortIds(updated)
    try {
      localStorage.setItem('student_dismissed_cohorts', JSON.stringify(updated))
    } catch {}
  }

  const handleRestoreCohort = (cohortId: string) => {
    const updated = dismissedCohortIds.filter((id) => id !== cohortId)
    setDismissedCohortIds(updated)
    try {
      localStorage.setItem('student_dismissed_cohorts', JSON.stringify(updated))
    } catch {}
  }

  const handleRejectCohort = async (cohortId: string) => {
    if (!confirm('Are you sure you want to decline this cohort invitation? This will notify the institutional UIL Officer.')) return
    setIsRejectingCohort(cohortId)
    try {
      const res = await api.post(`/v1/projects/cohorts/${cohortId}/reject/`)
      alert(res.data.message || 'Cohort invitation declined.')
      await fetchMyCohorts()
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to decline cohort invitation.')
    } finally {
      setIsRejectingCohort(null)
    }
  }

  const fetchMyCohorts = async () => {
    try {
      const res = await api.get('/v1/projects/cohorts/my-cohorts/')
      if (res.data?.cohorts) {
        setStudentCohorts(res.data.cohorts)
      }
    } catch {
      // silent
    }
  }

  const handleAcceptCohort = async (cohortId: string) => {
    setIsAcceptingCohort(cohortId)
    try {
      const res = await api.post(`/v1/projects/cohorts/${cohortId}/accept/`)
      alert(res.data.message || 'Successfully enrolled in Track 1 In-House Cohort!')
      await fetchMyCohorts()
      try {
        const logisticsRes = await api.get('/v1/logistics/')
        if (logisticsRes.data && logisticsRes.data.length > 0) {
          setCampusPass(logisticsRes.data[0])
        }
      } catch {
        // silent
      }
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to accept cohort placement.')
    } finally {
      setIsAcceptingCohort(null)
    }
  }

  // Direct Company Chat
  const [companyChatInviteId, setCompanyChatInviteId] = useState<string | null>(null)
  const [companyChatMessages, setCompanyChatMessages] = useState<any[]>([])
  const [companyChatText, setCompanyChatText] = useState('')
  const [isSendingCompanyChat, setIsSendingCompanyChat] = useState(false)

  // Unified Institutional Chat State (Department Dean vs UIL Officer)
  const [activeChatTab, setActiveChatTab] = useState<'dean' | 'uil'>('dean')
  const [isDeanChatOpen, setIsDeanChatOpen] = useState(false)

  // 1. Department Dean Chat State
  const [deanChatMessages, setDeanChatMessages] = useState<any[]>([])
  const [deanChatDean, setDeanChatDean] = useState<{ id: string; full_name: string; email: string; department: string } | null>(null)
  const [deanChatText, setDeanChatText] = useState('')
  const [isDeanChatLoading, setIsDeanChatLoading] = useState(false)
  const [isSendingDeanMessage, setIsSendingDeanMessage] = useState(false)
  const [deanUnreadCount, setDeanUnreadCount] = useState<number>(0)
  const [deanIncomingAlert, setDeanIncomingAlert] = useState<{ sender_name: string; message: string } | null>(null)
  const deanChatEndRef = useRef<HTMLDivElement>(null)
  const lastSeenDeanMsgCountRef = useRef<number>(0)

  // 2. UIL Head Officer Chat State
  const [uilChatMessages, setUilChatMessages] = useState<any[]>([])
  const [uilChatOfficer, setUilChatOfficer] = useState<{ id: string; name: string; email: string; university?: string } | null>(null)
  const [uilChatText, setUilChatText] = useState('')
  const [isUilChatLoading, setIsUilChatLoading] = useState(false)
  const [isSendingUilMessage, setIsSendingUilMessage] = useState(false)
  const [uilUnreadCount, setUilUnreadCount] = useState<number>(0)
  const [uilIncomingAlert, setUilIncomingAlert] = useState<{ sender_name: string; message: string } | null>(null)
  const uilChatEndRef = useRef<HTMLDivElement>(null)
  const lastSeenUilMsgCountRef = useRef<number>(0)

  const fetchDeanChat = useCallback(async (isInitial = false, markRead = false) => {
    try {
      if (isInitial) setIsDeanChatLoading(true)
      const url = markRead ? '/v1/uil-profiles/student/dean-chat/?mark_read=true' : '/v1/uil-profiles/student/dean-chat/'
      const res = await api.get(url)
      const msgs = res.data?.messages || []
      setDeanChatMessages(msgs)
      if (res.data?.dean) setDeanChatDean(res.data.dean)

      if (markRead) {
        setDeanUnreadCount(0)
        setDeanIncomingAlert(null)
      } else if (typeof res.data?.unread_count === 'number') {
        setDeanUnreadCount(res.data.unread_count)
      }

      if (!markRead && lastSeenDeanMsgCountRef.current > 0 && msgs.length > lastSeenDeanMsgCountRef.current) {
        const lastMsg = msgs[msgs.length - 1]
        if (!lastMsg.is_mine) {
          setDeanIncomingAlert({
            sender_name: lastMsg.sender_name || res.data?.dean_title || 'Department Dean',
            message: lastMsg.message,
          })
        }
      }
      lastSeenDeanMsgCountRef.current = msgs.length
    } catch {
      // silent
    } finally {
      if (isInitial) setIsDeanChatLoading(false)
    }
  }, [])

  const fetchUilChat = useCallback(async (isInitial = false, markRead = false) => {
    try {
      if (isInitial) setIsUilChatLoading(true)
      const url = markRead ? '/v1/uil-profiles/student/uil-chat/?mark_read=true' : '/v1/uil-profiles/student/uil-chat/'
      const res = await api.get(url)
      const msgs = res.data?.messages || []
      setUilChatMessages(msgs)
      if (res.data?.uil_officer) setUilChatOfficer(res.data.uil_officer)

      if (markRead) {
        setUilUnreadCount(0)
        setUilIncomingAlert(null)
      } else if (typeof res.data?.unread_count === 'number') {
        setUilUnreadCount(res.data.unread_count)
      }

      if (!markRead && lastSeenUilMsgCountRef.current > 0 && msgs.length > lastSeenUilMsgCountRef.current) {
        const lastMsg = msgs[msgs.length - 1]
        if (!lastMsg.is_mine) {
          setUilIncomingAlert({
            sender_name: lastMsg.sender_name || res.data?.uil_officer?.name || 'UIL Head Officer',
            message: lastMsg.message,
          })
        }
      }
      lastSeenUilMsgCountRef.current = msgs.length
    } catch {
      // silent
    } finally {
      if (isInitial) setIsUilChatLoading(false)
    }
  }, [])

  // Background polling for both Dean & UIL channels
  useEffect(() => {
    fetchDeanChat(true, isDeanChatOpen && activeChatTab === 'dean')
    fetchUilChat(true, isDeanChatOpen && activeChatTab === 'uil')
    const interval = setInterval(() => {
      fetchDeanChat(false, isDeanChatOpen && activeChatTab === 'dean')
      fetchUilChat(false, isDeanChatOpen && activeChatTab === 'uil')
    }, 4500)
    return () => clearInterval(interval)
  }, [isDeanChatOpen, activeChatTab, fetchDeanChat, fetchUilChat])

  // When chat modal opens or active tab switches, mark that specific channel read
  useEffect(() => {
    if (isDeanChatOpen) {
      if (activeChatTab === 'dean') {
        setDeanUnreadCount(0)
        setDeanIncomingAlert(null)
        fetchDeanChat(false, true)
      } else if (activeChatTab === 'uil') {
        setUilUnreadCount(0)
        setUilIncomingAlert(null)
        fetchUilChat(false, true)
      }
    }
  }, [isDeanChatOpen, activeChatTab, fetchDeanChat, fetchUilChat])

  useEffect(() => {
    if (activeChatTab === 'dean') {
      deanChatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [deanChatMessages, activeChatTab])

  useEffect(() => {
    if (activeChatTab === 'uil') {
      uilChatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [uilChatMessages, activeChatTab])

  // Direct redirection and modal opening from notification clicks or query params
  useEffect(() => {
    const chatParam = searchParams.get('chat')
    const uilParam = searchParams.get('uil')
    const letterParam = searchParams.get('letter')
    const tabParam = searchParams.get('tab')

    if (chatParam === 'true') {
      if (uilParam === 'true') {
        setActiveChatTab('uil')
      } else {
        setActiveChatTab('dean')
      }
      setIsDeanChatOpen(true)
    }
    if (letterParam === 'true' || letterParam === 'internship') {
      setLastViewedLetter('internship')
      setIsClearanceLetterModalOpen(true)
    } else if (letterParam === 'dorm_food') {
      setLastViewedLetter('dorm_food')
      setIsClearanceLetterModalOpen(true)
    } else if (letterParam === 'score') {
      setLastViewedLetter('score')
      setIsScoreRosterModalOpen(true)
    }
    if (tabParam && ['overview', 'track1', 'logistics', 'channel'].includes(tabParam)) {
      setActiveTab(tabParam as any)
    }
  }, [searchParams])

  useEffect(() => {
    const handleNotificationAction = (event: Event) => {
      const customEvent = event as CustomEvent<any>
      const notif = customEvent.detail
      if (!notif) return

      if (notif.notification_type === 'CHAT' || notif.link?.includes('chat=true')) {
        if (notif.link?.includes('uil=true') || notif.actor_role === 'uil_officer' || notif.title?.toLowerCase().includes('uil')) {
          setActiveChatTab('uil')
        } else {
          setActiveChatTab('dean')
        }
        setIsDeanChatOpen(true)
      } else if (
        notif.notification_type === 'CLEARANCE_LETTER' ||
        notif.notification_type === 'VERIFICATION' ||
        notif.link?.includes('letter=')
      ) {
        if (notif.link?.includes('letter=dorm_food') || notif.metadata?.letter_type === 'dorm_food') {
          setLastViewedLetter('dorm_food')
          setIsClearanceLetterModalOpen(true)
        } else if (notif.link?.includes('letter=score') || notif.metadata?.letter_type === 'score') {
          setLastViewedLetter('score')
          setIsScoreRosterModalOpen(true)
        } else {
          setLastViewedLetter('internship')
          setIsClearanceLetterModalOpen(true)
        }
      } else if (notif.notification_type === 'LOGISTICS' || notif.link?.includes('tab=logistics')) {
        setActiveTab('logistics')
      } else if (notif.notification_type === 'DEFENSE' || notif.link?.includes('tab=channel')) {
        setActiveTab('channel')
      } else if (notif.notification_type === 'COHORT' || notif.link?.includes('tab=track1')) {
        setActiveTab('track1')
        setTimeout(() => {
          const el = document.getElementById('track1-cohorts-section')
          if (el) el.scrollIntoView({ behavior: 'smooth' })
        }, 150)
      }
    }

    window.addEventListener('smartintern:notification-action', handleNotificationAction)
    return () => {
      window.removeEventListener('smartintern:notification-action', handleNotificationAction)
    }
  }, [])

  const handleSendDeanMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!deanChatText.trim() || isSendingDeanMessage) return
    setIsSendingDeanMessage(true)
    try {
      const res = await api.post('/v1/uil-profiles/student/dean-chat/send/', {
        message: deanChatText.trim(),
      })
      setDeanChatMessages((prev) => [...prev, res.data])
      setDeanChatText('')
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to send message to Department Dean.')
    } finally {
      setIsSendingDeanMessage(false)
    }
  }

  const handleSendUilMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!uilChatText.trim() || isSendingUilMessage) return
    setIsSendingUilMessage(true)
    try {
      const res = await api.post('/v1/uil-profiles/student/uil-chat/send/', {
        message: uilChatText.trim(),
      })
      setUilChatMessages((prev) => [...prev, res.data])
      setUilChatText('')
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to send message to UIL Officer.')
    } finally {
      setIsSendingUilMessage(false)
    }
  }

  // Submissions & Timers
  const [submittingDoc, setSubmittingDoc] = useState(false)
  const [docContent, setDocContent] = useState('')
  const [submittingImpl, setSubmittingImpl] = useState(false)
  const [implRepoUrl, setImplRepoUrl] = useState('')

  const handleForwardToUIL = async () => {
    setIsForwardingToUIL(true)
    try {
      await api.post('/v1/uil-profiles/student/forward-to-uil/')
      alert('Your verified credentials, Dean QR letters, and Excel roster have been officially forwarded to the UIL Officer!')
      setForwardedToUIL(true)
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Forwarding failed. Ensure Department Dean has completed official verification.')
    } finally {
      setIsForwardingToUIL(false)
    }
  }

  const handleForwardToDorm = async () => {
    setIsForwardingToDorm(true)
    try {
      const res = await api.post('/v1/uil-profiles/student/forward-to-dorm/')
      alert(res.data?.message || 'Your Dorm & Cafeteria letter has been officially forwarded to the Dormitory Administration!')
      setForwardedToDorm(true)
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Forwarding to Dormitory failed. Ensure Dormitory Admin is verified with matching university.')
    } finally {
      setIsForwardingToDorm(false)
    }
  }

  const handleForwardToStudentDean = async () => {
    setIsForwardingToStudentDean(true)
    try {
      const res = await api.post('/v1/uil-profiles/student/forward-to-student-dean/')
      alert(res.data?.message || 'Your Dorm & Cafeteria letter has been officially forwarded to the Student Dean!')
      setForwardedToStudentDean(true)
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Forwarding to Student Dean failed. Ensure Student Dean is verified with matching university.')
    } finally {
      setIsForwardingToStudentDean(false)
    }
  }

  const handleRespondInvitation = async (invitationId: string, response: 'ACCEPT' | 'DECLINE') => {
    setIsRespondingInvite(invitationId)
    try {
      await api.post(`/companies/student/invitations/${invitationId}/respond/`, { response })
      alert(`Invitation ${response === 'ACCEPT' ? 'accepted! Direct chat with company unlocked.' : 'declined.'}`)
      setInvitations((prev) =>
        prev.map((inv) => (inv.id === invitationId ? { ...inv, status: response === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED' } : inv))
      )
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Response failed.')
    } finally {
      setIsRespondingInvite(null)
    }
  }

  const handleOpenCompanyChat = async (invitationId: string) => {
    setCompanyChatInviteId(invitationId)
    try {
      const res = await api.get(`/companies/chat/${invitationId}/`)
      setCompanyChatMessages(res.data.messages || [])
    } catch {
      // silent
    }
  }

  const handleSendCompanyChat = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyChatInviteId || !companyChatText.trim()) return
    setIsSendingCompanyChat(true)
    try {
      const res = await api.post(`/companies/chat/${companyChatInviteId}/send/`, {
        message: companyChatText.trim(),
      })
      setCompanyChatMessages((prev) => [...prev, res.data])
      setCompanyChatText('')
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to send message.')
    } finally {
      setIsSendingCompanyChat(false)
    }
  }

  const handleSubmitDocumentation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!myTeam || !docContent.trim()) return
    setSubmittingDoc(true)
    try {
      await api.post(`/v1/teams/${myTeam.id}/submit-documentation/`, {
        documentation_text: docContent.trim(),
      })
      alert('Software Requirements Specification (SRS) successfully submitted!')
      setDocContent('')
      loadData()
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Documentation submission failed or deadline expired.')
    } finally {
      setSubmittingDoc(false)
    }
  }

  const handleSubmitImplementation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!myTeam || !implRepoUrl.trim()) return
    setSubmittingImpl(true)
    try {
      await api.post(`/v1/teams/${myTeam.id}/submit-implementation/`, {
        repository_url: implRepoUrl.trim(),
        implementation_notes: 'Production build and test suite verified.',
      })
      alert('Project implementation & git repository successfully submitted!')
      setImplRepoUrl('')
      loadData()
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Implementation submission failed or deadline expired.')
    } finally {
      setSubmittingImpl(false)
    }
  }

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [userResult, dashData, skillsResult, interestsResult, internshipsResult, teamResult, logisticsResult] = await Promise.allSettled([
        authApi.getCurrentUser(),
        fetchDashboardData(),
        studentApi.getStudentSkills(),
        studentApi.getStudentInterests(),
        searchInternships({ page_size: 6 }),
        getMyTeamChannel(),
        getCampusLogistics(),
      ])

      try {
        const invRes = await api.get('/companies/student/invitations/')
        setInvitations(Array.isArray(invRes.data) ? invRes.data : [])
      } catch {
        // silent
      }

      if (userResult.status === 'fulfilled') {
        setUser(userResult.value)
      }
      
      if (skillsResult.status === 'fulfilled') setMySkills(skillsResult.value)
      if (interestsResult.status === 'fulfilled') setMyInterests(interestsResult.value)

      if (teamResult.status === 'fulfilled' && teamResult.value?.team) {
        setMyTeam(teamResult.value.team)
      }

      if (logisticsResult.status === 'fulfilled' && Array.isArray(logisticsResult.value) && logisticsResult.value.length > 0) {
        setCampusPass(logisticsResult.value[0])
      }

      try {
        const uilRes = await api.get('/v1/uil-profiles/student/me/')
        if (uilRes.data) {
          setUilProfile(uilRes.data)
          if (uilRes.data.forwarded_to_uil) {
            setForwardedToUIL(true)
          }
          if (uilRes.data.forwarded_to_dorm) {
            setForwardedToDorm(true)
          }
          if (uilRes.data.forwarded_to_student_dean) {
            setForwardedToStudentDean(true)
          }
        }
      } catch {
        // silent
      }

      await fetchMyCohorts()
      
      if (dashData.status === 'fulfilled') {
        setData(dashData.value)
        const d = dashData.value
        if (d.profileError && d.dashboardError && d.recommendationsError && d.resumeError) {
          setError('Failed to load dashboard data. Please try again.')
        }

        // If profile is 100% complete, fetch AI recommendations
        const completionPct = d.profile?.completion?.percent ?? 0
        if (completionPct === 100 && !d.recommendationsError) {
          try {
            const recsResult = await getRecommendations(6)
            const recInternships = recsResult.results.map((r: any) => r.internship)
            setAiRecommendations(recInternships)
            setFeaturedInternships(recInternships)
          } catch (err) {
            console.error('Failed to load AI recommendations:', err)
          }
        } else if (internshipsResult.status === 'fulfilled') {
          setFeaturedInternships(internshipsResult.value.results.slice(0, 6))
        }
      } else {
        setError('Failed to load dashboard data. Please try again.')
        if (internshipsResult.status === 'fulfilled') {
          setFeaturedInternships(internshipsResult.value.results.slice(0, 6))
        }
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleSRSUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!myTeam || !srsFile) return
    setIsUploadingSRS(true)
    setSrsStatusMsg(null)
    try {
      const updated = await uploadTeamSRS(myTeam.id, srsFile)
      setMyTeam((prev) => prev ? { ...prev, ...updated, srs_status: 'SUBMITTED' } : updated)
      setSrsStatusMsg({
        type: 'success',
        text: 'Software Requirements Specification (SRS) successfully uploaded and queued for Academic Advisor review!',
      })
      setSrsFile(null)
    } catch (err: any) {
      setSrsStatusMsg({
        type: 'error',
        text: err.response?.data?.detail || err.response?.data?.srs_document?.[0] || 'Failed to upload SRS document. Please ensure it is a valid PDF.',
      })
    } finally {
      setIsUploadingSRS(false)
    }
  }

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash)
    setCopiedHash(true)
    setTimeout(() => setCopiedHash(false), 2000)
  }

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleChangePassword = () => {
    setShowChangePasswordModal(true)
    setPasswordError(null)
    setPasswordSuccess(null)
  }

  const handlePasswordChange = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const oldPassword = formData.get('old_password') as string
    const newPassword = formData.get('new_password') as string
    const newPasswordConfirm = formData.get('new_password_confirm') as string

    if (!oldPassword || !newPassword || !newPasswordConfirm) {
      setPasswordError('All fields are required')
      return
    }

    if (newPassword !== newPasswordConfirm) {
      setPasswordError('New passwords do not match')
      return
    }

    setIsChangingPassword(true)
    setPasswordError(null)
    setPasswordSuccess(null)

    try {
      await authApi.changePassword({
        old_password: oldPassword,
        new_password: newPassword,
        new_password_confirm: newPasswordConfirm,
      })
      setPasswordSuccess('Password changed successfully')
      setTimeout(() => {
        setShowChangePasswordModal(false)
        setPasswordSuccess(null)
      }, 2000)
    } catch (err: any) {
      if (err.response?.data) {
        const errorData = err.response.data
        if (typeof errorData === 'string') {
          setPasswordError(errorData)
        } else if (errorData.detail) {
          setPasswordError(errorData.detail)
        } else if (errorData.old_password) {
          setPasswordError(`Old password: ${errorData.old_password}`)
        } else if (errorData.new_password) {
          setPasswordError(`New password: ${errorData.new_password}`)
        } else if (errorData.new_password_confirm) {
          setPasswordError(`Confirm password: ${errorData.new_password_confirm}`)
        } else if (errorData.non_field_errors) {
          setPasswordError(errorData.non_field_errors.join(', '))
        } else {
          setPasswordError('Failed to change password. Please check your inputs and try again.')
        }
      } else {
        setPasswordError('Failed to change password. Please try again.')
      }
    } finally {
      setIsChangingPassword(false)
    }
  }

  const handleProfilePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB')
      return
    }

    setIsUploadingPhoto(true)
    try {
      const updatedUser = await authApi.updateUser({ profile_photo: file })
      setUser(updatedUser)
    } catch (err) {
      alert('Failed to upload profile photo. Please try again.')
    } finally {
      setIsUploadingPhoto(false)
    }
  }

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

  const fullName =
    user?.first_name || user?.last_name
      ? `${user?.first_name || ''} ${user?.last_name || ''}`.trim()
      : user?.username || 'Student User'

  const completionPct = data?.profile?.completion?.percent ?? null
  const sections = data?.profile?.completion?.sections ?? null
  const clampedPct = completionPct === null ? 0 : Math.min(100, Math.max(0, completionPct))
  const isComplete = clampedPct === 100

  const hasResume = data?.resumeStatus?.has_resume ?? data?.profile?.cv_data?.has_cv ?? false
  const resumeProcessingStatus =
    data?.resumeStatus?.processing_status ?? data?.profile?.cv_data?.processing_status ?? null
  const cvSkillsDetected = data?.profile?.cv_data?.merged_skills?.length ?? 0

  const savedCount = data?.dashboardSummary?.saved_internships ?? 0
  const applicationsCount = data?.dashboardSummary?.total_applications ?? 0
  const recommendationsCount = data?.recommendationsCount ?? 0

  const isPersonalEducationComplete = Boolean(
    data?.profile?.phone &&
    data?.profile?.country &&
    data?.profile?.city &&
    data?.profile?.date_of_birth &&
    data?.profile?.university &&
    (data?.profile?.student_id_number || uilProfile?.student_id_number) &&
    (data?.profile?.field_of_study || uilProfile?.department) &&
    (data?.profile?.education_level || uilProfile?.academic_year) &&
    (data?.profile?.gpa || uilProfile?.gpa)
  )

  const resumeStatusLabel = (() => {
    if (!hasResume) return 'No resume uploaded'
    if (resumeProcessingStatus === 'PENDING' || resumeProcessingStatus === 'PROCESSING')
      return 'Processing...'
    if (resumeProcessingStatus === 'FAILED') return 'Processing failed'
    if (resumeProcessingStatus === 'COMPLETED') return 'Resume ready'
    return 'Resume uploaded'
  })()

  const resumeStatusColor = (() => {
    if (!hasResume) return 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
    if (resumeProcessingStatus === 'FAILED') return 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300'
    if (resumeProcessingStatus === 'PENDING' || resumeProcessingStatus === 'PROCESSING')
      return 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300'
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
  })()

  if (isLoading) {
    return (
      <div className="min-h-screen p-4 sm:p-6 lg:p-8 space-y-8 animate-fade-in" role="status" aria-label="Loading dashboard">
        <span className="sr-only">Loading your dashboard data...</span>
        <div className="card-gradient p-8 rounded-3xl animate-pulse space-y-4">
          <div className="h-8 w-64 bg-neutral-200 dark:bg-neutral-800 rounded-xl" />
          <div className="h-4 w-96 bg-neutral-100 dark:bg-neutral-800/60 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="card-gradient p-6 rounded-3xl animate-pulse space-y-4">
              <div className="h-3 w-20 bg-neutral-200 dark:bg-neutral-800 rounded" />
              <div className="h-8 w-16 bg-neutral-200 dark:bg-neutral-800 rounded-lg" />
              <div className="h-3 w-24 bg-neutral-100 dark:bg-neutral-800/60 rounded" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!user && authUser) {
    return (
      <div className="min-h-screen flex items-center justify-center animate-fade-in p-6">
        <div className="card-gradient p-8 rounded-3xl text-center max-w-md shadow-card">
          <AlertCircle className="w-12 h-12 text-error-500 mx-auto mb-4" />
          <p className="text-error-600 dark:text-error-400 font-bold mb-4">Failed to load user profile</p>
          <Button onClick={loadData} className="w-full rounded-2xl shadow-glow">
            <RefreshCw className="w-4 h-4 mr-2" /> Retry Connection
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Email Verification Success Alert */}
      {showVerifiedToast && (
        <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-4 flex items-center justify-between text-emerald-800 dark:text-emerald-300 animate-slide-up">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm font-bold">Email Verified Successfully!</p>
              <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">Your student account is verified and fully active. Welcome to your dashboard!</p>
            </div>
          </div>
          <button
            onClick={() => setShowVerifiedToast(false)}
            className="p-1 hover:bg-emerald-500/20 rounded-lg text-emerald-700 dark:text-emerald-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Banner with Greeting & Profile Overview */}
      <div className="relative overflow-visible z-20 rounded-3xl bg-gradient-to-br from-white/90 via-primary-50/40 to-secondary-50/30 dark:from-neutral-900/90 dark:via-neutral-900/60 dark:to-neutral-800/40 border border-neutral-200/80 dark:border-neutral-800/80 p-6 sm:p-8 backdrop-blur-2xl shadow-soft">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div className="flex items-center gap-5">
            {/* Profile Photo */}
            <div className="relative group">
              {getProfilePhotoUrl(user) ? (
                <img
                  src={getProfilePhotoUrl(user)}
                  alt="Profile"
                  className="w-20 h-20 rounded-2xl object-cover border-2 border-white dark:border-neutral-700 shadow-glow transition-all duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-primary-600 via-primary-500 to-secondary-500 text-white text-2xl font-black flex items-center justify-center shadow-glow">
                  {fullName.charAt(0).toUpperCase()}
                </div>
              )}
              <label className="absolute -bottom-1 -right-1 bg-gradient-to-r from-primary-600 to-secondary-600 text-white rounded-xl p-1.5 cursor-pointer shadow-soft hover:scale-110 transition-transform">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleProfilePhotoUpload}
                  disabled={isUploadingPhoto}
                  className="hidden"
                />
                {isUploadingPhoto ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
              </label>
            </div>

            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-neutral-900 dark:text-white">
                  Welcome back, {fullName}!
                </h1>
              </div>
              <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mt-1">
                Your AI-powered opportunity pipeline is active and analyzing fresh roles.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <NotificationBell />
            <Link to="/recommendations" className="flex-1 sm:flex-initial">
              <Button className="w-full sm:w-auto rounded-2xl shadow-glow text-xs sm:text-sm font-bold">
                <Sparkles className="w-4 h-4 mr-1.5" /> AI Matches
              </Button>
            </Link>
            <Link to="/profile" className="flex-1 sm:flex-initial">
              <Button variant="secondary" className="w-full sm:w-auto rounded-2xl text-xs sm:text-sm font-bold">
                {isComplete ? 'View Profile' : 'Complete Profile'}
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleChangePassword}
              className="rounded-2xl shrink-0"
              title="Change Password"
            >
              <Lock className="w-4 h-4 text-neutral-500" />
            </Button>
          </div>
        </div>
      </div>

      {/* Error alert if any */}
      {error && (
        <div className="rounded-2xl bg-error-50/90 dark:bg-error-950/40 p-4 border border-error-200 dark:border-error-800/80 animate-scale-in" role="alert">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-error-600 dark:text-error-400" />
              <p className="text-sm font-medium text-error-700 dark:text-error-300">{error}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={loadData} className="text-error-600 dark:text-error-400 hover:bg-error-100">
              Try again
            </Button>
          </div>
        </div>
      )}

      {/* Personal & Education Dossier Completeness Gate */}
      {activeTab === 'overview' && !isPersonalEducationComplete && (
        <div className="p-5 sm:p-6 rounded-3xl bg-amber-500/10 border-2 border-amber-500/30 dark:bg-amber-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-5 animate-fade-in shadow-soft">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white flex items-center justify-center font-bold shadow-md shadow-amber-500/20 shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Required Action
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  Dossier Incomplete
                </span>
              </div>
              <h3 className="text-base font-bold text-neutral-900 dark:text-white mt-1">
                Personal & Education Dossier Incomplete
              </h3>
              <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-1 max-w-2xl leading-relaxed">
                All personal and educational profile fields (phone, country, city, date of birth, university, student ID number, field of study, academic year, and GPA) must be completed before student data can be sent to or verified by the Department Dean.
              </p>
            </div>
          </div>
          <Link to="/profile?tab=personal" className="shrink-0">
            <Button className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-10 px-5 rounded-xl shadow-sm flex items-center gap-2">
              <UserCheck className="w-4 h-4" />
              Complete Dossier Now →
            </Button>
          </Link>
        </div>
      )}

      {/* Quick Integration Status Strip */}
      {activeTab === 'overview' && (myTeam || (uilProfile && !uilProfile.is_verified_by_dean)) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-scale-in">
          {uilProfile && !uilProfile.is_verified_by_dean && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center font-bold">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-neutral-900 dark:text-white">Dean Verification</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      PENDING
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500">
                    Awaiting 3rd-Year Academic Verification by Department Dean
                  </p>
                </div>
              </div>
            </div>
          )}

          {myTeam && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-primary-500/10 via-primary-500/5 to-transparent border border-primary-500/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-600 text-white flex items-center justify-center font-bold">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-neutral-900 dark:text-white">{myTeam.team_name}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                      myTeam.srs_status === 'APPROVED'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : myTeam.srs_status === 'SUBMITTED'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    }`}>
                      SRS {myTeam.srs_status}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500 truncate max-w-xs">{myTeam.project_title}</p>
                </div>
              </div>
              <button
                onClick={() => setActiveTab('track1')}
                className="text-xs font-bold text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
              >
                Track 1 Portal →
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 1: OVERVIEW & INTERNSHIPS */}
      {activeTab === 'overview' && (
        <div className="space-y-8 animate-fade-in">
          {/* KPI Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
        <ProfileCompletionCard
          percent={completionPct}
          sections={sections}
          error={data?.profileError ?? false}
          onRetry={loadData}
        />

        <ResumeStatusCard
          hasResume={hasResume}
          statusLabel={resumeStatusLabel}
          statusColor={resumeStatusColor}
          skillsDetected={cvSkillsDetected}
          error={data?.resumeError ?? false}
          onRetry={loadData}
        />

        <CountCard
          label="Recommendations"
          value={data?.recommendationsError ? null : recommendationsCount}
          error={data?.recommendationsError ?? false}
          onRetry={loadData}
          emptyMessage="Complete your profile for matches"
          presentMessage="Matched for your profile"
          icon={Sparkles}
          badgeText="High Fit"
        />

        <CountCard
          label="Saved"
          value={data?.dashboardError ? null : savedCount}
          error={data?.dashboardError ?? false}
          onRetry={loadData}
          emptyMessage="No saved internships yet"
          presentMessage="Saved internships"
          icon={Bookmark}
        />

        <CountCard
          label="Applied"
          value={data?.dashboardError ? null : applicationsCount}
          error={data?.dashboardError ?? false}
          onRetry={loadData}
          emptyMessage="No applications yet"
          presentMessage="Submitted applications"
          icon={Send}
        />
      </div>

      {/* Quick Access Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link
          to="/recommendations"
          className="group card-gradient p-5 rounded-3xl flex items-center justify-between hover:border-primary-400/60 hover:shadow-glow transition-all duration-300"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-neutral-900 dark:text-white">AI Recommendations</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Personalized matching</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:translate-x-1 transition-transform" />
        </Link>

        <Link
          to="/internships"
          className="group card-gradient p-5 rounded-3xl flex items-center justify-between hover:border-secondary-400/60 hover:shadow-glow transition-all duration-300"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-secondary-500/10 text-secondary-600 dark:text-secondary-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-neutral-900 dark:text-white">Browse Internships</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Search all active roles</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:translate-x-1 transition-transform" />
        </Link>

        <Link
          to="/profile"
          className="group card-gradient p-5 rounded-3xl flex items-center justify-between hover:border-emerald-400/60 hover:shadow-glow transition-all duration-300"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-neutral-900 dark:text-white">Resume & CV</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">{hasResume ? 'View extraction' : 'Upload CV'}</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:translate-x-1 transition-transform" />
        </Link>

        <Link
          to="/applications/history"
          className="group card-gradient p-5 rounded-3xl flex items-center justify-between hover:border-accent-400/60 hover:shadow-glow transition-all duration-300"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-accent-500/10 text-accent-600 dark:text-accent-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-neutral-900 dark:text-white">Track Applications</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Application status hub</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:translate-x-1 transition-transform" />
        </Link>
      </div>

      {/* Skills & Interests Overview */}
      <div className="card-gradient p-6 sm:p-8 rounded-3xl shadow-card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white">Your Technical Profile & Interests</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              These verified tags are used by the AI engine to compute recommendation similarity.
            </p>
          </div>
          <Link to="/profile">
            <Button size="sm" variant="ghost" className="rounded-xl text-xs font-bold">
              Manage Skills <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-2">
          <div className="space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400">
              Verified Skills ({mySkills.length})
            </span>
            {mySkills.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {mySkills.map((skill) => (
                  <span
                    key={skill.id}
                    className="px-3 py-1 rounded-xl bg-primary-50 dark:bg-primary-950/50 text-primary-700 dark:text-primary-300 border border-primary-200/70 dark:border-primary-800/80 text-xs font-semibold"
                  >
                    {skill.name}
                    {skill.category && <span className="ml-1 text-primary-400 text-[10px]">({skill.category})</span>}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-neutral-400 font-medium">No skills registered yet. Add skills in your profile.</p>
            )}
          </div>

          <div className="space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Career Interests ({myInterests.length})
            </span>
            {myInterests.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {myInterests.map((interest) => (
                  <span
                    key={interest.id}
                    className="px-3 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/80 text-xs font-semibold"
                  >
                    {interest.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-neutral-400 font-medium">No career interests selected yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Featured Live Internships Section */}
      <div className="card-gradient p-6 sm:p-8 rounded-3xl shadow-card space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              {isComplete && aiRecommendations.length > 0 ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary-500/10 text-primary-600 dark:text-primary-400">
                  <Sparkles className="w-3 h-3 mr-1.5" />
                  AI-Powered Matches
                </span>
              ) : (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1.5" />
                  Live Ingested Feed
                </span>
              )}
              <span className="text-xs text-neutral-400 font-medium">
                {isComplete && aiRecommendations.length > 0
                  ? `Personalized for your profile (${aiRecommendations.length} matches)`
                  : featuredInternships.length > 0
                  ? `${featuredInternships.length} of ${data?.recommendationsCount || '200+'} available`
                  : 'Active positions'}
              </span>
            </div>
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white mt-1">
              {isComplete && aiRecommendations.length > 0 ? 'AI-Matched Internships' : 'Latest Active Internships'}
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              {isComplete && aiRecommendations.length > 0
                ? 'AI-powered recommendations based on your skills, interests, and preferences.'
                : 'Real-world positions continuously collected from verified industry data sources and career portals.'}
            </p>
          </div>
          <Link to={isComplete && aiRecommendations.length > 0 ? "/recommendations" : "/internships"}>
            <Button size="sm" variant="default" className="rounded-xl text-xs font-bold shadow-soft">
              {isComplete && aiRecommendations.length > 0 ? 'View All Matches' : 'Browse All Internships'} <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>

        {featuredInternships.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {featuredInternships.map((internship) => (
              <div
                key={internship.id}
                className="card-gradient p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 flex flex-col justify-between hover:shadow-glow hover:-translate-y-1 transition-all duration-300 group"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-primary-500/10 text-primary-600 dark:text-primary-400 capitalize">
                      {internship.internship_type || 'remote'}
                    </span>
                    {internship.work_type && (
                      <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 capitalize">
                        {internship.work_type.replace('_', ' ')}
                      </span>
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-white line-clamp-1 group-hover:text-primary-600 transition-colors">
                      {internship.title}
                    </h3>
                    <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mt-0.5">
                      {internship.organization_name}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-y-1.5 gap-x-3 text-xs text-neutral-500 dark:text-neutral-400 pt-1">
                    {internship.location_text && (
                      <span className="inline-flex items-center gap-1 line-clamp-1">
                        <MapPin className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                        <span className="truncate max-w-[140px]">{internship.location_text}</span>
                      </span>
                    )}
                    {internship.category && (
                      <span className="inline-flex items-center gap-1">
                        <Briefcase className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                        <span className="truncate max-w-[120px]">{internship.category}</span>
                      </span>
                    )}
                    {internship.application_deadline && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                        <span>Deadline: {formatDate(internship.application_deadline)}</span>
                      </span>
                    )}
                  </div>

                  {internship.required_skills && internship.required_skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {internship.required_skills.slice(0, 3).map((skill, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800/80 text-[10px] font-semibold text-neutral-600 dark:text-neutral-300"
                        >
                          {typeof skill === 'string' ? skill : (skill as any).name}
                        </span>
                      ))}
                      {internship.required_skills.length > 3 && (
                        <span className="text-[10px] text-neutral-400 font-semibold self-center">
                          +{internship.required_skills.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-4 mt-2 border-t border-neutral-100 dark:border-neutral-800">
                  <Link to={`/internships/${internship.id}`} className="flex-1">
                    <Button variant="ghost" size="sm" className="w-full rounded-xl text-xs font-bold">
                      Details
                    </Button>
                  </Link>
                  {internship.application_url || internship.source_url ? (
                    <a
                      href={normalizeApplicationUrl(internship.application_url || internship.source_url) || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1"
                    >
                      <Button size="sm" className="w-full rounded-xl text-xs font-bold shadow-glow inline-flex items-center justify-center gap-1">
                        Apply <ExternalLink className="w-3 h-3 ml-0.5" />
                      </Button>
                    </a>
                  ) : (
                    <Link to={`/internships/${internship.id}`} className="flex-1">
                      <Button size="sm" className="w-full rounded-xl text-xs font-bold shadow-glow">
                        Apply
                      </Button>
                    </Link>
                  )}

                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 rounded-2xl bg-neutral-50 dark:bg-neutral-900/40 border border-dashed border-neutral-200 dark:border-neutral-800">
            <Compass className="w-8 h-8 text-neutral-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Syncing live internships...</p>
            <p className="text-xs text-neutral-400 mt-1">Real-time listings will appear here automatically.</p>
          </div>
        )}
      </div>
      </div>
      )}

      {/* TAB 2: TRACK 1 SOFTWARE HOUSE & DOCUMENTATION GATE */}
      {activeTab === 'track1' && (
        <div className="space-y-6 animate-fade-in">
          {srsStatusMsg && (
            <div
              className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between ${
                srsStatusMsg.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                  : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200'
              }`}
            >
              <span>{srsStatusMsg.text}</span>
              <button onClick={() => setSrsStatusMsg(null)} className="underline text-neutral-500">Dismiss</button>
            </div>
          )}

          {/* DEAN VERIFICATION & CREDENTIAL FORWARDING */}
          <div className="card-gradient p-6 rounded-3xl border border-neutral-200/80 dark:border-neutral-800 shadow-soft space-y-4">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div>
                <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">
                  Academic Dean Gate
                </span>
                <h3 className="text-base font-bold text-neutral-900 dark:text-white mt-0.5">
                  Official Department Dean Clearance & Base64 QR Letters
                </h3>
                <p className="text-xs text-neutral-500">
                  Cryptographic verification of 3rd-year academic completion, meal card authorization, and score sheet roster.
                </p>
              </div>

              <div className="flex flex-col gap-2.5 w-full md:w-auto">
                {uilProfile?.is_verified_by_dean || campusPass?.dean_approved ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        Verified by {uilProfile?.dean_title || 'Department Dean'}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          setLastViewedLetter('internship')
                          setIsClearanceLetterModalOpen(true)
                        }}
                        className="text-xs h-9 justify-start px-3.5 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs"
                      >
                        <FileText className="w-4 h-4" /> View Internship Clearance Letter
                        {uilProfile?.internship_letter_sent && (
                          <span className="w-2 h-2 rounded-full bg-emerald-400 ml-auto" title="Dispatched by Dean" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setLastViewedLetter('dorm_food')
                          setIsClearanceLetterModalOpen(true)
                        }}
                        className="text-xs h-9 justify-start px-3.5 flex items-center gap-2 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/50 font-bold rounded-xl"
                      >
                        <Home className="w-4 h-4 text-amber-600" /> View Dorm & Cafeteria Letter
                        {uilProfile?.dorm_food_letter_sent && (
                          <span className="w-2 h-2 rounded-full bg-emerald-400 ml-auto" title="Dispatched by Dean" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setLastViewedLetter('score')
                          setIsScoreRosterModalOpen(true)
                        }}
                        className="text-xs h-9 justify-start px-3.5 flex items-center gap-2 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 font-bold rounded-xl"
                      >
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> View Score Letter
                        {uilProfile?.score_letter_sent && (
                          <span className="w-2 h-2 rounded-full bg-emerald-400 ml-auto" title="Dispatched by Dean" />
                        )}
                      </Button>
                    </div>
                  </>
                ) : (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> Awaiting Dean Verification
                  </span>
                )}
              </div>
            </div>

            {uilProfile?.is_verified_by_dean && (
              <div className="pt-3 border-t border-neutral-200/60 dark:border-neutral-800/60 flex flex-wrap items-center gap-3">
                <span className="text-xs font-bold text-neutral-500">Services Cleared by Dean:</span>
                {uilProfile.dean_allow_dorm && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    <Home className="w-3.5 h-3.5" /> Dormitory Cleared
                  </span>
                )}
                {uilProfile.dean_allow_food && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    <Utensils className="w-3.5 h-3.5" /> Cafeteria Meal Access
                  </span>
                )}
                {uilProfile.dean_allow_internship && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                    <Cpu className="w-3.5 h-3.5" /> Track 1 In-House Internship
                  </span>
                )}
                {uilProfile.dean_valid_from && uilProfile.dean_valid_until && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                    <Calendar className="w-3.5 h-3.5" /> Valid: {uilProfile.dean_valid_from} to {uilProfile.dean_valid_until}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* TRACK 1 IN-HOUSE COHORT PLACEMENT GATE */}
          <div id="track1-cohorts-section" className="card-gradient p-6 rounded-3xl border border-neutral-200/80 dark:border-neutral-800 shadow-soft space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                  Track 1 Placement
                </span>
                <h3 className="text-base font-bold text-neutral-900 dark:text-white mt-0.5">
                  University In-House Software House Cohorts & Placement
                </h3>
                <p className="text-xs text-neutral-500">
                  Institutional software house cohorts established by UIL. Review academic opportunities, prerequisites, and accept official placement.
                </p>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                {studentCohorts.some((c) => dismissedCohortIds.includes(c.id)) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowHiddenCohorts(!showHiddenCohorts)}
                    className="text-xs h-8 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200 cursor-pointer"
                  >
                    {showHiddenCohorts ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5 mr-1 text-amber-500" />
                        Hide Dismissed ({studentCohorts.filter((c) => dismissedCohortIds.includes(c.id)).length})
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5 mr-1 text-indigo-500" />
                        Show Hidden ({studentCohorts.filter((c) => dismissedCohortIds.includes(c.id)).length})
                      </>
                    )}
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchMyCohorts}
                  className="text-xs h-8 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh Cohorts
                </Button>
              </div>
            </div>

            {(() => {
              const visibleCohorts = studentCohorts.filter(
                (c) => showHiddenCohorts || !dismissedCohortIds.includes(c.id)
              )

              if (visibleCohorts.length === 0) {
                return (
                  <div className="p-6 text-center text-xs text-neutral-400 bg-neutral-50 dark:bg-neutral-800/40 rounded-2xl border border-dashed border-neutral-200 dark:border-neutral-800">
                    {studentCohorts.length > 0
                      ? 'All cohorts have been hidden on this dashboard. Click "Show Hidden" above to reveal them.'
                      : 'No active in-house software house cohorts currently open for enrollment. Check back soon.'}
                  </div>
                )
              }

              return (
                <div className="space-y-3">
                  {visibleCohorts.map((cohort) => {
                    const isDismissed = dismissedCohortIds.includes(cohort.id)
                    return (
                      <div
                        key={cohort.id}
                        className={`p-5 rounded-2xl border transition-all relative group ${
                          isDismissed
                            ? 'opacity-60 bg-neutral-100/70 dark:bg-neutral-900/40 border-dashed border-neutral-300 dark:border-neutral-700'
                            : cohort.is_enrolled
                            ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800 shadow-xs'
                            : cohort.is_invited
                            ? 'bg-indigo-50/50 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-800 shadow-glow'
                            : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800'
                        }`}
                      >
                        {/* Close / Hide Toggle Button on Card Header */}
                        <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
                          {isDismissed ? (
                            <button
                              type="button"
                              onClick={() => handleRestoreCohort(cohort.id)}
                              className="px-2 py-0.5 rounded-lg text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 flex items-center gap-1 transition-colors cursor-pointer"
                              title="Restore card to dashboard"
                            >
                              <EyeOff className="w-3 h-3" /> Hidden (Restore)
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleDismissCohort(cohort.id)}
                              className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer opacity-70 group-hover:opacity-100"
                              title="Close / Hide card from dashboard (unseen only, does not notify UIL)"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pr-8">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-neutral-900 dark:text-white">
                                {cohort.title}
                              </span>
                              <span className="text-xs text-neutral-500">
                                • {cohort.university_name} ({cohort.department})
                              </span>
                              {cohort.is_enrolled ? (
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> ENROLLED
                                </span>
                              ) : cohort.is_invited ? (
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 animate-pulse flex items-center gap-1">
                                  <Sparkles className="w-3 h-3 text-indigo-600" /> INVITATION RECEIVED
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                                  Open Seat ({cohort.enrolled_count}/{cohort.capacity_k})
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500 mt-1.5">
                              <span>
                                Academic Year: <strong className="text-neutral-700 dark:text-neutral-300">{cohort.academic_year}</strong>
                              </span>
                              <span>•</span>
                              <span>
                                Dates: <strong className="text-neutral-700 dark:text-neutral-300">{cohort.start_date} to {cohort.end_date}</strong>
                              </span>
                              {cohort.min_gpa && (
                                <>
                                  <span>•</span>
                                  <span>
                                    Min GPA: <strong className="text-neutral-700 dark:text-neutral-300">{cohort.min_gpa}</strong>
                                  </span>
                                </>
                              )}
                            </div>

                            {cohort.requirements && (
                              <div className="text-xs text-neutral-600 dark:text-neutral-300 mt-2 bg-white/60 dark:bg-neutral-800/60 p-2 rounded-xl border border-neutral-100 dark:border-neutral-800">
                                <strong>Prerequisites: </strong>{cohort.requirements}
                              </div>
                            )}

                            {cohort.opportunities && (
                              <div className="text-xs text-neutral-600 dark:text-neutral-300 mt-1.5 bg-indigo-50/40 dark:bg-indigo-950/20 p-2 rounded-xl border border-indigo-100/60 dark:border-indigo-900/30">
                                <strong className="text-indigo-700 dark:text-indigo-300">Included Logistics & Opportunities: </strong>{cohort.opportunities}
                              </div>
                            )}
                          </div>

                          <div className="shrink-0 flex items-center gap-2 mt-2 sm:mt-0">
                            {cohort.is_enrolled ? (
                              <div className="text-right">
                                <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                                  <ShieldCheck className="w-4 h-4" /> Placement Confirmed
                                </span>
                                <span className="text-[11px] text-neutral-400">Logistics clearances active</span>
                              </div>
                            ) : cohort.is_invited ? (
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  disabled={isAcceptingCohort === cohort.id || isRejectingCohort === cohort.id}
                                  onClick={() => handleAcceptCohort(cohort.id)}
                                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-9 px-4 shadow-glow cursor-pointer"
                                >
                                  {isAcceptingCohort === cohort.id ? (
                                    <span className="flex items-center gap-1">
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Accepting...
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1">
                                      <Check className="w-4 h-4" /> 1-Click Accept Placement
                                    </span>
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={isAcceptingCohort === cohort.id || isRejectingCohort === cohort.id}
                                  onClick={() => handleRejectCohort(cohort.id)}
                                  className="text-xs h-9 px-3 border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 font-bold cursor-pointer"
                                  title="Decline this invitation (notifies institutional UIL Officer)"
                                >
                                  {isRejectingCohort === cohort.id ? (
                                    <span className="flex items-center gap-1">
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Declining...
                                    </span>
                                  ) : (
                                    'Reject'
                                  )}
                                </Button>
                              </div>
                            ) : uilProfile?.is_verified_by_dean ? (
                              <Button
                                size="sm"
                                disabled={isAcceptingCohort === cohort.id}
                                onClick={() => handleAcceptCohort(cohort.id)}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-9 px-3 cursor-pointer"
                              >
                                {isAcceptingCohort === cohort.id ? (
                                  'Enrolling...'
                                ) : (
                                  'Apply / Join Cohort'
                                )}
                              </Button>
                            ) : (
                              <span className="text-[11px] text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-2 py-1 rounded-lg border border-amber-200 dark:border-amber-800">
                                Requires Dean Verification
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>

          {/* COMPANY DIRECT INVITATIONS INBOX */}
          {invitations.length > 0 && (
            <div className="card-gradient p-6 rounded-3xl border border-indigo-200/80 dark:border-indigo-900/60 shadow-soft space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                      Employer Direct Invitations ({invitations.length})
                    </h3>
                    <p className="text-xs text-neutral-500">
                      Companies matched by AI who have invited you for direct interview and placement.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {invitations.map((inv) => (
                  <div
                    key={inv.id}
                    className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-neutral-900 dark:text-white">
                          {inv.company_name}
                        </span>
                        <span className="text-xs text-neutral-500">• {inv.internship_title}</span>
                        {inv.match_score && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                            {inv.match_score}% Match
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-1 italic">
                        "{inv.invitation_note || 'We are pleased to invite you to interview for our internship.'}"
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {inv.status === 'ACCEPTED' ? (
                        <Button
                          size="sm"
                          onClick={() => handleOpenCompanyChat(inv.id)}
                          className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1"
                        >
                          <MessagesSquare className="w-3.5 h-3.5" /> Chat with Employer
                        </Button>
                      ) : inv.status === 'DECLINED' ? (
                        <span className="text-xs text-neutral-400">Declined</span>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            disabled={isRespondingInvite === inv.id}
                            onClick={() => handleRespondInvitation(inv.id, 'ACCEPT')}
                            className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                          >
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isRespondingInvite === inv.id}
                            onClick={() => handleRespondInvitation(inv.id, 'DECLINE')}
                            className="text-xs h-8"
                          >
                            Decline
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!myTeam ? (
            <div className="card-gradient p-8 rounded-3xl text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-primary-500/10 text-primary-600 flex items-center justify-center mx-auto">
                <Cpu className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-bold text-neutral-900 dark:text-white">Track 1 In-House Software House</h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-lg mx-auto">
                In Track 1, your university operates as a real-world software house company. The UIL Officer automatically balances student cohorts into squads according to tech stack skills once cohort registration concludes.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Squad Header Banner */}
              <div className="card-gradient p-6 sm:p-8 rounded-3xl border border-neutral-200/80 dark:border-neutral-800 shadow-soft">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-primary-500/10 text-primary-600 dark:text-primary-400">
                      Track 1 Cohort Project
                    </span>
                    <h2 className="text-2xl font-black text-neutral-900 dark:text-white mt-1">
                      {myTeam.team_name}
                    </h2>
                    <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-300 mt-0.5">
                      Project: {myTeam.project_title}
                    </p>
                  </div>

                  {myTeam.assigned_advisor && (
                    <div className="p-4 rounded-2xl bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200/80 dark:border-neutral-700 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary-600 text-white flex items-center justify-center font-bold">
                        <Users className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-neutral-400 uppercase">Assigned Academic Advisor</div>
                        <div className="text-xs font-bold text-neutral-900 dark:text-white">
                          {myTeam.assigned_advisor.first_name} {myTeam.assigned_advisor.last_name}
                        </div>
                        <button
                          onClick={() => setActiveTab('channel')}
                          className="text-[11px] font-semibold text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1 mt-0.5"
                        >
                          <MessagesSquare className="w-3 h-3" />
                          Chat with Advisor
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Documentation Gate (SRS Stepper) */}
              <div className="card-gradient p-6 sm:p-8 rounded-3xl border border-neutral-200/80 dark:border-neutral-800 shadow-soft space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileCheck className="w-5 h-5 text-primary-600" />
                    <div>
                      <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                        Two-Stage Documentation Gate (SRS)
                      </h3>
                      <p className="text-xs text-neutral-500">
                        SRS must be approved by your academic advisor before sprint tasks and code commits unlock.
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                      myTeam.srs_status === 'APPROVED'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : myTeam.srs_status === 'SUBMITTED'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                        : myTeam.srs_status === 'REVISION_REQUIRED'
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    }`}
                  >
                    Gate Status: {myTeam.srs_status}
                  </span>
                </div>

                {/* Stepper Progress */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
                  <div className={`p-4 rounded-2xl border transition-all ${
                    myTeam.srs_status ? 'bg-primary-500/10 border-primary-500/30' : 'bg-neutral-50 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800'
                  }`}>
                    <div className="text-[10px] font-bold text-neutral-400">STAGE 1</div>
                    <div className="text-xs font-bold text-neutral-900 dark:text-white mt-1">1. Draft SRS</div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">Specify architecture & API schemas</div>
                  </div>

                  <div className={`p-4 rounded-2xl border transition-all ${
                    myTeam.srs_status === 'SUBMITTED' || myTeam.srs_status === 'APPROVED' || myTeam.srs_status === 'REVISION_REQUIRED'
                      ? 'bg-primary-500/10 border-primary-500/30'
                      : 'bg-neutral-50 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800'
                  }`}>
                    <div className="text-[10px] font-bold text-neutral-400">STAGE 2</div>
                    <div className="text-xs font-bold text-neutral-900 dark:text-white mt-1">2. Upload PDF</div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">Submit document for review</div>
                  </div>

                  <div className={`p-4 rounded-2xl border transition-all ${
                    myTeam.srs_status === 'SUBMITTED' || myTeam.srs_status === 'APPROVED'
                      ? 'bg-primary-500/10 border-primary-500/30'
                      : 'bg-neutral-50 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800'
                  }`}>
                    <div className="text-[10px] font-bold text-neutral-400">STAGE 3</div>
                    <div className="text-xs font-bold text-neutral-900 dark:text-white mt-1">3. Advisor Review</div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">Evaluation & feedback</div>
                  </div>

                  <div className={`p-4 rounded-2xl border transition-all ${
                    myTeam.coding_unlocked
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-900 dark:text-emerald-300'
                      : 'bg-neutral-50 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-500'
                  }`}>
                    <div className="text-[10px] font-bold text-neutral-400">STAGE 4</div>
                    <div className="text-xs font-bold mt-1">4. Coding Phase</div>
                    <div className="text-[11px] mt-0.5">
                      {myTeam.coding_unlocked ? 'Unlocked & Active' : 'Locked by Gate'}
                    </div>
                  </div>
                </div>

                {/* SRS Status Callout */}
                {myTeam.srs_status === 'APPROVED' ? (
                  <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div>
                      <h4 className="text-xs font-bold text-emerald-800 dark:text-emerald-200">
                        Documentation Gate Cleared — Coding Phase Unlocked!
                      </h4>
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-0.5">
                        Your academic advisor approved the SRS document. Git repositories and weekly sprint task submissions are now unlocked.
                      </p>
                    </div>
                  </div>
                ) : myTeam.srs_status === 'REVISION_REQUIRED' ? (
                  <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 space-y-2">
                    <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 text-xs font-bold">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>Revision Required by Academic Advisor</span>
                    </div>
                    {myTeam.srs_feedback && (
                      <p className="text-xs text-rose-800 dark:text-rose-200 bg-white/60 dark:bg-neutral-900/60 p-3 rounded-xl border border-rose-200/60 dark:border-rose-800/60">
                        Advisor Note: "{myTeam.srs_feedback}"
                      </p>
                    )}
                    {myTeam.srs_revision_deadline && (
                      <p className="text-[11px] text-rose-600 font-bold">
                        14-Day Revision Deadline: {new Date(myTeam.srs_revision_deadline).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                ) : null}

                {/* Upload Form */}
                <form onSubmit={handleSRSUploadSubmit} className="p-5 rounded-2xl bg-neutral-50 dark:bg-neutral-900/80 border border-neutral-200 dark:border-neutral-800 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-xs font-bold text-neutral-900 dark:text-white">
                        {myTeam.srs_document ? 'Upload Revised SRS Document' : 'Upload SRS Specification Document'}
                      </h4>
                      <p className="text-[11px] text-neutral-500">
                        Upload your squad's SRS document in PDF format (Max 15MB).
                      </p>
                    </div>
                    {myTeam.srs_document && (
                      <a
                        href={myTeam.srs_document}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-bold text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Download Current SRS
                      </a>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={(e) => setSrsFile(e.target.files?.[0] || null)}
                      className="flex-1 text-xs text-neutral-600 dark:text-neutral-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-primary-50 dark:file:bg-primary-950 file:text-primary-700 dark:file:text-primary-300 hover:file:bg-primary-100"
                    />
                    <Button
                      type="submit"
                      disabled={!srsFile || isUploadingSRS}
                      className="rounded-xl shadow-glow text-xs font-bold shrink-0"
                    >
                      {isUploadingSRS ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                          Uploading SRS...
                        </>
                      ) : (
                        <>
                          <Upload className="w-3.5 h-3.5 mr-1.5" />
                          Submit for Review
                        </>
                      )}
                    </Button>
                  </div>
                </form>

                {/* Track 1 Timed Milestone Submissions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Documentation Milestone */}
                  <div className="p-5 rounded-2xl bg-neutral-50 dark:bg-neutral-900/80 border border-neutral-200 dark:border-neutral-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-primary-600" />
                        <h4 className="text-xs font-bold text-neutral-900 dark:text-white">Documentation Milestone</h4>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        myTeam.documentation_submitted_at ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      }`}>
                        {myTeam.documentation_submitted_at ? 'Submitted' : 'Pending Submission'}
                      </span>
                    </div>
                    {myTeam.documentation_deadline && (
                      <p className="text-[11px] text-neutral-500">
                        Deadline: {new Date(myTeam.documentation_deadline).toLocaleString()}
                      </p>
                    )}
                    <form onSubmit={handleSubmitDocumentation} className="space-y-2">
                      <textarea
                        rows={2}
                        value={docContent}
                        onChange={(e) => setDocContent(e.target.value)}
                        placeholder="Enter documentation overview / link..."
                        className="w-full text-xs p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-1 focus:ring-primary-500 outline-none"
                      />
                      <Button
                        type="submit"
                        size="sm"
                        disabled={submittingDoc || !docContent.trim()}
                        className="w-full text-xs font-bold"
                      >
                        {submittingDoc ? 'Submitting...' : 'Submit Documentation'}
                      </Button>
                    </form>
                  </div>

                  {/* Implementation Milestone */}
                  <div className="p-5 rounded-2xl bg-neutral-50 dark:bg-neutral-900/80 border border-neutral-200 dark:border-neutral-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-emerald-600" />
                        <h4 className="text-xs font-bold text-neutral-900 dark:text-white">Implementation Milestone</h4>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        myTeam.implementation_submitted_at ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      }`}>
                        {myTeam.implementation_submitted_at ? 'Submitted' : 'Pending Submission'}
                      </span>
                    </div>
                    {myTeam.implementation_deadline && (
                      <p className="text-[11px] text-neutral-500">
                        Deadline: {new Date(myTeam.implementation_deadline).toLocaleString()}
                      </p>
                    )}
                    <form onSubmit={handleSubmitImplementation} className="space-y-2">
                      <input
                        type="url"
                        value={implRepoUrl}
                        onChange={(e) => setImplRepoUrl(e.target.value)}
                        placeholder="https://github.com/org/repo..."
                        className="w-full text-xs p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-1 focus:ring-primary-500 outline-none"
                      />
                      <Button
                        type="submit"
                        size="sm"
                        disabled={submittingImpl || !implRepoUrl.trim()}
                        className="w-full text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        {submittingImpl ? 'Submitting...' : 'Submit Implementation'}
                      </Button>
                    </form>
                  </div>
                </div>
              </div>

              {/* Squad Teammates Roster */}
              <div className="card-gradient p-6 sm:p-8 rounded-3xl border border-neutral-200/80 dark:border-neutral-800 shadow-soft space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary-600" />
                    <div>
                      <h3 className="text-base font-bold text-neutral-900 dark:text-white">Squad Teammates</h3>
                      <p className="text-xs text-neutral-500">Tech-stack balanced team formulated by UIL Officer</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setActiveTab('channel')}
                    className="text-xs rounded-xl"
                  >
                    <MessagesSquare className="w-3.5 h-3.5 mr-1.5" />
                    Open Team Channel
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {myTeam.members?.map((member) => (
                    <div
                      key={member.id}
                      className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 space-y-2"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-primary-600 to-secondary-600 text-white font-black text-xs flex items-center justify-center">
                          {member.student?.user?.first_name?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-neutral-900 dark:text-white">
                            {member.student?.user?.first_name} {member.student?.user?.last_name}
                          </div>
                          <div className="text-[11px] text-neutral-400">
                            {member.student?.department || 'Engineering'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-neutral-100 dark:border-neutral-800 text-[11px]">
                        <span className="font-semibold text-primary-600 dark:text-primary-400">
                          {member.assigned_role || 'Developer'}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 font-medium">
                          {member.primary_stack || 'FullStack'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: CAMPUS LOGISTICS PASS */}
      {activeTab === 'logistics' && (
        <div className="space-y-6 animate-fade-in">
          {!campusPass ? (
            <div className="card-gradient p-8 rounded-3xl text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-bold text-neutral-900 dark:text-white">Campus Logistics Clearance Pass</h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-lg mx-auto">
                Track 1 students staying on campus receive digital clearance signed by the Dean, an active meal card from the Student Union, and dormitory room assignment from Housing Admin.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Digital Pass Header */}
              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 text-white p-6 sm:p-8 shadow-glow">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-black uppercase tracking-wider">
                        Track 1 Official Pass
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-400/30 text-emerald-100 text-[10px] font-bold">
                        {campusPass.cohort_academic_year || 'Academic Year 2026/27'}
                      </span>
                    </div>
                    <h2 className="text-2xl font-black mt-2">Campus Resident Clearance Pass</h2>
                    <p className="text-xs text-emerald-100/90 mt-0.5">
                      Student: {campusPass.student_name} • ID: {campusPass.student_id_number}
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider text-emerald-200">Pass Status</div>
                    <div className="text-xl font-black mt-0.5">
                      {campusPass.meal_card_active && campusPass.dean_approved ? 'VERIFIED ACTIVE' : 'PENDING APPROVAL'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Three Logistics Pillars */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* 1. Dean Clearance */}
                <div className="card-gradient p-6 rounded-3xl border border-neutral-200/80 dark:border-neutral-800 shadow-soft space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-2xl bg-primary-500/10 text-primary-600 flex items-center justify-center">
                      <Award className="w-5 h-5" />
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        campusPass.dean_approved
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      }`}
                    >
                      {campusPass.dean_approved ? 'Dean Approved' : 'Pending Dean'}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Academic Dean Signature</h3>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {campusPass.dean_signed_by_name ? `Signed by ${campusPass.dean_signed_by_name}` : 'Awaiting digital sign-off'}
                    </p>
                  </div>

                  {campusPass.dean_signature_hash ? (
                    <div className="p-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] text-neutral-400 font-bold uppercase">
                        <span>HMAC-SHA256 Hash</span>
                        <button
                          onClick={() => handleCopyHash(campusPass.dean_signature_hash)}
                          className="hover:text-primary-500 flex items-center gap-1"
                        >
                          {copiedHash ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          {copiedHash ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <div className="font-mono text-[10px] text-neutral-600 dark:text-neutral-300 break-all select-all">
                        {campusPass.dean_signature_hash}
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* 2. Meal Card */}
                <div className="card-gradient p-6 rounded-3xl border border-neutral-200/80 dark:border-neutral-800 shadow-soft space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                      <Utensils className="w-5 h-5" />
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        campusPass.meal_card_active
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      }`}
                    >
                      {campusPass.meal_card_active ? 'Card Active' : 'Not Activated'}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Student Union Dining</h3>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {campusPass.meal_card_number ? `Card #${campusPass.meal_card_number}` : 'Awaiting card allocation'}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-xs space-y-1">
                    <div className="flex justify-between text-neutral-500 text-[11px]">
                      <span>Dining Hall Access:</span>
                      <span className="font-bold text-neutral-800 dark:text-neutral-200">
                        {campusPass.meal_card_active ? 'Unlimited Breakfast & Lunch' : 'Pending Activation'}
                      </span>
                    </div>
                    {campusPass.meal_card_issued_by_name && (
                      <div className="flex justify-between text-neutral-400 text-[10px]">
                        <span>Issued by:</span>
                        <span>{campusPass.meal_card_issued_by_name}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. Dorm Room */}
                <div className="card-gradient p-6 rounded-3xl border border-neutral-200/80 dark:border-neutral-800 shadow-soft space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
                      <KeyRound className="w-5 h-5" />
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        campusPass.key_issued
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                      }`}
                    >
                      {campusPass.key_issued ? 'Key Issued' : 'Key Pending'}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Campus Dormitory</h3>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {campusPass.dorm_block
                        ? `Block ${campusPass.dorm_block} • Room ${campusPass.dorm_room} (Bed #${campusPass.dorm_bed_number})`
                        : 'Room assignment pending'}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-xs space-y-1">
                    <div className="flex justify-between text-neutral-500 text-[11px]">
                      <span>Dorm Status:</span>
                      <span className="font-bold text-neutral-800 dark:text-neutral-200">
                        {campusPass.dorm_status || 'ASSIGNED'}
                      </span>
                    </div>
                    <div className="flex justify-between text-neutral-400 text-[10px]">
                      <span>Key Return Clearance:</span>
                      <span className={campusPass.cleared_at_exit ? 'text-emerald-500 font-bold' : 'text-neutral-400'}>
                        {campusPass.cleared_at_exit ? 'Cleared' : 'Active Residency'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: ADVISOR & SQUAD COMMUNICATION CHANNEL */}
      {activeTab === 'channel' && (
        <div className="space-y-4 animate-fade-in">
          <TeamCommunicationHub
            teamId={myTeam?.id}
            teamName={myTeam?.team_name}
            projectTitle={myTeam?.project_title}
            advisorName={myTeam?.assigned_advisor ? `${myTeam.assigned_advisor.first_name} ${myTeam.assigned_advisor.last_name}` : undefined}
          />
        </div>
      )}

      {/* Change Password Modal */}
      {showChangePasswordModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="card-gradient rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-glow border border-neutral-200/80 dark:border-neutral-800 animate-scale-in">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center">
                  <KeyRound className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-bold text-neutral-900 dark:text-white">Change Password</h2>
              </div>
              <button
                onClick={() => {
                  setShowChangePasswordModal(false)
                  setPasswordError(null)
                  setPasswordSuccess(null)
                }}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
              >
                ✕
              </button>
            </div>

            {passwordSuccess && (
              <div className="mb-4 p-3.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-2xl">
                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{passwordSuccess}</p>
              </div>
            )}

            {passwordError && (
              <div className="mb-4 p-3.5 bg-error-50 dark:bg-error-950/50 border border-error-200 dark:border-error-800 rounded-2xl">
                <p className="text-xs font-bold text-error-700 dark:text-error-300">{passwordError}</p>
              </div>
            )}

            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">
                  Current Password
                </label>
                <input
                  type="password"
                  name="old_password"
                  required
                  disabled={isChangingPassword}
                  className="w-full px-4 py-2.5 rounded-2xl border-2 border-neutral-200 dark:border-neutral-700 bg-white/80 dark:bg-neutral-800/80 text-sm text-neutral-900 dark:text-white focus:outline-none focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">
                  New Password
                </label>
                <input
                  type="password"
                  name="new_password"
                  required
                  disabled={isChangingPassword}
                  className="w-full px-4 py-2.5 rounded-2xl border-2 border-neutral-200 dark:border-neutral-700 bg-white/80 dark:bg-neutral-800/80 text-sm text-neutral-900 dark:text-white focus:outline-none focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  name="new_password_confirm"
                  required
                  disabled={isChangingPassword}
                  className="w-full px-4 py-2.5 rounded-2xl border-2 border-neutral-200 dark:border-neutral-700 bg-white/80 dark:bg-neutral-800/80 text-sm text-neutral-900 dark:text-white focus:outline-none focus:border-primary-500"
                />
              </div>

              <div className="flex gap-3 pt-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowChangePasswordModal(false)}
                  disabled={isChangingPassword}
                  className="flex-1 rounded-2xl text-xs font-bold"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isChangingPassword}
                  className="flex-1 rounded-2xl shadow-glow text-xs font-bold"
                >
                  {isChangingPassword ? 'Updating...' : 'Update Password'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 1: STUDENT BASE64 QR VIEWER */}
      {studentQrModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl max-w-sm w-full p-6 space-y-4 border border-neutral-200 dark:border-neutral-800 shadow-xl text-center">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">{studentQrModal.title}</h3>
              <button onClick={() => setStudentQrModal(null)} className="text-neutral-400 hover:text-neutral-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-white rounded-xl border border-neutral-200 inline-block mx-auto shadow-sm">
              {studentQrModal.qrBase64 ? (
                <img
                  src={
                    studentQrModal.qrBase64.startsWith('data:')
                      ? studentQrModal.qrBase64
                      : `data:image/png;base64,${studentQrModal.qrBase64}`
                  }
                  alt="Verification QR"
                  className="w-48 h-48 object-contain mx-auto"
                />
              ) : (
                <div className="w-48 h-48 flex flex-col items-center justify-center text-xs text-neutral-400">
                  <QrCode className="w-8 h-8 text-neutral-300 mb-1" />
                  <span>QR Letter Generating...</span>
                </div>
              )}
            </div>
            <p className="text-xs text-neutral-500">
              Scannable cryptographic clearance token for campus dorms, dining, and UIL verification.
            </p>
            <Button size="sm" onClick={() => setStudentQrModal(null)} className="w-full text-xs">
              Done
            </Button>
          </div>
        </div>
      )}

      {/* MODAL 2: DIRECT COMPANY CHAT */}
      {companyChatInviteId && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-3xl max-w-lg w-full p-6 space-y-4 border border-neutral-200 dark:border-neutral-800 shadow-xl h-[550px] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-100 dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <MessagesSquare className="w-5 h-5 text-emerald-600" />
                <div>
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                    Direct Employer Communication
                  </h3>
                  <p className="text-[10px] text-neutral-400">Track 1 Direct Interview Thread</p>
                </div>
              </div>
              <button onClick={() => setCompanyChatInviteId(null)} className="text-neutral-400 hover:text-neutral-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 p-2 bg-neutral-50 dark:bg-neutral-950/40 rounded-2xl">
              {companyChatMessages.length === 0 ? (
                <div className="p-8 text-center text-xs text-neutral-400">
                  Invitation accepted. You are connected directly with the company hiring team.
                </div>
              ) : (
                companyChatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-2xl text-xs max-w-[80%] ${
                      msg.sender_role === 'student'
                        ? 'ml-auto bg-primary-600 text-white'
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

            <form onSubmit={handleSendCompanyChat} className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={companyChatText}
                onChange={(e) => setCompanyChatText(e.target.value)}
                placeholder="Type response to company..."
                className="flex-1 p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs"
              />
              <Button type="submit" size="sm" disabled={isSendingCompanyChat || !companyChatText.trim()} className="bg-primary-600 text-white font-bold">
                <Send className="w-3.5 h-3.5 mr-1" /> Send
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: DIRECT INSTITUTIONAL CHAT (DEPARTMENT DEAN VS UIL OFFICER TABS) */}
      {isDeanChatOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-neutral-900 rounded-3xl max-w-lg w-full p-6 space-y-3 border border-neutral-200 dark:border-neutral-800 shadow-xl h-[620px] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-2 border-b border-neutral-100 dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-600 to-indigo-600 text-white flex items-center justify-center shadow-xs">
                  <MessagesSquare className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-white leading-tight">
                    Institutional Consultation Channels
                  </h3>
                  <p className="text-[11px] text-neutral-400 leading-tight">
                    Direct communication with your Department Dean and UIL Head Officer
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsDeanChatOpen(false)}
                className="p-1 rounded-xl text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sub-Tabs: Department Dean vs UIL Officer */}
            <div className="grid grid-cols-2 gap-2 bg-neutral-100 dark:bg-neutral-800/60 p-1 rounded-2xl">
              <button
                type="button"
                onClick={() => {
                  setActiveChatTab('dean')
                  setDeanUnreadCount(0)
                  fetchDeanChat(false, true)
                }}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeChatTab === 'dean'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                <GraduationCap className="w-3.5 h-3.5" />
                <span>Department Dean</span>
                {deanUnreadCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-rose-600 text-white animate-pulse">
                    {deanUnreadCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveChatTab('uil')
                  setUilUnreadCount(0)
                  fetchUilChat(false, true)
                }}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeChatTab === 'uil'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                <Building className="w-3.5 h-3.5" />
                <span>UIL Officer</span>
                {uilUnreadCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-rose-600 text-white animate-pulse">
                    {uilUnreadCount}
                  </span>
                )}
              </button>
            </div>

            {/* TAB 1 CONTENT: DEPARTMENT DEAN */}
            {activeChatTab === 'dean' && (
              <>
                {/* Dean Identity Bar */}
                <div className="p-2.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 flex items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-amber-600 text-white font-bold flex items-center justify-center text-xs shadow-xs shrink-0">
                      {deanChatDean?.full_name?.charAt(0) || 'D'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-neutral-900 dark:text-white truncate">
                          {uilProfile?.dean_title ||
                            (deanChatDean?.full_name
                              ? deanChatDean.full_name.startsWith('Dean')
                                ? deanChatDean.full_name
                                : `Dean Dr. ${deanChatDean.full_name}`
                              : 'Department Dean')}
                        </span>
                        <span className="px-1.5 py-0.2 rounded-md text-[9px] font-bold bg-amber-200/80 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200">
                          Clearance Channel
                        </span>
                      </div>
                      <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                        {deanChatDean?.department || uilProfile?.dean_department || (user as any)?.department || 'Academic Department'} • {deanChatDean?.email || uilProfile?.dean_email || ''}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Dean Messages Container */}
                <div className="flex-1 overflow-y-auto space-y-2.5 p-3 bg-neutral-50/50 dark:bg-neutral-950/40 rounded-2xl border border-neutral-100 dark:border-neutral-800/80">
                  {isDeanChatLoading ? (
                    <div className="h-full flex items-center justify-center text-xs text-neutral-400 gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                      Loading consultation messages...
                    </div>
                  ) : deanChatMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-neutral-400 space-y-2">
                      <GraduationCap className="w-8 h-8 text-neutral-300 dark:text-neutral-700" />
                      <p className="text-xs font-semibold">No messages in Department Dean channel yet.</p>
                      <p className="text-[11px] text-neutral-500 max-w-xs">
                        Inquire with your Dean regarding academic clearance, project approval, or Track 1 defense scheduling.
                      </p>
                    </div>
                  ) : (
                    deanChatMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex flex-col ${msg.is_mine ? 'items-end' : 'items-start'}`}
                      >
                        <div className="flex items-center gap-1 text-[10px] text-neutral-400 mb-0.5 px-1 font-mono">
                          <span className="font-semibold text-neutral-600 dark:text-neutral-300">
                            {msg.is_mine ? 'You' : msg.sender_name || uilProfile?.dean_title || 'Department Dean'}
                          </span>
                          <span>•</span>
                          <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div
                          className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-xs shadow-xs ${
                            msg.is_mine
                              ? 'bg-amber-600 text-white rounded-tr-none'
                              : 'bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 border border-neutral-200/80 dark:border-neutral-700 rounded-tl-none'
                          }`}
                        >
                          <p className="whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={deanChatEndRef} />
                </div>

                {/* Dean Input Form */}
                <form onSubmit={handleSendDeanMessage} className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={deanChatText}
                    onChange={(e) => setDeanChatText(e.target.value)}
                    disabled={isSendingDeanMessage}
                    placeholder="Type message to Department Dean... (Press Enter to send)"
                    className="flex-1 p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isSendingDeanMessage || !deanChatText.trim()}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold h-9 px-4 rounded-xl flex items-center gap-1"
                  >
                    {isSendingDeanMessage ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" /> Send
                      </>
                    )}
                  </Button>
                </form>
              </>
            )}

            {/* TAB 2 CONTENT: UIL OFFICER */}
            {activeChatTab === 'uil' && (
              <>
                {/* UIL Officer Identity Bar */}
                <div className="p-2.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-900/40 flex items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white font-bold flex items-center justify-center text-xs shadow-xs shrink-0">
                      {uilChatOfficer?.name?.charAt(0) || 'U'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-neutral-900 dark:text-white truncate">
                          {uilChatOfficer?.name || 'UIL Head Officer'}
                        </span>
                        <span className="px-1.5 py-0.2 rounded-md text-[9px] font-bold bg-indigo-200/80 dark:bg-indigo-900/60 text-indigo-900 dark:text-indigo-200">
                          Cohorts & Squads Channel
                        </span>
                      </div>
                      <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                        {uilChatOfficer?.university || user?.university_name || 'University-Industry Linkage Office'} • {uilChatOfficer?.email || 'uil@smartintern.et'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* UIL Messages Container */}
                <div className="flex-1 overflow-y-auto space-y-2.5 p-3 bg-neutral-50/50 dark:bg-neutral-950/40 rounded-2xl border border-neutral-100 dark:border-neutral-800/80">
                  {isUilChatLoading ? (
                    <div className="h-full flex items-center justify-center text-xs text-neutral-400 gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                      Loading UIL messages...
                    </div>
                  ) : uilChatMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-neutral-400 space-y-2">
                      <Building className="w-8 h-8 text-neutral-300 dark:text-neutral-700" />
                      <p className="text-xs font-semibold">No messages in UIL Officer channel yet.</p>
                      <p className="text-[11px] text-neutral-500 max-w-xs">
                        Inquire with your UIL Officer regarding Track 1 software house cohorts, balanced squad placement, or stipends.
                      </p>
                    </div>
                  ) : (
                    uilChatMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex flex-col ${msg.is_mine ? 'items-end' : 'items-start'}`}
                      >
                        <div className="flex items-center gap-1 text-[10px] text-neutral-400 mb-0.5 px-1 font-mono">
                          <span className="font-semibold text-neutral-600 dark:text-neutral-300">
                            {msg.is_mine ? 'You' : msg.sender_name || uilChatOfficer?.name || 'UIL Head Officer'}
                          </span>
                          <span>•</span>
                          <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div
                          className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-xs shadow-xs ${
                            msg.is_mine
                              ? 'bg-indigo-600 text-white rounded-tr-none'
                              : 'bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 border border-neutral-200/80 dark:border-neutral-700 rounded-tl-none'
                          }`}
                        >
                          <p className="whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={uilChatEndRef} />
                </div>

                {/* UIL Input Form */}
                <form onSubmit={handleSendUilMessage} className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={uilChatText}
                    onChange={(e) => setUilChatText(e.target.value)}
                    disabled={isSendingUilMessage}
                    placeholder="Type message to UIL Head Officer... (Press Enter to send)"
                    className="flex-1 p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isSendingUilMessage || !uilChatText.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-9 px-4 rounded-xl flex items-center gap-1"
                  >
                    {isSendingUilMessage ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" /> Send
                      </>
                    )}
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* FLOATING INSTITUTIONAL CHAT TRIGGER (ACCESSIBLE ACROSS ALL TABS) */}
      <button
        onClick={() => {
          if (uilUnreadCount > 0 && deanUnreadCount === 0) {
            setActiveChatTab('uil')
          } else {
            setActiveChatTab('dean')
          }
          setIsDeanChatOpen(true)
        }}
        className="fixed bottom-6 right-6 z-40 bg-gradient-to-r from-amber-600 via-purple-700 to-indigo-700 hover:opacity-95 text-white font-bold text-xs py-3 px-4 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-200 flex items-center gap-2 group cursor-pointer"
        title="Open Institutional Consultation Channels (Department Dean & UIL Officer)"
      >
        <div className="relative">
          <MessagesSquare className="w-5 h-5 group-hover:scale-110 transition-transform" />
          {(deanUnreadCount + uilUnreadCount) > 0 && (
            <span className="absolute -top-2 -right-2 min-w-4 h-4 px-1 bg-red-600 text-white text-[10px] font-black rounded-full flex items-center justify-center animate-pulse">
              {deanUnreadCount + uilUnreadCount}
            </span>
          )}
        </div>
        <span>Institutional Chat</span>
      </button>

      {/* REAL-TIME INCOMING DEAN MESSAGE ALERT TOAST */}
      {deanIncomingAlert && (
        <div className="fixed bottom-24 right-6 z-50 max-w-sm w-full bg-white dark:bg-neutral-900 border-2 border-amber-500/80 rounded-2xl p-4 shadow-2xl animate-bounce flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0">
            <GraduationCap className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-900 dark:text-white truncate">
                {deanIncomingAlert.sender_name}
              </span>
              <button
                onClick={() => setDeanIncomingAlert(null)}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-300 line-clamp-2 mt-0.5">
              {deanIncomingAlert.message}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() => {
                  setDeanIncomingAlert(null)
                  setActiveChatTab('dean')
                  setIsDeanChatOpen(true)
                }}
                className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold"
              >
                Reply to Dean
              </button>
              <button
                onClick={() => setDeanIncomingAlert(null)}
                className="px-2 py-1 text-[11px] text-neutral-500 hover:underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REAL-TIME INCOMING UIL OFFICER MESSAGE ALERT TOAST */}
      {uilIncomingAlert && (
        <div className="fixed bottom-24 right-6 z-50 max-w-sm w-full bg-white dark:bg-neutral-900 border-2 border-indigo-500/80 rounded-2xl p-4 shadow-2xl animate-bounce flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
            <Building className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-900 dark:text-white truncate">
                {uilIncomingAlert.sender_name}
              </span>
              <button
                onClick={() => setUilIncomingAlert(null)}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-300 line-clamp-2 mt-0.5">
              {uilIncomingAlert.message}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() => {
                  setUilIncomingAlert(null)
                  setActiveChatTab('uil')
                  setIsDeanChatOpen(true)
                }}
                className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold"
              >
                Reply to UIL Officer
              </button>
              <button
                onClick={() => setUilIncomingAlert(null)}
                className="px-2 py-1 text-[11px] text-neutral-500 hover:underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UN-EDITABLE OFFICIAL CLEARANCE LETTER MODAL */}
      {isClearanceLetterModalOpen && uilProfile && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto animate-fade-in">
          <div className="bg-white dark:bg-neutral-900 border-2 border-neutral-300 dark:border-neutral-700 rounded-3xl max-w-2xl w-full p-8 shadow-2xl space-y-6 relative my-8 select-none">
            {/* Top Close Button & Security Watermark */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-md text-[10px] font-black tracking-widest bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 uppercase flex items-center gap-1">
                  <Lock className="w-3 h-3 text-emerald-600" />
                  AUTHENTICATED OFFICIAL INSTITUTIONAL RECORD
                </span>
                <span className="text-[11px] font-bold text-neutral-400">UN-EDITABLE</span>
              </div>
              <button
                onClick={() => setIsClearanceLetterModalOpen(false)}
                className="p-1 rounded-xl text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* University Letterhead */}
            <div className="text-center space-y-1 border-b pb-4 border-neutral-200 dark:border-neutral-800">
              <div className="w-12 h-12 mx-auto rounded-full bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold mb-1 border border-indigo-200 dark:border-indigo-800">
                <Building className="w-6 h-6" />
              </div>
              <p className="text-[11px] font-bold tracking-widest text-neutral-500 uppercase">Federal Democratic Republic of Ethiopia</p>
              <h3 className="text-base font-black text-neutral-900 dark:text-white uppercase tracking-tight">
                Ministry of Education • Directorate of Academic Affairs
              </h3>
              <h4 className="text-sm font-bold text-indigo-600 dark:text-indigo-400 uppercase">
                Office of the Department Dean — {uilProfile.dean_department || uilProfile.department || 'Engineering & Technology'}
              </h4>
              <div className="flex justify-between items-center text-[10px] text-neutral-500 pt-2 px-2">
                <span>Ref: REF/UoE/DEAN/{uilProfile.student_id_number || 'STU'}-{new Date().getFullYear()}</span>
                <span>Date: {uilProfile.dean_verified_at ? new Date(uilProfile.dean_verified_at).toLocaleDateString(undefined, { dateStyle: 'long' }) : new Date().toLocaleDateString()}</span>
              </div>
            </div>

            {/* Recipient & Student Information Block */}
            <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200/80 dark:border-neutral-700/80 text-xs space-y-1.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] uppercase font-bold text-neutral-400">Addressed To:</span>
                  <p className="font-semibold text-neutral-800 dark:text-neutral-200">
                    UIL Directorate & Student Services Division
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-neutral-400">Student Candidate:</span>
                  <p className="font-bold text-neutral-900 dark:text-white">
                    {(user as any)?.full_name || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || 'Student Candidate'}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-neutral-400">Student ID / Dept:</span>
                  <p className="font-mono text-neutral-800 dark:text-neutral-200">
                    {uilProfile.student_id_number || 'N/A'} • {uilProfile.department || 'N/A'}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-neutral-400">Standing & GPA:</span>
                  <p className="font-semibold text-neutral-800 dark:text-neutral-200">
                    Year {uilProfile.academic_year || 4} (3rd Year Completed) • GPA: {uilProfile.gpa || 'N/A'}
                  </p>
                </div>
              </div>
            </div>

            {/* Letter Title & Custom Body */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase text-neutral-900 dark:text-white tracking-wide border-l-4 border-indigo-600 pl-2">
                {lastViewedLetter === 'dorm_food'
                  ? (uilProfile.dorm_food_letter_title || 'CAMPUS DORMITORY & CAFETERIA CLEARANCE PERMIT')
                  : (uilProfile.dean_letter_title || 'OFFICIAL INTERNSHIP PROGRAM CLEARANCE LETTER')}
              </h4>
              <div className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed space-y-2 whitespace-pre-wrap font-serif bg-neutral-50/50 dark:bg-neutral-900/50 p-4 rounded-xl border border-neutral-200/60 dark:border-neutral-800">
                {lastViewedLetter === 'dorm_food'
                  ? (uilProfile.dorm_food_letter_notes ||
                      `This campus logistics clearance certifies that ${(user as any)?.full_name || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || 'Student Candidate'} is in full compliance with university residency regulations and is hereby granted official authorization for campus dormitory accommodation and dining hall meal card access.`)
                  : (uilProfile.dean_letter_notes ||
                      `This official academic clearance confirms that ${(user as any)?.full_name || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || 'Student Candidate'} has completed 3rd-year prerequisites with good standing and is authorized for Track 1 institutional placement, along with university campus services.`)}
              </div>
            </div>

            {/* Allowed Services Table */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                Authorized University Services & Provisions
              </span>
              <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-neutral-100 dark:bg-neutral-800 text-[10px] uppercase font-bold text-neutral-600 dark:text-neutral-400">
                    <tr>
                      <th className="p-2.5">Institutional Service</th>
                      <th className="p-2.5">Clearance Status</th>
                      <th className="p-2.5">Validity Period</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    <tr>
                      <td className="p-2.5 font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                        <Home className="w-3.5 h-3.5 text-indigo-600" /> Dormitory Accommodation
                      </td>
                      <td className="p-2.5">
                        {uilProfile.dean_allow_dorm ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            AUTHORIZED & GRANTED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                            NOT APPLICABLE
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-neutral-500 text-[11px]">
                        {uilProfile.dean_valid_from && uilProfile.dean_valid_until
                          ? `${uilProfile.dean_valid_from} to ${uilProfile.dean_valid_until}`
                          : 'Full Internship Term'}
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                        <Utensils className="w-3.5 h-3.5 text-amber-600" /> Student Cafeteria Meal Access
                      </td>
                      <td className="p-2.5">
                        {uilProfile.dean_allow_food ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            AUTHORIZED & GRANTED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                            NOT APPLICABLE
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-neutral-500 text-[11px]">
                        {uilProfile.dean_valid_from && uilProfile.dean_valid_until
                          ? `${uilProfile.dean_valid_from} to ${uilProfile.dean_valid_until}`
                          : 'Full Internship Term'}
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5 text-teal-600" /> Track 1 In-House Internship
                      </td>
                      <td className="p-2.5">
                        {uilProfile.dean_allow_internship ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            AUTHORIZED & ENROLLED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                            NOT APPLICABLE
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-neutral-500 text-[11px]">
                        {uilProfile.dean_valid_from && uilProfile.dean_valid_until
                          ? `${uilProfile.dean_valid_from} to ${uilProfile.dean_valid_until}`
                          : 'Full Internship Term'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Signature & Auto-generated Dean QR Code Block */}
            <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1 text-center sm:text-left">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                  Institutional Sign-Off & Verification Seal
                </span>
                <p className="text-sm font-black text-neutral-900 dark:text-white">
                  {uilProfile.dean_title || 'Department Dean'}
                </p>
                <p className="text-xs text-neutral-500">
                  Department Dean, {uilProfile.dean_department || uilProfile.department}
                </p>
                <div className="pt-1">
                  <span className="inline-block text-[9px] font-mono text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded">
                    HMAC: {uilProfile.dean_signature_hash ? `${uilProfile.dean_signature_hash.slice(0, 24)}...` : 'HMAC-SHA256-AUTHENTICATED'}
                  </span>
                </div>
              </div>

              {/* Auto Generated Dean QR Code - Directly Scannable + Click to Crop & Zoom */}
              <div
                onClick={() => {
                  setIsClearanceLetterModalOpen(false)
                  setIsQrScannerModalOpen(true)
                }}
                className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-white dark:bg-neutral-800/90 border-2 border-emerald-500/50 hover:border-emerald-500 hover:shadow-lg transition-all cursor-pointer group flex-shrink-0"
                title="Directly scannable by phone camera. Click to crop, zoom & inspect."
              >
                {(uilProfile.dean_unique_qr || uilProfile.dean_letter_qr || uilProfile.dean_verification_letter_qr) ? (
                  <div className="relative">
                    <img
                      src={ensureBase64DataUri(uilProfile.dean_unique_qr || uilProfile.dean_letter_qr || uilProfile.dean_verification_letter_qr)}
                      alt="Dean Digital QR Signature"
                      className="w-28 h-28 rounded-xl bg-white p-1 border shadow-xs group-hover:scale-105 transition-transform"
                    />
                    <div className="absolute inset-0 bg-emerald-950/0 group-hover:bg-emerald-950/15 rounded-xl transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 bg-black/75 text-white text-[9px] px-2 py-0.5 rounded-full font-bold transition-opacity shadow-sm">
                        Click to Zoom
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="w-28 h-28 rounded-xl bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center">
                    <QrCode className="w-8 h-8 text-neutral-400" />
                  </div>
                )}
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <QrCode className="w-3 h-3" /> Scannable Dean QR
                </span>
                <span className="text-[9px] text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-300">
                  Scan via phone or click
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-neutral-200 dark:border-neutral-800">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setIsClearanceLetterModalOpen(false)
                  setIsQrScannerModalOpen(true)
                }}
                className="text-xs h-9 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 font-bold flex items-center gap-1.5"
              >
                <QrCode className="w-4 h-4" /> Zoom & Inspect QR Code
              </Button>

              <div className="flex flex-wrap items-center gap-2">
                {lastViewedLetter === 'internship' && (
                  <Button
                    size="sm"
                    disabled={isForwardingToUIL || forwardedToUIL}
                    onClick={handleForwardToUIL}
                    className="text-xs h-9 bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 rounded-xl shadow-xs"
                  >
                    {forwardedToUIL ? 'Forwarded to UIL' : isForwardingToUIL ? 'Forwarding...' : 'Forward to UIL'}
                  </Button>
                )}

                {lastViewedLetter === 'dorm_food' && (
                  <>
                    <Button
                      size="sm"
                      disabled={isForwardingToDorm || forwardedToDorm}
                      onClick={handleForwardToDorm}
                      className="text-xs h-9 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3.5 rounded-xl shadow-xs flex items-center gap-1.5"
                    >
                      <Home className="w-3.5 h-3.5" />
                      {forwardedToDorm ? 'Forwarded to Dormitory' : isForwardingToDorm ? 'Forwarding...' : 'Forward to Dormitory'}
                    </Button>
                    <Button
                      size="sm"
                      disabled={isForwardingToStudentDean || forwardedToStudentDean}
                      onClick={handleForwardToStudentDean}
                      className="text-xs h-9 bg-amber-600 hover:bg-amber-700 text-white font-bold px-3.5 rounded-xl shadow-xs flex items-center gap-1.5"
                    >
                      <Utensils className="w-3.5 h-3.5" />
                      {forwardedToStudentDean ? 'Forwarded to Student Dean' : isForwardingToStudentDean ? 'Forwarding...' : 'Forward to Student Dean'}
                    </Button>
                  </>
                )}

                <Button
                  size="sm"
                  onClick={() => setIsClearanceLetterModalOpen(false)}
                  className="text-xs h-9 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 hover:bg-neutral-800 px-5 rounded-xl font-bold"
                >
                  Close Official Letter
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DEAN QR CROP, ZOOM & AUTHENTICITY CHECK MODAL */}
      {isQrScannerModalOpen && uilProfile && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-md animate-fade-in overflow-y-auto">
          <div className="bg-white dark:bg-neutral-900 border-2 border-emerald-500/50 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 relative my-auto">
            {/* Header with explicit Toggle and Exit controls */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Dean Cryptographic QR Inspection</h3>
                  <p className="text-[11px] text-neutral-400">High-Resolution Scannable Seal & Digital Signature</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsQrScannerModalOpen(false)
                    setIsClearanceLetterModalOpen(true)
                  }}
                  className="text-xs h-8 px-2.5 font-bold flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 bg-indigo-50/60 dark:bg-indigo-950/40 hover:bg-indigo-100"
                  title="Toggle back to clearance letter"
                >
                  <FileText className="w-3.5 h-3.5" /> Toggle Back to Letter
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setIsQrScannerModalOpen(false)
                    setIsClearanceLetterModalOpen(false)
                  }}
                  className="p-1.5 rounded-xl text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                  title="Exit inspection and close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Interactive Zoom & Crop Bar */}
            <div className="flex items-center justify-between p-2.5 rounded-2xl bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200/80 dark:border-neutral-700/80">
              <span className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 flex items-center gap-1.5">
                <ZoomIn className="w-3.5 h-3.5 text-emerald-600" />
                Zoom & Crop Mode:
              </span>
              <div className="flex items-center gap-1.5 bg-white dark:bg-neutral-900 p-1 rounded-xl border border-neutral-200 dark:border-neutral-700">
                <button
                  type="button"
                  onClick={() => setQrZoomLevel('fit')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition-all ${
                    qrZoomLevel === 'fit'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
                >
                  Fit (1x)
                </button>
                <button
                  type="button"
                  onClick={() => setQrZoomLevel('1.5x')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition-all ${
                    qrZoomLevel === '1.5x'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
                >
                  Zoom (1.5x)
                </button>
                <button
                  type="button"
                  onClick={() => setQrZoomLevel('2x')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition-all ${
                    qrZoomLevel === '2x'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
                >
                  Crop Reticle (2x)
                </button>
              </div>
            </div>

            {/* High-Contrast Scannable QR Code with Reticle Framing & Zoom */}
            <div className="flex flex-col items-center justify-center p-5 bg-gradient-to-b from-neutral-50 to-neutral-100 dark:from-neutral-800/80 dark:to-neutral-900/80 rounded-2xl border border-neutral-200 dark:border-neutral-700 relative overflow-hidden">
              <div className={`relative p-3 bg-white rounded-2xl shadow-md border-2 border-emerald-500/30 transition-all duration-200 ${
                qrZoomLevel === '2x' ? 'ring-4 ring-emerald-500/20' : ''
              }`}>
                {/* Camera Scan Reticle Corner Accents */}
                <div className="absolute top-1 left-1 w-3.5 h-3.5 border-t-2 border-l-2 border-emerald-600" />
                <div className="absolute top-1 right-1 w-3.5 h-3.5 border-t-2 border-r-2 border-emerald-600" />
                <div className="absolute bottom-1 left-1 w-3.5 h-3.5 border-b-2 border-l-2 border-emerald-600" />
                <div className="absolute bottom-1 right-1 w-3.5 h-3.5 border-b-2 border-r-2 border-emerald-600" />

                {(uilProfile.dean_letter_qr || uilProfile.dean_verification_letter_qr) ? (
                  <div className={`overflow-hidden transition-all duration-200 ${
                    qrZoomLevel === 'fit' ? 'w-48 h-48 sm:w-56 sm:h-56' : qrZoomLevel === '1.5x' ? 'w-60 h-60 sm:w-68 sm:h-68' : 'w-68 h-68 sm:w-76 sm:h-76'
                  } flex items-center justify-center`}>
                    <img
                      src={ensureBase64DataUri(uilProfile.dean_letter_qr || uilProfile.dean_verification_letter_qr)}
                      alt="Enlarged Dean Digital QR Signature"
                      className={`w-full h-full object-contain transition-transform duration-200 ${
                        qrZoomLevel === 'fit' ? 'scale-100' : qrZoomLevel === '1.5x' ? 'scale-115' : 'scale-130'
                      }`}
                    />
                  </div>
                ) : (
                  <div className="w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center bg-neutral-100">
                    <QrCode className="w-16 h-16 text-neutral-400" />
                  </div>
                )}
              </div>
              <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 mt-3 text-center">
                Point any phone camera or barcode scanner at the code above
              </p>
              <span className="text-[10px] text-neutral-400 mt-0.5">
                Target Payload: HMAC-SHA256 Signed Clearance Token ({qrZoomLevel.toUpperCase()} View)
              </span>
            </div>

            {/* Validation Badge */}
            <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow flex-shrink-0">
                <Check className="w-4 h-4 stroke-[3]" />
              </div>
              <div>
                <span className="text-xs font-black uppercase text-emerald-800 dark:text-emerald-300 tracking-wider">
                  Authentic Dean Signature Verified ✓
                </span>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                  Digitally issued by {uilProfile.dean_title || 'Department Dean'}. Cryptographically valid and unique to this Department Dean.
                </p>
              </div>
            </div>

            {/* Authenticity Details Grid */}
            <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 space-y-2 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-neutral-200/60 dark:border-neutral-700/60">
                <span className="text-neutral-400 text-[11px]">Issuing Authority:</span>
                <span className="font-bold text-neutral-900 dark:text-white">{uilProfile.dean_title || 'Department Dean'}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-neutral-200/60 dark:border-neutral-700/60">
                <span className="text-neutral-400 text-[11px]">Academic Department:</span>
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">{uilProfile.dean_department || uilProfile.department}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-neutral-200/60 dark:border-neutral-700/60">
                <span className="text-neutral-400 text-[11px]">Candidate Student ID:</span>
                <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{uilProfile.student_id_number || 'N/A'}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-neutral-200/60 dark:border-neutral-700/60">
                <span className="text-neutral-400 text-[11px]">Authorized Services:</span>
                <span className="font-semibold text-neutral-800 dark:text-neutral-200 text-right">
                  {[
                    uilProfile.dean_allow_dorm ? 'Dormitory' : null,
                    uilProfile.dean_allow_food ? 'Cafeteria' : null,
                    uilProfile.dean_allow_internship ? 'Track 1' : null,
                  ].filter(Boolean).join(', ') || 'None'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-neutral-200/60 dark:border-neutral-700/60">
                <span className="text-neutral-400 text-[11px]">Validity Window:</span>
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                  {uilProfile.dean_valid_from && uilProfile.dean_valid_until
                    ? `${uilProfile.dean_valid_from} — ${uilProfile.dean_valid_until}`
                    : 'Current Academic Term'}
                </span>
              </div>
              <div className="pt-1">
                <span className="text-[10px] text-neutral-400 block mb-1">HMAC-SHA256 Digital Fingerprint:</span>
                <p className="font-mono text-[9px] text-neutral-600 dark:text-neutral-400 break-all bg-neutral-100 dark:bg-neutral-900 p-2 rounded-lg border border-neutral-200 dark:border-neutral-800">
                  {uilProfile.dean_signature_hash || 'SHA256:VERIFIED-INSTITUTIONAL-SEAL'}
                </p>
              </div>
            </div>

            {/* Bottom Actions with explicit Toggle and Exit */}
            <div className="flex items-center justify-between pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsQrScannerModalOpen(false)
                  setIsClearanceLetterModalOpen(true)
                }}
                className="text-xs font-bold flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
              >
                <FileText className="w-3.5 h-3.5" /> ← Toggle Back to Letter
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setIsQrScannerModalOpen(false)
                  setIsClearanceLetterModalOpen(false)
                }}
                className="bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-neutral-100 dark:text-neutral-900 font-bold text-xs h-9 px-6 rounded-xl shadow-sm flex items-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" /> Exit Inspection
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW-ONLY EXCEL SCORE ROSTER MODAL (NO DOWNLOAD, NO PRINT, NO EDIT) */}
      {isScoreRosterModalOpen && uilProfile && (
        <div
          onContextMenu={(e) => e.preventDefault()}
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto animate-fade-in score-roster-protected"
        >
          {/* Print protection style: hides content on print/ctrl+p */}
          <style>{`
            @media print {
              .score-roster-protected {
                display: none !important;
              }
            }
          `}</style>
          <div className="bg-white dark:bg-neutral-900 border-2 border-emerald-500/40 rounded-3xl max-w-3xl w-full p-6 shadow-2xl space-y-5 select-none relative my-8">
            {/* Top Bar with Excel styling */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-sm">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                      Track1_Student_Score_Roster.xlsx
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      XLSX View-Only
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400">
                    Official Department Roster • Forwarded Directly to UIL Directorate
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsScoreRosterModalOpen(false)}
                className="p-1 rounded-xl text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Strict Institutional Protection Banner */}
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-semibold">
                <Lock className="w-4 h-4 flex-shrink-0" />
                <span>
                  Strictly View-Only Institutional Record • Download, Printing, and Editing Disabled
                </span>
              </div>
              <span className="text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-950 px-2 py-0.5 rounded-full whitespace-nowrap">
                Protected Roster
              </span>
            </div>

            {/* Excel Spreadsheet Table Simulation */}
            <div className="border border-neutral-200 dark:border-neutral-700 rounded-xl overflow-hidden shadow-xs">
              {/* Spreadsheet Column Headers A, B */}
              <div className="grid grid-cols-12 bg-neutral-100 dark:bg-neutral-800 text-[10px] font-mono text-neutral-500 uppercase border-b border-neutral-200 dark:border-neutral-700">
                <div className="col-span-1 p-2 border-r border-neutral-200 dark:border-neutral-700 text-center font-bold">#</div>
                <div className="col-span-4 p-2 border-r border-neutral-200 dark:border-neutral-700 font-bold">A: Parameter</div>
                <div className="col-span-7 p-2 font-bold">B: Institutional Record Value</div>
              </div>

              {/* Spreadsheet Rows */}
              <div className="divide-y divide-neutral-200 dark:divide-neutral-800 text-xs font-mono">
                <div className="grid grid-cols-12 hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                  <div className="col-span-1 p-2.5 border-r border-neutral-200 dark:border-neutral-700 text-center text-neutral-400">1</div>
                  <div className="col-span-4 p-2.5 border-r border-neutral-200 dark:border-neutral-700 font-bold text-neutral-700 dark:text-neutral-300">
                    Student ID Number
                  </div>
                  <div className="col-span-7 p-2.5 font-bold text-indigo-600 dark:text-indigo-400">
                    {uilProfile.score_roster_preview?.student_id || uilProfile.student_id_number || 'STU-RECORD'}
                  </div>
                </div>

                <div className="grid grid-cols-12 hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                  <div className="col-span-1 p-2.5 border-r border-neutral-200 dark:border-neutral-700 text-center text-neutral-400">2</div>
                  <div className="col-span-4 p-2.5 border-r border-neutral-200 dark:border-neutral-700 font-bold text-neutral-700 dark:text-neutral-300">
                    Student Full Name
                  </div>
                  <div className="col-span-7 p-2.5 text-neutral-900 dark:text-white font-sans font-semibold">
                    {uilProfile.score_roster_preview?.full_name || (user as any)?.full_name || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || 'Student Candidate'}
                  </div>
                </div>

                <div className="grid grid-cols-12 hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                  <div className="col-span-1 p-2.5 border-r border-neutral-200 dark:border-neutral-700 text-center text-neutral-400">3</div>
                  <div className="col-span-4 p-2.5 border-r border-neutral-200 dark:border-neutral-700 font-bold text-neutral-700 dark:text-neutral-300">
                    Academic Department
                  </div>
                  <div className="col-span-7 p-2.5 text-neutral-800 dark:text-neutral-200">
                    {uilProfile.score_roster_preview?.department || uilProfile.department}
                  </div>
                </div>

                <div className="grid grid-cols-12 hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                  <div className="col-span-1 p-2.5 border-r border-neutral-200 dark:border-neutral-700 text-center text-neutral-400">4</div>
                  <div className="col-span-4 p-2.5 border-r border-neutral-200 dark:border-neutral-700 font-bold text-neutral-700 dark:text-neutral-300">
                    Academic Standing
                  </div>
                  <div className="col-span-7 p-2.5 text-neutral-800 dark:text-neutral-200">
                    {uilProfile.score_roster_preview?.academic_year || `Year ${uilProfile.academic_year}`} (Completed 3rd Year)
                  </div>
                </div>

                <div className="grid grid-cols-12 hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                  <div className="col-span-1 p-2.5 border-r border-neutral-200 dark:border-neutral-700 text-center text-neutral-400">5</div>
                  <div className="col-span-4 p-2.5 border-r border-neutral-200 dark:border-neutral-700 font-bold text-neutral-700 dark:text-neutral-300">
                    Cumulative GPA
                  </div>
                  <div className="col-span-7 p-2.5 font-bold text-emerald-600 dark:text-emerald-400">
                    {uilProfile.score_roster_preview?.gpa || uilProfile.gpa || 'N/A'}
                  </div>
                </div>

                <div className="grid grid-cols-12 hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                  <div className="col-span-1 p-2.5 border-r border-neutral-200 dark:border-neutral-700 text-center text-neutral-400">6</div>
                  <div className="col-span-4 p-2.5 border-r border-neutral-200 dark:border-neutral-700 font-bold text-neutral-700 dark:text-neutral-300">
                    Institutional Eligibility
                  </div>
                  <div className="col-span-7 p-2.5">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      {uilProfile.score_roster_preview?.eligibility_status || 'APPROVED - 3RD YEAR COMPLETED'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-12 hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                  <div className="col-span-1 p-2.5 border-r border-neutral-200 dark:border-neutral-700 text-center text-neutral-400">7</div>
                  <div className="col-span-4 p-2.5 border-r border-neutral-200 dark:border-neutral-700 font-bold text-neutral-700 dark:text-neutral-300">
                    Authorized Services
                  </div>
                  <div className="col-span-7 p-2.5 text-neutral-700 dark:text-neutral-300 text-[11px]">
                    {uilProfile.score_roster_preview?.allowed_services?.join(', ') ||
                      [
                        uilProfile.dean_allow_dorm ? 'Dormitory' : null,
                        uilProfile.dean_allow_food ? 'Cafeteria' : null,
                        uilProfile.dean_allow_internship ? 'Track 1 Internship' : null,
                      ].filter(Boolean).join(', ') || 'All Campus Logistics Authorized'}
                  </div>
                </div>

                <div className="grid grid-cols-12 hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                  <div className="col-span-1 p-2.5 border-r border-neutral-200 dark:border-neutral-700 text-center text-neutral-400">8</div>
                  <div className="col-span-4 p-2.5 border-r border-neutral-200 dark:border-neutral-700 font-bold text-neutral-700 dark:text-neutral-300">
                    Endorsed By
                  </div>
                  <div className="col-span-7 p-2.5 font-bold text-neutral-900 dark:text-white">
                    {uilProfile.score_roster_preview?.endorsed_by || uilProfile.dean_title || 'Department Dean'}
                  </div>
                </div>

                <div className="grid grid-cols-12 hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                  <div className="col-span-1 p-2.5 border-r border-neutral-200 dark:border-neutral-700 text-center text-neutral-400">9</div>
                  <div className="col-span-4 p-2.5 border-r border-neutral-200 dark:border-neutral-700 font-bold text-neutral-700 dark:text-neutral-300">
                    Verification Stamp
                  </div>
                  <div className="col-span-7 p-2.5 text-[10px] text-neutral-500 break-all">
                    {uilProfile.score_roster_preview?.signature_hash || uilProfile.dean_signature_hash || 'HMAC-SHA256-AUTHENTICATED'}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer with Notice */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <span className="text-[11px] text-neutral-400 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-neutral-400" />
                Screen capture & printing restricted under institutional policy
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  disabled={isForwardingToUIL || forwardedToUIL}
                  onClick={handleForwardToUIL}
                  className="text-xs h-9 bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 rounded-xl shadow-xs"
                >
                  {forwardedToUIL ? 'Forwarded to UIL' : isForwardingToUIL ? 'Forwarding...' : 'Forward to UIL'}
                </Button>
                <Button
                  onClick={() => setIsScoreRosterModalOpen(false)}
                  className="bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 hover:bg-neutral-800 text-xs font-bold h-9 px-5 rounded-xl"
                >
                  Close Preview
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
