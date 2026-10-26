import { useState } from 'react'
import { Link, useNavigate, useSearchParams, useParams } from 'react-router-dom'
import * as authApi from '@/services/authApi'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const routeParams = useParams<{ uid?: string; token?: string }>()

  const uid = searchParams.get('uid') || routeParams.uid
  const token = searchParams.get('token') || routeParams.token

  const [formData, setFormData] = useState({
    password: '',
    password_confirm: '',
  })
  const [clientError, setClientError] = useState('')
  const [serverError, setServerError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }))
    if (clientError) setClientError('')
    if (serverError) setServerError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setClientError('')
    setServerError('')

    if (!uid || !token) {
      setClientError('Invalid or missing password reset token.')
      return
    }

    if (!formData.password) {
      setClientError('New password is required.')
      return
    }

    if (formData.password.length < 8) {
      setClientError('Password must be at least 8 characters.')
      return
    }

    if (formData.password !== formData.password_confirm) {
      setClientError('Passwords do not match.')
      return
    }

    setIsLoading(true)

    try {
      await authApi.resetPassword(uid, token, formData.password, formData.password_confirm)
      setIsSuccess(true)
    } catch (error: any) {
      const detail = error.response?.data?.detail
      const pwdError = error.response?.data?.password
      if (detail) {
        setServerError(detail)
      } else if (pwdError) {
        setServerError(Array.isArray(pwdError) ? pwdError.join(' ') : String(pwdError))
      } else {
        setServerError('Unable to reset password. Please request a new reset link.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  if (!uid || !token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 to-primary-50/30 dark:from-dark-bg dark:to-neutral-900/30 px-4 py-12 sm:px-6 lg:px-8 animate-fade-in">
        <div className="max-w-md w-full card-gradient p-8 rounded-2xl shadow-glow border-2 border-neutral-200 dark:border-dark-border bg-white dark:bg-dark-card text-center space-y-6 animate-scale-in">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-gradient-to-br from-warning-400 to-warning-600 shadow-glow">
            <svg
              className="h-8 w-8 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold gradient-text dark:text-white">Invalid Reset Link</h1>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              This password reset link is missing required verification tokens. Please request a new one.
            </p>
          </div>
          <Link
            to="/forgot-password"
            className="btn-primary w-full inline-flex justify-center items-center py-2.5 px-4 rounded-xl shadow-glow text-sm font-semibold transition-all duration-200 hover:scale-105"
          >
            Request New Reset Link
          </Link>
        </div>
      </div>
    )
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 to-primary-50/30 dark:from-dark-bg dark:to-neutral-900/30 px-4 py-12 sm:px-6 lg:px-8 animate-fade-in">
        <div className="max-w-md w-full card-gradient p-8 rounded-2xl shadow-glow border-2 border-neutral-200 dark:border-dark-border bg-white dark:bg-dark-card text-center space-y-6 animate-scale-in">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-gradient-to-br from-success-400 to-success-600 shadow-glow">
            <svg
              className="h-8 w-8 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold gradient-text dark:text-white">Password Reset Successful</h1>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Your password has been changed successfully. You can now sign in with your new password.
            </p>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="btn-primary w-full inline-flex justify-center items-center py-2.5 px-4 rounded-xl shadow-glow text-sm font-semibold transition-all duration-200 hover:scale-105"
          >
            Continue to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 to-primary-50/30 dark:from-dark-bg dark:to-neutral-900/30 px-4 py-12 sm:px-6 lg:px-8 animate-fade-in">
      <div className="max-w-md w-full space-y-8 card-gradient p-8 rounded-2xl shadow-glow border-2 border-neutral-200 dark:border-dark-border bg-white dark:bg-dark-card animate-slide-up">
        <div>
          <h1 className="text-center text-3xl font-extrabold gradient-text dark:text-white tracking-tight">
            Create new password
          </h1>
          <p className="mt-2 text-center text-sm text-neutral-600 dark:text-neutral-400 font-medium">
            Please enter your new password below.
          </p>
        </div>

        {(clientError || serverError) && (
          <div className="rounded-xl bg-error-50 p-4 border-2 border-error-200 dark:bg-error-900/20 dark:border-error-800 animate-scale-in" role="alert">
            <p className="text-sm font-medium text-error-700 dark:text-error-300">{clientError || serverError}</p>
          </div>
        )}

        <form className="mt-6 space-y-5" onSubmit={handleSubmit} noValidate>
          <div>
            <label htmlFor="password" className="block text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-1">
              New Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              value={formData.password}
              onChange={handleChange}
              disabled={isLoading}
              className="input-base appearance-none block w-full px-4 py-2.5 rounded-xl shadow-sm placeholder-neutral-400 dark:placeholder-neutral-500 dark:bg-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:focus:border-primary-400 dark:focus:ring-primary-400 text-sm disabled:bg-neutral-100 dark:disabled:bg-neutral-800 transition-all duration-200"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label htmlFor="password_confirm" className="block text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-1">
              Confirm New Password
            </label>
            <input
              id="password_confirm"
              name="password_confirm"
              type="password"
              autoComplete="new-password"
              required
              value={formData.password_confirm}
              onChange={handleChange}
              disabled={isLoading}
              className="input-base appearance-none block w-full px-4 py-2.5 rounded-xl shadow-sm placeholder-neutral-400 dark:placeholder-neutral-500 dark:bg-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:focus:border-primary-400 dark:focus:ring-primary-400 text-sm disabled:bg-neutral-100 dark:disabled:bg-neutral-800 transition-all duration-200"
              placeholder="••••••••"
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full flex justify-center items-center py-2.5 px-4 rounded-xl shadow-glow text-sm font-semibold transition-all duration-200 hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Resetting password...
                </>
              ) : (
                'Set new password'
              )}
            </button>
          </div>

          <div className="text-center pt-2">
            <Link
              to="/login"
              className="text-sm font-bold text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 transition-colors duration-200"
            >
              Back to Login
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
