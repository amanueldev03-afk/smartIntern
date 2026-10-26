import api from './api'

// -----------------------------------------------------------------------
// Types mirror the Phase 3 Django DRF serializers exactly (snake_case).
// -----------------------------------------------------------------------

export interface Skill {
  id: number
  name: string
  category?: string
  description?: string
  is_active?: boolean
}

export interface CareerInterest {
  id: number
  name: string
  description?: string
  is_active?: boolean
}

export interface ProfileCompletion {
  percent: number
  sections: {
    personal: boolean
    education: boolean
    skills: boolean
    interests: boolean
    preferences: boolean
    resume: boolean
  }
}

export interface CVData {
  has_cv: boolean
  processing_status?: string
  merged_skills?: string[]
  extracted_skills?: string[]
  extracted_education?: Array<{
    institution?: string
    degree?: string
    field_of_study?: string
    start_date?: string
    end_date?: string
    gpa?: string | number
  }>
  extracted_experience?: Array<{
    company?: string
    role?: string
    start_date?: string
    end_date?: string
    description?: string
  }>
  extracted_projects?: Array<{
    name?: string
    description?: string
    technologies?: string[]
  }>
  extracted_certifications?: Array<{
    name?: string
    issuer?: string
    date?: string
  }>
  extracted_languages?: Array<{
    name?: string
    proficiency?: string
  }>
  uploaded_at?: string
  message?: string
}

/** GET/PATCH /api/students/ — full profile (StudentProfileSerializer). */
export interface StudentProfile {
  id: number
  user: number
  phone: string | null
  country: string | null
  city: string | null
  date_of_birth: string | null
  bio: string | null
  education_level: string | null
  field_of_study: string | null
  university: string | null
  student_id_number?: string | null
  gpa?: string | number | null
  skills: number[]
  interests: number[]
  experience: string | null
  internship_type: string
  work_type: string
  compensation_preference: string
  minimum_compensation: string | number | null
  maximum_compensation: string | number | null
  compensation_currency: string
  preferred_locations: string[]
  willing_to_relocate: boolean
  preferred_industries: string[]
  preferred_roles: string[]
  internship_duration_min_weeks: number | null
  internship_duration_max_weeks: number | null
  availability_start: string | null
  availability_end: string | null
  cv: string | null
  resume: string | null
  cv_data: CVData
  completion: ProfileCompletion
  created_at: string
  updated_at: string
}

/** GET/PATCH /api/students/me/ — personal info + education (StudentMeSerializer). */
export interface StudentMeData {
  id: number
  phone: string | null
  country: string | null
  city: string | null
  date_of_birth: string | null
  bio: string | null
  education_level: string | null
  current_year: string | null
  field_of_study: string | null
  university: string | null
  student_id_number?: string | null
  gpa?: string | number | null
  completion: ProfileCompletion
  created_at: string
  updated_at: string
}

export type StudentMeInput = Partial<Omit<StudentMeData, 'id' | 'completion' | 'created_at' | 'updated_at'>>

/** GET/PATCH /api/students/me/preferences/ (StudentPreferencesSerializer). */
export interface StudentPreferences {
  country: string | null
  city: string | null
  work_mode: string
  internship_type: string
  availability_start: string | null
  availability_end: string | null
  availability_immediately: boolean
}

export type StudentPreferencesInput = Partial<StudentPreferences>

/** POST /api/students/me/resume/ response. */
export interface ResumeUploadResult {
  cv_id: number
  processing_status: string
  resume_url: string
  message: string
}

/** GET /api/students/me/resume/ — resume status. */
export interface ResumeStatus {
  has_resume: boolean
  resume_url: string | null
  cv_id: number | null
  processing_status: string | null
  processing_error: string | null
}

/** GET /api/students/cv/status/ (and by-id) — CV processing status + extracted data. */
export interface CVStatus {
  cv_id: number
  processing_status: string
  processing_error: string | null
  processed_at: string | null
  message: string
  extracted_skills: string[]
  extracted_education: Array<Record<string, unknown>>
  extracted_experience: Array<Record<string, unknown>>
  extracted_projects: Array<Record<string, unknown>>
  extracted_certifications: Array<{
    name?: string
    issuer?: string
    date?: string
  }>
  extracted_languages: Array<{
    name?: string
    proficiency?: string
  }>
}

// -----------------------------------------------------------------------
// Full profile
// -----------------------------------------------------------------------

export async function getStudentProfile(): Promise<StudentProfile> {
  const response = await api.get<StudentProfile>('/students/')
  return response.data
}

// -----------------------------------------------------------------------
// Personal info + education  — GET/PATCH /api/students/me/
// -----------------------------------------------------------------------

export async function getStudentMe(): Promise<StudentMeData> {
  const response = await api.get<StudentMeData>('/students/me/')
  return response.data
}

export async function updateStudentMe(data: StudentMeInput): Promise<StudentMeData> {
  const response = await api.patch<StudentMeData>('/students/me/', data)
  return response.data
}

// -----------------------------------------------------------------------
// Preferences  — GET/PATCH /api/students/me/preferences/
// -----------------------------------------------------------------------

export async function getStudentPreferences(): Promise<StudentPreferences> {
  const response = await api.get<StudentPreferences>('/students/me/preferences/')
  return response.data
}

export async function updateStudentPreferences(
  data: StudentPreferencesInput
): Promise<StudentPreferences> {
  const response = await api.patch<StudentPreferences>('/students/me/preferences/', data)
  return response.data
}

// -----------------------------------------------------------------------
// Skills  — GET/POST/DELETE /api/students/me/skills/, catalogue choices
// -----------------------------------------------------------------------

export async function getStudentSkills(): Promise<Skill[]> {
  const response = await api.get<Skill[]>('/students/me/skills/')
  return response.data
}

export async function addStudentSkill(skill: number | string): Promise<Skill> {
  const payload = typeof skill === 'number' ? { skill_id: skill } : { name: skill }
  const response = await api.post<Skill>('/students/me/skills/', payload)
  return response.data
}

export async function removeStudentSkill(skillId: number): Promise<void> {
  await api.delete('/students/me/skills/', { data: { skill_id: skillId } })
}

/** Read-only Task 1.3 Skill catalogue (GET /api/students/skills/choices/). */
export async function getSkillChoices(): Promise<Skill[]> {
  const response = await api.get<Skill[]>('/students/skills/choices/')
  return response.data
}

// -----------------------------------------------------------------------
// Interests  — GET/POST/DELETE /api/students/me/interests/, catalogue choices
// -----------------------------------------------------------------------

export async function getStudentInterests(): Promise<CareerInterest[]> {
  const response = await api.get<CareerInterest[]>('/students/me/interests/')
  return response.data
}

export async function addStudentInterest(interest: number | string): Promise<CareerInterest> {
  const payload = typeof interest === 'number' ? { interest_id: interest } : { name: interest }
  const response = await api.post<CareerInterest>('/students/me/interests/', payload)
  return response.data
}

export async function removeStudentInterest(interestId: number): Promise<void> {
  await api.delete('/students/me/interests/', { data: { interest_id: interestId } })
}

/** Read-only Task 1.3 CareerInterest catalogue (GET /api/students/interests/choices/). */
export async function getInterestChoices(): Promise<CareerInterest[]> {
  const response = await api.get<CareerInterest[]>('/students/interests/choices/')
  return response.data
}

// -----------------------------------------------------------------------
// Resume / CV  — POST /api/students/me/resume/, GET resume status,
//                GET /api/students/cv/status/ (polling)
// -----------------------------------------------------------------------

export async function uploadResume(file: File): Promise<ResumeUploadResult> {
  const formData = new FormData()
  formData.append('file', file)
  const response = await api.post<ResumeUploadResult>('/students/me/resume/', formData)
  return response.data
}

export async function getResumeStatus(): Promise<ResumeStatus> {
  const response = await api.get<ResumeStatus>('/students/me/resume/')
  return response.data
}

export async function getCVStatus(): Promise<CVStatus> {
  const response = await api.get<CVStatus>('/students/cv/status/')
  return response.data
}