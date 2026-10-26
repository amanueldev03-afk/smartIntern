import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import * as authApi from '@/services/authApi'
import type { User, UserRole } from '@/types'

export interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  role: UserRole | null
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  isInitialized: boolean
  error: string | null
}

const initialAccessToken = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
const initialRefreshToken = typeof localStorage !== 'undefined' ? localStorage.getItem('refresh_token') : null

export const authInitialState: AuthState = {
  accessToken: initialAccessToken,
  refreshToken: initialRefreshToken,
  role: null,
  user: null,
  isAuthenticated: !!initialAccessToken,
  isLoading: false,
  isInitialized: false,
  error: null,
}

const normalizeRole = (role?: string | null): UserRole | null => {
  if (!role) return null
  return role.toLowerCase() as UserRole
}

// Initialize auth state from stored tokens
export const initializeAuth = createAsyncThunk(
  'auth/initialize',
  async (_, { rejectWithValue }) => {
    const accessToken = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
    const refreshToken = typeof localStorage !== 'undefined' ? localStorage.getItem('refresh_token') : null

    if (!accessToken || !refreshToken) {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
      }
      return { user: null, role: null, accessToken: null, refreshToken: null }
    }

    try {
      const user = await authApi.getCurrentUser()
      const normalizedRole = normalizeRole(user.role)
      return {
        user: { ...user, role: normalizedRole || user.role },
        role: normalizedRole,
        accessToken,
        refreshToken,
      }
    } catch {
      // Token is invalid/expired - clear storage
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
      }
      return rejectWithValue('Session expired')
    }
  }
)

export const login = createAsyncThunk(
  'auth/login',
  async (credentials: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const response = await authApi.login(credentials)
      return response
    } catch (error: any) {
      const detail = error.response?.data?.detail
      if (detail) {
        if (Array.isArray(detail)) {
          return rejectWithValue(detail.map((d: any) => String(d)).join(', '))
        }
        if (typeof detail === 'object') {
          return rejectWithValue(JSON.stringify(detail))
        }
        return rejectWithValue(String(detail))
      }
      const errors = error.response?.data
      if (errors && typeof errors === 'object') {
        const firstVal = Object.values(errors)[0]
        if (Array.isArray(firstVal) && firstVal.length > 0) {
          return rejectWithValue(String(firstVal[0]))
        }
        return rejectWithValue(JSON.stringify(errors))
      }
      return rejectWithValue('Login failed. Please check your credentials.')
    }
  }
)

export const register = createAsyncThunk(
  'auth/register',
  async (
    data: {
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
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await authApi.register(data)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data || 'Registration failed')
    }
  }
)

export const logoutUser = createAsyncThunk(
  'auth/logout',
  async (refreshToken: string | null) => {
    try {
      if (refreshToken) {
        await authApi.logout(refreshToken)
      }
    } catch {
      // Continue with client-side cleanup even if API call fails
    } finally {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
      }
    }
    return null
  }
)

export const refreshAccessToken = createAsyncThunk(
  'auth/refreshToken',
  async (_, { rejectWithValue }) => {
    const refreshToken = typeof localStorage !== 'undefined' ? localStorage.getItem('refresh_token') : null
    if (!refreshToken) {
      return rejectWithValue('No refresh token available')
    }

    try {
      const response = await authApi.refreshToken(refreshToken)
      return response
    } catch {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
      }
      return rejectWithValue('Token refresh failed')
    }
  }
)

const authSlice = createSlice({
  name: 'auth',
  initialState: authInitialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
    setCredentials: (
      state,
      action: {
        payload: {
          user: User
          accessToken: string
          refreshToken: string
        }
      }
    ) => {
      const normalizedRole = normalizeRole(action.payload.user?.role) || 'student'
      state.user = { ...action.payload.user, role: normalizedRole }
      state.role = normalizedRole
      state.accessToken = action.payload.accessToken
      state.refreshToken = action.payload.refreshToken
      state.isAuthenticated = true
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('access_token', action.payload.accessToken)
        localStorage.setItem('refresh_token', action.payload.refreshToken)
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // Initialize auth
      .addCase(initializeAuth.pending, (state) => {
        state.isLoading = true
      })
      .addCase(initializeAuth.fulfilled, (state, action) => {
        state.user = action.payload.user
        state.role = action.payload.role
        state.accessToken = action.payload.accessToken
        state.refreshToken = action.payload.refreshToken
        state.isAuthenticated = !!action.payload.accessToken
        state.isLoading = false
        state.isInitialized = true
      })
      .addCase(initializeAuth.rejected, (state) => {
        state.user = null
        state.role = null
        state.accessToken = null
        state.refreshToken = null
        state.isAuthenticated = false
        state.isLoading = false
        state.isInitialized = true
      })
      // Login
      .addCase(login.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(login.fulfilled, (state, action) => {
        const normalizedRole = normalizeRole(action.payload.user?.role) || 'student'
        const user: User = {
          id: action.payload.user.id,
          email: action.payload.user.email,
          username: action.payload.user.username,
          role: normalizedRole,
        }
        state.user = user
        state.role = normalizedRole
        state.accessToken = action.payload.access
        state.refreshToken = action.payload.refresh
        state.isAuthenticated = true
        state.isLoading = false
        state.error = null
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('access_token', action.payload.access)
          localStorage.setItem('refresh_token', action.payload.refresh)
        }
      })
      .addCase(login.rejected, (state, action) => {
        state.isLoading = false
        state.error = (action.payload as string) || 'Login failed'
      })
      // Register
      .addCase(register.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(register.fulfilled, (state, action) => {
        state.isLoading = false
        state.error = null
        if (action.payload?.access && action.payload?.refresh && action.payload?.user) {
          const normalizedRole = normalizeRole(action.payload.user.role) || 'student'
          const user: User = {
            id: typeof action.payload.user.id === 'number' ? action.payload.user.id : (parseInt(String(action.payload.user.id), 10) || 0),
            email: action.payload.user.email,
            username: action.payload.user.username,
            role: normalizedRole,
          }
          state.user = user
          state.role = normalizedRole
          state.accessToken = action.payload.access
          state.refreshToken = action.payload.refresh
          state.isAuthenticated = true
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('access_token', action.payload.access)
            localStorage.setItem('refresh_token', action.payload.refresh)
          }
        }
      })
      .addCase(register.rejected, (state, action) => {
        state.isLoading = false
        state.error =
          typeof action.payload === 'string'
            ? action.payload
            : JSON.stringify(action.payload)
      })
      // Logout
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null
        state.role = null
        state.accessToken = null
        state.refreshToken = null
        state.isAuthenticated = false
        state.isLoading = false
        state.error = null
      })
      // Refresh token
      .addCase(refreshAccessToken.fulfilled, (state, action) => {
        state.accessToken = action.payload.access
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('access_token', action.payload.access)
        }
        if (action.payload.refresh) {
          state.refreshToken = action.payload.refresh
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('refresh_token', action.payload.refresh)
          }
        }
      })
      .addCase(refreshAccessToken.rejected, (state) => {
        state.user = null
        state.role = null
        state.accessToken = null
        state.refreshToken = null
        state.isAuthenticated = false
        state.isLoading = false
      })
  },
})

export const { clearError, setCredentials } = authSlice.actions
export default authSlice.reducer
export { authInitialState as initialState }
