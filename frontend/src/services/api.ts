import axios, { AxiosError } from 'axios'
import type { InternalAxiosRequestConfig } from 'axios'
import { store } from '@/store'
import { refreshAccessToken, logoutUser } from '@/features/auth/authSlice'

function getBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL
  if (!envUrl || envUrl === '/api') return '/api'
  let url = envUrl.trim()
  if (
    typeof window !== 'undefined' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1' &&
    (url.includes('localhost') || url.includes('127.0.0.1'))
  ) {
    return '/api'
  }
  if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('/')) {
    url = `https://${url}`
  }
  if (!url.endsWith('/api') && !url.endsWith('/api/')) {
    url = `${url.replace(/\/$/, '')}/api`
  }
  return url
}

const baseURL = getBaseUrl()

// Raw Axios instance without 401 retry interceptors (e.g. for refresh token calls)
export const rawApi = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
})

// Base Axios instance used by all feature services.
const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
})

// Track ongoing refresh to prevent concurrent refresh requests
let isRefreshing = false
let refreshSubscribers: Array<{
  resolve: (token: string) => void
  reject: (error: unknown) => void
}> = []

// Add subscriber to be notified when refresh completes
function subscribeTokenRefresh(
  resolve: (token: string) => void,
  reject: (error: unknown) => void
) {
  refreshSubscribers.push({ resolve, reject })
}

// Notify all subscribers and clear the list
function onRefreshed(token: string) {
  refreshSubscribers.forEach(({ resolve }) => resolve(token))
  refreshSubscribers = []
}

function onRefreshFailed(error: unknown) {
  refreshSubscribers.forEach(({ reject }) => reject(error))
  refreshSubscribers = []
}

// Auth endpoints that should never trigger 401 token refresh
const PUBLIC_AUTH_PATHS = [
  '/auth/login/',
  '/auth/refresh/',
  '/auth/register/',
  '/auth/verify-email/',
  '/auth/password-reset/',
  '/auth/password-reset-confirm/',
  '/accounts/resend-verification/',
]

function isPublicAuthEndpoint(url?: string): boolean {
  if (!url) return false
  return PUBLIC_AUTH_PATHS.some((path) => url.includes(path))
}

export function setApiLanguage(lang: string) {
  api.defaults.headers.common['Accept-Language'] = lang
  rawApi.defaults.headers.common['Accept-Language'] = lang
}

// Attach JWT access token and language header to every request if present
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('access_token')
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  const currentLang = localStorage.getItem('i18nextLng') || 'en'
  if (config.headers && !config.headers['Accept-Language']) {
    config.headers['Accept-Language'] = currentLang
  }
  if (typeof FormData !== 'undefined' && config.data instanceof FormData && config.headers) {
    delete config.headers['Content-Type']
  }
  return config
})

// Handle 401 responses with token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined

    if (!originalRequest) {
      return Promise.reject(error)
    }

    // If error is not 401 or request is already retried, reject immediately (loop protection)
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error)
    }

    // Don't attempt refresh for auth endpoints themselves
    if (isPublicAuthEndpoint(originalRequest.url)) {
      return Promise.reject(error)
    }

    // If already refreshing, queue this request
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        subscribeTokenRefresh(
          (newToken: string) => {
            originalRequest._retry = true
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`
            }
            resolve(api(originalRequest))
          },
          (refreshError: unknown) => {
            reject(refreshError)
          }
        )
      })
    }

    // Mark as refreshing and attempt refresh
    isRefreshing = true
    originalRequest._retry = true

    try {
      // Dispatch refresh action to update Redux state
      const result = await store.dispatch(refreshAccessToken())

      if (refreshAccessToken.fulfilled.match(result)) {
        const newToken = result.payload.access
        isRefreshing = false
        onRefreshed(newToken)

        // Retry original request with new token
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`
        }
        return api(originalRequest)
      } else {
        // Refresh failed - notify subscribers, logout and redirect
        isRefreshing = false
        onRefreshFailed(error)

        const state = store.getState()
        await store.dispatch(logoutUser(state.auth.refreshToken))

        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
        return Promise.reject(error)
      }
    } catch (refreshError) {
      // Refresh failed - notify subscribers, logout and redirect
      isRefreshing = false
      onRefreshFailed(refreshError)

      const state = store.getState()
      await store.dispatch(logoutUser(state.auth.refreshToken))

      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
      return Promise.reject(refreshError)
    }
  }
)

export default api
