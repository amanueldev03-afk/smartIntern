/**
 * QR Code utilities for SmartIntern-ET
 * Ensures scannable data URI format and provides payload parsing.
 */

export function ensureBase64DataUri(rawQr: string | null | undefined): string {
  if (!rawQr) return ''
  const trimmed = rawQr.trim()
  if (!trimmed) return ''

  // If already starts with data:image/png;base64, return it
  if (trimmed.startsWith('data:image/')) {
    return trimmed
  }

  // If prefixed with redundant or partial data: schemas, normalize
  if (trimmed.startsWith('data:')) {
    const commaIndex = trimmed.indexOf(',')
    if (commaIndex !== -1) {
      const b64 = trimmed.substring(commaIndex + 1)
      return `data:image/png;base64,${b64}`
    }
  }

  return `data:image/png;base64,${trimmed}`
}

export interface ParsedDeanQrPayload {
  doc_type?: string
  institution?: string
  dean_title?: string
  dean_id?: string
  dean_email?: string
  dean_department?: string
  student_id?: string
  student_name?: string
  department?: string
  academic_year?: number | string
  gpa?: string
  allowed_services?: {
    dormitory?: boolean
    cafeteria?: boolean
    internship?: boolean
  }
  valid_from?: string
  valid_until?: string
  dean_notes?: string
  signature_hash?: string
  verified_at?: string
  security_seal?: string
  [key: string]: any
}

export function parseQrData(payload: string | null | undefined): ParsedDeanQrPayload | null {
  if (!payload) return null
  try {
    return JSON.parse(payload) as ParsedDeanQrPayload
  } catch {
    return null
  }
}
