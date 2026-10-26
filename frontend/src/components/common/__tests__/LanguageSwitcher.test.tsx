import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useTranslation } from 'react-i18next'
import '@/i18n' // Initialize i18n
import i18n from '@/i18n'
import { LanguageSwitcher } from '../LanguageSwitcher'
import api, { rawApi } from '@/services/api'

// Test harness component to verify live reactive translation
const TestLocalizedComponent = () => {
  const { t } = useTranslation()
  return (
    <div>
      <LanguageSwitcher variant="dropdown" />
      <span data-testid="dashboard-label">{t('nav.dashboard')}</span>
      <span data-testid="status-active">{t('status.active')}</span>
      <span data-testid="form-student-id">{t('forms.studentId')}</span>
      <span data-testid="msg-credentials">{t('messages.invalidCredentials')}</span>
    </div>
  )
}

describe('LanguageSwitcher & i18n Integration', () => {
  beforeEach(async () => {
    localStorage.clear()
    await i18n.changeLanguage('en')
  })

  it('renders dropdown button with EN by default and displays English labels', () => {
    render(<TestLocalizedComponent />)

    expect(screen.getByRole('button', { name: /Language selector/i })).toBeInTheDocument()
    expect(screen.getByTestId('dashboard-label')).toHaveTextContent('Dashboard')
    expect(screen.getByTestId('status-active')).toHaveTextContent('Active')
    expect(screen.getByTestId('form-student-id')).toHaveTextContent('Student ID')
    expect(screen.getByTestId('msg-credentials')).toHaveTextContent('Invalid credentials')
  })

  it('switches language to Amharic on selection and updates labels without reload', async () => {
    render(<TestLocalizedComponent />)

    const selectorButton = screen.getByRole('button', { name: /Language selector/i })
    fireEvent.click(selectorButton)

    // Option for Amharic
    const amharicOption = screen.getByText(/አማርኛ/i)
    fireEvent.click(amharicOption)

    await waitFor(() => {
      expect(i18n.language).toMatch(/^am/)
      expect(document.documentElement.lang).toBe('am')
      expect(screen.getByTestId('dashboard-label')).toHaveTextContent('ዳሽቦርድ')
      expect(screen.getByTestId('status-active')).toHaveTextContent('ንቁ')
      expect(screen.getByTestId('form-student-id')).toHaveTextContent('የተማሪ መታወቂያ')
      expect(screen.getByTestId('msg-credentials')).toHaveTextContent('ልክ ያልሆነ መለያ መረጃ')
    })

    // Verify Axios Accept-Language header
    expect(api.defaults.headers.common['Accept-Language']).toBe('am')
    expect(rawApi.defaults.headers.common['Accept-Language']).toBe('am')
  })

  it('supports toggle variant for switching between English and Amharic', async () => {
    render(
      <div>
        <LanguageSwitcher variant="toggle" />
        <TestLocalizedComponent />
      </div>
    )

    const amharicBtn = screen.getByRole('button', { name: /Switch to Amharic/i })
    fireEvent.click(amharicBtn)

    await waitFor(() => {
      expect(i18n.language).toMatch(/^am/)
      expect(screen.getByTestId('dashboard-label')).toHaveTextContent('ዳሽቦርድ')
    })

    const englishBtn = screen.getByRole('button', { name: /Switch to English/i })
    fireEvent.click(englishBtn)

    await waitFor(() => {
      expect(i18n.language).toBe('en')
      expect(screen.getByTestId('dashboard-label')).toHaveTextContent('Dashboard')
      expect(api.defaults.headers.common['Accept-Language']).toBe('en')
    })
  })
})
