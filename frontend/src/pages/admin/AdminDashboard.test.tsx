import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import authReducer from '@/features/auth/authSlice'
import AdminDashboard from './AdminDashboard'
import * as analyticsApi from '@/services/adminAnalyticsApi'

const analytics = {
  users: { total: 12, students: 10, admins: 2 },
  internships: { total: 30, active: 25, needs_review: 3 },
  most_requested_skills: [
    { skill: 'Python', count: 8 },
    { skill: 'Django', count: 4 },
  ],
  recommendations: { total: 100, average_match_score: 78.5 },
}

function renderDashboard() {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: {
        accessToken: null,
        refreshToken: null,
        role: 'admin',
        user: { id: 1, email: 'admin@example.com', username: 'admin', role: 'admin' },
        isAuthenticated: true,
        isLoading: false,
        isInitialized: true,
        error: null,
      },
    },
  })

  return render(
    <Provider store={store}>
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    </Provider>,
  )
}

describe('AdminDashboard analytics', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('loads analytics and renders all dashboard sections', async () => {
    const request = vi.spyOn(analyticsApi, 'getAdminAnalytics').mockResolvedValue(analytics)
    renderDashboard()

    expect(screen.getByText('Loading analytics...')).toBeInTheDocument()
    expect(await screen.findByText('12')).toBeInTheDocument()
    expect(screen.getByText('Python')).toBeInTheDocument()
    expect(screen.getByText('78.5%')).toBeInTheDocument()
    expect(request).toHaveBeenCalledOnce()
  })

  it('handles empty skills without crashing', async () => {
    vi.spyOn(analyticsApi, 'getAdminAnalytics').mockResolvedValue({
      ...analytics,
      most_requested_skills: [],
      recommendations: { total: 0, average_match_score: null },
    })
    renderDashboard()

    expect(await screen.findByText(/No internship skill demand/i)).toBeInTheDocument()
    expect(screen.getByText('No data')).toBeInTheDocument()
  })

  it('renders an API error state', async () => {
    vi.spyOn(analyticsApi, 'getAdminAnalytics').mockRejectedValue(new Error('network'))
    renderDashboard()

    expect(await screen.findByRole('alert')).toHaveTextContent(/Unable to load/i)
  })
})
