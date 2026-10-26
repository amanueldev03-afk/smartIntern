/**
 * Utility functions for role-based dashboard routing and role labeling.
 */

export function getDashboardPathForRole(role?: string | null): string {
  const r = (role || '').toLowerCase().trim()
  switch (r) {
    case 'admin':
      return '/admin/dashboard'
    case 'advisor':
      return '/advisor/dashboard'
    case 'company_hr':
    case 'employer':
      return '/company/dashboard'
    case 'company_mentor':
    case 'mentor':
      return '/mentor/dashboard'
    case 'dept_dean':
    case 'dean':
      return '/dean/dashboard'
    case 'uil_officer':
    case 'uil':
      return '/uil/dashboard'
    case 'student_union':
    case 'union':
      return '/union/dashboard'
    case 'dorm_admin':
    case 'dorm':
      return '/dorm/dashboard'
    case 'finance_officer':
    case 'finance':
      return '/dean/dashboard'
    case 'student':
    default:
      return '/dashboard'
  }
}

export function getRoleBadgeLabel(role?: string | null): string {
  const r = (role || '').toLowerCase().trim()
  switch (r) {
    case 'admin':
      return 'System Administrator'
    case 'advisor':
      return 'Academic Advisor'
    case 'company_hr':
    case 'employer':
      return 'Company HR'
    case 'company_mentor':
    case 'mentor':
      return 'Company Mentor'
    case 'dept_dean':
    case 'dean':
      return 'Department Dean'
    case 'uil_officer':
    case 'uil':
      return 'UIL Head Officer'
    case 'student_union':
    case 'union':
      return 'Student Union'
    case 'dorm_admin':
    case 'dorm':
      return 'Dormitory Admin'
    case 'finance_officer':
    case 'finance':
      return 'Finance Officer'
    case 'student':
    default:
      return 'Student Intern'
  }
}
