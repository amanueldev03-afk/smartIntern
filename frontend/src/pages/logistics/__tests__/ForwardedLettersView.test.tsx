import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DormDashboard from '../DormDashboard'
import UnionDashboard from '../UnionDashboard'
import * as logisticsApi from '@/services/logisticsApi'

vi.mock('@/services/logisticsApi', async () => {
  const actual = await vi.importActual<typeof import('@/services/logisticsApi')>('@/services/logisticsApi')
  return {
    ...actual,
    getDormForwardedLetters: vi.fn(),
    getStudentDeanForwardedLetters: vi.fn(),
    getDormRoomGrid: vi.fn().mockResolvedValue({ rooms: [], total_rooms_with_occupants: 0 }),
    getCampusLogistics: vi.fn().mockResolvedValue([]),
    getMealCardQueue: vi.fn().mockResolvedValue([]),
  }
})

describe('Forwarded Letters View in Logistics Dashboards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(logisticsApi.getDormForwardedLetters).mockResolvedValue([
      {
        student_id: 'stu-1',
        student_id_number: 'UGR/1234/14',
        student_name: 'Abebe Bikila',
        student_email: 'abebe@example.com',
        department: 'Software Engineering',
        university_name: 'Addis Ababa University',
        academic_year: 4,
        dean_title: 'Dr. Haile Dean',
        dean_verified_at: '2026-10-09T10:00:00Z',
        dean_signature_hash: 'hmac1234567890abcdef',
        letter_title: 'CAMPUS DORMITORY & CAFETERIA CLEARANCE PERMIT',
        letter_notes: 'Approved for dormitory accommodation.',
        allow_dorm: true,
        valid_from: '2026-10-01',
        valid_until: '2027-02-01',
        qr_code: 'data:image/png;base64,mockqr',
        forwarded_at: '2026-10-09T12:00:00Z',
      },
    ])

    vi.mocked(logisticsApi.getStudentDeanForwardedLetters).mockResolvedValue([
      {
        student_id: 'stu-2',
        student_id_number: 'UGR/5678/14',
        student_name: 'Sara Mengistu',
        student_email: 'sara@example.com',
        department: 'Electrical Engineering',
        university_name: 'Addis Ababa University',
        academic_year: 4,
        dean_title: 'Dr. Haile Dean',
        dean_verified_at: '2026-10-09T10:00:00Z',
        dean_signature_hash: 'hmac0987654321fedcba',
        letter_title: 'CAMPUS DORMITORY & CAFETERIA CLEARANCE PERMIT',
        letter_notes: 'Approved for cafeteria meal card access.',
        allow_food: true,
        valid_from: '2026-10-01',
        valid_until: '2027-02-01',
        qr_code: 'data:image/png;base64,mockqr2',
        forwarded_at: '2026-10-09T12:30:00Z',
      },
    ])
  })

  it('DormDashboard toggles between Room Allocation and Forwarded Dorm Letters', async () => {
    render(
      <MemoryRouter initialEntries={['/dorm/dashboard']}>
        <DormDashboard />
      </MemoryRouter>
    )

    // Initial tab is Room Allocation
    expect(screen.getByText('Room Allocation & Keys')).toBeInTheDocument()
    const lettersTab = screen.getByRole('button', { name: /forwarded dorm letters/i })
    expect(lettersTab).toBeInTheDocument()

    // Click Forwarded Dorm Letters tab
    fireEvent.click(lettersTab)

    // Check letter card rendered
    expect(await screen.findByText('Abebe Bikila')).toBeInTheDocument()
    expect(screen.getByText('UGR/1234/14')).toBeInTheDocument()
    expect(screen.getByText('Dr. Haile Dean')).toBeInTheDocument()

    // View Letter & QR modal
    const viewBtn = screen.getByRole('button', { name: /view letter & qr/i })
    fireEvent.click(viewBtn)

    expect(screen.getByText('AUTHENTICATED OFFICIAL INSTITUTIONAL RECORD')).toBeInTheDocument()
    expect(screen.getByText('Dormitory Administration Directorate')).toBeInTheDocument()
  })

  it('UnionDashboard toggles between Meal Cards and Forwarded Cafeteria Letters', async () => {
    render(
      <MemoryRouter initialEntries={['/union/dashboard']}>
        <UnionDashboard />
      </MemoryRouter>
    )

    const lettersTab = screen.getByRole('button', { name: /forwarded cafeteria letters/i })
    expect(lettersTab).toBeInTheDocument()

    // Click Forwarded Cafeteria Letters tab
    fireEvent.click(lettersTab)

    // Check letter card rendered
    expect(await screen.findByText('Sara Mengistu')).toBeInTheDocument()
    expect(screen.getByText('UGR/5678/14')).toBeInTheDocument()
    expect(screen.getByText('Dr. Haile Dean')).toBeInTheDocument()

    // View Letter & QR modal
    const viewBtn = screen.getByRole('button', { name: /view letter & qr/i })
    fireEvent.click(viewBtn)

    expect(screen.getByText('AUTHENTICATED OFFICIAL INSTITUTIONAL RECORD')).toBeInTheDocument()
    expect(screen.getByText('Student Union & Dining Services Division')).toBeInTheDocument()
  })
})
