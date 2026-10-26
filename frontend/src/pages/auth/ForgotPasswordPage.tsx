import { useState } from 'react'
import { Link } from 'react-router-dom'
import * as authApi from '@/services/authApi'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [clientError, setClientError] = useState('')
  const [serverError, setServerError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setClientError('')
    setServerError('')

    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setClientError('Email address is required.')
      return
    }
    if (!/\S+@\S+\.\S+/.test(trimmedEmail)) {
      setClientError('Please enter a valid email address.')
      return
    }

    setIsLoading(true)

    try {
      await authApi.forgotPassword(trimmedEmail)
      setSubmitted(true)
    } catch (error: any) {
      const detail = error.response?.data?.email || error.response?.data?.detail
      setServerError(
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
          ? detail.join(' ')
          : 'Unable to process password reset request. Please try again.'
      )
    } finally {
      setIsLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 to-primary-50/30 dark:from-dark-bg dark:to-neutral-900/30 px-4 py-12 sm:px-6 lg:px-8 animate-fade-in">
        <div className="max-w-md w-full space-y-6 card-gradient p-8 rounded-2xl shadow-glow border-2 border-neutral-200 dark:border-dark-border bg-white dark:bg-dark-card text-center animate-scale-in">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-gradient-to-br from-success-400 to-success-600 shadow-glow">
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
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold gradient-text dark:text-white">Check your email</h1>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              If an account exists with <span className="font-semibold text-primary-700 dark:text-primary-400">{email}</span>, a password reset link has been sent. Please check your inbox and spam folder.
            </p>
          </div>
          <div className="pt-2 flex flex-col sm:flex-row justify-center gap-3">
            <Link
              to="/login"
              className="btn-primary w-full inline-flex justify-center items-center py-2.5 px-4 rounded-xl shadow-glow text-sm font-semibold transition-all duration-200 hover:scale-105"
            >
              Return to Login
            </Link>
            <button
              onClick={() => {
                setSubmitted(false)
                setEmail('')
              }}
              className="btn-secondary w-full inline-flex justify-center items-center py-2.5 px-4 rounded-xl shadow-glow text-sm font-semibold transition-all duration-200 hover:scale-105"
            >
              Try another email
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 to-primary-50/30 dark:from-dark-bg dark:to-neutral-900/30 px-4 py-12 sm:px-6 lg:px-8 animate-fade-in">
      <div className="max-w-md w-full space-y-8 card-gradient p-8 rounded-2xl shadow-glow border-2 border-neutral-200 dark:border-dark-border bg-white dark:bg-dark-card animate-slide-up">
        <div>
          <h1 className="text-center text-3xl font-extrabold gradient-text dark:text-white tracking-tight">
            Reset your password
          </h1>
          <p className="mt-2 text-center text-sm text-neutral-600 dark:text-neutral-400 font-medium">
            Enter your email address and we'll send you a link to reset your password.
          </p>
        </div>

        {(clientError || serverError) && (
          <div className="rounded-xl bg-error-50 p-4 border-2 border-error-200 dark:bg-error-900/20 dark:border-error-800 animate-scale-in" role="alert">
            <p className="text-sm font-medium text-error-700 dark:text-error-300">{clientError || serverError}</p>
          </div>
        )}

        <form className="mt-6 space-y-5" onSubmit={handleSubmit} noValidate>
          <div>
            <label htmlFor="email" className="block text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-1">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (clientError) setClientError('')
                if (serverError) setServerError('')
              }}
              disabled={isLoading}
              className="input-base appearance-none block w-full px-4 py-2.5 rounded-xl shadow-sm placeholder-neutral-400 dark:placeholder-neutral-500 dark:bg-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:focus:border-primary-400 dark:focus:ring-primary-400 text-sm disabled:bg-neutral-100 dark:disabled:bg-neutral-800 transition-all duration-200"
              placeholder="student@example.com"
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
                  Sending reset link...
                </>
              ) : (
                'Send password reset link'
              )}
            </button>
          </div>

          <div className="text-center pt-2">
            <span className="text-sm text-neutral-600 dark:text-neutral-400 font-medium">Remember your password? </span>
            <Link
              to="/login"
              className="text-sm font-bold text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 transition-colors duration-200"
            >
              Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
