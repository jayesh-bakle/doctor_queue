import { describe, expect, it } from 'vitest'

import { ERROR_MESSAGES } from '../src/lib/errors'
import {
  formatMobileForDisplay,
  isValidMobile,
  MAX_NAME_LENGTH,
  normaliseMobile,
  validateRegistration,
} from '../src/lib/validation'

describe('normaliseMobile', () => {
  it('accepts the bare ten-digit number', () => {
    expect(normaliseMobile('9876543210')).toBe('9876543210')
  })

  it('strips the spaces a patient naturally types', () => {
    expect(normaliseMobile('98765 43210')).toBe('9876543210')
  })

  it('strips the country code and the leading trunk zero', () => {
    expect(normaliseMobile('+91 9876543210')).toBe('9876543210')
    expect(normaliseMobile('+919876543210')).toBe('9876543210')
    expect(normaliseMobile('09876543210')).toBe('9876543210')
    expect(normaliseMobile('91 9876543210')).toBe('9876543210')
  })

  it('strips dashes, which is how it is often written on paper', () => {
    expect(normaliseMobile('98765-43210')).toBe('9876543210')
  })

  it('understands a number typed in Devanagari numerals', () => {
    // A phone with a Marathi keyboard produces these.
    expect(normaliseMobile('९८७६५ ४३२१०')).toBe('9876543210')
  })

  it('returns null for an empty field, because mobile is optional', () => {
    expect(normaliseMobile('')).toBeNull()
    expect(normaliseMobile('   ')).toBeNull()
  })

  it('keeps a partial number rather than pretending the field was left blank', () => {
    // "+91" on its own is not a number the clinic can ring. Collapsing it to
    // null here would make it indistinguishable from an empty field, and the
    // registration would be accepted with what the patient typed thrown away.
    expect(normaliseMobile('+91')).toBe('91')
    expect(isValidMobile('91')).toBe(false)
  })
})

describe('isValidMobile', () => {
  it('accepts Indian mobiles, which start with 6 to 9', () => {
    expect(isValidMobile('9876543210')).toBe(true)
    expect(isValidMobile('6123456789')).toBe(true)
  })

  it('rejects a landline, a short number and a number starting with 0-5', () => {
    expect(isValidMobile('1234567890')).toBe(false)
    expect(isValidMobile('98765')).toBe(false)
    expect(isValidMobile('0201234567')).toBe(false)
    expect(isValidMobile('98765432100')).toBe(false)
  })
})

describe('formatMobileForDisplay', () => {
  it('groups a stored number the way it is read aloud', () => {
    expect(formatMobileForDisplay('9876543210')).toBe('98765 43210')
  })

  it('returns an empty string when there is no number', () => {
    expect(formatMobileForDisplay(null)).toBe('')
  })
})

describe('validateRegistration', () => {
  const valid = {
    patientName: 'संदीप जाधव',
    mobile: '9876543210',
    doctorId: '22222222-2222-2222-2222-222222222222',
    patientType: 'NEW' as const,
  }

  it('accepts a complete registration', () => {
    const result = validateRegistration(valid)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual({})
  })

  it('accepts a registration with no mobile, which is optional', () => {
    const result = validateRegistration({ ...valid, mobile: '' })
    expect(result.valid).toBe(true)
    expect(result.normalised.mobile).toBeNull()
  })

  it('requires a name and says so in Marathi', () => {
    const result = validateRegistration({ ...valid, patientName: '   ' })
    expect(result.valid).toBe(false)
    expect(result.errors.patientName).toBe(ERROR_MESSAGES.NAME_REQUIRED)
    expect(result.errors.patientName).toBe('कृपया रुग्णाचे नाव भरा.')
  })

  it('requires a doctor and says so in Marathi', () => {
    const result = validateRegistration({ ...valid, doctorId: '' })
    expect(result.valid).toBe(false)
    expect(result.errors.doctorId).toBe('कृपया डॉक्टर निवडा.')
  })

  it('rejects a malformed mobile number', () => {
    const result = validateRegistration({ ...valid, mobile: '12345' })
    expect(result.valid).toBe(false)
    expect(result.errors.mobile).toBe(ERROR_MESSAGES.INVALID_MOBILE)
  })

  it('rejects a mobile field containing no digits at all', () => {
    // Stripping "nonsense" leaves nothing, which must not read as "left blank".
    const result = validateRegistration({ ...valid, mobile: 'nonsense' })
    expect(result.valid).toBe(false)
    expect(result.errors.mobile).toBe(ERROR_MESSAGES.INVALID_MOBILE)
  })

  it('rejects a name longer than the column allows', () => {
    const result = validateRegistration({ ...valid, patientName: 'क'.repeat(MAX_NAME_LENGTH + 1) })
    expect(result.valid).toBe(false)
    expect(result.errors.patientName).toBe(ERROR_MESSAGES.NAME_TOO_LONG)
  })

  it('reports every problem at once, so the patient fixes them in one pass', () => {
    const result = validateRegistration({
      patientName: '',
      mobile: 'nonsense',
      doctorId: '',
      patientType: 'NEW',
    })
    expect(result.valid).toBe(false)
    expect(Object.keys(result.errors).sort()).toEqual(['doctorId', 'mobile', 'patientName'])
  })

  it('collapses stray whitespace so the same person is never stored twice', () => {
    const result = validateRegistration({ ...valid, patientName: '  संदीप   जाधव  ' })
    expect(result.normalised.patientName).toBe('संदीप जाधव')
  })

  it('normalises the mobile before returning it, not after', () => {
    const result = validateRegistration({ ...valid, mobile: '+91 98765 43210' })
    expect(result.valid).toBe(true)
    expect(result.normalised.mobile).toBe('9876543210')
  })

  it('passes the patient type through unchanged', () => {
    expect(validateRegistration({ ...valid, patientType: 'FOLLOWUP' }).normalised.patientType).toBe(
      'FOLLOWUP',
    )
  })

  it('returns the cleaned values even when validation failed', () => {
    // The form shows the normalised name back to the patient for correction.
    const result = validateRegistration({ ...valid, doctorId: '', patientName: ' संदीप   जाधव ' })
    expect(result.valid).toBe(false)
    expect(result.normalised.patientName).toBe('संदीप जाधव')
  })
})
