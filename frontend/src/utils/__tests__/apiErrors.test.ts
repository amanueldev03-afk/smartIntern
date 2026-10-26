import { describe, it, expect } from 'vitest'
import type { AxiosError } from 'axios'
import {
  mapApiErrors,
  firstFieldError,
  flattenApiErrors,
  hasApiErrors,
  toMessageList,
} from '../apiErrors'

function apiError(data: unknown): AxiosError {
  return { response: { data } } as unknown as AxiosError
}

const networkError = new Error('Network Error') as unknown as AxiosError

describe('mapApiErrors', () => {
  it('maps per-field DRF validation errors', () => {
    const mapped = mapApiErrors(
      apiError({
        field_of_study: ['"foo" is not a valid choice.'],
        university: ['This field is required.'],
      })
    )
    expect(mapped.fieldErrors['field_of_study']).toEqual(['"foo" is not a valid choice.'])
    expect(mapped.fieldErrors['university']).toEqual(['This field is required.'])
    expect(mapped.nonFieldErrors).toEqual([])
  })

  it('collects detail into global errors', () => {
    const mapped = mapApiErrors(
      apiError({ detail: 'A resume file is required. Send it as form-data with key file.' })
    )
    expect(mapped.nonFieldErrors).toEqual([
      'A resume file is required. Send it as form-data with key file.',
    ])
  })

  it('collects non_field_errors into global errors', () => {
    const mapped = mapApiErrors(apiError({ non_field_errors: ['Objects do not match.'] }))
    expect(mapped.nonFieldErrors).toEqual(['Objects do not match.'])
  })

  it('treats a string response body as a global error', () => {
    const mapped = mapApiErrors(apiError('Rate limit exceeded.'))
    expect(mapped.nonFieldErrors).toEqual(['Rate limit exceeded.'])
  })

  it('falls back to a network message when there is no response', () => {
    const mapped = mapApiErrors(networkError)
    expect(mapped.nonFieldErrors).toEqual(['Network error. Please try again.'])
  })

  it('handles mixed field and global errors in one payload', () => {
    const mapped = mapApiErrors(
      apiError({
        availability_end: ['availability_end cannot be before availability_start.'],
        non_field_errors: ['Objects do not match.'],
      })
    )
    expect(firstFieldError(mapped, 'availability_end')).toBe(
      'availability_end cannot be before availability_start.'
    )
    expect(mapped.nonFieldErrors).toEqual(['Objects do not match.'])
    expect(hasApiErrors(mapped)).toBe(true)
    expect(flattenApiErrors(mapped)).toEqual([
      'Objects do not match.',
      'availability_end cannot be before availability_start.',
    ])
  })

  it('returns no errors for an empty payload', () => {
    const mapped = mapApiErrors(apiError({}))
    expect(hasApiErrors(mapped)).toBe(false)
  })
})

describe('toMessageList', () => {
  it('normalizes arrays, strings, objects, and scalars', () => {
    expect(toMessageList('simple')).toEqual(['simple'])
    expect(toMessageList(['a', 'b'])).toEqual(['a', 'b'])
    expect(toMessageList({ key: 'x' })).toEqual(['{"key":"x"}'])
    expect(toMessageList(42)).toEqual(['42'])
  })
})