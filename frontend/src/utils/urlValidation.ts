export interface ApplicationUrlValidationResult {
  isValid: boolean
  error: string | null
}

const DUMMY_DOMAINS = [
  'example.com',
  'example.org',
  'example.net',
  'placeholder.com',
  'test.com',
  'localhost',
  '127.0.0.1',
]

export function isPlaceholderUrl(url?: string | null): boolean {
  if (!url) return true
  const trimmed = url.trim()
  if (!trimmed) return true
  try {
    const parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
    return DUMMY_DOMAINS.some(domain => parsed.hostname.toLowerCase() === domain || parsed.hostname.toLowerCase().endsWith('.' + domain))
  } catch {
    return true
  }
}

/**
 * Normalizes an external application URL to ensure it has a valid protocol
 * (defaulting to https://) and trimmed whitespace.
 */
export function normalizeApplicationUrl(url?: string | null): string | null {
  if (!url) return null
  const trimmed = url.trim()
  if (!trimmed) return null

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  // Prepend https:// if protocol is missing
  return `https://${trimmed}`
}

/**
 * Validates an internship's application URL before redirection.
 * Enforces reachability, syntax, and flagging checks.
 */
export function validateApplicationUrl(internship?: {
  application_url?: string | null
  is_flagged?: boolean
  is_expired?: boolean
  status?: string
  url_validation?: {
    application_url_valid?: boolean
    status?: string
    [key: string]: any
  } | null
}): ApplicationUrlValidationResult {
  if (!internship) {
    return {
      isValid: false,
      error: 'Internship details are unavailable.',
    }
  }

  const rawUrl = internship.application_url?.trim()

  if (!rawUrl) {
    return {
      isValid: false,
      error: 'Application URL is missing for this internship.',
    }
  }

  // Check for dummy / placeholder domains (e.g., example.com)
  if (isPlaceholderUrl(rawUrl)) {
    return {
      isValid: false,
      error: 'External employer link is unavailable (placeholder link). Please apply directly on platform.',
    }
  }

  // Check for explicitly unsupported protocols
  if (/^[a-zA-Z0-9+.-]+:/.test(rawUrl) && !/^https?:\/\//i.test(rawUrl)) {
    return {
      isValid: false,
      error: 'Application URL is malformed or uses an unsupported protocol.',
    }
  }

  // Syntax check
  try {
    const urlToParse = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`
    const parsed = new URL(urlToParse)
    if (!parsed.hostname || !parsed.hostname.includes('.')) {
      return {
        isValid: false,
        error: 'Application URL is invalid or malformed.',
      }
    }
  } catch {
    return {
      isValid: false,
      error: 'Application URL is invalid or malformed.',
    }
  }

  // Flagged listing check (Task 5.9 / Task 8.2)
  if (internship.is_flagged) {
    return {
      isValid: false,
      error: 'This listing has been flagged for a broken or unreachable application link.',
    }
  }

  // Background URL validation results check - only fail if confirmed dead (404/410)
  const appCheck = internship.url_validation?.application_url
  if (
    internship.url_validation &&
    (internship.url_validation.application_url_valid === false ||
      (appCheck && appCheck.valid === false && (appCheck.status_code === 404 || appCheck.status_code === 410 || appCheck.error?.includes('404'))))
  ) {
    return {
      isValid: false,
      error: 'The employer application link is unreachable or dead.',
    }
  }

  // Expired listing check
  if (internship.is_expired || internship.status === 'expired') {
    return {
      isValid: false,
      error: 'The application deadline for this internship has passed.',
    }
  }

  return {
    isValid: true,
    error: null,
  }
}

