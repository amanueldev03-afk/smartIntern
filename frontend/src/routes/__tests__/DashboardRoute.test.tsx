import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import authReducer, { type AuthState } from '@/features/auth/authSlice'
import AppRoutes from '@/routes'
import * as authApi from '@/services/authApi'
import * as dashboardApi from '@/services/dashboardApi'
import type { DashboardData } from '@/services/dashboardApi'

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
    reducer: { auth: authReducer },
    preloadedState: { auth: defaultState },
  })
}

function makeDashboardData(): DashboardData {
  return {
    profile: {
      id: 1,
      user: 1,
      phone: null,
      country: null,
      city: null,
      date_of_birth: null,
      bio: null,
      education_level: null,
      field_of_study: null,
      university: null,
      skills: [],
      interests: [],
      experience: null,
      internship_type: 'any',
      work_type: 'either',
      compensation_preference: 'either',
      minimum_compensation: null,
      maximum_compensation: null,
      compensation_currency: 'USD',
      preferred_locations: [],
      willing_to_relocate: false,
      preferred_industries: [],
      preferred_roles: [],
      internship_duration_min_weeks: null,
      internship_duration_max_weeks: null,
      availability_start: null,
      availability_end: null,
      cv: null,
      resume: null,
      cv_data: { has_cv: false, merged_skills: [] },
      completion: {
        percent: 60,
        sections: {
          personal: true,
          education: true,
          skills: true,
          interests: false,
          preferences: true,
          resume: false,
        },
      },
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    } as unknown as import('@/services/studentApi').StudentProfile,
    profileError: false,
    resumeStatus: {
      has_resume: false,
      resume_url: null,
      cv_id: null,
      processing_status: null,
      processing_error: null,
    },
    resumeError: false,
    dashboardSummary: {
      saved_internships: 4,
      total_applications: 20,
      applied_applications: 12,
      interview_applications: 4,
      accepted_applications: 2,
      rejected_applications: 2,
      withdrawn_applications: 0,
      active_saved_internships: 3,
      recent_applications: [],
      recent_saved_internships: [],
    },
    dashboardError: false,
    recommendationsCount: 14,
    recommendationsError: false,
  }
}

function renderAt(path: string, authState: Partial<AuthState>) {
  const store = createMockStore(authState)
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </Provider>
  )
}

describe('Student dashboard route authentication (Task 7.1 guards)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('redirects an unauthenticated user from /dashboard to /login', () => {
    renderAt('/dashboard', { isAuthenticated: false, isInitialized: true })

    expect(screen.getByRole('heading', { name: /sign in to your account/i })).toBeInTheDocument()
    expect(screen.queryByText(/Welcome back/i)).not.toBeInTheDocument()
  })

  it('redirects an admin away from /dashboard to /admin/dashboard', () => {
    renderAt('/dashboard', {
      isAuthenticated: true,
      isInitialized: true,
      role: 'admin',
      user: { id: 2, email: 'admin@example.com', username: 'admin1', role: 'admin' },
    })

    expect(screen.getByRole('heading', { name: 'Admin Dashboard' })).toBeInTheDocument()
    expect(screen.queryByText(/Welcome back/i)).not.toBeInTheDocument()
  })

  it('lets a student render the dashboard with real data', async () => {
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue({
      id: 1,
      email: 'student@example.com',
      username: 'student1',
      role: 'student',
      first_name: 'Test',
      last_name: 'Student',
    })
    vi.spyOn(dashboardApi, 'fetchDashboardData').mockResolvedValue(makeDashboardData())

    renderAt('/dashboard', {
      isAuthenticated: true,
      isInitialized: true,
      role: 'student',
      user: { id: 1, email: 'student@example.com', username: 'student1', role: 'student' },
    })

    expect(await screen.findByText('Welcome back, Test Student!')).toBeInTheDocument()
    expect(await screen.findByText('60%')).toBeInTheDocument()
  })
})