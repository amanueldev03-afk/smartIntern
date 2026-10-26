import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { AxiosError } from 'axios'
import PreferencesSection from '../PreferencesSection'
import * as studentApi from '@/services/studentApi'

const prefs = {
  country: 'USA',
  city: 'New York',
  work_mode: 'full_time',
  internship_type: 'remote',
  availability_start: '2026-06-01',
  availability_end: '2026-09-01',
  availability_immediately: false,
}

function apiError(data: unknown): AxiosError {
  return { response: { data } } as unknown as AxiosError
}

async function waitForForm() {
  const workMode = (await screen.findByLabelText('Work mode')) as HTMLSelectElement
  expect(workMode.value).toBe('full_time')
  return workMode
}

describe('PreferencesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends canonical work_mode / internship_type codes and nulls empty dates', async () => {
    vi.spyOn(studentApi, 'getStudentPreferences').mockResolvedValue(prefs)
    const updateSpy = vi.spyOn(studentApi, 'updateStudentPreferences').mockResolvedValue(prefs)
    const onSaved = vi.fn()

    render(<PreferencesSection onSaved={onSaved} />)

    await waitForForm()

    fireEvent.change(screen.getByLabelText('Availability end'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /save preferences/i }))

    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledWith({
      country: 'USA',
      city: 'New York',
      availability_start: '2026-06-01',
      availability_end: null,
      availability_immediately: false,
      work_mode: 'full_time',
      internship_type: 'remote',
    })
    expect(await screen.findByText('Internship preferences saved.')).toBeInTheDocument()
    expect(onSaved).toHaveBeenCalled()
  })

  it('renders the exact DRF invariant message when availability_end precedes availability_start', async () => {
    vi.spyOn(studentApi, 'getStudentPreferences').mockResolvedValue(prefs)
    vi.spyOn(studentApi, 'updateStudentPreferences').mockRejectedValue(
      apiError({
        availability_end: ['availability_end cannot be before availability_start.'],
      })
    )

    render(<PreferencesSection onSaved={() => {}} />)

    await waitForForm()
    fireEvent.click(screen.getByRole('button', { name: /save preferences/i }))

    expect(
        (await screen.findAllByText('availability_end cannot be before availability_start.')).length
      ).toBeGreaterThan(0)
  })
})