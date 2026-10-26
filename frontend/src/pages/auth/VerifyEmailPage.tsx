import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, useParams, Link } from 'react-router-dom'
import * as authApi from '@/services/authApi'

export default function VerifyEmailPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const routeParams = useParams<{ uid?: string; token?: string }>()

  const uid = searchParams.get('uid') || routeParams.uid
  const token = searchParams.get('token') || routeParams.token

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'already_verified' | 'error'>(
    uid && token ? 'loading' : 'idle'
  )
  const [errorMessage, setErrorMessage] = useState('')
  const [targetDestination, setTargetDestination] = useState('/dashboard')

  // Resend verification state
  const [resendEmail, setResendEmail] = useState('')
  const [resendLoading, setResendLoading] = useState(false)
  const [resendSuccess, setResendSuccess] = useState(false)
  const [resendError, setResendError] = useState('')

  useEffect(() => {
    if (!uid || !token) {
      if (status === 'loading') {
        setStatus('idle')
      }
      return
    }

    let isMounted = true
    let redirectTimer: ReturnType<typeof setTimeout> | null = null

    const verifyToken = async () => {
      try {
        const response = await authApi.verifyEmail(uid, token)
        if (!isMounted) return

        const userEmail = response.user?.email || ''
        const userRole = response.user?.role ? String(response.user.role).toLowerCase() : ''
        const params = new URLSearchParams({ verified: 'true' })
        if (userEmail) params.set('email', userEmail)
        if (userRole) params.set('role', userRole)
        const loginUrl = `/login?${params.toString()}`

        setTargetDestination(loginUrl)
        setStatus('success')

        redirectTimer = setTimeout(() => {
          navigate(loginUrl, { replace: true })
        }, 1200)
      } catch (error: any) {
        if (!isMounted) return
        const detail = error.response?.data?.detail || error.response?.data?.message
        const userData = error.response?.data?.user

        if (detail === 'Email has already been verified.' || userData) {
          const userEmail = userData?.email || ''
          const userRole = userData?.role ? String(userData.role).toLowerCase() : ''
          const params = new URLSearchParams({ verified: 'true' })
          if (userEmail) params.set('email', userEmail)
          if (userRole) params.set('role', userRole)
          const loginUrl = `/login?${params.toString()}`

          setTargetDestination(loginUrl)
          setStatus('already_verified')

          redirectTimer = setTimeout(() => {
            navigate(loginUrl, { replace: true })
          }, 1200)
        } else if (detail === 'Invalid or expired verification token.') {
          setStatus('error')
          setErrorMessage('This verification link has expired or is invalid. Please request a new verification email below.')
        } else {
          setStatus('error')
          setErrorMessage(detail || 'Email verification failed. Please request a new verification link below.')
        }
      }
    }

    verifyToken()

    return () => {
      isMounted = false
      if (redirectTimer) clearTimeout(redirectTimer)
    }
  }, [uid, token, navigate])

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault()
    setResendError('')
    setResendSuccess(false)

    if (!resendEmail.trim()) {
      setResendError('Please enter your email address.')
      return
    }

    setResendLoading(true)
    try {
      await authApi.resendVerification(resendEmail.trim())
      setResendSuccess(true)
    } catch (error: any) {
      const detail = error.response?.data?.email || error.response?.data?.detail
      setResendError(
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
          ? detail.join(' ')
          : 'Could not send verification email. Please check the address.'
      )
    } finally {
      setResendLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 to-primary-50/30 dark:from-dark-bg dark:to-neutral-900/30 px-4 py-12 sm:px-6 lg:px-8 animate-fade-in">
      <div className="max-w-md w-full space-y-8 card-gradient p-8 rounded-2xl shadow-glow border-2 border-neutral-200 dark:border-dark-border bg-white dark:bg-dark-card animate-slide-up">
        {status === 'loading' && (
          <div className="text-center py-6">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 shadow-glow">
              <svg
                className="animate-spin h-8 w-8 text-white"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
            <h1 className="mt-4 text-2xl font-bold gradient-text dark:text-white">Verifying your email</h1>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 font-medium">Please wait while we confirm your email address...</p>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center py-4 space-y-5 animate-scale-in">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-gradient-to-br from-success-400 to-success-600 shadow-glow">
              <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold gradient-text dark:text-white">Email Verified!</h1>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                Your email address has been verified and your account is active. Redirecting you to sign in...
              </p>
            </div>
            <button
              onClick={() => navigate(targetDestination, { replace: true })}
              className="btn-primary w-full inline-flex justify-center items-center py-2.5 px-4 rounded-xl shadow-glow text-sm font-semibold transition-all duration-200 hover:scale-105"
            >
              Continue to Login
            </button>
          </div>
        )}

        {status === 'already_verified' && (
          <div className="text-center py-4 space-y-5 animate-scale-in">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-gradient-to-br from-info-400 to-info-600 shadow-glow">
              <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold gradient-text dark:text-white">Account Already Verified</h1>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                This email address is already verified and active. Redirecting you to sign in...
              </p>
            </div>
            <button
              onClick={() => navigate(targetDestination, { replace: true })}
              className="btn-primary w-full inline-flex justify-center items-center py-2.5 px-4 rounded-xl shadow-glow text-sm font-semibold transition-all duration-200 hover:scale-105"
            >
              Continue to Login
            </button>
          </div>
        )}

        {(status === 'error' || status === 'idle') && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-gradient-to-br from-warning-400 to-warning-600 shadow-glow">
                <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h1 className="mt-4 text-2xl font-bold gradient-text dark:text-white">
                {status === 'error' ? 'Verification Failed' : 'Resend Verification Email'}
              </h1>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 font-medium">
                {status === 'error'
                  ? errorMessage
                  : 'Enter your registered email address to receive a new verification link.'}
              </p>
            </div>

            {resendSuccess ? (
              <div className="rounded-xl bg-success-50 dark:bg-success-900/20 p-4 border-2 border-success-200 dark:border-success-800 text-center space-y-3 animate-scale-in">
                <p className="text-sm font-semibold text-success-800 dark:text-success-300">
                  A new verification link has been sent to your email.
                </p>
                <Link
                  to="/login"
                  className="inline-block text-sm font-bold text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 transition-colors duration-200"
                >
                  Back to Login
                </Link>
              </div>
            ) : (
              <form onSubmit={handleResend} className="space-y-4" noValidate>
                {resendError && (
                  <div className="rounded-xl bg-error-50 dark:bg-error-900/20 p-3 border-2 border-error-200 dark:border-error-800 animate-scale-in">
                    <p className="text-xs font-medium text-error-700 dark:text-error-300">{resendError}</p>
                  </div>
                )}
                <div>
                  <label htmlFor="resendEmail" className="block text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Email address
                  </label>
                  <input
                    id="resendEmail"
                    name="resendEmail"
                    type="email"
                    required
                    value={resendEmail}
                    onChange={(e) => {
                      setResendEmail(e.target.value)
                      if (resendError) setResendError('')
                    }}
                    placeholder="student@example.com"
                    className="input-base appearance-none block w-full px-4 py-2.5 rounded-xl shadow-sm text-sm placeholder-neutral-400 dark:placeholder-neutral-500 dark:bg-neutral-900 dark:text-white border-neutral-300 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:focus:border-primary-400 transition-all duration-200"
                  />
                </div>
                <button
                  type="submit"
                  disabled={resendLoading}
                  className="btn-primary w-full flex justify-center items-center py-2.5 px-4 rounded-xl shadow-glow text-sm font-semibold transition-all duration-200 hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {resendLoading ? 'Sending...' : 'Send Verification Email'}
                </button>
                <div className="text-center pt-2">
                  <Link to="/login" className="text-sm font-bold text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 transition-colors duration-200">
                    Back to Login
                  </Link>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
