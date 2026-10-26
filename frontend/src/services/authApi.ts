import api, { rawApi } from './api'
import type { User } from '@/types'

export interface LoginResponse {
  access: string
  refresh: string
  user: {
    id: number
    email: string
    username: string
    role: string
  }
}

export interface RegisterResponse {
  message: string
  access?: string
  refresh?: string
  user: {
    id: number | string
    email: string
    username: string
    full_name: string
    role?: string
  }
}

export interface RefreshResponse {
  access: string
  refresh?: string
}

// Helper to determine the correct Google OAuth login endpoint
export function getGoogleOAuthUrl(): string {
  const envUrl = import.meta.env.VITE_OAUTH_BASE_URL || import.meta.env.VITE_API_BASE_URL
  if (envUrl) {
    try {
      let target = envUrl.trim()
      if (!target.startsWith('http://') && !target.startsWith('https://') && !target.startsWith('/')) {
        target = `https://${target}`
      }
      if (target.startsWith('http://') || target.startsWith('https://')) {
        const parsed = new URL(target)
        if (
          typeof window !== 'undefined' &&
          window.location.hostname !== 'localhost' &&
          window.location.hostname !== '127.0.0.1' &&
          (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
        ) {
          return '/accounts/google/login/'
        }
        return `${parsed.origin}/accounts/google/login/`
      }
    } catch {
      // Fallback
    }
  }
  return '/accounts/google/login/'
}

// Login - POST /api/auth/login/
export async function login(credentials: { email: string; password: string }): Promise<LoginResponse> {
  const response = await api.post<LoginResponse>('/auth/login/', credentials)
  return response.data
}

// Register - POST /api/auth/register/
export async function register(data: {
  full_name: string
  email: string
  password: string
  password_confirm: string
  phone?: string
  role?: string
  organization_name?: string
  department?: string
  university_name?: string
  staff_id_number?: string
  auto_activate?: boolean
}): Promise<RegisterResponse> {
  const response = await api.post<RegisterResponse>('/auth/register/', data)
  return response.data
}

// Refresh Token - POST /api/auth/refresh/ using rawApi to avoid interceptor recursion
export async function refreshToken(refresh: string): Promise<RefreshResponse> {
  const response = await rawApi.post<RefreshResponse>('/auth/refresh/', { refresh })
  return response.data
}

// Logout - POST /api/accounts/logout/
export async function logout(refresh: string): Promise<{ message: string }> {
  const response = await api.post<{ message: string }>('/accounts/logout/', { refresh })
  return response.data
}

// Get Current User - GET /api/accounts/me/
export async function getCurrentUser(): Promise<User> {
  const response = await api.get<User>('/accounts/me/')
  return response.data
}

// Update Current User - PATCH /api/accounts/me/
export async function updateUser(data: {
  first_name?: string
  last_name?: string
  profile_photo?: File
}): Promise<User> {
  const formData = new FormData()
  if (data.first_name !== undefined) formData.append('first_name', data.first_name)
  if (data.last_name !== undefined) formData.append('last_name', data.last_name)
  if (data.profile_photo !== undefined) formData.append('profile_photo', data.profile_photo)
  
  const response = await api.patch<User>('/accounts/me/', formData)
  return response.data
}

export interface VerifyEmailResponse {
  message: string
  access?: string
  refresh?: string
  user?: {
    id: number
    email: string
    username: string
    role: string
  }
}

// Verify Email - GET /api/auth/verify-email/<uid>/<token>/
export async function verifyEmail(uid: string, token: string): Promise<VerifyEmailResponse> {
  const response = await api.get<VerifyEmailResponse>(`/auth/verify-email/${encodeURIComponent(uid)}/${encodeURIComponent(token)}/`)
  return response.data
}

// Forgot Password - POST /api/auth/password-reset/
export async function forgotPassword(email: string): Promise<{ message: string }> {
  const response = await api.post<{ message: string }>('/auth/password-reset/', { email })
  return response.data
}

// Reset Password - POST /api/auth/password-reset-confirm/<uid>/<token>/
export async function resetPassword(
  uid: string,
  token: string,
  password: string,
  password_confirm: string
): Promise<{ message: string }> {
  const response = await api.post<{ message: string }>(
    `/auth/password-reset-confirm/${encodeURIComponent(uid)}/${encodeURIComponent(token)}/`,
    { uid, token, password, password_confirm }
  )
  return response.data
}

// Resend Verification Email - POST /api/accounts/resend-verification/
export async function resendVerification(email: string): Promise<{ message: string }> {
  const response = await api.post<{ message: string }>('/accounts/resend-verification/', { email })
  return response.data
}

// Change Password - POST /api/accounts/change-password/
export async function changePassword(data: {
  old_password: string
  new_password: string
  new_password_confirm: string
}): Promise<{ message: string }> {
  const response = await api.post<{ message: string }>('/accounts/change-password/', data)
  return response.data
}
