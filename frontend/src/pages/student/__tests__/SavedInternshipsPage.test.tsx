import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SavedInternshipsPage from '../SavedInternshipsPage'
import * as internshipApi from '@/services/internshipApi'
import * as recommendationApi from '@/services/recommendationApi'

// Mock redux hooks
vi.mock('@/store/hooks', () => ({
  useAppSelector: (selector: any) =>
    selector({
      auth: {
        isAuthenticated: true,
        role: 'student',
        user: { id: 1, email: 'student@example.com' },
      },
    }),
  useAppDispatch: () => vi.fn(),
}))

const mockSavedList = [
  {
    id: 101,
    internship: 1,
    internship_title: 'Frontend Engineer Intern',
    organization_name: 'Tech Corp',
    application_url: 'https://example.com/apply/1',
    created_at: '2026-09-01T00:00:00Z',
    internship_details: {
      id: 1,
      title: 'Frontend Engineer Intern',
      organization_name: 'Tech Corp',
      description: 'Build modern React interfaces.',
      internship_type: 'remote' as const,
      work_type: 'full_time',
      required_skills: ['React', 'TypeScript'],
      application_url: 'https://example.com/apply/1',
      is_verified: true,
      is_expired: false,
      status: 'active',
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
    },
  },
  {
    id: 102,
    internship: 2,
    internship_title: 'Backend Python Intern',
    organization_name: 'AI Labs',
    application_url: 'https://example.com/apply/2',
    created_at: '2026-09-01T00:00:00Z',
    internship_details: {
      id: 2,
      title: 'Backend Python Intern',
      organization_name: 'AI Labs',
      description: 'Build Django microservices.',
      internship_type: 'hybrid' as const,
      work_type: 'full_time',
      required_skills: ['Python', 'Django'],
      application_url: 'https://example.com/apply/2',
      is_verified: true,
      is_expired: false,
      status: 'active',
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
    },
  },
]

describe('SavedInternshipsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders saved internships list', async () => {
    vi.spyOn(internshipApi, 'getSavedInternships').mockResolvedValueOnce(mockSavedList)

    render(
      <MemoryRouter>
        <SavedInternshipsPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Frontend Engineer Intern')).toBeInTheDocument()
      expect(screen.getByText('Backend Python Intern')).toBeInTheDocument()
      expect(screen.getByText('Tech Corp')).toBeInTheDocument()
    })
  })

  it('shows empty state when no saved internships exist', async () => {
    vi.spyOn(internshipApi, 'getSavedInternships').mockResolvedValueOnce([])

    render(
      <MemoryRouter>
        <SavedInternshipsPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('No Saved Internships')).toBeInTheDocument()
      expect(screen.getByText(/You haven't saved any internships yet/i)).toBeInTheDocument()
    })
  })

  it('unsaving an internship immediately removes it from the list without page reload', async () => {
    vi.spyOn(internshipApi, 'getSavedInternships').mockResolvedValueOnce([...mockSavedList])
    const unsaveSpy = vi.spyOn(internshipApi, 'unsaveInternship').mockResolvedValueOnce({ saved: false })
    vi.spyOn(recommendationApi, 'unsaveInternship').mockResolvedValueOnce()

    render(
      <MemoryRouter>
        <SavedInternshipsPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Frontend Engineer Intern')).toBeInTheDocument()
    })

    // Find unsave buttons (marked as Saved)
    const unsaveButtons = screen.getAllByRole('button', { name: /Unsave/i })
    expect(unsaveButtons.length).toBe(2)

    // Click unsave on the first item
    fireEvent.click(unsaveButtons[0])

    // Immediately removed from visible list
    await waitFor(() => {
      expect(screen.queryByText('Frontend Engineer Intern')).not.toBeInTheDocument()
      expect(screen.getByText('Backend Python Intern')).toBeInTheDocument()
    })

    expect(unsaveSpy).toHaveBeenCalledWith(1)
  })

  it('keeps item in list and displays error message if unsave API request fails', async () => {
    vi.spyOn(internshipApi, 'getSavedInternships').mockResolvedValueOnce([...mockSavedList])
    vi.spyOn(internshipApi, 'unsaveInternship').mockRejectedValueOnce(new Error('Network failure'))

    render(
      <MemoryRouter>
        <SavedInternshipsPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Frontend Engineer Intern')).toBeInTheDocument()
    })

    const unsaveButtons = screen.getAllByRole('button', { name: /Unsave/i })
    fireEvent.click(unsaveButtons[0])

    await waitFor(() => {
      expect(screen.getByText('Frontend Engineer Intern')).toBeInTheDocument()
      expect(screen.getByText('Failed to unsave internship')).toBeInTheDocument()
    })
  })
})
