import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAppDispatch } from '@/hooks/redux'
import { setCredentials } from '@/features/auth/authSlice'
import * as authApi from '@/services/authApi'
import type { User } from '@/types'

export default function OAuthCallbackPage() {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const [searchParams] = useSearchParams()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handleAuthCallback = async () => {
      const access = searchParams.get('access') || searchParams.get('token')
      const refresh = searchParams.get('refresh') || searchParams.get('refreshToken') || ''
      const email = searchParams.get('email') || ''
      const roleParam = searchParams.get('role') as any
      const errorParam = searchParams.get('error')

      if (errorParam) {
        setError(decodeURIComponent(errorParam))
        return
      }

      if (!access) {
        setError('No access token received from authentication provider.')
        return
      }

      try {
        localStorage.setItem('access_token', access)
        if (refresh) {
          localStorage.setItem('refresh_token', refresh)
        }

        let user: User
        try {
          user = await authApi.getCurrentUser()
        } catch {
          user = {
            id: 0,
            email: email || 'user@example.com',
            username: email ? email.split('@')[0] : 'user',
            role: roleParam === 'admin' ? 'admin' : 'student',
          }
        }

        dispatch(
          setCredentials({
            user,
            accessToken: access,
            refreshToken: refresh,
          })
        )

        if (user.role === 'admin' || roleParam === 'admin') {
          navigate('/admin/dashboard', { replace: true })
        } else {
          navigate('/dashboard', { replace: true })
        }
      } catch {
        setError('Failed to complete social sign-in. Please try again.')
      }
    }

    handleAuthCallback()
  }, [searchParams, dispatch, navigate])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
        <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-sm border border-gray-100 text-center space-y-6">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100">
            <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sign-in Failed</h1>
            <p className="mt-2 text-sm text-gray-600">{error}</p>
          </div>
          <Link
            to="/login"
            className="w-full inline-flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
          >
            Back to Login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
        <p className="text-sm font-medium text-gray-600">Completing sign-in with Google...</p>
      </div>
    </div>
  )
}
