import api from './api'
import type { PaginatedHistory, RecommendationHistoryEntry, RecommendationResponse } from '@/types'

/**
 * Get AI-powered recommendations for the authenticated student.
 * @param refresh - Set to true to bust cache and re-score immediately
 */
export async function getRecommendations(refresh = false, page = 1): Promise<RecommendationResponse> {
  const params = {
    ...(refresh ? { refresh: 'true' } : {}),
    ...(page > 1 ? { page } : {}),
  }
  const response = await api.get<RecommendationResponse>('/recommendations/', { params })
  return response.data
}

/**
 * Get recommendation history for the authenticated student.
 */
export async function getRecommendationHistory(page = 1): Promise<PaginatedHistory<RecommendationHistoryEntry>> {
  const response = await api.get<PaginatedHistory<RecommendationHistoryEntry>>('/recommendations/history/', {
    params: { page },
  })
  return response.data
}

/**
 * Submit feedback for a recommendation (view, save, apply, ignore).
 * @param internshipId - The ID of the internship
 * @param action - The action to perform: 'view' | 'save' | 'apply' | 'ignore'
 */
export async function submitRecommendationFeedback(
  internshipId: number,
  action: 'view' | 'save' | 'apply' | 'ignore'
): Promise<{ message: string; status: string }> {
  const response = await api.post<{ message: string; status: string }>(
    `/recommendations/${internshipId}/feedback/`,
    { action }
  )
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
 * Apply to an internship.
 * @param internshipId - The ID of the internship
 * @param notes - Optional notes about the application
 */
export async function applyToInternship(
  internshipId: number,
  notes?: string
): Promise<{ id?: number; internship: number; student?: number; notes?: string; created_at?: string; clicked_apply?: boolean }> {
  try {
    const res = await trackApplication(internshipId)
    return {
      internship: res.internship_id || internshipId,
      clicked_apply: res.clicked_apply,
    }
  } catch (err) {
    const response = await api.post(
      '/internships/applications/add/',
      { internship: internshipId, notes },
      { timeout: 1500 }
    )
    return response.data
  }
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
export async function unsaveInternship(internshipId: number): Promise<void> {
  await api.delete(`/internships/${internshipId}/save/`)
}
