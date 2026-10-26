import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { AxiosError } from 'axios'
import ResumeSection from '../ResumeSection'
import * as studentApi from '@/services/studentApi'

function apiError(data: unknown): AxiosError {
  return { response: { data } } as unknown as AxiosError
}

function makePdfFile(): File {
  return new File(['dummy-pdf'], 'resume.pdf', { type: 'application/pdf' })
}

function setFiles(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: files,
  })
}

const noResumeStatus = {
  has_resume: false,
  resume_url: null,
  cv_id: null,
  processing_status: null,
  processing_error: null,
}

const completedCv = {
  cv_id: 1,
  processing_status: 'COMPLETED',
  processing_error: null,
  processed_at: '2026-01-02T00:00:00Z',
  message: 'CV processed successfully. 1 skills extracted.',
  extracted_skills: ['Python'],
  extracted_education: [],
  extracted_experience: [{ role: 'Frontend Intern', company: 'Tech Corp', description: 'Built React UIs' }],
  extracted_projects: [{ name: 'AI Chatbot', description: 'Assistant bot' }],
  extracted_certifications: [],
  extracted_languages: [],
}

describe('ResumeSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the no-resume state and uploads a file with the multipart payload', async () => {
    vi.spyOn(studentApi, 'getResumeStatus').mockResolvedValue(noResumeStatus)
    const uploadSpy = vi
      .spyOn(studentApi, 'uploadResume')
      .mockResolvedValue({
        cv_id: 1,
        processing_status: 'PENDING',
        resume_url: 'http://media/resume.pdf',
        message: 'Resume uploaded. Processing in background.',
      })
    vi.spyOn(studentApi, 'getCVStatus').mockResolvedValue(completedCv)
    const onSaved = vi.fn()

    render(<ResumeSection profile={null} onSaved={onSaved} />)

    expect(await screen.findByText('No Resume Uploaded')).toBeInTheDocument()

    const input = screen.getByLabelText('Resume file input') as HTMLInputElement
    setFiles(input, [makePdfFile()])
    fireEvent.change(input)
    fireEvent.click(screen.getByRole('button', { name: /upload resume/i }))

    expect(uploadSpy).toHaveBeenCalledTimes(1)
    expect(uploadSpy.mock.calls[0][0]).toBeInstanceOf(File)
    expect((uploadSpy.mock.calls[0][0] as File).name).toBe('resume.pdf')

    expect(await screen.findByText('Resume uploaded. Processing in background.')).toBeInTheDocument()
    expect(await screen.findByText('Processed')).toBeInTheDocument()
    expect(screen.getByText('Python')).toBeInTheDocument()
    expect(screen.getByText('Frontend Intern')).toBeInTheDocument()
    expect(screen.getByText('Tech Corp')).toBeInTheDocument()
    expect(screen.getByText('AI Chatbot')).toBeInTheDocument()
    expect(onSaved).toHaveBeenCalled()
  })

  it('renders the exact DRF detail message on a rejected upload', async () => {
    vi.spyOn(studentApi, 'getResumeStatus').mockResolvedValue(noResumeStatus)
    vi.spyOn(studentApi, 'uploadResume').mockRejectedValue(
      apiError({
        detail:
          'File type must be PDF or DOCX (content sniffed). A .pdf must start with the %PDF signature.',
      })
    )

    render(<ResumeSection profile={null} onSaved={() => {}} />)

    await screen.findByText('No Resume Uploaded')
    const input = screen.getByLabelText('Resume file input') as HTMLInputElement
    setFiles(input, [makePdfFile()])
    fireEvent.change(input)
    fireEvent.click(screen.getByRole('button', { name: /upload resume/i }))

    expect(
      await screen.findByText(
        'File type must be PDF or DOCX (content sniffed). A .pdf must start with the %PDF signature.'
      )
    ).toBeInTheDocument()
  })
})