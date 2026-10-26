import api from './api'
import * as studentApi from './studentApi'

// -----------------------------------------------------------------------
// Dashboard summary response from GET /api/internships/dashboard/
// -----------------------------------------------------------------------

export interface DashboardSummary {
  saved_internships: number
  total_applications: number
  applied_applications: number
  interview_applications: number
  accepted_applications: number
  rejected_applications: number
  withdrawn_applications: number
  active_saved_internships: number
  recent_applications: unknown[]
  recent_saved_internships: unknown[]
}

// -----------------------------------------------------------------------
// Recommendations paginated response from GET /api/recommendations/
// -----------------------------------------------------------------------

export interface RecommendationsPage {
  count: number
  next: string | null
  previous: string | null
  results: unknown[]
}

// -----------------------------------------------------------------------
// Dashboard data combining all backend sources
// -----------------------------------------------------------------------

export interface DashboardData {
  profile: studentApi.StudentProfile | null
  profileError: boolean
  resumeStatus: studentApi.ResumeStatus | null
  resumeError: boolean
  dashboardSummary: DashboardSummary | null
  dashboardError: boolean
  recommendationsCount: number
  recommendationsError: boolean
}

// -----------------------------------------------------------------------
// API calls — each maps to a real backend endpoint
// -----------------------------------------------------------------------

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const response = await api.get<DashboardSummary>('/internships/dashboard/')
  return response.data
}

export async function getRecommendationsCount(): Promise<number> {
  const response = await api.get<RecommendationsPage>('/recommendations/', {
    params: { page_size: 1 },
  })
  return response.data.count ?? 0
}

export async function getRecommendations(pageSize: number = 6): Promise<RecommendationsPage> {
  const response = await api.get<RecommendationsPage>('/recommendations/', {
    params: { page_size: pageSize },
  })
  return response.data
}

/**
 * Aggregate all dashboard data sources in parallel.
 * Uses Promise.allSettled so a single endpoint failure
 * does not hide the entire dashboard. Each section tracks
 * its own error state so the UI can show localized retries.
 */
export async function fetchDashboardData(): Promise<DashboardData> {
  const [profileResult, resumeResult, dashboardResult, recsResult] =
    await Promise.allSettled([
      studentApi.getStudentProfile(),
      studentApi.getResumeStatus(),
      getDashboardSummary(),
      getRecommendationsCount(),
    ])

  return {
    profile: profileResult.status === 'fulfilled' ? profileResult.value : null,
    profileError: profileResult.status === 'rejected',
    resumeStatus: resumeResult.status === 'fulfilled' ? resumeResult.value : null,
    resumeError: resumeResult.status === 'rejected',
    dashboardSummary:
      dashboardResult.status === 'fulfilled' ? dashboardResult.value : null,
    dashboardError: dashboardResult.status === 'rejected',
    recommendationsCount: recsResult.status === 'fulfilled' ? recsResult.value : 0,
    recommendationsError: recsResult.status === 'rejected',
  }
}

// Re-export individual fetchers for targeted refetching
export { studentApi }
