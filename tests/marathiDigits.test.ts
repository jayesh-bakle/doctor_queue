import { describe, expect, it } from 'vitest'

import {
  formatToken,
  mapDigitsToMarathi,
  minutesLabel,
  patientCountLabel,
  toEnglishDigits,
  toMarathiDigits,
  toMarathiNumber,
  tokenLabel,
  TOKEN_WIDTH,
} from '../src/lib/marathiDigits'

/**
 * The single most visible contract in the app: what number the patient sees.
 * Spec §8 — Marathi numerals, zero-padded to three digits.
 */
describe('toMarathiDigits', () => {
  it('pads numbers to three digits, as the spec requires', () => {
    expect(toMarathiDigits(1)).toBe('००१')
    expect(toMarathiDigits(27)).toBe('०२७')
    expect(toMarathiDigits(100)).toBe('१००')
  })

  it('does not truncate a number wider than the padding', () => {
    expect(toMarathiDigits(1000)).toBe('१०००')
  })

  it('converts every digit, not just the first', () => {
    expect(toMarathiDigits(9)).toBe('००९')
    expect(toMarathiDigits(10)).toBe('०१०')
    expect(toMarathiDigits(99)).toBe('०९९')
    expect(toMarathiDigits(999)).toBe('९९९')
  })

  it('handles zero', () => {
    expect(toMarathiDigits(0)).toBe('०००')
  })

  it('accepts a numeric string and pads it the same way', () => {
    expect(toMarathiDigits('27')).toBe('०२७')
    expect(toMarathiDigits('7')).toBe('००७')
  })

  it('honours an explicit width of zero', () => {
    expect(toMarathiDigits(27, 0)).toBe('२७')
    expect(toMarathiDigits(5, 5)).toBe('००००५')
  })

  it('leaves separators alone, so a clock time is not padded', () => {
    // The bug this guards against: '10:24' becoming '०१०:२४'.
    expect(toMarathiDigits('10:24')).toBe('१०:२४')
    expect(toMarathiDigits('10:24')).not.toContain('०१०')
  })

  it('returns an empty string for blank and non-finite input', () => {
    expect(toMarathiDigits('')).toBe('')
    expect(toMarathiDigits('   ')).toBe('')
    expect(toMarathiDigits(Number.NaN)).toBe('')
    expect(toMarathiDigits(Number.POSITIVE_INFINITY)).toBe('')
  })

  it('truncates a fractional number rather than rendering a decimal point', () => {
    expect(toMarathiDigits(27.9)).toBe('०२७')
  })

  it('keeps a minus sign in front of a negative number', () => {
    expect(toMarathiDigits(-5)).toBe('-००५')
  })
})

describe('toMarathiNumber', () => {
  it('does not pad, because a count of "०२७" reads as nonsense', () => {
    expect(toMarathiNumber(27)).toBe('२७')
    expect(toMarathiNumber(0)).toBe('०')
    expect(toMarathiNumber(1)).toBe('१')
  })
})

describe('digit mapping both ways', () => {
  it('maps ASCII to Devanagari', () => {
    expect(mapDigitsToMarathi('0123456789')).toBe('०१२३४५६७८९')
  })

  it('maps Devanagari back to ASCII, so a typed mobile can be parsed', () => {
    expect(toEnglishDigits('९८७६५४३२१०')).toBe('9876543210')
    expect(toEnglishDigits('०२७')).toBe('027')
  })

  it('is reversible', () => {
    expect(toEnglishDigits(mapDigitsToMarathi('2026-10-06'))).toBe('2026-10-06')
  })

  it('leaves non-digits untouched', () => {
    expect(mapDigitsToMarathi('कक्ष १')).toBe('कक्ष १')
    expect(toEnglishDigits('डॉ. अमोल')).toBe('डॉ. अमोल')
  })
})

describe('token formatting', () => {
  it('formats the token exactly as the TV and the phone show it', () => {
    expect(formatToken(1)).toBe('००१')
    expect(formatToken(27)).toBe('०२७')
    expect(formatToken(100)).toBe('१००')
  })

  it('labels the token as reception announces it', () => {
    expect(tokenLabel(27)).toBe('टोकन क्र. ०२७')
  })

  it('uses a three-digit token width', () => {
    expect(TOKEN_WIDTH).toBe(3)
  })
})

describe('patient-facing quantity labels', () => {
  it('uses the singular form for one patient and the plural for more', () => {
    expect(patientCountLabel(1)).toBe('१ रुग्ण')
    expect(patientCountLabel(3)).toBe('३ रुग्णे')
    expect(patientCountLabel(12)).toBe('१२ रुग्णे')
  })

  it('says "काही क्षण" instead of "० मिनिटे"', () => {
    expect(minutesLabel(0)).toBe('काही क्षण')
    expect(minutesLabel(30)).toBe('३० मिनिटे')
    expect(minutesLabel(45.4)).toBe('४५ मिनिटे')
  })

  it('never shows a negative duration', () => {
    expect(minutesLabel(-10)).toBe('काही क्षण')
  })
})
