// UI presentation only — canonical backend choice codes are always submitted.
// Mirrors the fixed choice lists in apps/students/models.py (StudentProfile)
// and the StudentPreferencesSerializer (work_mode/internship_type).

export const EDUCATION_LEVEL_LABELS: Record<string, string> = {
  high_school: 'High School',
  diploma: 'Diploma',
  bachelor: 'Bachelor',
  master: 'Master',
  phd: 'PhD',
  other: 'Other',
}

export const CURRENT_YEAR_LABELS: Record<string, string> = {
  first_year: 'First Year',
  second_year: 'Second Year',
  third_year: 'Third Year',
  fourth_year: 'Fourth Year',
  final_year: 'Final Year',
  graduate: 'Graduate',
  other: 'Other',
}

export const FIELD_OF_STUDY_LABELS: Record<string, string> = {
  computer_science: 'Computer Science',
  software_engineering: 'Software Engineering',
  data_science: 'Data Science',
  artificial_intelligence: 'Artificial Intelligence',
  information_technology: 'Information Technology',
  information_systems: 'Information Systems',
  computer_engineering: 'Computer Engineering',
  electrical_engineering: 'Electrical Engineering',
  mechanical_engineering: 'Mechanical Engineering',
  civil_engineering: 'Civil Engineering',
  mathematics: 'Mathematics',
  statistics: 'Statistics',
  physics: 'Physics',
  business_administration: 'Business Administration',
  economics: 'Economics',
  finance: 'Finance',
  accounting: 'Accounting',
  marketing: 'Marketing',
  management: 'Management',
  health_sciences: 'Health Sciences',
  biology: 'Biology',
  chemistry: 'Chemistry',
  law: 'Law',
  design: 'Design',
  communications: 'Communications',
  other: 'Other',
}

export const WORK_MODE_LABELS: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  either: 'Either',
}

export const INTERNSHIP_TYPE_LABELS: Record<string, string> = {
  remote: 'Remote',
  onsite: 'On-site',
  hybrid: 'Hybrid',
  any: 'Any',
}

export const COMPENSATION_LABELS: Record<string, string> = {
  paid: 'Paid',
  unpaid: 'Unpaid',
  either: 'Either',
}

export function labelFor(
  labels: Record<string, string>,
  code: string | null | undefined
): string {
  if (!code) return ''
  return labels[code] ?? code
}

export function choiceOptions(labels: Record<string, string>): Array<{
  value: string
  label: string
}> {
  return Object.entries(labels).map(([value, label]) => ({ value, label }))
}