import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import authReducer, { type AuthState } from '@/features/auth/authSlice'
import StudentDashboard from '../StudentDashboard'
import * as authApi from '@/services/authApi'
import * as dashboardApi from '@/services/dashboardApi'
import type { DashboardData } from '@/services/dashboardApi'

function createMockStore(authState: Partial<AuthState> = {}) {
  const defaultState: AuthState = {
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    role: 'student',
    user: {
      id: 1,
      email: 'student@example.com',
      username: 'student1',
      role: 'student',
      first_name: 'Test',
      last_name: 'Student',
    },
    isAuthenticated: true,
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

function renderDashboard(overrides: Partial<AuthState> = {}) {
  const store = createMockStore(overrides)
  const view = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <StudentDashboard />
      </MemoryRouter>
    </Provider>
  )
  return { store, ...view }
}

function makeProfile(percent: number, hasCv = false) {
  return {
    id: 1,
    user: 1,
    phone: '123',
    country: 'US',
    city: 'NY',
    date_of_birth: null,
    bio: null,
    education_level: 'bachelor',
    field_of_study: 'CS',
    university: 'MIT',
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
    cv: hasCv ? '/media/cv.pdf' : null,
    resume: hasCv ? '/media/resume.pdf' : null,
    cv_data: { has_cv: hasCv, merged_skills: hasCv ? ['Python', 'React'] : [] },
    completion: {
      percent,
      sections: {
        personal: percent >= 100,
        education: true,
        skills: true,
        interests: false,
        preferences: true,
        resume: hasCv,
      },
    },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  } as unknown as import('@/services/studentApi').StudentProfile
}

function makeDashboardData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    profile: makeProfile(60),
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
    ...overrides,
  }
}

describe('StudentDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows a loading skeleton while data is being fetched', () => {
    vi.spyOn(authApi, 'getCurrentUser').mockReturnValue(new Promise(() => {}))
    vi.spyOn(dashboardApi, 'fetchDashboardData').mockReturnValue(new Promise(() => {}))

    renderDashboard()

    // An accessible loading indicator is announced...
    expect(screen.getByRole('status', { name: /loading dashboard/i })).toBeInTheDocument()
    // ...and no real data values are shown yet.
    expect(screen.queryByText('14')).not.toBeInTheDocument()
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
    expect(screen.queryByText('No resume uploaded')).not.toBeInTheDocument()
  })

  it('displays completion percentage, resume status, and summary counts', async () => {
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue({
      id: 1,
      email: 'student@example.com',
      username: 'student1',
      role: 'student',
      first_name: 'Test',
      last_name: 'Student',
    })
    vi.spyOn(dashboardApi, 'fetchDashboardData').mockResolvedValue(makeDashboardData())

    renderDashboard()

    expect(await screen.findByText('60%')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: /profile completion progress/i })).toHaveAttribute(
      'aria-valuenow',
      '60'
    )
    expect(screen.getByText('14')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('20')).toBeInTheDocument()
    expect(screen.getByText('No resume uploaded')).toBeInTheDocument()
  })

  it('renders the exact backend percentage without frontend recalculation', async () => {
    // Backend says 73% even if the frontend might assume all sections complete
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue({
      id: 1,
      email: 'student@example.com',
      username: 'student1',
      role: 'student',
    })
    vi.spyOn(dashboardApi, 'fetchDashboardData').mockResolvedValue(
      makeDashboardData({ profile: makeProfile(73, true) })
    )

    renderDashboard()

    expect(await screen.findByText('73%')).toBeInTheDocument()
    expect(screen.queryByText('100%')).not.toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: /profile completion progress/i })).toHaveAttribute(
      'aria-valuenow',
      '73'
    )
  })

  it('displays a complete state at 100% completion', async () => {
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue({
      id: 1,
      email: 'student@example.com',
      username: 'student1',
      role: 'student',
    })
    vi.spyOn(dashboardApi, 'fetchDashboardData').mockResolvedValue(
      makeDashboardData({ profile: makeProfile(100, true) })
    )

    renderDashboard()

    expect(await screen.findByText('100%')).toBeInTheDocument()
    expect(screen.getByText('Complete')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view profile/i })).toBeInTheDocument()
  })

  it('handles empty states with zero counts without treating them as errors', async () => {
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue({
      id: 1,
      email: 'student@example.com',
      username: 'student1',
      role: 'student',
    })
    vi.spyOn(dashboardApi, 'fetchDashboardData').mockResolvedValue(
      makeDashboardData({
        profile: makeProfile(0),
        resumeStatus: {
          has_resume: false,
          resume_url: null,
          cv_id: null,
          processing_status: null,
          processing_error: null,
        },
        dashboardSummary: {
          saved_internships: 0,
          total_applications: 0,
          applied_applications: 0,
          interview_applications: 0,
          accepted_applications: 0,
          rejected_applications: 0,
          withdrawn_applications: 0,
          active_saved_internships: 0,
          recent_applications: [],
          recent_saved_internships: [],
        },
        recommendationsCount: 0,
      })
    )

    renderDashboard()

    expect(await screen.findByText('0%')).toBeInTheDocument()
    expect(screen.getByText('Complete your profile for matches')).toBeInTheDocument()
    expect(screen.getByText('No saved internships yet')).toBeInTheDocument()
    expect(screen.getByText('No applications yet')).toBeInTheDocument()
    expect(screen.getByText('No resume uploaded')).toBeInTheDocument()
    expect(screen.getByText('Upload to unlock AI recommendations')).toBeInTheDocument()
  })

  it('shows resume status when a resume is uploaded', async () => {
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue({
      id: 1,
      email: 'student@example.com',
      username: 'student1',
      role: 'student',
    })
    vi.spyOn(dashboardApi, 'fetchDashboardData').mockResolvedValue(
      makeDashboardData({
        profile: makeProfile(75, true),
        resumeStatus: {
          has_resume: true,
          resume_url: '/media/resume.pdf',
          cv_id: 1,
          processing_status: 'COMPLETED',
          processing_error: null,
        },
      })
    )

    renderDashboard()

    expect(await screen.findByText('Resume ready')).toBeInTheDocument()
    expect(screen.getByText('2 skills detected')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view resume/i })).toBeInTheDocument()
  })

  it('shows a localized error with retry when the dashboard fetch fails entirely', async () => {
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue({
      id: 1,
      email: 'student@example.com',
      username: 'student1',
      role: 'student',
    })
    const fetchSpy = vi.spyOn(dashboardApi, 'fetchDashboardData')
    fetchSpy.mockRejectedValueOnce(new Error('network error'))

    renderDashboard()

    expect(await screen.findByText(/Failed to load dashboard data/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('keeps available sections when only some API calls fail', async () => {
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue({
      id: 1,
      email: 'student@example.com',
      username: 'student1',
      role: 'student',
    })
    // Profile + summary succeed, but resume endpoint failed
    vi.spyOn(dashboardApi, 'fetchDashboardData').mockResolvedValue(
      makeDashboardData({
        resumeStatus: null,
        resumeError: true,
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
      })
    )

    renderDashboard()

    // Available sections still render with real data...
    expect(await screen.findByText('60%')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    // ...while the failed resume section shows a localized error.
    expect(screen.getByText('Resume status unavailable')).toBeInTheDocument()
  })

  it('shows a localized error for the recommendations count and retries on demand', async () => {
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue({
      id: 1,
      email: 'student@example.com',
      username: 'student1',
      role: 'student',
    })
    const fetchSpy = vi.spyOn(dashboardApi, 'fetchDashboardData')
    fetchSpy.mockResolvedValueOnce(
      makeDashboardData({ recommendationsCount: 0, recommendationsError: true })
    )
    fetchSpy.mockResolvedValueOnce(
      makeDashboardData({ recommendationsError: false })
    )

    renderDashboard()

    // Failed section shows a localized error — not a false "0".
    expect(await screen.findByText('Recommendations unavailable')).toBeInTheDocument()
    expect(screen.queryByText('Complete your profile for matches')).not.toBeInTheDocument()
    // Other sections still show real data.
    expect(screen.getByText('60%')).toBeInTheDocument()

    // Retrying refetches and restores the section.
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(await screen.findByText('14')).toBeInTheDocument()
    expect(screen.queryByText('Recommendations unavailable')).not.toBeInTheDocument()
  })

  it('provides quick-action links that route to the profile page', async () => {
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue({
      id: 1,
      email: 'student@example.com',
      username: 'student1',
      role: 'student',
    })
    vi.spyOn(dashboardApi, 'fetchDashboardData').mockResolvedValue(makeDashboardData())

    renderDashboard()

    expect(await screen.findByText('60%')).toBeInTheDocument()
    const editProfileLink = screen.getByRole('link', { name: /edit profile/i })
    const uploadResumeLink = screen.getByRole('link', { name: /upload resume/i })
    expect(editProfileLink).toBeInTheDocument()
    expect(uploadResumeLink).toBeInTheDocument()
    expect(editProfileLink.getAttribute('href')).toBe('/profile')
    expect(uploadResumeLink.getAttribute('href')).toBe('/profile')
  })
})