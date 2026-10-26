import { describe, it, expect, beforeEach, vi } from 'vitest'
import authReducer, {
  setCredentials,
  clearError,
  login,
  register,
  logoutUser,
  refreshAccessToken,
  initializeAuth,
} from '../authSlice'
import { initialState } from '../authSlice'

describe('authSlice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  describe('initial state', () => {
    it('should return initial state', () => {
      expect(authReducer(undefined, { type: 'unknown' })).toEqual(initialState)
    })
  })

  describe('reducers', () => {
    it('should handle setCredentials', () => {
      const user = { id: 1, email: 'student@example.com', username: 'student1', role: 'student' }
      const action = setCredentials({
        user,
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-123',
      })
      const state = authReducer(initialState, action)

      expect(state.user).toEqual(user)
      expect(state.role).toBe('student')
      expect(state.accessToken).toBe('access-token-123')
      expect(state.refreshToken).toBe('refresh-token-123')
      expect(state.isAuthenticated).toBe(true)
      expect(localStorage.getItem('access_token')).toBe('access-token-123')
      expect(localStorage.getItem('refresh_token')).toBe('refresh-token-123')
    })

    it('should handle clearError', () => {
      const stateWithError = { ...initialState, error: 'Some error' }
      const action = clearError()
      const state = authReducer(stateWithError, action)

      expect(state.error).toBeNull()
    })
  })

  describe('async thunks - reducer actions', () => {
    describe('initializeAuth', () => {
      it('should handle pending state', () => {
        const state = authReducer(initialState, { type: initializeAuth.pending.type })
        expect(state.isLoading).toBe(true)
      })

      it('should handle fulfilled state with user session', () => {
        const user = { id: 1, email: 'student@example.com', username: 'student1', role: 'student' }
        const payload = {
          user,
          role: 'student',
          accessToken: 'stored-access',
          refreshToken: 'stored-refresh',
        }
        const state = authReducer(initialState, {
          type: initializeAuth.fulfilled.type,
          payload,
        })

        expect(state.user).toEqual(user)
        expect(state.role).toBe('student')
        expect(state.accessToken).toBe('stored-access')
        expect(state.refreshToken).toBe('stored-refresh')
        expect(state.isAuthenticated).toBe(true)
        expect(state.isInitialized).toBe(true)
        expect(state.isLoading).toBe(false)
      })

      it('should handle rejected state', () => {
        const state = authReducer(initialState, {
          type: initializeAuth.rejected.type,
        })

        expect(state.user).toBeNull()
        expect(state.role).toBeNull()
        expect(state.accessToken).toBeNull()
        expect(state.refreshToken).toBeNull()
        expect(state.isAuthenticated).toBe(false)
        expect(state.isInitialized).toBe(true)
        expect(state.isLoading).toBe(false)
      })
    })

    describe('login', () => {
      it('should handle pending state', () => {
        const state = authReducer(initialState, { type: login.pending.type })
        expect(state.isLoading).toBe(true)
        expect(state.error).toBeNull()
      })

      it('should handle successful login for student', () => {
        const mockResponse = {
          access: 'new-access',
          refresh: 'new-refresh',
          user: { id: 1, email: 'student@example.com', username: 'student1', role: 'student' },
        }
        const state = authReducer(initialState, {
          type: login.fulfilled.type,
          payload: mockResponse,
        })

        expect(state.user).toEqual(mockResponse.user)
        expect(state.role).toBe('student')
        expect(state.accessToken).toBe(mockResponse.access)
        expect(state.refreshToken).toBe(mockResponse.refresh)
        expect(state.isAuthenticated).toBe(true)
        expect(state.isLoading).toBe(false)
        expect(state.error).toBeNull()
      })

      it('should handle successful login for admin', () => {
        const mockResponse = {
          access: 'admin-access',
          refresh: 'admin-refresh',
          user: { id: 2, email: 'admin@example.com', username: 'admin1', role: 'admin' },
        }
        const state = authReducer(initialState, {
          type: login.fulfilled.type,
          payload: mockResponse,
        })

        expect(state.user).toEqual(mockResponse.user)
        expect(state.role).toBe('admin')
        expect(state.isAuthenticated).toBe(true)
      })

      it('should handle login failure with error message', () => {
        const state = authReducer(initialState, {
          type: login.rejected.type,
          payload: 'Invalid email or password.',
        })

        expect(state.isLoading).toBe(false)
        expect(state.error).toBe('Invalid email or password.')
      })
    })

    describe('register', () => {
      it('should handle pending state', () => {
        const state = authReducer(initialState, { type: register.pending.type })
        expect(state.isLoading).toBe(true)
        expect(state.error).toBeNull()
      })

      it('should handle successful registration', () => {
        const mockResponse = {
          message: 'Registration successful. Please check your email to verify your account.',
          user: { id: 1, email: 'student@example.com', username: 'student1', full_name: 'Jane Doe' },
        }
        const state = authReducer(initialState, {
          type: register.fulfilled.type,
          payload: mockResponse,
        })

        expect(state.isLoading).toBe(false)
        expect(state.error).toBeNull()
      })

      it('should handle registration failure', () => {
        const state = authReducer(initialState, {
          type: register.rejected.type,
          payload: JSON.stringify({ email: ['A user with that email already exists.'] }),
        })

        expect(state.isLoading).toBe(false)
        expect(state.error).toContain('already exists')
      })
    })

    describe('logoutUser', () => {
      it('should clear state on logout', () => {
        const authenticatedState = {
          ...initialState,
          user: { id: 1, email: 'student@example.com', username: 'student1', role: 'student' },
          role: 'student',
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          isAuthenticated: true,
        }

        const state = authReducer(authenticatedState, {
          type: logoutUser.fulfilled.type,
        })

        expect(state.user).toBeNull()
        expect(state.role).toBeNull()
        expect(state.accessToken).toBeNull()
        expect(state.refreshToken).toBeNull()
        expect(state.isAuthenticated).toBe(false)
      })
    })

    describe('refreshAccessToken', () => {
      it('should handle successful token refresh', () => {
        const mockResponse = {
          access: 'new-rotated-access',
          refresh: 'new-rotated-refresh',
        }
        const state = authReducer(initialState, {
          type: refreshAccessToken.fulfilled.type,
          payload: mockResponse,
        })

        expect(state.accessToken).toBe('new-rotated-access')
        expect(state.refreshToken).toBe('new-rotated-refresh')
      })

      it('should handle refresh failure and reset state', () => {
        const authenticatedState = {
          ...initialState,
          user: { id: 1, email: 'student@example.com', username: 'student1', role: 'student' },
          role: 'student',
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          isAuthenticated: true,
        }

        const state = authReducer(authenticatedState, {
          type: refreshAccessToken.rejected.type,
        })

        expect(state.user).toBeNull()
        expect(state.role).toBeNull()
        expect(state.accessToken).toBeNull()
        expect(state.refreshToken).toBeNull()
        expect(state.isAuthenticated).toBe(false)
      })
    })
  })
})
