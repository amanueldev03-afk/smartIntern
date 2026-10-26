import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import authReducer from '@/features/auth/authSlice'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { AccessibilityProvider } from '@/contexts/AccessibilityContext'
import Navbar from '../Navbar'
import '@/i18n'
import i18n from '@/i18n'

import type { User } from '@/types'

function renderNavbar(initialRole = 'student', isAuthenticated = true) {
  const testUser: User = {
    id: 1,
    username: 'abebikila',
    email: 'test@student.edu.et',
    first_name: 'Abebe',
    last_name: 'Bikila',
    role: initialRole,
  }

  const store = configureStore({
    reducer: {
      auth: authReducer,
    },
    preloadedState: {
      auth: {
        isAuthenticated,
        role: initialRole,
        user: isAuthenticated ? testUser : null,
        accessToken: isAuthenticated ? 'fake-token' : null,
        refreshToken: isAuthenticated ? 'fake-refresh' : null,
        isLoading: false,
        isInitialized: true,
        error: null,
      },
    },
  })

  return render(
    <Provider store={store}>
      <ThemeProvider>
        <AccessibilityProvider>
          <MemoryRouter>
            <Navbar />
          </MemoryRouter>
        </AccessibilityProvider>
      </ThemeProvider>
    </Provider>
  )
}

describe('Navbar Component & Accessibility Large Text Toggle', () => {
  beforeEach(async () => {
    localStorage.clear()
    document.documentElement.className = ''
    await i18n.changeLanguage('en')
  })

  it('renders brand, navigation links, and utility toggles when authenticated', () => {
    renderNavbar('student', true)

    expect(screen.getByText('InternMatch')).toBeInTheDocument()
    expect(screen.getByText('UIL Career Engine')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Language selector/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Toggle theme/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Large Text/i })).toBeInTheDocument()
  })

  it('toggles large-text class on document root and persists state in localStorage', async () => {
    renderNavbar('student', true)

    const toggleBtn = screen.getByRole('button', { name: /Large Text/i })
    expect(document.documentElement.classList.contains('large-text')).toBe(false)
    expect(toggleBtn).toHaveAttribute('aria-pressed', 'false')

    // Click to enable large text
    fireEvent.click(toggleBtn)

    await waitFor(() => {
      expect(document.documentElement.classList.contains('large-text')).toBe(true)
      expect(localStorage.getItem('accessibility_large_text')).toBe('true')
      expect(screen.getByRole('button', { name: /Default Text/i })).toBeInTheDocument()
    })

    // Click again to revert to default text size
    const activeToggleBtn = screen.getByRole('button', { name: /Default Text/i })
    fireEvent.click(activeToggleBtn)

    await waitFor(() => {
      expect(document.documentElement.classList.contains('large-text')).toBe(false)
      expect(localStorage.getItem('accessibility_large_text')).toBe('false')
      expect(screen.getByRole('button', { name: /Large Text/i })).toBeInTheDocument()
    })
  })

  it('renders sign in button when unauthenticated', () => {
    renderNavbar('student', false)

    expect(screen.getByText('Sign In')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Large Text/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Language selector/i })).toBeInTheDocument()
  })

  it('updates localized labels in Navbar when language is switched', async () => {
    renderNavbar('student', true)

    const langBtn = screen.getByRole('button', { name: /Language selector/i })
    fireEvent.click(langBtn)

    const amharicOption = screen.getByText(/አማርኛ/i)
    fireEvent.click(amharicOption)

    await waitFor(() => {
      expect(i18n.language).toMatch(/^am/)
      expect(screen.getByText('ዳሽቦርድ')).toBeInTheDocument()
      expect(screen.getByText('የአይ-አይ ምርጫዎች')).toBeInTheDocument()
    })
  })
})
