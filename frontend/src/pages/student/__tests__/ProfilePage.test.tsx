import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import authReducer, { type AuthState } from '@/features/auth/authSlice'
import ProfilePage from '../ProfilePage'
import * as authApi from '@/services/authApi'
import * as studentApi from '@/services/studentApi'
import type { StudentProfile } from '@/services/studentApi'

function createStore(authState: Partial<AuthState> = {}) {
  const defaultState: AuthState = {
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    role: 'student',
    user: { id: 1, email: 'student@example.com', username: 'student1', role: 'student', first_name: 'John', last_name: 'Doe' },
    isAuthenticated: true,
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

const realProfile: StudentProfile = {
  id: 1,
  user: 1,
  phone: '+1234567890',
  country: 'USA',
  city: 'New York',
  date_of_birth: '2000-01-01',
  bio: 'Aspiring AI engineer.',
  education_level: 'bachelor',
  field_of_study: 'computer_science',
  university: 'Tech University',
  skills: [1],
  interests: [1],
  experience: '',
  internship_type: 'remote',
  work_type: 'full_time',
  compensation_preference: 'paid',
  minimum_compensation: '2000.00',
  maximum_compensation: '3000.00',
  compensation_currency: 'USD',
  preferred_locations: ['New York', 'San Francisco'],
  willing_to_relocate: true,
  preferred_industries: [],
  preferred_roles: [],
  internship_duration_min_weeks: 8,
  internship_duration_max_weeks: 24,
  availability_start: '2026-06-01',
  availability_end: '2026-09-01',
  cv: null,
  resume: null,
  cv_data: { has_cv: false, message: 'No CV uploaded yet.' },
  completion: {
    percent: 67,
    sections: {
      personal: true,
      education: true,
      skills: true,
      interests: true,
      preferences: false,
      resume: false,
    },
  },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const realMe = {
  id: 1,
  phone: '+1234567890',
  country: 'USA',
  city: 'New York',
  date_of_birth: '2000-01-01',
  bio: 'Aspiring AI engineer.',
  education_level: 'bachelor',
  current_year: 'third_year',
  field_of_study: 'computer_science',
  university: 'Tech University',
  completion: realProfile.completion,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('ProfilePage & Student Profile Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders account and academic snapshot from the real API shape', async () => {
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue({
      id: 1,
      email: 'student@example.com',
      username: 'student1',
      role: 'student',
      first_name: 'John',
      last_name: 'Doe',
    })
    vi.spyOn(studentApi, 'getStudentProfile').mockResolvedValue(realProfile)

    render(
      <Provider store={createStore()}>
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>
      </Provider>
    )

    expect(await screen.findByText('John Doe')).toBeInTheDocument()
    expect(screen.getAllByText('student@example.com').length).toBeGreaterThan(0)
    expect(screen.getByText('67%')).toBeInTheDocument()
    expect(screen.getByText('Tech University')).toBeInTheDocument()
    expect(screen.getByText('Computer Science')).toBeInTheDocument()
    expect(screen.getByText('Full-time')).toBeInTheDocument()
    expect(screen.getByText('Remote')).toBeInTheDocument()
    expect(screen.getByText('Paid')).toBeInTheDocument()
    // Section chips render from completion.sections
    expect(screen.getByText('Interests')).toBeInTheDocument()
    expect(screen.getAllByText('Preferences').length).toBeGreaterThan(0)
  })

  it('renders a placeholder when profile data fails to load', async () => {
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue({
      id: 1,
      email: 'student@example.com',
      username: 'student1',
      role: 'student',
    })
    vi.spyOn(studentApi, 'getStudentProfile').mockRejectedValue(new Error('boom'))

    render(
      <Provider store={createStore()}>
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>
      </Provider>
    )

    expect(await screen.findByText('Failed to load profile details. Please try again.')).toBeInTheDocument()
  })

  it('switches to the Personal & Education tab and renders the editable form', async () => {
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue({
      id: 1,
      email: 'student@example.com',
      username: 'student1',
      role: 'student',
      first_name: 'John',
      last_name: 'Doe',
    })
    vi.spyOn(studentApi, 'getStudentProfile').mockResolvedValue(realProfile)
    vi.spyOn(studentApi, 'getStudentMe').mockResolvedValue(realMe)

    render(
      <Provider store={createStore()}>
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>
      </Provider>
    )

    fireEvent.click(await screen.findByRole('button', { name: /personal & education/i }))

    // Form is pre-filled from GET /api/students/me/
    expect(await screen.findByDisplayValue('Tech University')).toBeInTheDocument()
    expect(screen.getByDisplayValue('+1234567890')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument()
  })

  it('handles refresh button click by reloading profile data from backend', async () => {
    const getUserSpy = vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue({
      id: 1,
      email: 'student@example.com',
      username: 'student1',
      role: 'student',
    })
    const getProfileSpy = vi.spyOn(studentApi, 'getStudentProfile').mockResolvedValue(realProfile)

    render(
      <Provider store={createStore()}>
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>
      </Provider>
    )

    expect(await screen.findByRole('heading', { name: /student profile/i })).toBeInTheDocument()
    expect(getUserSpy).toHaveBeenCalledTimes(1)
    expect(getProfileSpy).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }))

    await waitFor(() => {
      expect(getUserSpy).toHaveBeenCalledTimes(2)
      expect(getProfileSpy).toHaveBeenCalledTimes(2)
    })
  })
})