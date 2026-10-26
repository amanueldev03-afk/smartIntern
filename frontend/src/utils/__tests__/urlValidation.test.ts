import { describe, it, expect } from 'vitest'
import { validateApplicationUrl } from '../urlValidation'

describe('validateApplicationUrl', () => {
  it('returns valid for well-formed https URL on active listing', () => {
    const result = validateApplicationUrl({
      application_url: 'https://careers.google.com/jobs/results/12345',
      status: 'active',
      is_flagged: false,
      is_expired: false,
    })
    expect(result.isValid).toBe(true)
    expect(result.error).toBeNull()
  })

  it('returns error when application_url is missing or empty', () => {
    const result = validateApplicationUrl({
      application_url: '',
      status: 'active',
    })
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('missing')
  })

  it('returns error when application_url is malformed', () => {
    const result = validateApplicationUrl({
      application_url: 'not-a-valid-url',
      status: 'active',
    })
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('invalid or malformed')
  })

  it('returns error when application_url uses unsupported protocol', () => {
    const result = validateApplicationUrl({
      application_url: 'javascript:alert(1)',
      status: 'active',
    })
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('unsupported protocol')
  })

  it('returns error when listing is flagged for admin review', () => {
    const result = validateApplicationUrl({
      application_url: 'https://careers.example.com/job/1',
      is_flagged: true,
      status: 'active',
    })
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('flagged')
  })

  it('returns error when background validation marked application_url as dead/unreachable', () => {
    const result = validateApplicationUrl({
      application_url: 'https://careers.example.com/job/1',
      url_validation: { application_url_valid: false, status: 'dead' },
      status: 'active',
    })
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('unreachable or dead')
  })

  it('returns error when listing is expired', () => {
    const result = validateApplicationUrl({
      application_url: 'https://careers.example.com/job/1',
      is_expired: true,
      status: 'expired',
    })
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('deadline')
  })
})
