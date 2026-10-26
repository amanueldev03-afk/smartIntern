import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RecommendationCard from '../RecommendationCard'
import * as internshipApi from '@/services/internshipApi'

const mockRecommendation = {
  id: 1,
  match_score: 92,
  explanation: ['Matches your React skill', 'Matches remote preference'],
  internship: {
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
}

describe('RecommendationCard - Save/Unsave Toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('displays Save button when isSaved is false', () => {
    render(
      <MemoryRouter>
        <RecommendationCard recommendation={mockRecommendation} isSaved={false} />
      </MemoryRouter>
    )

    const saveBtn = screen.getByRole('button', { name: /Save/i })
    expect(saveBtn).toBeInTheDocument()
    expect(saveBtn.textContent).toContain('Save')
  })

  it('displays Saved button when isSaved is true', () => {
    render(
      <MemoryRouter>
        <RecommendationCard recommendation={mockRecommendation} isSaved={true} />
      </MemoryRouter>
    )

    const savedBtn = screen.getByRole('button', { name: /Unsave/i })
    expect(savedBtn).toBeInTheDocument()
    expect(savedBtn.textContent).toContain('Saved')
  })

  it('clicking Save calls saveInternship API and toggles to Saved state immediately', async () => {
    const saveSpy = vi.spyOn(internshipApi, 'saveInternship').mockResolvedValueOnce({
      id: 10,
      internship: 1,
      saved: true,
    })
    const onSave = vi.fn()

    render(
      <MemoryRouter>
        <RecommendationCard
          recommendation={mockRecommendation}
          isSaved={false}
          onSave={onSave}
        />
      </MemoryRouter>
    )

    const saveBtn = screen.getByRole('button', { name: /Save/i })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledWith(1)
      expect(onSave).toHaveBeenCalledWith(1)
      expect(screen.getByRole('button', { name: /Unsave/i })).toBeInTheDocument()
    })
  })

  it('clicking Unsave calls unsaveInternship API and toggles to Save state immediately', async () => {
    const unsaveSpy = vi.spyOn(internshipApi, 'unsaveInternship').mockResolvedValueOnce({ saved: false })
    const onUnsave = vi.fn()

    render(
      <MemoryRouter>
        <RecommendationCard
          recommendation={mockRecommendation}
          isSaved={true}
          onUnsave={onUnsave}
        />
      </MemoryRouter>
    )

    const savedBtn = screen.getByRole('button', { name: /Unsave/i })
    fireEvent.click(savedBtn)

    await waitFor(() => {
      expect(unsaveSpy).toHaveBeenCalledWith(1)
      expect(onUnsave).toHaveBeenCalledWith(1)
      expect(screen.getByRole('button', { name: /Save/i })).toBeInTheDocument()
    })
  })

  it('does not falsely toggle state if save API fails', async () => {
    vi.spyOn(internshipApi, 'saveInternship').mockRejectedValueOnce(new Error('Network error'))

    render(
      <MemoryRouter>
        <RecommendationCard recommendation={mockRecommendation} isSaved={false} />
      </MemoryRouter>
    )

    const saveBtn = screen.getByRole('button', { name: /Save/i })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(screen.getByText('Failed to save internship')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Save/i })).toBeInTheDocument()
    })
  })

  it('does not falsely toggle state if unsave API fails', async () => {
    vi.spyOn(internshipApi, 'unsaveInternship').mockRejectedValueOnce(new Error('Server error'))

    render(
      <MemoryRouter>
        <RecommendationCard recommendation={mockRecommendation} isSaved={true} />
      </MemoryRouter>
    )

    const unsaveBtn = screen.getByRole('button', { name: /Unsave/i })
    fireEvent.click(unsaveBtn)

    await waitFor(() => {
      expect(screen.getByText('Failed to unsave internship')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Unsave/i })).toBeInTheDocument()
    })
  })
})

describe('RecommendationCard - Apply Flow (Task 8.2 / TC009)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window, 'open').mockImplementation(() => null)
  })

  it('TC009: Valid Apply initiates tracking and immediately redirects to employer application_url', async () => {
    const trackSpy = vi.spyOn(internshipApi, 'trackApplication').mockResolvedValueOnce({
      message: 'Application tracked successfully.',
      clicked_apply: true,
      internship_id: 1,
      applied_date: '2026-09-01T00:00:00Z',
    })
    const onApply = vi.fn()

    render(
      <MemoryRouter>
        <RecommendationCard
          recommendation={mockRecommendation}
          onApply={onApply}
        />
      </MemoryRouter>
    )

    const applyBtn = screen.getByRole('button', { name: /^Apply$/i })
    fireEvent.click(applyBtn)

    // Verify window.open was called immediately with valid URL and security flags
    expect(window.open).toHaveBeenCalledWith('https://example.com/apply/1', '_blank', 'noopener,noreferrer')

    // Verify background tracking was initiated
    expect(trackSpy).toHaveBeenCalledWith(1)
    expect(onApply).toHaveBeenCalledWith(1)
  })

  it('TC009: Invalid/Flagged Apply shows in-app error state and DOES NOT redirect', async () => {
    const flaggedRec = {
      ...mockRecommendation,
      internship: {
        ...mockRecommendation.internship,
        is_flagged: true,
      },
    }

    render(
      <MemoryRouter>
        <RecommendationCard recommendation={flaggedRec} />
      </MemoryRouter>
    )

    const applyBtn = screen.getByRole('button', { name: /^Apply$/i })
    fireEvent.click(applyBtn)

    // Verify NO redirect occurred
    expect(window.open).not.toHaveBeenCalled()

    // Verify in-app error state rendered
    await waitFor(() => {
      expect(screen.getByText(/flagged for a broken or unreachable application link/i)).toBeInTheDocument()
    })
  })

  it('TC009: Dead/unreachable URL shows in-app error and DOES NOT redirect', async () => {
    const deadRec = {
      ...mockRecommendation,
      internship: {
        ...mockRecommendation.internship,
        url_validation: { application_url_valid: false, status: 'dead' },
      },
    }

    render(
      <MemoryRouter>
        <RecommendationCard recommendation={deadRec} />
      </MemoryRouter>
    )

    const applyBtn = screen.getByRole('button', { name: /^Apply$/i })
    fireEvent.click(applyBtn)

    // Verify NO redirect
    expect(window.open).not.toHaveBeenCalled()

    // Verify error displayed
    await waitFor(() => {
      expect(screen.getByText(/employer application link is unreachable or dead/i)).toBeInTheDocument()
    })
  })

  it('TC009: Tracking backend failure or timeout STILL redirects student to valid employer URL', async () => {
    // Tracking fails/times out
    vi.spyOn(internshipApi, 'trackApplication').mockRejectedValueOnce(new Error('Tracking service timeout'))
    const onApply = vi.fn()

    render(
      <MemoryRouter>
        <RecommendationCard
          recommendation={mockRecommendation}
          onApply={onApply}
        />
      </MemoryRouter>
    )

    const applyBtn = screen.getByRole('button', { name: /^Apply$/i })
    fireEvent.click(applyBtn)

    // Verify redirect STILL succeeded without getting blocked
    expect(window.open).toHaveBeenCalledWith('https://example.com/apply/1', '_blank', 'noopener,noreferrer')
    expect(onApply).toHaveBeenCalledWith(1)
  })
})