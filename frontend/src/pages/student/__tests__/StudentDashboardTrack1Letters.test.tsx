import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import authReducer, { type AuthState } from '@/features/auth/authSlice'
import StudentDashboard from '../StudentDashboard'
import * as authApi from '@/services/authApi'
import * as dashboardApi from '@/services/dashboardApi'
import api from '@/services/api'

vi.mock('@/services/api', () => {
  return {
    default: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    },
    rawApi: {
      post: vi.fn(),
    },
  }
})

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

function renderDashboardWithTrack1() {
  const store = createMockStore()
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/dashboard?tab=track1']}>
        <StudentDashboard />
      </MemoryRouter>
    </Provider>
  )
}

describe('StudentDashboard Track 1 Letter Buttons & Selective Forwarding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue({
      id: 1,
      email: 'student@example.com',
      username: 'student1',
      role: 'student',
      first_name: 'Test',
      last_name: 'Student',
    })
    vi.spyOn(dashboardApi, 'fetchDashboardData').mockResolvedValue({
      profile: {
        id: 1,
        completion: { percent: 100, sections: {} },
      } as any,
      resumeStatus: null,
      dashboardSummary: null,
      recommendationsCount: 0,
      profileError: false,
      dashboardError: false,
      recommendationsError: false,
      resumeError: false,
    })

    const mockApi = api as unknown as { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> }
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/v1/uil-profiles/student/me/') {
        return Promise.resolve({
          data: {
            id: 'stu-1',
            student_id_number: 'UGR/0001/14',
            department: 'Software Engineering',
            academic_year: 4,
            gpa: '3.85',
            is_eligible: true,
            is_verified_by_dean: true,
            dean_title: 'Dr. Haile Dean',
            dean_department: 'Software Engineering',
            dean_allow_dorm: true,
            dean_allow_food: true,
            dean_allow_internship: true,
            dean_signature_hash: 'abc123hash',
            internship_letter_sent: true,
            dorm_food_letter_sent: true,
            score_letter_sent: true,
            forwarded_to_uil: false,
            forwarded_to_dorm: false,
            forwarded_to_student_dean: false,
          },
        })
      }
      if (url === '/v1/logistics/') {
        return Promise.resolve({ data: [] })
      }
      if (url === '/v1/projects/cohorts/my-cohorts/') {
        return Promise.resolve({ data: { cohorts: [] } })
      }
      if (url === '/companies/student/invitations/') {
        return Promise.resolve({ data: [] })
      }
      if (url.includes('/student-dean/messages/')) {
        return Promise.resolve({ data: { messages: [] } })
      }
      return Promise.resolve({ data: {} })
    })
  })

  it('renders three letter buttons vertically and removes 1-Click Forward to UIL from main card', async () => {
    renderDashboardWithTrack1()

    // Letter buttons exist
    const internshipBtn = await screen.findByRole('button', { name: /view internship clearance letter/i })
    const dormFoodBtn = screen.getByRole('button', { name: /view dorm & cafeteria letter/i })
    const scoreBtn = screen.getByRole('button', { name: /view score letter/i })

    expect(internshipBtn).toBeInTheDocument()
    expect(dormFoodBtn).toBeInTheDocument()
    expect(scoreBtn).toBeInTheDocument()

    // "1-Click Forward to UIL" must NOT be present in main card
    expect(screen.queryByRole('button', { name: /1-click forward to uil/i })).not.toBeInTheDocument()
  })

  it('opening View Internship Clearance Letter shows Forward to UIL at bottom', async () => {
    renderDashboardWithTrack1()

    const internshipBtn = await screen.findByRole('button', { name: /view internship clearance letter/i })
    fireEvent.click(internshipBtn)

    // Modal opens with official record header
    expect(screen.getByText(/AUTHENTICATED OFFICIAL INSTITUTIONAL RECORD/i)).toBeInTheDocument()

    // "Forward to UIL" button is present at bottom of modal
    const forwardToUilBtn = screen.getByRole('button', { name: /^forward to uil$/i })
    expect(forwardToUilBtn).toBeInTheDocument()

    // Dorm / Dean forward buttons must NOT be present in this modal
    expect(screen.queryByRole('button', { name: /forward to dormitory/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /forward to student dean/i })).not.toBeInTheDocument()
  })

  it('opening View Dorm & Cafeteria Letter shows Forward to Dormitory and Forward to Student Dean, but NOT UIL', async () => {
    renderDashboardWithTrack1()

    const dormFoodBtn = await screen.findByRole('button', { name: /view dorm & cafeteria letter/i })
    fireEvent.click(dormFoodBtn)

    // Modal opens
    expect(screen.getByText(/AUTHENTICATED OFFICIAL INSTITUTIONAL RECORD/i)).toBeInTheDocument()

    // Shows Forward to Dormitory and Forward to Student Dean
    const forwardDormBtn = screen.getByRole('button', { name: /forward to dormitory/i })
    const forwardDeanBtn = screen.getByRole('button', { name: /forward to student dean/i })
    expect(forwardDormBtn).toBeInTheDocument()
    expect(forwardDeanBtn).toBeInTheDocument()

    // Must NOT have Forward to UIL
    expect(screen.queryByRole('button', { name: /^forward to uil$/i })).not.toBeInTheDocument()
  })

  it('opening View Score Letter shows Forward to UIL at bottom of score roster modal', async () => {
    renderDashboardWithTrack1()

    const scoreBtn = await screen.findByRole('button', { name: /view score letter/i })
    fireEvent.click(scoreBtn)

    // Score Roster modal opens
    expect(screen.getByText(/Track1_Student_Score_Roster\.xlsx/i)).toBeInTheDocument()

    // "Forward to UIL" button is present in this modal
    const forwardToUilBtn = screen.getByRole('button', { name: /^forward to uil$/i })
    expect(forwardToUilBtn).toBeInTheDocument()
  })
})
