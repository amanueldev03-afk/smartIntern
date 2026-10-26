import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { AxiosError } from 'axios'
import PersonalEducationSection from '../PersonalEducationSection'
import * as studentApi from '@/services/studentApi'

const meData = {
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
  completion: {
    percent: 67,
    sections: { personal: true, education: true, skills: true, interests: true, preferences: false, resume: false },
  },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function apiError(data: unknown): AxiosError {
  return { response: { data } } as unknown as AxiosError
}

import * as authApi from '@/services/authApi'

const mockUser = {
  id: 1,
  email: 'student@example.com',
  username: 'student1',
  role: 'student' as const,
  profile_photo: null,
}

describe('PersonalEducationSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue(mockUser)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends the exact DRF field names on save', async () => {
    const getMeSpy = vi.spyOn(studentApi, 'getStudentMe').mockResolvedValue(meData)
    const updateSpy = vi.spyOn(studentApi, 'updateStudentMe').mockResolvedValue(meData)
    const onSaved = vi.fn()

    render(<PersonalEducationSection onSaved={onSaved} />)

    expect(await screen.findByDisplayValue('Tech University')).toBeInTheDocument()
    expect(getMeSpy).toHaveBeenCalledTimes(1)

    fireEvent.change(screen.getByLabelText('University'), {
      target: { value: 'New University' },
    })
    fireEvent.change(screen.getByLabelText('Date of birth'), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledWith({
      phone: '+1234567890',
      country: 'USA',
      city: 'New York',
      date_of_birth: null,
      bio: 'Aspiring AI engineer.',
      education_level: 'bachelor',
      current_year: 'third_year',
      field_of_study: 'computer_science',
      university: 'New University',
    })
    expect(await screen.findByText('Personal and education details saved.')).toBeInTheDocument()
    expect(onSaved).toHaveBeenCalled()
  })

  it('renders exact DRF field validation messages', async () => {
    vi.spyOn(studentApi, 'getStudentMe').mockResolvedValue(meData)
    vi.spyOn(studentApi, 'updateStudentMe').mockRejectedValue(
      apiError({ field_of_study: ['"not-a-choice" is not a valid choice.'] })
    )

    render(<PersonalEducationSection onSaved={() => {}} />)

    await screen.findByDisplayValue('Tech University')
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    expect(
      (await screen.findAllByText('"not-a-choice" is not a valid choice.')).length
    ).toBeGreaterThan(0)
  })

  it('shows a load failure message when fetching fails', async () => {
    vi.spyOn(studentApi, 'getStudentMe').mockRejectedValue(new Error('network'))
    render(<PersonalEducationSection onSaved={() => {}} />)

    expect(
      await screen.findByText('Failed to load your profile. Please try again.')
    ).toBeInTheDocument()
  })
})