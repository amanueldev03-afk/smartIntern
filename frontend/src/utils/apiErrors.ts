import type { AxiosError } from 'axios'

/**
 * DRF error mapping — Phase 7 Task 7.2.
 *
 * Django REST Framework returns validation errors as a JSON object keyed by
 * field, e.g.:
 *
 *   {
 *     "first_name":        ["This field is required."],
 *     "availability_end":  ["availability_end cannot be before availability_start."],
 *     "non_field_errors":  ["..."],
 *     "detail":            "A resume file is required..."
 *   }
 *
 * This module normalizes any AxiosError into a structure the forms can bind
 * to individual inputs (exact DRF messages) plus a list of global messages.
 */

export interface MappedApiErrors {
  /** Field key → exact DRF message list (message[0] is shown under the input). */
  fieldErrors: Record<string, string[]>
  /** Global messages: `detail`, `non_field_errors`, network failures. */
  nonFieldErrors: string[]
}

export function isErrorObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function toMessageList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) =>
      typeof item === 'string' ? item : JSON.stringify(item)
    )
  }
  if (typeof value === 'string') {
    return [value]
  }
  if (isErrorObject(value)) {
    return [JSON.stringify(value)]
  }
  return [String(value)]
}

export function mapApiErrors(error: unknown): MappedApiErrors {
  const fieldErrors: Record<string, string[]> = {}
  const nonFieldErrors: string[] = []

  const data = (error as AxiosError | undefined)?.response?.data

  if (typeof data === 'string') {
    nonFieldErrors.push(data)
    return { fieldErrors, nonFieldErrors }
  }

  if (isErrorObject(data)) {
    for (const [key, value] of Object.entries(data)) {
      if (key === 'detail' || key === 'non_field_errors') {
        nonFieldErrors.push(...toMessageList(value))
      } else {
        fieldErrors[key] = toMessageList(value)
      }
    }
    return { fieldErrors, nonFieldErrors }
  }

  nonFieldErrors.push('Network error. Please try again.')
  return { fieldErrors, nonFieldErrors }
}

/** First error message for a field, or undefined. */
export function firstFieldError(
  mapped: MappedApiErrors | null | undefined,
  field: string
): string | undefined {
  if (!mapped) return undefined
  const messages = mapped.fieldErrors[field]
  return messages && messages.length > 0 ? messages[0] : undefined
}

/** All messages (global + field) flattened — for an error summary banner. */
export function flattenApiErrors(mapped: MappedApiErrors): string[] {
  const fieldMessages = Object.values(mapped.fieldErrors).flat()
  return [...mapped.nonFieldErrors, ...fieldMessages]
}

export function hasApiErrors(mapped: MappedApiErrors): boolean {
  return (
    mapped.nonFieldErrors.length > 0 ||
    Object.keys(mapped.fieldErrors).length > 0
  )
}