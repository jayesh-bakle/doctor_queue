import { describe, expect, it } from 'vitest'

import {
  formatToken,
  mapDigitsToGujarati,
  minutesLabel,
  patientCountLabel,
  toEnglishDigits,
  toGujaratiDigits,
  toGujaratiNumber,
  TOKEN_WIDTH,
} from '../src/lib/gujaratiDigits'

/**
 * The Gujarati twin of `marathiDigits.test.ts`. Gujarati numerals use their own
 * digit set (U+0AE6–U+0AEF), zero-padded to three digits like every other locale.
 */
describe('toGujaratiDigits', () => {
  it('pads numbers to three digits, as the spec requires', () => {
    expect(toGujaratiDigits(1)).toBe('૦૦૧')
    expect(toGujaratiDigits(27)).toBe('૦૨૭')
    expect(toGujaratiDigits(100)).toBe('૧૦૦')
  })

  it('does not truncate a number wider than the padding', () => {
    expect(toGujaratiDigits(1000)).toBe('૧૦૦૦')
  })

  it('converts every digit, not just the first', () => {
    expect(toGujaratiDigits(9)).toBe('૦૦૯')
    expect(toGujaratiDigits(10)).toBe('૦૧૦')
    expect(toGujaratiDigits(99)).toBe('૦૯૯')
    expect(toGujaratiDigits(999)).toBe('૯૯૯')
  })

  it('handles zero', () => {
    expect(toGujaratiDigits(0)).toBe('૦૦૦')
  })

  it('accepts a numeric string and pads it the same way', () => {
    expect(toGujaratiDigits('27')).toBe('૦૨૭')
    expect(toGujaratiDigits('7')).toBe('૦૦૭')
  })

  it('honours an explicit width of zero', () => {
    expect(toGujaratiDigits(27, 0)).toBe('૨૭')
    expect(toGujaratiDigits(5, 5)).toBe('૦૦૦૦૫')
  })

  it('leaves separators alone, so a clock time is not padded', () => {
    // The bug this guards against: '10:24' becoming '૦૧૦:૨૪'.
    expect(toGujaratiDigits('10:24')).toBe('૧૦:૨૪')
    expect(toGujaratiDigits('10:24')).not.toContain('૦૧૦')
  })

  it('returns an empty string for blank and non-finite input', () => {
    expect(toGujaratiDigits('')).toBe('')
    expect(toGujaratiDigits('   ')).toBe('')
    expect(toGujaratiDigits(Number.NaN)).toBe('')
    expect(toGujaratiDigits(Number.POSITIVE_INFINITY)).toBe('')
  })

  it('truncates a fractional number rather than rendering a decimal point', () => {
    expect(toGujaratiDigits(27.9)).toBe('૦૨૭')
  })

  it('keeps a minus sign in front of a negative number', () => {
    expect(toGujaratiDigits(-5)).toBe('-૦૦૫')
  })
})

describe('toGujaratiNumber', () => {
  it('does not pad, because a count of "૦૨૭" reads as nonsense', () => {
    expect(toGujaratiNumber(27)).toBe('૨૭')
    expect(toGujaratiNumber(0)).toBe('૦')
    expect(toGujaratiNumber(1)).toBe('૧')
  })
})

describe('digit mapping both ways', () => {
  it('maps ASCII to Gujarati', () => {
    expect(mapDigitsToGujarati('0123456789')).toBe('૦૧૨૩૪૫૬૭૮૯')
  })

  it('maps Gujarati back to ASCII, so a typed mobile can be parsed', () => {
    expect(toEnglishDigits('૯૮૭૬૫૪૩૨૧૦')).toBe('9876543210')
    expect(toEnglishDigits('૦૨૭')).toBe('027')
  })

  it('is reversible', () => {
    expect(toEnglishDigits(mapDigitsToGujarati('2026-10-06'))).toBe('2026-10-06')
  })

  it('leaves non-digits untouched', () => {
    expect(mapDigitsToGujarati('રૂમ ૧')).toBe('રૂમ ૧')
    expect(toEnglishDigits('ડૉ. અમોલ')).toBe('ડૉ. અમોલ')
  })
})

describe('token formatting', () => {
  it('formats the token exactly as the TV and the phone show it', () => {
    expect(formatToken(1)).toBe('૦૦૧')
    expect(formatToken(27)).toBe('૦૨૭')
    expect(formatToken(100)).toBe('૧૦૦')
  })

  it('uses a three-digit token width', () => {
    expect(TOKEN_WIDTH).toBe(3)
  })
})

describe('patient-facing quantity labels', () => {
  it('uses the singular form for one patient and the plural for more', () => {
    expect(patientCountLabel(1)).toBe('૧ દર્દી')
    expect(patientCountLabel(3)).toBe('૩ દર્દીઓ')
    expect(patientCountLabel(12)).toBe('૧૨ દર્દીઓ')
  })

  it('says "થોડી ક્ષણો" instead of "૦ મિનિટ"', () => {
    expect(minutesLabel(0)).toBe('થોડી ક્ષણો')
    expect(minutesLabel(30)).toBe('૩૦ મિનિટ')
    expect(minutesLabel(45.4)).toBe('૪૫ મિનિટ')
  })

  it('never shows a negative duration', () => {
    expect(minutesLabel(-10)).toBe('થોડી ક્ષણો')
  })
})
