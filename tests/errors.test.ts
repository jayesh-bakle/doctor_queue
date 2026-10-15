import { describe, expect, it, vi } from 'vitest'

import {
  AppError,
  ERROR_CODES,
  extractErrorCode,
  isKnownErrorCode,
  logTechnicalError,
  toAppError,
  toUserErrorCode,
  toUserMessage,
} from '../src/lib/errors'
import { DEFAULT_LANGUAGE, LANGUAGES, getMessages } from '../src/lib/i18n'
import { mr } from '../src/lib/i18n/mr'

const marathi = getMessages('mr')

/**
 * Spec §21: the patient must never see a raw database error, and the developers
 * must not lose it either. Both halves are asserted here.
 *
 * The message text no longer lives in this module — it lives in the locale
 * modules — so these tests pass `getMessages('mr')` in explicitly. That is the
 * point of the split: the same failure renders as Marathi, Hindi or English
 * depending on what the caller hands over, and the code is what stays stable.
 */
describe('toUserMessage', () => {
  it('renders an AppError as its Marathi sentence', () => {
    expect(toUserMessage(new AppError('DOCTOR_REQUIRED'), marathi)).toBe('कृपया डॉक्टर निवडा.')
    expect(toUserMessage(new AppError('NAME_REQUIRED'), marathi)).toBe('कृपया रुग्णाचे नाव भरा.')
  })

  it('recognises a code that arrived as a plain string', () => {
    expect(toUserMessage('DOCTOR_INACTIVE', marathi)).toBe(marathi.errors.DOCTOR_INACTIVE)
  })

  it('recognises a code buried in the way PostgREST wraps an error', () => {
    // PostgREST reports a raised exception as `message` on the error object.
    expect(toUserMessage({ message: 'DOCTOR_NOT_FOUND' }, marathi)).toBe(
      marathi.errors.DOCTOR_NOT_FOUND,
    )
    expect(toUserMessage({ message: 'DOCTOR_NOT_FOUND: no such doctor' }, marathi)).toBe(
      marathi.errors.DOCTOR_NOT_FOUND,
    )
  })

  it('never leaks a raw Postgres error to the patient', () => {
    const raw = {
      message:
        'duplicate key value violates unique constraint "queue_entries_unique_token"',
      code: '23505',
      details: 'Key (doctor_id, queue_date, token_number)=(…) already exists.',
    }
    const shown = toUserMessage(raw, marathi)
    expect(shown).toBe(marathi.errors.UNKNOWN)
    expect(shown).not.toMatch(/constraint|duplicate|postgres|23505/i)
  })

  it('never leaks a stack trace', () => {
    const shown = toUserMessage(new TypeError('Cannot read properties of undefined'), marathi)
    expect(shown).toBe(marathi.errors.UNKNOWN)
    expect(shown).not.toContain('TypeError')
  })

  it('reports an unreachable server rather than blaming the patient', () => {
    expect(toUserMessage(new TypeError('Failed to fetch'), marathi)).toBe(marathi.errors.NETWORK)
    expect(toUserMessage(new Error('fetch failed'), marathi)).toBe(marathi.errors.NETWORK)
  })

  it('falls back to a generic sentence for anything unrecognised', () => {
    expect(toUserMessage(null, marathi)).toBe(marathi.errors.UNKNOWN)
    expect(toUserMessage(undefined, marathi)).toBe(marathi.errors.UNKNOWN)
    expect(toUserMessage(42, marathi)).toBe(marathi.errors.UNKNOWN)
  })

  it('always returns non-empty text, whatever it is handed', () => {
    for (const input of [null, undefined, 0, '', {}, [], new Error('boom'), 'who knows']) {
      const shown = toUserMessage(input, marathi)
      expect(typeof shown).toBe('string')
      expect(shown.length).toBeGreaterThan(0)
      // Devanagari range — the message is Marathi, not English fallback text.
      expect(shown).toMatch(/[ऀ-ॿ]/)
    }
  })

  it('phrases the same failure differently per language', () => {
    const english = getMessages('en')
    expect(toUserMessage(new AppError('DOCTOR_REQUIRED'), english)).toBe(english.errors.DOCTOR_REQUIRED)
    expect(toUserMessage(new AppError('DOCTOR_REQUIRED'), english)).not.toBe(
      marathi.errors.DOCTOR_REQUIRED,
    )
  })
})

describe('toUserErrorCode', () => {
  it('narrows every failure to a code the catalogue can phrase', () => {
    expect(toUserErrorCode(new AppError('TOKEN_NOT_FOUND'))).toBe('TOKEN_NOT_FOUND')
    expect(toUserErrorCode({ message: 'DOCTOR_INACTIVE: gone' })).toBe('DOCTOR_INACTIVE')
    expect(toUserErrorCode(new TypeError('Failed to fetch'))).toBe('NETWORK')
    expect(toUserErrorCode(new Error('boom'))).toBe('UNKNOWN')
  })

  it('returns a code every locale has a sentence for', () => {
    for (const language of LANGUAGES) {
      const messages = getMessages(language)
      expect(messages.errors[toUserErrorCode(new Error('boom'))].length).toBeGreaterThan(0)
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

describe('isKnownErrorCode', () => {
  it('accepts every code in the catalogue and rejects anything else', () => {
    for (const code of ERROR_CODES) {
      expect(isKnownErrorCode(code)).toBe(true)
    }
    expect(isKnownErrorCode('NOT_A_CODE')).toBe(false)
    expect(isKnownErrorCode(null)).toBe(false)
  })
})

describe('AppError', () => {
  it('carries the machine code as its message, not display text', () => {
    // Display text depends on the reader's language, which this layer does not
    // know. `toUserMessage` is what turns a code into a sentence.
    const error = new AppError('INVALID_CREDENTIALS')
    expect(error.message).toBe('INVALID_CREDENTIALS')
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

describe('toAppError', () => {
  it('keeps a recognised code and falls back to UNKNOWN otherwise', () => {
    expect(toAppError(new AppError('DOCTOR_NOT_FOUND')).code).toBe('DOCTOR_NOT_FOUND')
    expect(toAppError(new Error('mystery')).code).toBe('UNKNOWN')
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
    for (const code of ERROR_CODES) {
      expect(mr.errors[code], `${code} has no Marathi message`).toMatch(/[ऀ-ॿ]/)
    }
  })

  it('uses the exact wording the spec asks for', () => {
    expect(mr.errors.DOCTOR_REQUIRED).toBe('कृपया डॉक्टर निवडा.')
    expect(mr.errors.NAME_REQUIRED).toBe('कृपया रुग्णाचे नाव भरा.')
    expect(mr.errors.UNKNOWN).toBe('काहीतरी तांत्रिक अडचण आली आहे. कृपया पुन्हा प्रयत्न करा.')
    expect(mr.errors.DOCTOR_NOT_FOUND).toBe('सध्या रांग उपलब्ध नाही. कृपया रिसेप्शनशी संपर्क साधा.')
  })

  it('has no error code left un-phrased in any language', () => {
    for (const language of LANGUAGES) {
      const messages = getMessages(language)
      for (const code of ERROR_CODES) {
        expect(messages.errors[code], `${language}.${code} is empty`).not.toBe('')
      }
    }
  })
})

describe('the default language', () => {
  it('is Marathi, the language the clinic runs on', () => {
    expect(DEFAULT_LANGUAGE).toBe('mr')
  })
})
