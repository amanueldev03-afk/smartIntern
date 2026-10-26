import api from './api'

export interface AdminAnalytics {
  users: {
    total: number
    students: number
    admins: number
  }
  internships: {
    total: number
    active: number
    needs_review: number
  }
  most_requested_skills: Array<{
    skill: string
    count: number
  }>
  recommendations: {
    total: number
    average_match_score: number | null
  }
}

export interface AdminAIMonitoringData {
  recommendations_per_day: Array<{ date: string; count: number }>
  average_match_score: number | null
  score_distribution: Array<{ range: string; count: number }>
}

export async function getAdminAnalytics(): Promise<AdminAnalytics> {
  const response = await api.get<AdminAnalytics>('/admin/analytics/')
  return response.data
}

export async function getAIMonitoringData(): Promise<AdminAIMonitoringData> {
  const response = await api.get<AdminAIMonitoringData>('/admin/analytics/ai/')
  return response.data
}
