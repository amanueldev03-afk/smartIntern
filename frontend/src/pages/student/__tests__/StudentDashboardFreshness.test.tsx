import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { useState } from 'react'
import authReducer, { type AuthState } from '@/features/auth/authSlice'
import StudentDashboard from '../StudentDashboard'
import * as authApi from '@/services/authApi'
import * as dashboardApi from '@/services/dashboardApi'
import type { DashboardData } from '@/services/dashboardApi'

function createMockStore() {
  const authState: AuthState = {
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    role: 'student',
    user: { id: 1, email: 'student@example.com', username: 'student1', role: 'student' },
    isAuthenticated: true,
    isLoading: false,
    isInitialized: true,
    error: null,
  }

  return configureStore({
    reducer: { auth: authReducer },
    preloadedState: { auth: authState },
  })
}

function makeProfile(percent: number) {
  return {
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
      percent,
      sections: {
        personal: true,
        education: true,
        skills: percent > 60,
        interests: false,
        preferences: true,
        resume: false,
      },
    },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  } as unknown as import('@/services/studentApi').StudentProfile
}

function makeDashboardData(percent: number): DashboardData {
  return {
    profile: makeProfile(percent),
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

/**
 * Simulates React Router navigation between /dashboard and /profile.
 * The real app unmounts StudentDashboard when navigating away and remounts
 * it when returning. This harness reproduces exactly that lifecycle, which
 * is the mechanism that guarantees fresh backend data without a browser
 * refresh (React Router v6 default unmount/remount behavior).
 */
function Navigator() {
  const [view, setView] = useState<'dashboard' | 'profile'>('dashboard')
  return (
    <div>
      <button onClick={() => setView('dashboard')}>go dashboard</button>
      <button onClick={() => setView('profile')}>go profile</button>
      {view === 'dashboard' ? <StudentDashboard /> : <div>Profile page (Task 7.2)</div>}
    </div>
  )
}

describe('StudentDashboard cache freshness / navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue({
      id: 1,
      email: 'student@example.com',
      username: 'student1',
      role: 'student',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('refetches on remount: navigating back from profile shows the updated backend percentage', async () => {
    // Index of backend "simulated time": dashboard fetch #1 → 60%,
    // after profile mutation the following fetch returns 75%.
    let fetchCount = 0
    vi.spyOn(dashboardApi, 'fetchDashboardData').mockImplementation(async () => {
      fetchCount += 1
      return makeDashboardData(fetchCount === 1 ? 60 : 75)
    })

    const store = createMockStore()
    const { unmount } = render(
      <Provider store={store}>
        <MemoryRouter>
          <Navigator />
        </MemoryRouter>
      </Provider>
    )

    // Step 1 — initial dashboard shows the backend 60%
    expect(await screen.findByText('60%')).toBeInTheDocument()

    // Step 2 — "open the profile page" → StudentDashboard unmounts
    fireEvent.click(screen.getByRole('button', { name: /go profile/i }))
    expect(screen.getByText('Profile page (Task 7.2)')).toBeInTheDocument()

    // Step 3 — profile mutation completed on the backend while away;
    // the backend now returns 75% for the dashboard request.

    // Step 4 — navigate back to the dashboard → StudentDashboard remounts
    // and refetches. No browser reload is involved.
    fireEvent.click(screen.getByRole('button', { name: /go dashboard/i }))

    // Assert the new backend value is shown automatically.
    expect(await screen.findByText('75%')).toBeInTheDocument()
    expect(screen.queryByText('60%')).not.toBeInTheDocument()

    // The remount caused exactly one refetch (fetch #2) — no polling, no
    // duplicate requests beyond the mount-driven fetch.
    expect(fetchCount).toBe(2)

    unmount()
  })

  it('does not display stale percentage after navigation without a full page reload', async () => {
    let fetchCount = 0
    vi.spyOn(dashboardApi, 'fetchDashboardData').mockImplementation(async () => {
      fetchCount += 1
      return makeDashboardData(fetchCount === 1 ? 60 : 75)
    })

    const store = createMockStore()
    const { unmount } = render(
      <Provider store={store}>
        <MemoryRouter>
          <Navigator />
        </MemoryRouter>
      </Provider>
    )

    await screen.findByText('60%')

    fireEvent.click(screen.getByRole('button', { name: /go profile/i }))
    fireEvent.click(screen.getByRole('button', { name: /go dashboard/i }))

    await screen.findByText('75%')

    const progressbar = screen.getByRole('progressbar', { name: /profile completion progress/i })
    expect(progressbar).toHaveAttribute('aria-valuenow', '75')
    // Stale 60 must not win.
    expect(screen.queryByText('60%')).not.toBeInTheDocument()
    expect(fetchCount).toBe(2)

    unmount()
  })
})