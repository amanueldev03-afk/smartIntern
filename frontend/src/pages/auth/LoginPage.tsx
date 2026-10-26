import { useState, useEffect } from 'react'
import { useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom'
import {
  Loader2,
  AlertCircle,
  Clock,
  Lock,
  Mail,
  GraduationCap,
  Building2,
  Building,
  School,
  Award,
  Cpu,
  Utensils,
  KeyRound,
  CreditCard,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { login, clearError } from '@/features/auth/authSlice'
import { getGoogleOAuthUrl } from '@/services/authApi'
import { Button } from '@/components/ui/button'
import { getDashboardPathForRole } from '@/routes/routeUtils'

export type LoginRoleTab =
  | 'student'
  | 'company_hr'
  | 'company_mentor'
  | 'advisor'
  | 'dept_dean'
  | 'uil_officer'
  | 'student_union'
  | 'dorm_admin'
  | 'finance_officer'
  | 'admin'

export interface RoleTabOption {
  id: LoginRoleTab
  title: string
  portalName: string
  subtitle: string
  badge: string
  icon: typeof GraduationCap
  registerParam: string
  registerLabel: string
}

export const ROLE_TABS: RoleTabOption[] = [
  {
    id: 'student',
    title: 'Student',
    portalName: 'Student Portal',
    subtitle: 'Sign in to access AI recommendations & track applications',
    badge: 'Intern',
    icon: GraduationCap,
    registerParam: 'student',
    registerLabel: 'Student / Intern',
  },
  {
    id: 'company_hr',
    title: 'Company HR',
    portalName: 'Employer Portal',
    subtitle: 'Sign in to post listings & review student applicants',
    badge: 'Recruiter',
    icon: Building2,
    registerParam: 'company_hr',
    registerLabel: 'Company / Employer',
  },
  {
    id: 'company_mentor',
    title: 'Mentor',
    portalName: 'Company Mentor Portal',
    subtitle: 'Sign in to supervise squads & evaluate intern performance',
    badge: 'Mentor',
    icon: Building,
    registerParam: 'company_mentor',
    registerLabel: 'Company Mentor',
  },
  {
    id: 'advisor',
    title: 'Advisor',
    portalName: 'Academic Advisor Portal',
    subtitle: 'Sign in to supervise student internships & verify logbooks',
    badge: 'Faculty',
    icon: School,
    registerParam: 'advisor',
    registerLabel: 'Academic Advisor',
  },
  {
    id: 'dept_dean',
    title: 'Dean',
    portalName: 'Department Dean Portal',
    subtitle: 'Sign in to verify student eligibility & issue signed rosters',
    badge: 'Leadership',
    icon: Award,
    registerParam: 'dept_dean',
    registerLabel: 'Department Dean',
  },
  {
    id: 'uil_officer',
    title: 'UIL Officer',
    portalName: 'UIL Head Officer Portal',
    subtitle: 'Sign in to balance technical squads & manage company quotas',
    badge: 'Institutional',
    icon: Cpu,
    registerParam: 'uil_officer',
    registerLabel: 'UIL Head Officer',
  },
  {
    id: 'student_union',
    title: 'Union',
    portalName: 'Student Union Portal',
    subtitle: 'Sign in to manage dining appointments & digital meal cards',
    badge: 'Campus Life',
    icon: Utensils,
    registerParam: 'student_union',
    registerLabel: 'Student Union',
  },
  {
    id: 'dorm_admin',
    title: 'Dorm Admin',
    portalName: 'Dormitory Admin Portal',
    subtitle: 'Sign in to assign rooms, beds & scan QR clearance passes',
    badge: 'Housing',
    icon: KeyRound,
    registerParam: 'dorm_admin',
    registerLabel: 'Dormitory Admin',
  },
  {
    id: 'finance_officer',
    title: 'Finance',
    portalName: 'Finance Officer Portal',
    subtitle: 'Sign in to verify student stipends & budget disbursements',
    badge: 'Finance',
    icon: CreditCard,
    registerParam: 'finance_officer',
    registerLabel: 'Finance Officer',
  },
  {
    id: 'admin',
    title: 'Admin',
    portalName: 'System Administrator Portal',
    subtitle: 'Sign in to approve staff accounts & manage system platform',
    badge: 'Administrator',
    icon: ShieldCheck,
    registerParam: 'admin',
    registerLabel: 'System Administrator',
  },
]

export function mapRoleParamToLoginRole(param?: string | null): LoginRoleTab {
  const p = (param || '').toLowerCase().trim()
  switch (p) {
    case 'company_hr':
    case 'company':
    case 'employer':
      return 'company_hr'
    case 'company_mentor':
    case 'mentor':
      return 'company_mentor'
    case 'advisor':
      return 'advisor'
    case 'dept_dean':
    case 'dean':
      return 'dept_dean'
    case 'uil_officer':
    case 'uil':
      return 'uil_officer'
    case 'student_union':
    case 'union':
      return 'student_union'
    case 'dorm_admin':
    case 'dorm':
      return 'dorm_admin'
    case 'finance_officer':
    case 'finance':
      return 'finance_officer'
    case 'admin':
    case 'administrator':
      return 'admin'
    case 'student':
    default:
      return 'student'
  }
}

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useAppDispatch()
  const [searchParams, setSearchParams] = useSearchParams()
  const { isLoading, error, isAuthenticated, user, role, isInitialized } = useAppSelector(
    (state) => state.auth
  )

  const roleParam = searchParams.get('role')?.toLowerCase()
  const emailParam = searchParams.get('email')?.trim()
  const isVerifiedSuccess = searchParams.get('verified') === 'true'
  const initialRole: LoginRoleTab = mapRoleParamToLoginRole(roleParam)

  const [activeRole, setActiveRole] = useState<LoginRoleTab>(initialRole)

  useEffect(() => {
    if (roleParam) {
      setActiveRole(mapRoleParamToLoginRole(roleParam))
    }
  }, [roleParam])

  const handleRoleChange = (roleId: LoginRoleTab) => {
    setActiveRole(roleId)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('role', roleId)
        return next
      },
      { replace: true }
    )
  }

  const activeRoleConfig = ROLE_TABS.find((t) => t.id === activeRole) || ROLE_TABS[0]
  const ActiveIcon = activeRoleConfig.icon

  const [formData, setFormData] = useState({
    email: emailParam || '',
    password: '',
  })
  const [clientError, setClientError] = useState<string | null>(null)

  useEffect(() => {
    if (emailParam && !formData.email) {
      setFormData((prev) => ({ ...prev, email: emailParam }))
    }
  }, [emailParam])

  useEffect(() => {
    if (isInitialized && isAuthenticated) {
      const rawRole = role || user?.role || ''
      const currentRole = rawRole.toLowerCase()
      const fromState = (location.state as { from?: { pathname?: string; search?: string } })?.from
      const from = fromState?.pathname
        ? `${fromState.pathname}${fromState.search || ''}`
        : null

      if (from && !from.startsWith('/login') && !from.startsWith('/register')) {
        navigate(from, { replace: true })
      } else {
        navigate(getDashboardPathForRole(currentRole), { replace: true })
      }
    }
  }, [isAuthenticated, user, role, isInitialized, navigate, location])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }))
    if (clientError) setClientError(null)
    if (error) dispatch(clearError())
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setClientError(null)

    if (!formData.email.trim()) {
      setClientError('Email address is required.')
      return
    }
    if (!formData.password) {
      setClientError('Password is required.')
      return
    }

    const result = await dispatch(login({ email: formData.email.trim(), password: formData.password }))

    if (login.fulfilled.match(result)) {
      const rawRole = result.payload.user?.role || role || ''
      const currentRole = rawRole.toLowerCase()
      const from = (location.state as { from?: { pathname?: string } })?.from?.pathname

      if (from && from !== '/login' && from !== '/register') {
        navigate(from, { replace: true })
      } else {
        navigate(getDashboardPathForRole(currentRole), { replace: true, state: { verifiedJustNow: isVerifiedSuccess } })
      }
    }
  }

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center animate-fade-in">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 text-primary-600 animate-spin" />
          <span className="text-xs font-semibold text-neutral-500">Initializing session...</span>
        </div>
      </div>
    )
  }

  const errorMsg =
    typeof error === 'string'
      ? error
      : Array.isArray(error)
      ? (error as string[]).join(', ')
      : error && typeof error === 'object'
      ? JSON.stringify(error)
      : ''

  const isUnverifiedAccount =
    errorMsg && (errorMsg.toLowerCase().includes('verify your email') || errorMsg.toLowerCase().includes('inactive'))

  const isPendingStaffApproval =
    errorMsg && errorMsg.toLowerCase().includes('institutional administrator approval')

  const isPendingAdvisorApproval =
    errorMsg && errorMsg.toLowerCase().includes('pending approval by the uil officer')

  const googleOAuthUrl = getGoogleOAuthUrl()

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8 animate-fade-in bg-gradient-to-br from-neutral-50 via-slate-50 to-primary-50/20 dark:from-[#09090b] dark:via-neutral-900/60 dark:to-neutral-900">
      <div className="max-w-xl w-full space-y-6 card-gradient p-8 sm:p-10 rounded-3xl shadow-glow border border-neutral-200/80 dark:border-neutral-800 bg-white/95 dark:bg-neutral-900/90 animate-slide-up">
        {/* Brand & Heading */}
        <div className="text-center space-y-2">
          <Link to="/" className="inline-flex items-center gap-2 mb-2 group">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-primary-600 to-secondary-500 text-white flex items-center justify-center font-black text-base shadow-glow group-hover:rotate-6 transition-transform">
              AI
            </div>
            <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-primary-600 via-primary-500 to-secondary-500 bg-clip-text text-transparent">
              InternMatch
            </span>
          </Link>
          <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white tracking-tight">
            Sign In to your account
          </h1>
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            Select your actor portal below to sign in to your dashboard
          </p>
        </div>

        {/* Selected Role Active Card */}
        <div className="p-3.5 rounded-2xl border-2 border-primary-500/40 bg-primary-50/50 dark:bg-primary-950/20 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <ActiveIcon className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xs sm:text-sm font-extrabold text-neutral-900 dark:text-white truncate">
                {activeRoleConfig.portalName}
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-600/10 text-primary-700 dark:text-primary-300 shrink-0">
                {activeRoleConfig.badge}
              </span>
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
              {activeRoleConfig.subtitle}
            </p>
          </div>
        </div>

        {/* Role Selector Grid (All 10 Actors) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-bold text-neutral-500 uppercase tracking-wider px-1">
            <span>Select Actor Portal ({ROLE_TABS.length} Actors)</span>
            <span className="text-primary-600 dark:text-primary-400 normal-case font-semibold">
              {activeRoleConfig.title}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 p-1.5 bg-neutral-100/90 dark:bg-neutral-800/90 rounded-2xl border border-neutral-200/80 dark:border-neutral-700/60">
            {ROLE_TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = activeRole === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleRoleChange(tab.id)}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                    isActive
                      ? 'bg-white dark:bg-neutral-900 text-primary-600 dark:text-primary-400 shadow-sm border border-neutral-200/60 dark:border-neutral-700/80'
                      : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
                  }`}
                  title={tab.portalName}
                >
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-primary-600 dark:text-primary-400' : 'text-neutral-400'}`} />
                  <span className="truncate">{tab.title}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Email Successfully Verified Alert Banner */}
        {isVerifiedSuccess && (
          <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 p-4 border border-emerald-200 dark:border-emerald-800 animate-scale-in" role="alert">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <h3 className="text-xs font-bold text-emerald-800 dark:text-emerald-300">Email Verified Successfully!</h3>
                <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400 leading-relaxed">
                  Your email address has been verified and your account is active. Please enter your password to sign in.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Unverified Email Warning */}
        {isUnverifiedAccount && (
          <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 p-4 border border-amber-200 dark:border-amber-800 animate-scale-in" role="alert">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div>
                <h3 className="text-xs font-bold text-amber-800 dark:text-amber-300">Email verification required</h3>
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                  Please verify your email address to activate your account before logging in.
                </p>
                <Link
                  to="/verify-email"
                  className="mt-2 inline-block text-xs font-bold text-amber-900 dark:text-amber-200 underline"
                >
                  Need a new verification link?
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Institutional Staff Approval Pending Warning */}
        {isPendingStaffApproval && (
          <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 p-4 border border-amber-200 dark:border-amber-800 animate-scale-in" role="alert">
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div>
                <h3 className="text-xs font-bold text-amber-800 dark:text-amber-300">Staff Account Approval Pending</h3>
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                  Your institutional staff account has been registered and verified, but requires approval by a System Administrator before you can sign in. Please contact your institution's administrator.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Academic Advisor Approval Pending Warning */}
        {isPendingAdvisorApproval && (
          <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 p-4 border border-amber-200 dark:border-amber-800 animate-scale-in" role="alert">
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div>
                <h3 className="text-xs font-bold text-amber-800 dark:text-amber-300">Advisor Account Approval Pending</h3>
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                  Your academic advisor account is pending approval by the UIL (University-Industry Linkage) Officer. You will be able to sign in once your appointment is verified.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* General Error Alert */}
        {(clientError || (errorMsg && !isUnverifiedAccount && !isPendingStaffApproval && !isPendingAdvisorApproval)) && (
          <div className="rounded-2xl bg-error-50 dark:bg-error-950/40 p-4 border border-error-200 dark:border-error-800 animate-scale-in" role="alert">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-error-600 dark:text-error-400 shrink-0" />
              <p className="text-xs font-medium text-error-700 dark:text-error-300">{clientError || errorMsg}</p>
            </div>
          </div>
        )}

        {/* Google OAuth Button */}
        <div>
          <a
            href={googleOAuthUrl}
            className="w-full flex justify-center items-center py-3 px-4 rounded-2xl border-2 border-neutral-200/80 dark:border-neutral-700 text-xs font-bold text-neutral-700 dark:text-neutral-200 bg-white/80 dark:bg-neutral-800/80 hover:border-primary-400 hover:bg-primary-50/50 dark:hover:bg-neutral-700 shadow-soft transition-all duration-300"
          >
            <svg className="h-4 w-4 mr-2.5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </a>
        </div>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-neutral-200/80 dark:border-neutral-800"></div>
          </div>
          <div className="relative flex justify-center text-[10px] font-bold uppercase tracking-wider">
            <span className="bg-white dark:bg-neutral-900 px-3 text-neutral-400">Or continue with email</span>
          </div>
        </div>

        {/* Email/Password Form */}
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <div>
            <label htmlFor="email" className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">
              {['admin', 'student_union', 'dorm_admin', 'dept_dean', 'uil_officer'].includes(activeRole)
                ? 'Username or Email address'
                : 'Email address'}
            </label>
            <div className="relative flex items-center">
              <Mail className="w-4 h-4 text-neutral-400 absolute left-4 pointer-events-none" />
              <input
                id="email"
                name="email"
                type="text"
                autoComplete="username"
                required
                value={formData.email}
                onChange={handleChange}
                disabled={isLoading}
                className="w-full pl-11 pr-4 py-3 rounded-2xl bg-neutral-100/80 dark:bg-neutral-800/80 border-2 border-neutral-200/80 dark:border-neutral-700 text-xs font-medium text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                placeholder={
                  activeRole === 'company_hr' || activeRole === 'company_mentor'
                    ? 'user@company.com'
                    : activeRole === 'admin'
                    ? 'admin1 or admin1@smartintern.et'
                    : activeRole === 'student_union'
                    ? 'union1 or union@smartintern.et'
                    : activeRole === 'dorm_admin'
                    ? 'dorm1 or dorm@smartintern.et'
                    : 'user@university.edu.et'
                }
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="password" className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                Password
              </label>
              <Link
                to="/forgot-password"
                className="text-xs font-bold text-primary-600 dark:text-primary-400 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative flex items-center">
              <Lock className="w-4 h-4 text-neutral-400 absolute left-4 pointer-events-none" />
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={formData.password}
                onChange={handleChange}
                disabled={isLoading}
                className="w-full pl-11 pr-4 py-3 rounded-2xl bg-neutral-100/80 dark:bg-neutral-800/80 border-2 border-neutral-200/80 dark:border-neutral-700 text-xs font-medium text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                placeholder="••••••••"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 rounded-2xl shadow-glow text-xs sm:text-sm font-bold"
          >
            {isLoading ? (
              <>
                <Loader2 className="animate-spin mr-2 h-4 w-4" />
                Signing in...
              </>
            ) : (
              `Sign In to ${activeRoleConfig.title} Portal`
            )}
          </Button>

          <div className="text-center pt-2 space-y-2">
            {activeRole === 'admin' ? (
              <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-3 text-left space-y-1">
                <div className="flex items-center justify-between text-xs font-bold text-amber-700 dark:text-amber-400">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    Administrator Credentials
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData({ email: 'admin1', password: 'Admin@1234' })}
                    className="text-[10px] text-primary-600 dark:text-primary-400 hover:underline font-bold"
                  >
                    Quick Fill
                  </button>
                </div>
                <p className="text-[11px] text-neutral-600 dark:text-neutral-300">
                  Username: <code className="font-mono font-bold bg-amber-500/20 text-amber-800 dark:text-amber-200 px-1.5 py-0.5 rounded">admin1</code> | Password: <code className="font-mono font-bold bg-amber-500/20 text-amber-800 dark:text-amber-200 px-1.5 py-0.5 rounded">Admin@1234</code>
                </p>
                <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                  Administrator accounts are pre-provisioned and cannot be registered publicly.
                </p>
              </div>
            ) : activeRole === 'student_union' ? (
              <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-3 text-left space-y-1">
                <div className="flex items-center justify-between text-xs font-bold text-amber-700 dark:text-amber-400">
                  <div className="flex items-center gap-1.5">
                    <Utensils className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    Student Union Credentials
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData({ email: 'union1', password: 'Password123!' })}
                    className="text-[10px] text-primary-600 dark:text-primary-400 hover:underline font-bold"
                  >
                    Quick Fill
                  </button>
                </div>
                <p className="text-[11px] text-neutral-600 dark:text-neutral-300">
                  Username: <code className="font-mono font-bold bg-amber-500/20 text-amber-800 dark:text-amber-200 px-1.5 py-0.5 rounded">union1</code> | Password: <code className="font-mono font-bold bg-amber-500/20 text-amber-800 dark:text-amber-200 px-1.5 py-0.5 rounded">Password123!</code>
                </p>
                <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                  Official Campus Dining Representative (Addis Ababa University).
                </p>
              </div>
            ) : activeRole === 'dorm_admin' ? (
              <div className="rounded-2xl bg-blue-500/10 border border-blue-500/20 p-3 text-left space-y-1">
                <div className="flex items-center justify-between text-xs font-bold text-blue-700 dark:text-blue-400">
                  <div className="flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    Dormitory Administrator Credentials
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData({ email: 'dorm1', password: 'Password123!' })}
                    className="text-[10px] text-primary-600 dark:text-primary-400 hover:underline font-bold"
                  >
                    Quick Fill
                  </button>
                </div>
                <p className="text-[11px] text-neutral-600 dark:text-neutral-300">
                  Username: <code className="font-mono font-bold bg-blue-500/20 text-blue-800 dark:text-blue-200 px-1.5 py-0.5 rounded">dorm1</code> | Password: <code className="font-mono font-bold bg-blue-500/20 text-blue-800 dark:text-blue-200 px-1.5 py-0.5 rounded">Password123!</code>
                </p>
                <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                  Official Campus Housing Administrator (Addis Ababa University).
                </p>
              </div>
            ) : (
              <div>
                <span className="text-xs text-neutral-500 font-medium">Don't have an account? </span>
                <Link
                  to={`/register?role=${activeRoleConfig.registerParam}`}
                  className="text-xs font-bold text-primary-600 dark:text-primary-400 hover:underline"
                >
                  Sign up as {activeRoleConfig.registerLabel}
                </Link>
              </div>
            )}
            <div className="pt-2 border-t border-neutral-200/60 dark:border-neutral-800/80">
              <span className="block text-[11px] font-semibold text-neutral-400 mb-1.5">
                Quick register as another actor:
              </span>
              <div className="flex items-center justify-center flex-wrap gap-1.5 text-[11px]">
                {ROLE_TABS.filter((t) => t.id !== activeRole && t.id !== 'admin').map((t) => (
                  <Link
                    key={t.id}
                    to={`/register?role=${t.registerParam}`}
                    className="px-2 py-0.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950/40 transition-colors"
                  >
                    {t.title}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
