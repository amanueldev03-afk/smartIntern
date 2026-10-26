/**
 * Filter types for internship search
 */

export interface InternshipFilters {
  search?: string
  country?: string
  city?: string
  location?: string
  category?: string
  internship_type?: 'remote' | 'onsite' | 'hybrid'
  work_mode?: 'remote' | 'onsite' | 'hybrid' | 'any'
  work_type?: 'full_time' | 'part_time'
  compensation_type?: 'paid' | 'unpaid' | 'unknown'
  minimum_compensation?: number
  maximum_compensation?: number
  duration_min_weeks?: number
  duration_max_weeks?: number
  skill?: string
  page?: number
  page_size?: number
  exclude_ids?: number[]
}

export const INTERNSHIP_TYPE_CHOICES = [
  { value: 'remote', label: 'Remote' },
  { value: 'onsite', label: 'On-site' },
  { value: 'hybrid', label: 'Hybrid' },
] as const

export const WORK_MODE_CHOICES = [
  { value: 'remote', label: 'Remote' },
  { value: 'onsite', label: 'On-site' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'any', label: 'Any' },
] as const

export const WORK_TYPE_CHOICES = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
] as const

export const COMPENSATION_TYPE_CHOICES = [
  { value: 'paid', label: 'Paid' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'unknown', label: 'Unknown' },
] as const
