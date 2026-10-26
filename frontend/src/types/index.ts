// -----------------------------------------------------------------------
// Shared TypeScript types — mirrors the Django model/serializer shapes.
// Expand each interface as the backend API is built out.
// -----------------------------------------------------------------------

export type UserRole = 'student' | 'admin' | string

export interface User {
  id: number | string
  email: string
  username: string
  role: UserRole
  first_name?: string
  last_name?: string
  full_name?: string
  phone_number?: string
  department?: string
  university_name?: string
  staff_id_number?: string
  is_approved?: boolean
  profile_photo?: string
  profile_photo_url?: string
  is_email_verified?: boolean
  date_joined?: string
}

export interface Internship {
  id: number
  title: string
  organization_name: string
  description: string
  category?: string
  country?: string
  city?: string
  location_text?: string
  internship_type: 'remote' | 'onsite' | 'hybrid'
  work_type: string
  compensation_type?: string
  minimum_compensation?: number
  maximum_compensation?: number
  compensation_currency?: string
  compensation_period?: string
  required_skills: string[]
  preferred_skills?: string[]
  duration_min_weeks?: number
  duration_max_weeks?: number
  application_url?: string
  source?: number
  source_name?: string
  source_url?: string
  external_id?: string
  posted_at?: string
  application_deadline?: string
  is_verified: boolean
  is_expired: boolean
  status: string
  created_at: string
  updated_at: string
}

export interface ScoreBreakdown {
  semantic_score?: number
  skill_score?: number
  preference_score?: number
  location_score?: number
  salary_score?: number
  weights?: {
    semantic: string
    skills: string
    preference: string
    location: string
    salary: string
  }
}

export interface Recommendation {
  internship: Internship
  match_score: number // 0–100
  score_breakdown?: ScoreBreakdown
  explanation: string[]
}

export interface RecommendationResponse {
  count: number
  next: string | null
  previous: string | null
  results: Recommendation[]
  cv_analysis?: {
    has_cv: boolean
    processing_status?: string
    message?: string
    extracted_skills?: string[]
    extracted_education?: any[]
    extracted_experience?: any[]
    extracted_projects?: any[]
    extracted_certifications?: any[]
    uploaded_at?: string
  }
  profile_summary?: {
    skills: string[]
    internship_type: string
    work_type: string
    compensation_preference: string
    country: string
    city: string
    preferred_locations: string[]
    willing_to_relocate: boolean
    has_embedding: boolean
    field_of_study: string
    education_level: string
  }
  scoring_metadata?: {
    from_cache: boolean
    cache_ttl_seconds: number
    weights: {
      semantic: string
      skills: string
      preference: string
      location: string
      salary: string
    }
  }
}

export interface RecommendationHistoryEntry {
  id: number
  internship: number | Internship
  internship_title: string
  organization_name: string
  overall_score?: number
  semantic_score?: number
  skill_score?: number
  preference_score?: number
  location_score?: number
  salary_score?: number
  status: string
  recommendation_date: string
  viewed_at?: string
  saved_at?: string
  applied_at?: string
  ignored_at?: string
  created_at: string
  updated_at: string
}

export interface ApplicationHistoryEntry {
  id: number
  internship: number
  internship_title: string
  organization_name: string
  clicked_apply: boolean
  applied_date: string
  created_at: string
  updated_at: string
}

export interface PaginatedHistory<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface Application {
  id: number
  internship: Internship
  applied_at: string
}

export interface SavedInternship {
  id: number
  internship: number
  internship_title: string
  organization_name: string
  application_url?: string
  source_url?: string
  internship_details?: Internship
  created_at: string
}

export interface ApiError {
  detail?: string
  [key: string]: unknown
}

