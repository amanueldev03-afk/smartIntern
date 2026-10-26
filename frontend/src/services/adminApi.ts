import api from './api'

export interface AdminStudent {
  id: string | number
  email: string
  username: string
  first_name: string
  last_name: string
  full_name: string
  role: string
  is_active: boolean
  is_email_verified: boolean
  profile_photo_url: string | null
  date_joined: string
  last_login: string | null
  education_level: string | null
  university: string | null
  field_of_study: string | null
  skills_count: number
  total_applications: number
  total_recommendations: number
}

export interface AdminStudentListResponse {
  count: number
  next: string | null
  previous: string | null
  results: AdminStudent[]
}

export interface StudentActivityEntry {
  id: number | string
  action: string
  action_display: string
  description: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface StudentActivityResponse {
  student: {
    id: string | number
    email: string
    full_name: string
    is_active: boolean
    date_joined: string
    last_login: string | null
  }
  profile_summary: {
    education_level: string | null
    university: string | null
    field_of_study: string | null
    skills_count: number
  }
  activity_counts: {
    total_applications: number
    total_saves: number
    total_recommendations: number
    total_application_clicks: number
    total_activity_logs: number
  }
  count: number
  next: string | null
  previous: string | null
  results: StudentActivityEntry[]
}

export interface InternshipReviewItem {
  id: number
  title: string
  organization_name: string
  description: string
  application_url: string
  status: string
  needs_review: boolean
  source_name: string | null
  data_source_name: string | null
  duplicate_flags: Array<{
    id: number
    title: string
    organization_name: string
    similarity_score: number | null
    review_status: string
  }>
  pending_duplicate_count: number
  invalid_urls: string[]
  low_confidence_skills: string[]
  url_validation: Record<string, unknown>
  skills_review: unknown[]
  created_at: string
}

export interface InternshipReviewListResponse {
  count: number
  next: string | null
  previous: string | null
  results: InternshipReviewItem[]
}

export interface DataSourceHealthItem {
  id: number
  name: string
  source_type: string
  is_active: boolean
  website_url: string
  last_synced_at: string | null
  last_run_status: string | null
  last_run_started_at: string | null
  last_run_completed_at: string | null
  last_error: string | null
  last_records_found: number
  last_records_created: number
  last_records_failed: number
  total_runs: number
}

export interface AdminAIMonitoringData {
  recommendations_per_day: Array<{ date: string; count: number }>
  average_match_score: number | null
  score_distribution: Array<{ range: string; count: number }>
}

// Student management
export async function getAdminStudents(params?: {
  page?: number
  page_size?: number
  search?: string
  is_active?: string
  ordering?: string
}): Promise<AdminStudentListResponse> {
  const response = await api.get<AdminStudentListResponse>('/admin/students/', { params })
  return response.data
}

export async function deactivateStudent(studentId: string | number): Promise<{ message: string; student_id: string | number; is_active: boolean }> {
  const response = await api.post(`/admin/students/${studentId}/deactivate/`)
  return response.data
}

export async function activateStudent(studentId: string | number): Promise<{ message: string; student_id: string | number; is_active: boolean }> {
  const response = await api.post(`/admin/students/${studentId}/activate/`)
  return response.data
}

export async function getStudentActivity(studentId: string | number, params?: { page?: number; action?: string }): Promise<StudentActivityResponse> {
  const response = await api.get(`/admin/students/${studentId}/activity/`, { params })
  return response.data
}

// Internship review queue
export async function getInternshipReviewQueue(params?: {
  page?: number
  search?: string
  reason?: string
}): Promise<InternshipReviewListResponse> {
  const response = await api.get('/internships/admin/review/', { params })
  return response.data
}

export async function approveInternship(internshipId: number): Promise<{ message: string; internship_id: number; status: string; needs_review: boolean }> {
  const response = await api.post(`/internships/admin/${internshipId}/approve/`)
  return response.data
}

export async function rejectInternship(
  internshipId: number,
  rejection_reason?: string
): Promise<{ message: string; internship_id: number; status: string; needs_review: boolean }> {
  const response = await api.post(`/internships/admin/${internshipId}/reject/`, { rejection_reason })
  return response.data
}

export async function removeInternship(internshipId: number): Promise<{ message: string; internship_id: number; status: string; needs_review: boolean }> {
  const response = await api.post(`/internships/admin/${internshipId}/remove/`)
  return response.data
}

// Data source health
export async function getDataSourceHealth(): Promise<DataSourceHealthItem[]> {
  const response = await api.get<{ results?: DataSourceHealthItem[] } | DataSourceHealthItem[]>(
    '/internships/admin/data-sources/health/'
  )
  return Array.isArray(response.data) ? response.data : response.data.results ?? []
}

// AI monitoring analytics
export async function getAIMonitoringData(): Promise<AdminAIMonitoringData> {
  const response = await api.get('/admin/analytics/ai/')
  return response.data
}
