import api from './api'
import type { ApplicationHistoryEntry, Internship, PaginatedHistory } from '@/types'
import type { InternshipFilters } from '@/types/filters'

/**
 * Get details for a specific internship by ID.
 * @param id - The internship ID
 */
export async function getInternshipDetail(id: number): Promise<Internship> {
  const response = await api.get<Internship>(`/internships/${id}/`)
  return response.data
}

/**
 * Search and filter internships.
 * @param filters - Filter parameters
 */
export async function searchInternships(filters: InternshipFilters = {}): Promise<{
  results: Internship[]
  count: number
  next: string | null
  previous: string | null
}> {
  const params: Record<string, string | number> = {}
  
  // Build query parameters from filters
  if (filters.search) params.search = filters.search
  if (filters.country) params.country = filters.country
  if (filters.city) params.city = filters.city
  if (filters.location) params.location = filters.location
  if (filters.category) params.category = filters.category
  if (filters.internship_type) params.internship_type = filters.internship_type
  if (filters.work_mode) params.work_mode = filters.work_mode
  if (filters.work_type) params.work_type = filters.work_type
  if (filters.compensation_type) params.compensation_type = filters.compensation_type
  if (filters.minimum_compensation) params.minimum_compensation = filters.minimum_compensation
  if (filters.maximum_compensation) params.maximum_compensation = filters.maximum_compensation
  if (filters.duration_min_weeks) params.duration_min_weeks = filters.duration_min_weeks
  if (filters.duration_max_weeks) params.duration_max_weeks = filters.duration_max_weeks
  if (filters.skill) params.skill = filters.skill
  if (filters.page) params.page = filters.page
  if (filters.page_size) params.page_size = filters.page_size
  if (filters.exclude_ids?.length) params.exclude_ids = filters.exclude_ids.join(',')
  
  const response = await api.get('/internships/', { params })
  return response.data
}

/**
 * Get all saved internships for the authenticated student.
 */
export async function getSavedInternships(): Promise<import('@/types').SavedInternship[]> {
  const response = await api.get<import('@/types').SavedInternship[]>('/internships/saved/')
  return response.data
}

/** Get the authenticated student's Apply history. */
export async function getApplicationHistory(page = 1): Promise<PaginatedHistory<ApplicationHistoryEntry>> {
  const response = await api.get<PaginatedHistory<ApplicationHistoryEntry>>('/applications/history/', {
    params: { page },
  })
  return response.data
}

/**
 * Save an internship to the student's saved list.
 * @param internshipId - The ID of the internship
 */
export async function saveInternship(
  internshipId: number
): Promise<{ message?: string; saved?: boolean; id?: number; internship?: number }> {
  const response = await api.post(`/internships/${internshipId}/save/`)
  return response.data
}

/**
 * Remove an internship from the student's saved list.
 * @param internshipId - The ID of the internship
 */
export async function unsaveInternship(
  internshipId: number
): Promise<{ message?: string; saved?: boolean; internship_id?: number }> {
  const response = await api.delete(`/internships/${internshipId}/save/`)
  return response.data
}

/**
 * Track an application click event (Task 8.2).
 * Uses a short bounded timeout (1500ms) for non-blocking fire-and-forget background tracking.
 * @param internshipId - The ID of the internship
 * @param timeoutMs - Optional timeout in milliseconds (default: 1500ms)
 */
export async function trackApplication(
  internshipId: number,
  timeoutMs = 1500
): Promise<{ message: string; clicked_apply: boolean; internship_id: number; applied_date: string }> {
  const response = await api.post(
    '/applications/track/',
    { internship: internshipId },
    { timeout: timeoutMs }
  )
  return response.data
}

/**
 * Direct on-platform internship application with verified university profile credentials.
 */
export async function applyDirectlyToInternship(
  internshipId: number,
  notes?: string
): Promise<any> {
  const response = await api.post(
    '/internships/applications/add/',
    {
      internship: internshipId,
      notes: notes || 'Direct on-platform application with verified university student credentials.',
    }
  )
  return response.data
}



