import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { AxiosError } from 'axios'
import SkillsInterestsSection from '../SkillsInterestsSection'
import * as studentApi from '@/services/studentApi'

const python = { id: 1, name: 'Python', category: 'Programming' }
const react = { id: 2, name: 'React', category: 'Web' }
const webDev = { id: 1, name: 'Web Development', description: 'Web' }

function apiError(data: unknown): AxiosError {
  return { response: { data } } as unknown as AxiosError
}

function setupStatefulMocks(options: {
  initialSkills?: Array<typeof python>
  initialInterests?: Array<typeof webDev>
  addSkillError?: unknown
}) {
  let skills: Array<typeof python> = [...(options.initialSkills ?? [])]
  let interests: Array<typeof webDev> = [...(options.initialInterests ?? [])]

  return {
    getStudentSkills: vi
      .spyOn(studentApi, 'getStudentSkills')
      .mockImplementation(async () => skills),
    getStudentInterests: vi
      .spyOn(studentApi, 'getStudentInterests')
      .mockImplementation(async () => interests),
    getSkillChoices: vi
      .spyOn(studentApi, 'getSkillChoices')
      .mockResolvedValue([python, react]),
    getInterestChoices: vi
      .spyOn(studentApi, 'getInterestChoices')
      .mockResolvedValue([webDev]),
    addStudentSkill: vi.spyOn(studentApi, 'addStudentSkill').mockImplementation(async (id: number) => {
      if (options.addSkillError) throw options.addSkillError
      const found = [python, react].find((s) => s.id === id)
      if (found) skills = [...skills, found]
      return (found ?? python) as typeof python
    }),
    removeStudentSkill: vi
      .spyOn(studentApi, 'removeStudentSkill')
      .mockImplementation(async (id: number) => {
        skills = skills.filter((s) => s.id !== id)
      }),
    addStudentInterest: vi
      .spyOn(studentApi, 'addStudentInterest')
      .mockImplementation(async (id: number) => {
        if (webDev.id === id) interests = [webDev]
        return webDev
      }),
    removeStudentInterest: vi
      .spyOn(studentApi, 'removeStudentInterest')
      .mockImplementation(async (id: number) => {
        interests = interests.filter((i) => i.id !== id)
      }),
  }
}

describe('SkillsInterestsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads the catalogue, adds and removes skills by catalogue id', async () => {
    const mocks = setupStatefulMocks({ initialSkills: [python] })
    const onSaved = vi.fn()

    render(<SkillsInterestsSection onSaved={onSaved} />)

    // Existing skill chip rendered; catalogue select excludes it.
    expect(await screen.findByText('Python')).toBeInTheDocument()
    const select = screen.getByLabelText('Select skill from catalogue')
    expect(select).not.toHaveTextContent('(Programming)')

    // Catalogue offers React; adding it POSTs its id then refetches.
    fireEvent.change(select, { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: /add skill/i }))

    await waitFor(() => expect(mocks.addStudentSkill).toHaveBeenCalledWith(2))
    expect(mocks.removeStudentSkill).not.toHaveBeenCalled()
    expect(onSaved).toHaveBeenCalled()

    // Removing chips only ever issues DELETE with id.
    fireEvent.click(screen.getByRole('button', { name: /remove skill Python/i }))
    await waitFor(() => expect(mocks.removeStudentSkill).toHaveBeenCalledWith(1))
  })

  it('repopulates after adding via the refetched list', async () => {
    setupStatefulMocks({ initialSkills: [python] })

    render(<SkillsInterestsSection onSaved={() => {}} />)

    await screen.findByText('Python')
    fireEvent.change(screen.getByLabelText('Select skill from catalogue'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: /add skill/i }))

    expect(await screen.findByText('React')).toBeInTheDocument()
  })

  it('shows exact DRF messages when a catalogue id is invalid', async () => {
    setupStatefulMocks({
      initialSkills: [python],
      addSkillError: apiError({
        skill_id: [
          'Skill not found in the catalogue (Task 1.3). Skills must be selected from the catalogue, not free-typed.',
        ],
      }),
    })

    render(<SkillsInterestsSection onSaved={() => {}} />)

    await screen.findByText('Python')
    fireEvent.change(screen.getByLabelText('Select skill from catalogue'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: /add skill/i }))

    expect(
      await screen.findByText(
        'Skill not found in the catalogue (Task 1.3). Skills must be selected from the catalogue, not free-typed.'
      )
    ).toBeInTheDocument()
  })

  it('adds and removes interests from the interest catalogue', async () => {
    const mocks = setupStatefulMocks({ initialSkills: [] })

    render(<SkillsInterestsSection onSaved={() => {}} />)

    const select = await screen.findByLabelText('Select interest from catalogue')
    fireEvent.change(select, { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: /add interest/i }))

    await waitFor(() => expect(mocks.addStudentInterest).toHaveBeenCalledWith(1))

    // After refetch the chip is present and removed on delete request.
    fireEvent.click(await screen.findByRole('button', { name: /remove interest Web Development/i }))
    await waitFor(() => expect(mocks.removeStudentInterest).toHaveBeenCalledWith(1))
  })
})