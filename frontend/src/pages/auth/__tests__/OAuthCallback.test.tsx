import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Provider } from 'react-redux'
import { store } from '@/store'
import OAuthCallbackPage from '../OAuthCallbackPage'
import * as authApi from '@/services/authApi'

describe('OAuthCallbackPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('extracts tokens from URL params, updates Redux session, and redirects to dashboard', async () => {
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValueOnce({
      id: 1,
      email: 'student@example.com',
      username: 'student1',
      role: 'student',
    })

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/auth/callback?access=google-access-token&refresh=google-refresh-token']}>
          <Routes>
            <Route path="/auth/callback" element={<OAuthCallbackPage />} />
            <Route path="/dashboard" element={<div>Dashboard Destination</div>} />
          </Routes>
        </MemoryRouter>
      </Provider>
    )

    expect(await screen.findByText('Dashboard Destination')).toBeInTheDocument()
    expect(localStorage.getItem('access_token')).toBe('google-access-token')
    expect(localStorage.getItem('refresh_token')).toBe('google-refresh-token')
    expect(store.getState().auth.isAuthenticated).toBe(true)
    expect(store.getState().auth.accessToken).toBe('google-access-token')
  })

  it('displays error message when error query parameter is present', async () => {
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/auth/callback?error=Access%20denied%20by%20user']}>
          <Routes>
            <Route path="/auth/callback" element={<OAuthCallbackPage />} />
          </Routes>
        </MemoryRouter>
      </Provider>
    )

    expect(await screen.findByText(/sign-in failed/i)).toBeInTheDocument()
    expect(screen.getByText('Access denied by user')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to login/i })).toBeInTheDocument()
  })
})
