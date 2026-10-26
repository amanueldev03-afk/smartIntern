import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { 
  GraduationCap, 
  Building2, 
  School, 
  CheckCircle2, 
  AlertCircle, 
  Mail, 
  Lock, 
  User, 
  Phone, 
  Briefcase, 
  BookOpen, 
  Building,
  Loader2,
  Award,
  KeyRound,
  Utensils,
  CreditCard,
  Cpu
} from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { register, clearError } from '@/features/auth/authSlice'
import { getGoogleOAuthUrl } from '@/services/authApi'
import { Button } from '@/components/ui/button'

export type RegistrationRole = 
  | 'student' 
  | 'company_hr' 
  | 'company_mentor' 
  | 'dept_dean' 
  | 'uil_officer' 
  | 'advisor' 
  | 'student_union' 
  | 'dorm_admin' 
  | 'finance_officer'

export interface RoleOption {
  id: RegistrationRole
  title: string
  badge: string
  description: string
  icon: typeof GraduationCap
  gradient: string
}

export const ROLE_OPTIONS: RoleOption[] = [
  {
    id: 'student',
    title: 'Student / Intern',
    badge: 'Applicant',
    description: 'Find AI-matched internships, build your CV, and track applications.',
    icon: GraduationCap,
    gradient: 'from-blue-600 to-indigo-600',
  },
  {
    id: 'company_hr',
    title: 'Company HR',
    badge: 'Recruiter',
    description: 'Post internships, review AI-ranked students, and invite candidates.',
    icon: Building2,
    gradient: 'from-emerald-600 to-teal-600',
  },
  {
    id: 'company_mentor',
    title: 'Company Mentor',
    badge: 'Mentor',
    description: 'Supervise intern squads within host companies and evaluate weekly tasks.',
    icon: Building,
    gradient: 'from-teal-600 to-emerald-700',
  },
  {
    id: 'advisor',
    title: 'Academic Advisor',
    badge: 'Faculty',
    description: 'Supervise squads, launch advisory calls, and verify submissions.',
    icon: School,
    gradient: 'from-purple-600 to-pink-600',
  },
  {
    id: 'dept_dean',
    title: 'Department Dean',
    badge: 'Leadership',
    description: 'Verify 3rd-year eligibility, issue Base64 QR letters & Excel rosters.',
    icon: Award,
    gradient: 'from-amber-600 to-orange-600',
  },
  {
    id: 'uil_officer',
    title: 'UIL Head Officer',
    badge: 'Institutional',
    description: 'Manage quotas, balance technical squads, and seal score sheets.',
    icon: Cpu,
    gradient: 'from-cyan-600 to-blue-600',
  },
  {
    id: 'student_union',
    title: 'Student Union',
    badge: 'Campus Life',
    description: 'Schedule dining appointments and activate digital meal cards.',
    icon: Utensils,
    gradient: 'from-rose-600 to-pink-600',
  },
  {
    id: 'dorm_admin',
    title: 'Dormitory Admin',
    badge: 'Housing',
    description: 'Scan QR clearance passes, assign room/bed, and issue keys.',
    icon: KeyRound,
    gradient: 'from-violet-600 to-purple-600',
  },
  {
    id: 'finance_officer',
    title: 'Finance Officer',
    badge: 'Finance',
    description: 'Oversee student stipends, budget allocations, and institutional disbursements.',
    icon: CreditCard,
    gradient: 'from-amber-700 to-yellow-600',
  },
]

export function mapRoleParamToRegistrationRole(param?: string | null): RegistrationRole {
  const p = (param || '').toLowerCase().trim()
  switch (p) {
    case 'company_hr':
    case 'company':
    case 'employer':
      return 'company_hr'
    case 'company_mentor':
    case 'mentor':
      return 'company_mentor'
    case 'dept_dean':
    case 'dean':
      return 'dept_dean'
    case 'uil_officer':
    case 'uil':
      return 'uil_officer'
    case 'advisor':
      return 'advisor'
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
    case 'student':
    default:
      return 'student'
  }
}

export default function RegisterPage() {
  const dispatch = useAppDispatch()
  const [searchParams] = useSearchParams()
  const { isLoading, error } = useAppSelector((state) => state.auth)

  const initialRoleParam = searchParams.get('role')?.toLowerCase()
  const initialRole: RegistrationRole = mapRoleParamToRegistrationRole(initialRoleParam)

  const [selectedRole, setSelectedRole] = useState<RegistrationRole>(initialRole)

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    password_confirm: '',
    organization_name: '',
    university_name: '',
    department: '',
    staff_id_number: '',
  })

  const [clientErrors, setClientErrors] = useState<Record<string, string>>({})
  const [registrationSuccess, setRegistrationSuccess] = useState(false)
  const [registeredEmail, setRegisteredEmail] = useState('')

  useEffect(() => {
    if (initialRoleParam) {
      setSelectedRole(mapRoleParamToRegistrationRole(initialRoleParam))
    }
  }, [initialRoleParam])

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {}

    if (!formData.full_name.trim()) {
      errors.full_name = 'Full name is required.'
    }

    if (!formData.email.trim()) {
      errors.email = 'Email address is required.'
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = 'Please enter a valid email address.'
    }

    if (!formData.password) {
      errors.password = 'Password is required.'
    } else if (formData.password.length < 8) {
      errors.password = 'Password must be at least 8 characters.'
    }

    if (!formData.password_confirm) {
      errors.password_confirm = 'Please confirm your password.'
    } else if (formData.password !== formData.password_confirm) {
      errors.password_confirm = 'Passwords do not match.'
    }

    if (['company_hr', 'company_mentor'].includes(selectedRole) && !formData.organization_name.trim()) {
      errors.organization_name = 'Company / Organization name is required.'
    }

    if (['advisor', 'dept_dean'].includes(selectedRole)) {
      if (!formData.university_name.trim()) {
        errors.university_name = 'University / Institution name is required.'
      }
      if (!formData.department.trim()) {
        errors.department = 'Academic department is required.'
      }
    }

    if (['uil_officer', 'student_union', 'dorm_admin', 'finance_officer'].includes(selectedRole)) {
      if (!formData.university_name.trim()) {
        errors.university_name = 'University / Institution name is required.'
      }
      if (['dorm_admin', 'student_union'].includes(selectedRole) && !formData.staff_id_number.trim()) {
        errors.staff_id_number = 'Official Staff / Employee ID is required for verification.'
      }
    }

    setClientErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
    if (clientErrors[name]) {
      setClientErrors((prev) => {
        const next = { ...prev }
        delete next[name]
        return next
      })
    }
    if (error) dispatch(clearError())
  }

  const handleRoleSelect = (roleId: RegistrationRole) => {
    setSelectedRole(roleId)
    setClientErrors({})
    if (error) dispatch(clearError())
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    const emailToRegister = formData.email.trim()
    const requiresOrg = ['company_hr', 'company_mentor'].includes(selectedRole)
    const requiresUni = ['advisor', 'dept_dean', 'uil_officer', 'student_union', 'dorm_admin', 'finance_officer', 'student'].includes(selectedRole)
    const requiresDept = ['advisor', 'dept_dean', 'student'].includes(selectedRole)

    const result = await dispatch(
      register({
        full_name: formData.full_name.trim(),
        email: emailToRegister,
        phone: formData.phone.trim() || undefined,
        password: formData.password,
        password_confirm: formData.password_confirm,
        role: selectedRole,
        organization_name:
          requiresOrg ? formData.organization_name.trim() : undefined,
        university_name:
          requiresUni ? formData.university_name.trim() || undefined : undefined,
        department:
          requiresDept ? formData.department.trim() || undefined : undefined,
        staff_id_number:
          ['dorm_admin', 'student_union', 'uil_officer', 'finance_officer', 'dept_dean'].includes(selectedRole)
            ? formData.staff_id_number.trim() || undefined
            : undefined,
      })
    )

    if (register.fulfilled.match(result)) {
      setRegisteredEmail(emailToRegister)
      setRegistrationSuccess(true)
    }
  }

  const getBackendErrorForField = (fieldName: string): string | null => {
    if (!error) return null
    try {
      const parsed = JSON.parse(error)
      const fieldVal = parsed[fieldName]
      if (Array.isArray(fieldVal)) return fieldVal.join(' ')
      if (typeof fieldVal === 'string') return fieldVal
      return null
    } catch {
      return null
    }
  }

  const generalBackendError =
    error &&
    !getBackendErrorForField('full_name') &&
    !getBackendErrorForField('email') &&
    !getBackendErrorForField('password') &&
    !getBackendErrorForField('password_confirm') &&
    !getBackendErrorForField('organization_name') &&
    !getBackendErrorForField('university_name') &&
    !getBackendErrorForField('department')
      ? error
      : null

  const googleOAuthUrl = getGoogleOAuthUrl()

  const currentRoleConfig = ROLE_OPTIONS.find((r) => r.id === selectedRole) || ROLE_OPTIONS[0]

  if (registrationSuccess) {
    const isStaffRole = ['dept_dean', 'uil_officer', 'student_union', 'dorm_admin', 'finance_officer'].includes(selectedRole)
    const isAdvisorRole = selectedRole === 'advisor'

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 to-primary-50/30 dark:from-[#09090b] dark:to-neutral-900/40 px-4 py-12 animate-fade-in">
        <div className="max-w-md w-full card-gradient p-8 sm:p-10 rounded-3xl shadow-glow border border-neutral-200/80 dark:border-neutral-800 bg-white/95 dark:bg-neutral-900/90 text-center space-y-6 animate-scale-in">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-glow">
            <CheckCircle2 className="h-8 w-8 text-white" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-primary-500/10 text-primary-600 dark:text-primary-400">
              {currentRoleConfig.badge} Account
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white tracking-tight">
              Registration Successful!
            </h1>
            <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
              {isStaffRole ? (
                <>
                  Your institutional staff registration for{' '}
                  <span className="font-bold text-neutral-900 dark:text-white">{registeredEmail}</span> has been received.
                  Please verify your email inbox. Note that your account will require Administrator approval before logging in.
                </>
              ) : isAdvisorRole ? (
                <>
                  Your academic advisor registration for{' '}
                  <span className="font-bold text-neutral-900 dark:text-white">{registeredEmail}</span> has been received.
                  Please verify your email inbox. Note that your account will require UIL Officer approval before logging in.
                </>
              ) : (
                <>
                  We have sent an activation link to{' '}
                  <span className="font-bold text-neutral-900 dark:text-white">{registeredEmail}</span>.
                  Please check your inbox to verify your email before signing in.
                </>
              )}
            </p>
          </div>

          <div className="pt-2 space-y-3">
            <Link to={`/login?role=${selectedRole}`} className="block">
              <Button className="w-full py-3 rounded-2xl shadow-glow text-xs sm:text-sm font-bold">
                Go to {currentRoleConfig.title} Login
              </Button>
            </Link>
            <div>
              <Link
                to="/verify-email"
                className="text-xs font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 underline transition-colors"
              >
                Didn't receive an email? Resend verification link
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 via-slate-50 to-primary-50/20 dark:from-[#09090b] dark:via-neutral-900/60 dark:to-neutral-900 px-4 py-12 sm:px-6 lg:px-8 animate-fade-in">
      <div className="max-w-xl w-full space-y-6 card-gradient p-8 sm:p-10 rounded-3xl shadow-glow border border-neutral-200/80 dark:border-neutral-800 bg-white/95 dark:bg-neutral-900/90 animate-slide-up">
        {/* Brand & Heading */}
        <div className="text-center space-y-2">
          <Link to="/" className="inline-flex items-center gap-2 mb-1 group">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-primary-600 to-secondary-500 text-white flex items-center justify-center font-black text-base shadow-glow group-hover:rotate-6 transition-transform">
              AI
            </div>
            <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-primary-600 via-primary-500 to-secondary-500 bg-clip-text text-transparent">
              InternMatch
            </span>
          </Link>
          <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white tracking-tight">
            Create your account
          </h1>
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            Select your role from all {ROLE_OPTIONS.length} platform actors to unlock customized pipelines
          </p>
        </div>

        {generalBackendError && (
          <div className="rounded-2xl bg-error-50 dark:bg-error-950/40 p-4 border border-error-200 dark:border-error-800 animate-scale-in" role="alert">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-error-600 dark:text-error-400 shrink-0" />
              <p className="text-xs font-medium text-error-700 dark:text-error-300">{generalBackendError}</p>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* Role Selection Grid (All 10 Actors) */}
        {/* ------------------------------------------------------------- */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold text-neutral-600 dark:text-neutral-300 uppercase tracking-wider">
              Select Your Role ({ROLE_OPTIONS.length} Actors Available)
            </label>
            <span className="text-[11px] font-semibold text-primary-600 dark:text-primary-400">
              {currentRoleConfig.title}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {ROLE_OPTIONS.map((option) => {
              const Icon = option.icon
              const isSelected = selectedRole === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleRoleSelect(option.id)}
                  className={`p-2.5 rounded-2xl border-2 text-left transition-all duration-300 flex flex-col justify-between ${
                    isSelected
                      ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-950/20 shadow-glow scale-[1.02]'
                      : 'border-neutral-200/80 dark:border-neutral-800 hover:border-primary-300 bg-white dark:bg-neutral-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div
                      className={`w-7 h-7 rounded-xl flex items-center justify-center text-white bg-gradient-to-tr ${option.gradient} shadow-sm`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    {isSelected && (
                      <span className="w-3.5 h-3.5 rounded-full bg-primary-600 text-white flex items-center justify-center text-[8px] font-bold">
                        ✓
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 className="text-[11px] font-black text-neutral-900 dark:text-white leading-tight truncate">
                      {option.title}
                    </h3>
                    <span className="inline-block text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 mt-1">
                      {option.badge}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 pt-1 italic">
            {currentRoleConfig.description}
          </p>
        </div>

        {/* Google OAuth Option */}
        <div>
          <a
            href={googleOAuthUrl}
            className="w-full flex justify-center items-center py-2.5 px-4 rounded-2xl border-2 border-neutral-200/80 dark:border-neutral-700 text-xs font-bold text-neutral-700 dark:text-neutral-200 bg-white/80 dark:bg-neutral-800/80 hover:border-primary-400 hover:bg-primary-50/50 dark:hover:bg-neutral-700 shadow-soft transition-all duration-300"
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
            Sign up with Google as {currentRoleConfig.title}
          </a>
        </div>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-neutral-200/80 dark:border-neutral-800"></div>
          </div>
          <div className="relative flex justify-center text-[10px] font-bold uppercase tracking-wider">
            <span className="bg-white dark:bg-neutral-900 px-3 text-neutral-400">Or continue with credentials</span>
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* Dynamic Form */}
        {/* ------------------------------------------------------------- */}
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          {/* Full Name */}
          <div>
            <label htmlFor="full_name" className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">
              Full Name <span className="text-error-500">*</span>
            </label>
            <div className="relative flex items-center">
              <User className="w-4 h-4 text-neutral-400 absolute left-4 pointer-events-none" />
              <input
                id="full_name"
                name="full_name"
                type="text"
                autoComplete="name"
                required
                value={formData.full_name}
                onChange={handleChange}
                disabled={isLoading}
                className="w-full pl-11 pr-4 py-3 rounded-2xl bg-neutral-100/80 dark:bg-neutral-800/80 border-2 border-neutral-200/80 dark:border-neutral-700 text-xs font-medium text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                placeholder={
                  selectedRole === 'company_hr'
                    ? 'e.g. Sara Bekele (HR Lead)'
                    : selectedRole === 'company_mentor'
                    ? 'e.g. Dawit Tadesse (Tech Lead)'
                    : selectedRole === 'dept_dean'
                    ? 'e.g. Dr. Haile Selassie (Dean)'
                    : selectedRole === 'advisor'
                    ? 'e.g. Dr. Muluken Advisor'
                    : 'e.g. Abebe Kebede'
                }
              />
            </div>
            {(clientErrors.full_name || getBackendErrorForField('full_name')) && (
              <p className="mt-1 text-xs font-medium text-error-600 dark:text-error-400">
                {clientErrors.full_name || getBackendErrorForField('full_name')}
              </p>
            )}
          </div>

          {/* Email Address */}
          <div>
            <label htmlFor="email" className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">
              Email Address <span className="text-error-500">*</span>
            </label>
            <div className="relative flex items-center">
              <Mail className="w-4 h-4 text-neutral-400 absolute left-4 pointer-events-none" />
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={formData.email}
                onChange={handleChange}
                disabled={isLoading}
                className="w-full pl-11 pr-4 py-3 rounded-2xl bg-neutral-100/80 dark:bg-neutral-800/80 border-2 border-neutral-200/80 dark:border-neutral-700 text-xs font-medium text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                placeholder={
                  selectedRole === 'company_hr' || selectedRole === 'company_mentor'
                    ? 'recruiting@company.et'
                    : 'user@university.edu.et'
                }
              />
            </div>
            {(clientErrors.email || getBackendErrorForField('email')) && (
              <p className="mt-1 text-xs font-medium text-error-600 dark:text-error-400">
                {clientErrors.email || getBackendErrorForField('email')}
              </p>
            )}
          </div>

          {/* Role-Specific Field: Company Name (for Employer & Mentor) */}
          {['company_hr', 'company_mentor'].includes(selectedRole) && (
            <div>
              <label htmlFor="organization_name" className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">
                Company / Organization Name <span className="text-error-500">*</span>
              </label>
              <div className="relative flex items-center">
                <Briefcase className="w-4 h-4 text-neutral-400 absolute left-4 pointer-events-none" />
                <input
                  id="organization_name"
                  name="organization_name"
                  type="text"
                  required
                  value={formData.organization_name}
                  onChange={handleChange}
                  disabled={isLoading}
                  className="w-full pl-11 pr-4 py-3 rounded-2xl bg-neutral-100/80 dark:bg-neutral-800/80 border-2 border-neutral-200/80 dark:border-neutral-700 text-xs font-medium text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                  placeholder="e.g. Ethio Telecom, Safaricom Ethiopia, Kifiya"
                />
              </div>
              {(clientErrors.organization_name || getBackendErrorForField('organization_name')) && (
                <p className="mt-1 text-xs font-medium text-error-600 dark:text-error-400">
                  {clientErrors.organization_name || getBackendErrorForField('organization_name')}
                </p>
              )}
            </div>
          )}

          {/* Role-Specific Fields: University & Department */}
          {['advisor', 'dept_dean', 'student', 'uil_officer', 'student_union', 'dorm_admin', 'finance_officer'].includes(selectedRole) && (
            <div className={`grid grid-cols-1 ${['advisor', 'dept_dean', 'student', 'dorm_admin', 'student_union', 'uil_officer', 'finance_officer'].includes(selectedRole) ? 'sm:grid-cols-2' : ''} gap-3`}>
              <div>
                <label htmlFor="university_name" className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">
                  University / College {selectedRole !== 'student' && <span className="text-error-500">*</span>}
                </label>
                <div className="relative flex items-center">
                  <Building className="w-4 h-4 text-neutral-400 absolute left-4 pointer-events-none" />
                  <input
                    id="university_name"
                    name="university_name"
                    type="text"
                    value={formData.university_name}
                    onChange={handleChange}
                    disabled={isLoading}
                    className="w-full pl-11 pr-4 py-3 rounded-2xl bg-neutral-100/80 dark:bg-neutral-800/80 border-2 border-neutral-200/80 dark:border-neutral-700 text-xs font-medium text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                    placeholder="e.g. Addis Ababa University"
                  />
                </div>
                {(clientErrors.university_name || getBackendErrorForField('university_name')) && (
                  <p className="mt-1 text-xs font-medium text-error-600 dark:text-error-400">
                    {clientErrors.university_name || getBackendErrorForField('university_name')}
                  </p>
                )}
              </div>

              {['advisor', 'dept_dean', 'student'].includes(selectedRole) && (
                <div>
                  <label htmlFor="department" className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">
                    Department {selectedRole !== 'student' && <span className="text-error-500">*</span>}
                  </label>
                  <div className="relative flex items-center">
                    <BookOpen className="w-4 h-4 text-neutral-400 absolute left-4 pointer-events-none" />
                    <input
                      id="department"
                      name="department"
                      type="text"
                      value={formData.department}
                      onChange={handleChange}
                      disabled={isLoading}
                      className="w-full pl-11 pr-4 py-3 rounded-2xl bg-neutral-100/80 dark:bg-neutral-800/80 border-2 border-neutral-200/80 dark:border-neutral-700 text-xs font-medium text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                      placeholder="e.g. Software Engineering"
                    />
                  </div>
                  {(clientErrors.department || getBackendErrorForField('department')) && (
                    <p className="mt-1 text-xs font-medium text-error-600 dark:text-error-400">
                      {clientErrors.department || getBackendErrorForField('department')}
                    </p>
                  )}
                </div>
              )}

              {['dorm_admin', 'student_union', 'uil_officer', 'finance_officer', 'dept_dean'].includes(selectedRole) && (
                <div>
                  <label htmlFor="staff_id_number" className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">
                    Staff / Employee ID {['dorm_admin', 'student_union'].includes(selectedRole) && <span className="text-error-500">*</span>}
                  </label>
                  <div className="relative flex items-center">
                    <CreditCard className="w-4 h-4 text-neutral-400 absolute left-4 pointer-events-none" />
                    <input
                      id="staff_id_number"
                      name="staff_id_number"
                      type="text"
                      value={formData.staff_id_number}
                      onChange={handleChange}
                      disabled={isLoading}
                      className="w-full pl-11 pr-4 py-3 rounded-2xl bg-neutral-100/80 dark:bg-neutral-800/80 border-2 border-neutral-200/80 dark:border-neutral-700 text-xs font-medium text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                      placeholder="e.g. AAU-STAFF-1049"
                    />
                  </div>
                  {(clientErrors.staff_id_number || getBackendErrorForField('staff_id_number')) && (
                    <p className="mt-1 text-xs font-medium text-error-600 dark:text-error-400">
                      {clientErrors.staff_id_number || getBackendErrorForField('staff_id_number')}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Phone Number (Optional) */}
          <div>
            <label htmlFor="phone" className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">
              Ethiopian Phone Number <span className="text-[10px] text-neutral-400 font-normal lowercase">(optional)</span>
            </label>
            <div className="relative flex items-center">
              <Phone className="w-4 h-4 text-neutral-400 absolute left-4 pointer-events-none" />
              <input
                id="phone"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleChange}
                disabled={isLoading}
                className="w-full pl-11 pr-4 py-3 rounded-2xl bg-neutral-100/80 dark:bg-neutral-800/80 border-2 border-neutral-200/80 dark:border-neutral-700 text-xs font-medium text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                placeholder="+251 91 123 4567"
              />
            </div>
            {getBackendErrorForField('phone') && (
              <p className="mt-1 text-xs font-medium text-error-600 dark:text-error-400">
                {getBackendErrorForField('phone')}
              </p>
            )}
          </div>

          {/* Passwords */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="password" className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">
                Password <span className="text-error-500">*</span>
              </label>
              <div className="relative flex items-center">
                <Lock className="w-4 h-4 text-neutral-400 absolute left-4 pointer-events-none" />
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  disabled={isLoading}
                  className="w-full pl-11 pr-4 py-3 rounded-2xl bg-neutral-100/80 dark:bg-neutral-800/80 border-2 border-neutral-200/80 dark:border-neutral-700 text-xs font-medium text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                  placeholder="Min 8 characters"
                />
              </div>
              {(clientErrors.password || getBackendErrorForField('password')) && (
                <p className="mt-1 text-xs font-medium text-error-600 dark:text-error-400">
                  {clientErrors.password || getBackendErrorForField('password')}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="password_confirm" className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">
                Confirm Password <span className="text-error-500">*</span>
              </label>
              <div className="relative flex items-center">
                <Lock className="w-4 h-4 text-neutral-400 absolute left-4 pointer-events-none" />
                <input
                  id="password_confirm"
                  name="password_confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={formData.password_confirm}
                  onChange={handleChange}
                  disabled={isLoading}
                  className="w-full pl-11 pr-4 py-3 rounded-2xl bg-neutral-100/80 dark:bg-neutral-800/80 border-2 border-neutral-200/80 dark:border-neutral-700 text-xs font-medium text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                  placeholder="Re-enter password"
                />
              </div>
              {(clientErrors.password_confirm || getBackendErrorForField('password_confirm')) && (
                <p className="mt-1 text-xs font-medium text-error-600 dark:text-error-400">
                  {clientErrors.password_confirm || getBackendErrorForField('password_confirm')}
                </p>
              )}
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
                Creating {currentRoleConfig.title} Account...
              </>
            ) : (
              `Create ${currentRoleConfig.title} Account`
            )}
          </Button>

          <div className="text-center pt-2">
            <span className="text-xs text-neutral-500 font-medium">Already have an account? </span>
            <Link
              to={`/login?role=${selectedRole}`}
              className="text-xs font-bold text-primary-600 dark:text-primary-400 hover:underline"
            >
              Sign In to {currentRoleConfig.title} Portal
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
