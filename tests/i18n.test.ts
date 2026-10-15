import { describe, expect, it } from 'vitest'

import { ERROR_CODES } from '../src/lib/errors'
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_LABELS,
  LANGUAGES,
  REGISTRY,
  getMessages,
  isLanguage,
  loadStoredLanguage,
  saveStoredLanguage,
} from '../src/lib/i18n'
import type { Language, Messages } from '../src/lib/i18n'
import type { QueueStatus } from '../src/types/database'
import { demoStorage, installBrowserEnv } from './helpers/browserEnv'

const STATUSES: QueueStatus[] = ['WAITING', 'CALLED', 'IN_CONSULTATION', 'COMPLETED', 'SKIPPED']

const everyLanguage = LANGUAGES.map((language) => [language, getMessages(language)] as const)

const mr = getMessages('mr')
const hi = getMessages('hi')
const en = getMessages('en')

/**
 * The tests that justify the locale-module design.
 *
 * A flat key → string table would pass a "has this key" check and still produce
 * the wrong sentence, because Marathi and Hindi inflect the noun where English
 * does not. These assertions are about the *output*, per language, which is the
 * only thing a patient ever sees.
 */
describe('numerals follow the language', () => {
  it('writes a Marathi token in Devanagari, padded to three digits', () => {
    expect(mr.token(27)).toBe('०२७')
    expect(mr.token(5)).toBe('००५')
  })

  it('writes a Hindi token in Devanagari too', () => {
    // Hindi and Marathi share the Devanagari digit set; only the words differ.
    expect(hi.token(27)).toBe('०२७')
    expect(hi.token(5)).toBe('००५')
  })

  it('writes an English token in Western digits', () => {
    expect(en.token(27)).toBe('027')
    expect(en.token(5)).toBe('005')
  })

  it('pads counts differently from tokens, in every language', () => {
    // A count is not a token: "१२ रुग्ण" must never print as "०१२ रुग्ण".
    expect(mr.count(12)).toBe('१२')
    expect(hi.count(12)).toBe('१२')
    expect(en.count(12)).toBe('12')
  })

  it('never pads digits embedded in a longer string', () => {
    // The bug this guards: a naive `padStart` turns a clock time into nonsense.
    expect(mr.digits('10:24')).toBe('१०:२४')
    expect(hi.digits('10:24')).toBe('१०:२४')
    expect(en.digits('10:24')).toBe('10:24')
    for (const [language, messages] of everyLanguage) {
      expect(messages.digits('10:24'), language).toContain(':')
    }
  })

  it('renders a room number without padding, in every language', () => {
    expect(mr.roomShort('1')).toBe('कक्ष क्र. १')
    expect(hi.roomShort('1')).toBe('कक्ष क्र. १')
    expect(en.roomShort('1')).toBe('Room 1')
  })
})

describe('quantities inflect correctly', () => {
  it('changes the Marathi noun between one and many', () => {
    // This is the assertion a `"{{count}} patients"` template could never pass.
    expect(mr.patientCount(1)).toBe('१ रुग्ण')
    expect(mr.patientCount(3)).toBe('३ रुग्णे')
  })

  it('changes the English noun between one and many', () => {
    expect(en.patientCount(1)).toBe('1 patient')
    expect(en.patientCount(3)).toBe('3 patients')
  })

  it('uses the Hindi noun, which does not change with the count', () => {
    expect(hi.patientCount(1)).toBe('१ मरीज़')
    expect(hi.patientCount(3)).toBe('३ मरीज़')
  })

  it('distinguishes one from many in all three languages', () => {
    for (const [language, messages] of everyLanguage) {
      expect(messages.patientCount(1), `${language} singular`).not.toBe(messages.patientCount(3))
    }
  })

  it('renders minutes as a duration, not a bare number, in every language', () => {
    expect(mr.minutes(30)).toBe('३० मिनिटे')
    expect(en.minutes(30)).toBe('30 minutes')
    for (const [language, messages] of everyLanguage) {
      const text = messages.minutes(30)
      expect(text, `${language} minutes`).toMatch(/3|३/)
      expect(text.length, `${language} minutes`).toBeGreaterThan(2)
    }
  })
})

describe('describeSituation', () => {
  const base = { tokenNumber: 7, patientsAhead: 3, currentToken: 5, roomNumber: '1' }

  it('answers every status with a headline and a detail, in every language', () => {
    for (const [language, messages] of everyLanguage) {
      for (const status of STATUSES) {
        const situation = messages.describeSituation({ ...base, status })
        expect(situation.headline, `${language}.${status}.headline`).not.toBe('')
        expect(situation.detail, `${language}.${status}.detail`).not.toBe('')
        expect(['waiting', 'soon', 'now', 'done', 'attention']).toContain(situation.tone)
      }
    }
  })

  it('never leaves a patient without an answer for the awkward counts', () => {
    // 0 and 2 are the branch boundaries, and the two most likely to be missed.
    for (const [language, messages] of everyLanguage) {
      for (const patientsAhead of [0, 1, 2, 3, 9]) {
        const situation = messages.describeSituation({
          ...base,
          status: 'WAITING',
          patientsAhead,
        })
        expect(situation.headline, `${language} @ ${patientsAhead}`).not.toBe('')
      }
    }
  })

  it('marks the urgent cases urgent and the finished ones not, in every language', () => {
    for (const [language, messages] of everyLanguage) {
      expect(messages.describeSituation({ ...base, status: 'CALLED' }).urgent, language).toBe(true)
      expect(
        messages.describeSituation({ ...base, status: 'COMPLETED', patientsAhead: 0 }).urgent,
        language,
      ).toBe(false)
    }
  })

  it('phrases the same situation differently per language', () => {
    const called = (messages: Messages) =>
      messages.describeSituation({ ...base, status: 'CALLED' })
    expect(new Set([called(mr).headline, called(hi).headline, called(en).headline]).size).toBe(3)
  })
})

describe('dates and calendar words', () => {
  it('has twelve months starting at January, in every language', () => {
    for (const [language, messages] of everyLanguage) {
      expect(messages.months, language).toHaveLength(12)
      messages.months.forEach((month) => expect(month, language).not.toBe(''))
    }
    expect(en.months[0]).toBe('January')
    expect(mr.months[0]).toBe('जानेवारी')
    expect(hi.months[0]).toBe('जनवरी')
  })

  it('has seven weekdays starting at Sunday, in every language', () => {
    for (const [language, messages] of everyLanguage) {
      expect(messages.weekdays, language).toHaveLength(7)
      messages.weekdays.forEach((day) => expect(day, language).not.toBe(''))
    }
    expect(en.weekdays[0]).toBe('Sunday')
    expect(mr.weekdays[0]).toBe('रविवार')
    expect(hi.weekdays[0]).toBe('रविवार')
  })

  it('formats a date with the language own digits and month name', () => {
    // 2026-10-07T06:00Z is the 7th of October in Asia/Kolkata (UTC+5:30).
    const iso = '2026-10-07T06:00:00Z'
    expect(mr.date(iso, 'Asia/Kolkata')).toBe('७ ऑक्टोबर २०२६')
    expect(en.date(iso, 'Asia/Kolkata')).toBe('7 October 2026')
    expect(hi.date(iso, 'Asia/Kolkata')).toBe('७ अक्टूबर २०२६')
  })

  it('formats a clock time in the hospital timezone, not the device own', () => {
    const iso = '2026-10-07T06:00:00Z'
    expect(en.time(iso, 'Asia/Kolkata')).toBe('11:30')
    expect(mr.time(iso, 'Asia/Kolkata')).toBe('११:३०')
    expect(hi.time(iso, 'Asia/Kolkata')).toBe('११:३०')
  })

  it('survives a timezone the browser cannot parse', () => {
    for (const [language, messages] of everyLanguage) {
      expect(() => messages.date('2026-10-07T06:00:00Z', 'Not/AZone'), language).not.toThrow()
      expect(() => messages.time('2026-10-07T06:00:00Z', 'Not/AZone'), language).not.toThrow()
    }
  })

  it('returns empty text rather than Invalid Date for nonsense input', () => {
    for (const [language, messages] of everyLanguage) {
      expect(messages.date('not-a-date', 'Asia/Kolkata'), language).toBe('')
      expect(messages.time('not-a-date', 'Asia/Kolkata'), language).toBe('')
    }
  })
})

describe('the announcement', () => {
  it('speaks the token and the room in the chosen language', () => {
    expect(mr.announcement(27, '1')).toBe(
      'टोकन क्रमांक ०२७, कृपया तपासणी कक्ष क्रमांक १ मध्ये या.',
    )
    expect(en.announcement(27, '1')).toBe('Token number 027, please come to room 1.')
    expect(hi.announcement(27, '1')).toContain('०२७')
    expect(hi.announcement(27, '1')).toContain('१')
  })

  it('differs between languages, so a wrong-language voice is detectable', () => {
    expect(new Set([mr.announcement(27, '1'), hi.announcement(27, '1'), en.announcement(27, '1')]).size).toBe(3)
  })
})

describe('the registry', () => {
  it('is the safety net: every language supplies every message', () => {
    // A missing key would not compile. An empty string would, so it is checked
    // here instead.
    for (const [language, messages] of everyLanguage) {
      expect(messages.name, language).not.toBe('')
      expect(Object.keys(messages.errors), language).toHaveLength(ERROR_CODES.length)
      for (const [code, sentence] of Object.entries(messages.errors)) {
        expect(sentence, `${language}.errors.${code}`).not.toBe('')
      }
      for (const status of STATUSES) {
        expect(messages.status[status], `${language}.status.${status}`).not.toBe('')
      }
      expect(messages.patientType.NEW, language).not.toBe('')
      expect(messages.patientType.FOLLOWUP, language).not.toBe('')
    }
  })

  it('reaches every language by code', () => {
    for (const language of LANGUAGES) {
      expect(REGISTRY[language]).toBe(getMessages(language))
    }
  })

  it('falls back to Marathi rather than handing back undefined', () => {
    // The type system cannot protect a value that came out of localStorage.
    expect(getMessages('kl' as unknown as Language)).toBe(getMessages(DEFAULT_LANGUAGE))
  })
})

describe('the switcher labels', () => {
  it('names each language in its own script, so it is readable when switched to', () => {
    expect(LANGUAGE_LABELS.mr).toBe('मराठी')
    expect(LANGUAGE_LABELS.hi).toBe('हिंदी')
    expect(LANGUAGE_LABELS.en).toBe('English')
  })

  it('covers exactly the languages in the registry', () => {
    expect(Object.keys(LANGUAGE_LABELS).sort()).toEqual(Object.keys(REGISTRY).sort())
  })
})

describe('isLanguage', () => {
  it('accepts the three languages and nothing else', () => {
    expect(isLanguage('mr')).toBe(true)
    expect(isLanguage('hi')).toBe(true)
    expect(isLanguage('en')).toBe(true)
    expect(isLanguage('fr')).toBe(false)
    expect(isLanguage(null)).toBe(false)
    expect(isLanguage(undefined)).toBe(false)
    expect(isLanguage(42)).toBe(false)
  })
})

describe('the stored preference', () => {
  it('defaults to Marathi when nothing has been chosen', () => {
    installBrowserEnv()
    expect(loadStoredLanguage()).toBe('mr')
    expect(DEFAULT_LANGUAGE).toBe('mr')
  })

  it('remembers a choice across a reload', () => {
    installBrowserEnv()
    saveStoredLanguage('en')
    expect(demoStorage().getItem('queue.language')).toBe('en')
    expect(loadStoredLanguage()).toBe('en')
  })

  it('ignores a stored value this build does not have', () => {
    installBrowserEnv()
    demoStorage().setItem('queue.language', 'kl')
    expect(loadStoredLanguage()).toBe('mr')
  })

  it('does not throw when storage is unavailable', () => {
    // Private browsing with storage disabled: the switch still works for this
    // page view, it just will not be remembered.
    const refuse = (): never => {
      throw new Error('storage disabled')
    }
    Object.defineProperty(globalThis, 'localStorage', {
      value: { getItem: refuse, setItem: refuse },
      configurable: true,
      writable: true,
    })
    try {
      expect(loadStoredLanguage()).toBe('mr')
      expect(() => saveStoredLanguage('en')).not.toThrow()
    } finally {
      installBrowserEnv()
    }
  })
})

describe('UiMessages completeness', () => {
  it('has no empty string anywhere in any language', () => {
    const walk = (value: unknown, path: string): void => {
      if (typeof value === 'string') {
        expect(value, path).not.toBe('')
        return
      }
      if (typeof value === 'function') return
      if (Array.isArray(value)) {
        expect(value.length, path).toBeGreaterThan(0)
        value.forEach((item, index) => walk(item, `${path}[${index}]`))
        return
      }
      if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`)
      }
    }

    for (const [language, messages] of everyLanguage) {
      walk(messages.ui, `${language}.ui`)
      walk(messages.errors, `${language}.errors`)
      walk(messages.status, `${language}.status`)
      walk(messages.patientType, `${language}.patientType`)
      walk(messages.months, `${language}.months`)
      walk(messages.weekdays, `${language}.weekdays`)
    }
  })

  it('numbers the QR poster steps in each language own digits', () => {
    expect(mr.ui.qr.steps[0]).toMatch(/^१/)
    expect(hi.ui.qr.steps[0]).toMatch(/^१/)
    expect(en.ui.qr.steps[0]).toMatch(/^1/)
    for (const [language, messages] of everyLanguage) {
      expect(messages.ui.qr.steps, language).toHaveLength(4)
    }
  })

  it('titles the QR poster with text, not a layout fragment', () => {
    // The original had a hardcoded `<br />`; the catalogue holds one string and
    // lets it wrap, so no locale may smuggle markup in.
    for (const [language, messages] of everyLanguage) {
      expect(messages.ui.qr.posterHeading, language).not.toMatch(/<|>/)
    }
  })
})
