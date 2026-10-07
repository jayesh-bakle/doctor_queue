import { describe, expect, it, vi } from 'vitest'

import {
  AppError,
  ERROR_MESSAGES,
  extractErrorCode,
  logTechnicalError,
  toMarathiError,
} from '../src/lib/errors'

/**
 * Spec §21: the patient must never see a raw database error, and the developers
 * must not lose it either. Both halves are asserted here.
 */
describe('toMarathiError', () => {
  it('renders an AppError as its Marathi sentence', () => {
    expect(toMarathiError(new AppError('DOCTOR_REQUIRED'))).toBe('कृपया डॉक्टर निवडा.')
    expect(toMarathiError(new AppError('NAME_REQUIRED'))).toBe('कृपया रुग्णाचे नाव भरा.')
  })

  it('recognises a code that arrived as a plain string', () => {
    expect(toMarathiError('DOCTOR_INACTIVE')).toBe(ERROR_MESSAGES.DOCTOR_INACTIVE)
  })

  it('recognises a code buried in the way PostgREST wraps an error', () => {
    // PostgREST reports a raised exception as `message` on the error object.
    expect(toMarathiError({ message: 'DOCTOR_NOT_FOUND' })).toBe(ERROR_MESSAGES.DOCTOR_NOT_FOUND)
    expect(toMarathiError({ message: 'DOCTOR_NOT_FOUND: no such doctor' })).toBe(
      ERROR_MESSAGES.DOCTOR_NOT_FOUND,
    )
  })

  it('never leaks a raw Postgres error to the patient', () => {
    const raw = {
      message:
        'duplicate key value violates unique constraint "queue_entries_unique_token"',
      code: '23505',
      details: 'Key (doctor_id, queue_date, token_number)=(…) already exists.',
    }
    const shown = toMarathiError(raw)
    expect(shown).toBe(ERROR_MESSAGES.UNKNOWN)
    expect(shown).not.toMatch(/constraint|duplicate|postgres|23505/i)
  })

  it('never leaks a stack trace', () => {
    const shown = toMarathiError(new TypeError('Cannot read properties of undefined'))
    expect(shown).toBe(ERROR_MESSAGES.UNKNOWN)
    expect(shown).not.toContain('TypeError')
  })

  it('reports an unreachable server rather than blaming the patient', () => {
    expect(toMarathiError(new TypeError('Failed to fetch'))).toBe(ERROR_MESSAGES.NETWORK)
    expect(toMarathiError(new Error('fetch failed'))).toBe(ERROR_MESSAGES.NETWORK)
  })

  it('falls back to a generic Marathi sentence for anything unrecognised', () => {
    expect(toMarathiError(null)).toBe(ERROR_MESSAGES.UNKNOWN)
    expect(toMarathiError(undefined)).toBe(ERROR_MESSAGES.UNKNOWN)
    expect(toMarathiError(42)).toBe(ERROR_MESSAGES.UNKNOWN)
  })

  it('always returns non-empty Marathi text, whatever it is handed', () => {
    for (const input of [null, undefined, 0, '', {}, [], new Error('boom'), 'who knows']) {
      const shown = toMarathiError(input)
      expect(typeof shown).toBe('string')
      expect(shown.length).toBeGreaterThan(0)
      // Devanagari range — the message is Marathi, not English fallback text.
      expect(shown).toMatch(/[ऀ-ॿ]/)
    }
  })
})

describe('extractErrorCode', () => {
  it('reads the code off an AppError', () => {
    expect(extractErrorCode(new AppError('TOKEN_NOT_FOUND'))).toBe('TOKEN_NOT_FOUND')
  })

  it('returns null when there is no code to find', () => {
    expect(extractErrorCode(new Error('something else'))).toBeNull()
    expect(extractErrorCode(null)).toBeNull()
  })
})

describe('AppError', () => {
  it('carries the Marathi message as its message, so it can be rendered directly', () => {
    const error = new AppError('INVALID_CREDENTIALS')
    expect(error.message).toBe('ईमेल किंवा पासवर्ड चुकीचा आहे.')
    expect(error.code).toBe('INVALID_CREDENTIALS')
    expect(error.name).toBe('AppError')
  })

  it('is a real Error, so it survives being thrown and caught', () => {
    expect(new AppError('QUEUE_EMPTY')).toBeInstanceOf(Error)
  })

  it('keeps the underlying cause for developers', () => {
    const cause = new Error('connection reset')
    expect(new AppError('NETWORK', { cause }).cause).toBe(cause)
  })
})

describe('logTechnicalError', () => {
  it('writes the technical detail to the console, where a developer can find it', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const cause = new Error('relation "queue_entries" does not exist')

    logTechnicalError('RegisterPage — registerPatient', cause)

    expect(spy).toHaveBeenCalledOnce()
    expect(spy.mock.calls[0]?.[0]).toContain('RegisterPage')
    expect(spy.mock.calls[0]?.[1]).toBe(cause)
    spy.mockRestore()
  })
})

describe('the Marathi message catalogue', () => {
  it('covers every error the app can raise, in Marathi', () => {
    for (const [code, message] of Object.entries(ERROR_MESSAGES)) {
      expect(message, `${code} has no Marathi message`).toMatch(/[ऀ-ॿ]/)
    }
  })

  it('uses the exact wording the spec asks for', () => {
    expect(ERROR_MESSAGES.DOCTOR_REQUIRED).toBe('कृपया डॉक्टर निवडा.')
    expect(ERROR_MESSAGES.NAME_REQUIRED).toBe('कृपया रुग्णाचे नाव भरा.')
    expect(ERROR_MESSAGES.UNKNOWN).toBe('काहीतरी तांत्रिक अडचण आली आहे. कृपया पुन्हा प्रयत्न करा.')
    expect(ERROR_MESSAGES.DOCTOR_NOT_FOUND).toBe(
      'सध्या रांग उपलब्ध नाही. कृपया रिसेप्शनशी संपर्क साधा.',
    )
  })
})
