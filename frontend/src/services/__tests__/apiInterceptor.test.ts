import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import api, { rawApi } from '../api'
import { store } from '@/store'
import { setCredentials, logoutUser } from '@/features/auth/authSlice'

function createAxiosError(
  message: string,
  status: number,
  data: any,
  config: InternalAxiosRequestConfig
) {
  const error = new AxiosError(
    message,
    status.toString(),
    config,
    {},
    {
      data,
      status,
      statusText: status === 401 ? 'Unauthorized' : 'Error',
      headers: {},
      config,
    }
  )
  return error
}

describe('Axios API Client & 401 Token Refresh Interceptor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    store.dispatch(logoutUser(null))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('automatically attaches Bearer token from localStorage to outgoing requests', async () => {
    localStorage.setItem('access_token', 'valid-test-access-token')

    let capturedHeaders: any = null
    api.defaults.adapter = async (config) => {
      capturedHeaders = config.headers
      return {
        data: { status: 'OK' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }
    }

    await api.get('/health/')

    expect(capturedHeaders?.Authorization).toBe('Bearer valid-test-access-token')
  })

  // Test A — Expired Access Token Flow
  it('Test A: refreshes expired access token on 401, retries original request, and succeeds', async () => {
    localStorage.setItem('access_token', 'expired-token')
    localStorage.setItem('refresh_token', 'valid-refresh-token')
    store.dispatch(
      setCredentials({
        user: { id: 1, email: 'student@example.com', username: 'student1', role: 'student' },
        accessToken: 'expired-token',
        refreshToken: 'valid-refresh-token',
      })
    )

    let refreshCalledTimes = 0
    rawApi.defaults.adapter = async (config) => {
      if (config.url?.includes('/auth/refresh/')) {
        refreshCalledTimes++
        const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
        expect(body?.refresh).toBe('valid-refresh-token')
        return {
          data: {
            access: 'refreshed-access-token',
            refresh: 'refreshed-refresh-token',
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        }
      }
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config }
    }

    let requestAttempts = 0
    api.defaults.adapter = async (config) => {
      requestAttempts++
      if (requestAttempts === 1) {
        // First attempt fails with 401
        throw createAxiosError(
          'Request failed with status code 401',
          401,
          { detail: 'Token is invalid or expired' },
          config
        )
      }
      // Retried attempt succeeds with new token
      return {
        data: { id: 1, full_name: 'Student User', tokenUsed: config.headers?.Authorization },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }
    }

    const response = await api.get('/students/profile/')

    // Verified:
    // 1. Refresh endpoint called once
    expect(refreshCalledTimes).toBe(1)

    // 2. Original request retried once and returned expected data
    expect(requestAttempts).toBe(2)
    expect(response.data).toEqual({
      id: 1,
      full_name: 'Student User',
      tokenUsed: 'Bearer refreshed-access-token',
    })

    // 3. New token stored in localStorage and Redux
    expect(localStorage.getItem('access_token')).toBe('refreshed-access-token')
    expect(store.getState().auth.accessToken).toBe('refreshed-access-token')
    expect(store.getState().auth.isAuthenticated).toBe(true)
  })

  // Test B — Refresh Failure Flow
  it('Test B: logs out user and clears tokens when token refresh fails on 401', async () => {
    localStorage.setItem('access_token', 'expired-token')
    localStorage.setItem('refresh_token', 'expired-refresh-token')
    store.dispatch(
      setCredentials({
        user: { id: 1, email: 'student@example.com', username: 'student1', role: 'student' },
        accessToken: 'expired-token',
        refreshToken: 'expired-refresh-token',
      })
    )

    rawApi.defaults.adapter = async (config) => {
      // Refresh endpoint fails with 401
      throw createAxiosError(
        'Token is invalid or expired',
        401,
        { detail: 'Token is invalid or expired' },
        config
      )
    }

    api.defaults.adapter = async (config) => {
      throw createAxiosError(
        'Unauthorized',
        401,
        { detail: 'Unauthorized' },
        config
      )
    }

    await expect(api.get('/students/profile/')).rejects.toBeDefined()

    // Verified:
    // 1. Redux state is cleared
    expect(store.getState().auth.isAuthenticated).toBe(false)
    expect(store.getState().auth.accessToken).toBeNull()
    expect(store.getState().auth.user).toBeNull()

    // 2. Storage cleared
    expect(localStorage.getItem('access_token')).toBeNull()
    expect(localStorage.getItem('refresh_token')).toBeNull()
  })

  // Test C — Infinite Loop Protection
  it('Test C: stops after single retry when retried request also returns 401', async () => {
    localStorage.setItem('access_token', 'initial-token')
    localStorage.setItem('refresh_token', 'valid-refresh')
    store.dispatch(
      setCredentials({
        user: { id: 1, email: 'student@example.com', username: 'student1', role: 'student' },
        accessToken: 'initial-token',
        refreshToken: 'valid-refresh',
      })
    )

    let refreshCalledTimes = 0
    rawApi.defaults.adapter = async (config) => {
      refreshCalledTimes++
      return {
        data: { access: 'second-token', refresh: 'valid-refresh' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }
    }

    let attempts = 0
    api.defaults.adapter = async (config) => {
      attempts++
      throw createAxiosError(
        'Unauthorized',
        401,
        { detail: 'Unauthorized' },
        config
      )
    }

    await expect(api.get('/students/profile/')).rejects.toBeDefined()

    // Verified:
    // Refresh only called ONCE
    expect(refreshCalledTimes).toBe(1)
    // Request attempted first time, retried once with _retry: true, then rejected without loop (attempts === 2)
    expect(attempts).toBe(2)
  })

  // Test D — Concurrent 401 Responses
  it('Test D: shares a single refresh request across multiple concurrent 401 responses', async () => {
    localStorage.setItem('access_token', 'expired-token')
    localStorage.setItem('refresh_token', 'shared-refresh-token')
    store.dispatch(
      setCredentials({
        user: { id: 1, email: 'student@example.com', username: 'student1', role: 'student' },
        accessToken: 'expired-token',
        refreshToken: 'shared-refresh-token',
      })
    )

    let refreshCalls = 0
    rawApi.defaults.adapter = async (config) => {
      if (config.url?.includes('/auth/refresh/')) {
        refreshCalls++
        // Simulate network delay for refresh
        await new Promise((resolve) => setTimeout(resolve, 50))
        return {
          data: { access: 'new-shared-token' },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        }
      }
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config }
    }

    const requestMap: Record<string, number> = {}
    api.defaults.adapter = async (config) => {
      const url = config.url || ''
      requestMap[url] = (requestMap[url] || 0) + 1

      if (requestMap[url] === 1) {
        // Initial attempt returns 401
        throw createAxiosError(
          '401 Unauthorized',
          401,
          { detail: 'Token expired' },
          config
        )
      }

      // Retried attempt succeeds
      return {
        data: { endpoint: url, tokenUsed: config.headers?.Authorization },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }
    }

    // Fire 3 simultaneous authenticated requests
    const [resA, resB, resC] = await Promise.all([
      api.get('/endpoint-A/'),
      api.get('/endpoint-B/'),
      api.get('/endpoint-C/'),
    ])

    // Verified:
    // 1. Only ONE refresh call was executed across all 3 requests
    expect(refreshCalls).toBe(1)

    // 2. All 3 requests resolved successfully with the new access token
    expect(resA.data).toEqual({ endpoint: '/endpoint-A/', tokenUsed: 'Bearer new-shared-token' })
    expect(resB.data).toEqual({ endpoint: '/endpoint-B/', tokenUsed: 'Bearer new-shared-token' })
    expect(resC.data).toEqual({ endpoint: '/endpoint-C/', tokenUsed: 'Bearer new-shared-token' })
  })
})
