import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import authReducer, { type AuthState } from '@/features/auth/authSlice'
import ProtectedRoute from '../ProtectedRoute'
import PublicRoute from '../PublicRoute'
import RoleRoute from '../RoleRoute'

function createMockStore(authState: Partial<AuthState> = {}) {
  const defaultState: AuthState = {
    accessToken: null,
    refreshToken: null,
    role: null,
    user: null,
    isAuthenticated: false,
    isLoading: false,
    isInitialized: true,
    error: null,
    ...authState,
  }

  return configureStore({
    reducer: {
      auth: authReducer,
    },
    preloadedState: {
      auth: defaultState,
    },
  })
}

describe('Route Guarding Components', () => {
  describe('ProtectedRoute', () => {
    it('shows loading indicator when auth is not initialized', () => {
      const store = createMockStore({ isInitialized: false })

      render(
        <Provider store={store}>
          <MemoryRouter initialEntries={['/protected']}>
            <Routes>
              <Route
                path="/protected"
                element={
                  <ProtectedRoute>
                    <div>Protected Content</div>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </MemoryRouter>
        </Provider>
      )

      expect(screen.getByText(/Checking authentication/i)).toBeInTheDocument()
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    })

    it('redirects unauthenticated user to /login', () => {
      const store = createMockStore({ isAuthenticated: false, isInitialized: true })

      render(
        <Provider store={store}>
          <MemoryRouter initialEntries={['/protected']}>
            <Routes>
              <Route
                path="/protected"
                element={
                  <ProtectedRoute>
                    <div>Protected Content</div>
                  </ProtectedRoute>
                }
              />
              <Route path="/login" element={<div>Login Page</div>} />
            </Routes>
          </MemoryRouter>
        </Provider>
      )

      expect(screen.getByText('Login Page')).toBeInTheDocument()
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    })

    it('renders protected content when user is authenticated', () => {
      const store = createMockStore({
        isAuthenticated: true,
        isInitialized: true,
        user: { id: 1, email: 'student@example.com', username: 'student1', role: 'student' },
      })

      render(
        <Provider store={store}>
          <MemoryRouter initialEntries={['/protected']}>
            <Routes>
              <Route
                path="/protected"
                element={
                  <ProtectedRoute>
                    <div>Protected Content</div>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </MemoryRouter>
        </Provider>
      )

      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })
  })

  describe('PublicRoute', () => {
    it('renders auth page for unauthenticated user', () => {
      const store = createMockStore({ isAuthenticated: false, isInitialized: true })

      render(
        <Provider store={store}>
          <MemoryRouter initialEntries={['/login']}>
            <Routes>
              <Route
                path="/login"
                element={
                  <PublicRoute>
                    <div>Login Form</div>
                  </PublicRoute>
                }
              />
            </Routes>
          </MemoryRouter>
        </Provider>
      )

      expect(screen.getByText('Login Form')).toBeInTheDocument()
    })

    it('redirects authenticated student to /dashboard', () => {
      const store = createMockStore({
        isAuthenticated: true,
        isInitialized: true,
        role: 'student',
        user: { id: 1, email: 'student@example.com', username: 'student1', role: 'student' },
      })

      render(
        <Provider store={store}>
          <MemoryRouter initialEntries={['/login']}>
            <Routes>
              <Route
                path="/login"
                element={
                  <PublicRoute>
                    <div>Login Form</div>
                  </PublicRoute>
                }
              />
              <Route path="/dashboard" element={<div>Student Dashboard</div>} />
            </Routes>
          </MemoryRouter>
        </Provider>
      )

      expect(screen.getByText('Student Dashboard')).toBeInTheDocument()
      expect(screen.queryByText('Login Form')).not.toBeInTheDocument()
    })

    it('redirects authenticated admin to /admin/dashboard', () => {
      const store = createMockStore({
        isAuthenticated: true,
        isInitialized: true,
        role: 'admin',
        user: { id: 2, email: 'admin@example.com', username: 'admin1', role: 'admin' },
      })

      render(
        <Provider store={store}>
          <MemoryRouter initialEntries={['/login']}>
            <Routes>
              <Route
                path="/login"
                element={
                  <PublicRoute>
                    <div>Login Form</div>
                  </PublicRoute>
                }
              />
              <Route path="/admin/dashboard" element={<div>Admin Dashboard</div>} />
            </Routes>
          </MemoryRouter>
        </Provider>
      )

      expect(screen.getByText('Admin Dashboard')).toBeInTheDocument()
      expect(screen.queryByText('Login Form')).not.toBeInTheDocument()
    })
  })

  describe('RoleRoute', () => {
    it('redirects unauthenticated user to /login', () => {
      const store = createMockStore({ isAuthenticated: false, isInitialized: true })

      render(
        <Provider store={store}>
          <MemoryRouter initialEntries={['/admin/dashboard']}>
            <Routes>
              <Route
                path="/admin/dashboard"
                element={
                  <RoleRoute allowedRoles={['admin']}>
                    <div>Admin Content</div>
                  </RoleRoute>
                }
              />
              <Route path="/login" element={<div>Login Page</div>} />
            </Routes>
          </MemoryRouter>
        </Provider>
      )

      expect(screen.getByText('Login Page')).toBeInTheDocument()
      expect(screen.queryByText('Admin Content')).not.toBeInTheDocument()
    })

    it('redirects student away from admin-only route to /dashboard', () => {
      const store = createMockStore({
        isAuthenticated: true,
        isInitialized: true,
        role: 'student',
        user: { id: 1, email: 'student@example.com', username: 'student1', role: 'student' },
      })

      render(
        <Provider store={store}>
          <MemoryRouter initialEntries={['/admin/dashboard']}>
            <Routes>
              <Route
                path="/admin/dashboard"
                element={
                  <RoleRoute allowedRoles={['admin']}>
                    <div>Admin Only Content</div>
                  </RoleRoute>
                }
              />
              <Route path="/dashboard" element={<div>Student Dashboard</div>} />
            </Routes>
          </MemoryRouter>
        </Provider>
      )

      expect(screen.getByText('Student Dashboard')).toBeInTheDocument()
      expect(screen.queryByText('Admin Only Content')).not.toBeInTheDocument()
    })

    it('allows admin user to access admin-only route', () => {
      const store = createMockStore({
        isAuthenticated: true,
        isInitialized: true,
        role: 'admin',
        user: { id: 2, email: 'admin@example.com', username: 'admin1', role: 'admin' },
      })

      render(
        <Provider store={store}>
          <MemoryRouter initialEntries={['/admin/dashboard']}>
            <Routes>
              <Route
                path="/admin/dashboard"
                element={
                  <RoleRoute allowedRoles={['admin']}>
                    <div>Admin Only Content</div>
                  </RoleRoute>
                }
              />
            </Routes>
          </MemoryRouter>
        </Provider>
      )

      expect(screen.getByText('Admin Only Content')).toBeInTheDocument()
    })
  })
})
