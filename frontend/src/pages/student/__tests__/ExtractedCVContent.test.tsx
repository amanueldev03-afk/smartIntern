import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ExtractedCVContent, { toParsedCVData } from '../components/ExtractedCVContent'
import type { CVData, CVStatus } from '@/services/studentApi'

const completedStatus: CVStatus = {
  cv_id: 1,
  processing_status: 'COMPLETED',
  processing_error: null,
  processed_at: '2026-01-02T00:00:00Z',
  message: 'OK',
  extracted_skills: ['Python', 'Django'],
  extracted_education: [
    { degree: 'BSc Computer Science', institution: 'AAU', field: 'Computer Science', years: '2019-2023' },
  ],
  extracted_experience: [
    { role: 'Backend Intern', company: 'Startup Inc', description: 'Built APIs' },
  ],
  extracted_projects: [
    { name: 'Chatbot', description: 'Assistant', technologies: ['React'] },
  ],
  extracted_certifications: [{ name: 'AWS Certified' }],
  extracted_languages: [],
}

const cvData: CVData = {
  has_cv: true,
  processing_status: 'COMPLETED',
  merged_skills: ['Python'],
  extracted_skills: ['Python'],
  extracted_education: [
    { institution: 'AAU', degree: 'BSc', field_of_study: 'CS' },
  ],
  extracted_experience: [],
  extracted_projects: [],
  extracted_certifications: [],
}

describe('ExtractedCVContent', () => {
  it('renders parsed fields from a completed CVStatus', () => {
    render(<ExtractedCVContent cvStatus={completedStatus} />)
    expect(screen.getByText('Parsed Skills')).toBeInTheDocument()
    expect(screen.getByText('Python')).toBeInTheDocument()
    expect(screen.getByText('Parsed Education')).toBeInTheDocument()
    expect(screen.getByText('BSc Computer Science')).toBeInTheDocument()
    expect(screen.getByText('Parsed Experience')).toBeInTheDocument()
    expect(screen.getByText('Backend Intern')).toBeInTheDocument()
    expect(screen.getByText('Parsed Projects')).toBeInTheDocument()
    expect(screen.getByText('Chatbot')).toBeInTheDocument()
    expect(screen.getByText('Parsed Certifications')).toBeInTheDocument()
    expect(screen.getByText('AWS Certified')).toBeInTheDocument()
  })

  it('renders parsed fields from CVData (merged_skills + education)', () => {
    render(<ExtractedCVContent cvData={cvData} />)
    expect(screen.getByText('Parsed Skills')).toBeInTheDocument()
    expect(screen.getByText('Python')).toBeInTheDocument()
    expect(screen.getByText('Parsed Education')).toBeInTheDocument()
    expect(screen.getByText('BSc')).toBeInTheDocument()
  })

  it('renders nothing when there is no CV content', () => {
    const { container } = render(<ExtractedCVContent cvData={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('maps inputs to parsed CV data via toParsedCVData', () => {
    const fromStatus = toParsedCVData(completedStatus, undefined)
    expect(fromStatus.hasContent).toBe(true)
    expect(fromStatus.skills).toEqual(['Python', 'Django'])
    expect(fromStatus.certifications).toEqual([{ name: 'AWS Certified', issuer: null, date: null }])

    const fromProfile = toParsedCVData(null, cvData)
    expect(fromProfile.hasContent).toBe(true)
    expect(fromProfile.skills).toEqual(['Python'])

    const empty = toParsedCVData(null, undefined)
    expect(empty.hasContent).toBe(false)
    expect(empty.skills).toEqual([])
  })
})
