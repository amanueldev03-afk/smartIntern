import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'

vi.mock('../api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import api from '../api'
import { fetchDashboardData, getRecommendationsCount } from '../dashboardApi'

const mockApiGet = vi.mocked(api.get)

function resolve<T>(data: T): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as InternalAxiosRequestConfig,
  }
}

beforeEach(() => {
  mockApiGet.mockReset()
})

describe('getRecommendationsCount', () => {
  it('returns the backend count, not the current page length', async () => {
    mockApiGet.mockImplementation(async (url: string) => {
      expect(url).toBe('/recommendations/')
      return resolve({
        count: 27,
        next: '/api/recommendations/?page=2',
        previous: null,
        results: new Array(10).fill({}),
      })
    })

    const count = await getRecommendationsCount()

    expect(count).toBe(27)
    expect(count).not.toBe(10)
  })
})

describe('fetchDashboardData', () => {
  const baseProfile = {
    id: 1,
    user: 1,
    phone: null,
    country: null,
    city: null,
    date_of_birth: null,
    bio: null,
    education_level: null,
    field_of_study: null,
    university: null,
    skills: [],
    interests: [],
    experience: null,
    internship_type: 'any',
    work_type: 'either',
    compensation_preference: 'either',
    minimum_compensation: null,
    maximum_compensation: null,
    compensation_currency: 'USD',
    preferred_locations: [],
    willing_to_relocate: false,
    preferred_industries: [],
    preferred_roles: [],
    internship_duration_min_weeks: null,
    internship_duration_max_weeks: null,
    availability_start: null,
    availability_end: null,
    cv: null,
    resume: null,
    cv_data: { has_cv: false },
    completion: {
      percent: 60,
      sections: {
        personal: true,
        education: true,
        skills: true,
        interests: false,
        preferences: false,
        resume: false,
      },
    },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }

  const resumeStatus = {
    has_resume: false,
    resume_url: null,
    cv_id: null,
    processing_status: null,
    processing_error: null,
  }

  const dashboardSummary = {
    saved_internships: 4,
    total_applications: 20,
    applied_applications: 12,
    interview_applications: 4,
    accepted_applications: 2,
    rejected_applications: 2,
    withdrawn_applications: 0,
    active_saved_internships: 3,
    recent_applications: [],
    recent_saved_internships: [],
  }

  it('aggregates all backend sources into a single DashboardData object', async () => {
    mockApiGet.mockImplementation(async (url: string) => {
      if (url === '/students/') return resolve(baseProfile)
      if (url === '/students/me/resume/') return resolve(resumeStatus)
      if (url === '/internships/dashboard/') return resolve(dashboardSummary)
      return resolve({ count: 14, next: null, previous: null, results: [] })
    })

    const data = await fetchDashboardData()

    expect(data.profile?.completion.percent).toBe(60)
    expect(data.resumeStatus).toEqual(resumeStatus)
    expect(data.dashboardSummary?.saved_internships).toBe(4)
    expect(data.dashboardSummary?.total_applications).toBe(20)
    expect(data.recommendationsCount).toBe(14)
  })

  it('keeps successful sections when the recommendation count request fails', async () => {
    mockApiGet.mockImplementation(async (url: string) => {
      if (url === '/students/') return resolve(baseProfile)
      if (url === '/students/me/resume/') return resolve(resumeStatus)
      if (url === '/internships/dashboard/') return resolve(dashboardSummary)
      throw new Error('network down')
    })

    const data = await fetchDashboardData()

    expect(data.profile).not.toBeNull()
    expect(data.dashboardSummary).not.toBeNull()
    expect(data.recommendationsCount).toBe(0)
  })

  it('does not hide the dashboard when several sources fail', async () => {
    mockApiGet.mockImplementation(async (url: string) => {
      if (url === '/students/') return resolve(baseProfile)
      throw new Error('endpoint down')
    })

    const data = await fetchDashboardData()

    expect(data.profile).not.toBeNull()
    expect(data.resumeStatus).toBeNull()
    expect(data.dashboardSummary).toBeNull()
    expect(data.recommendationsCount).toBe(0)
  })
})