import { describe, expect, it } from 'vitest'

import {
  DEFAULT_TIME_ZONE,
  formatDate,
  formatDateWithWeekday,
  formatTime,
  isValidTimeZone,
  resolveTimeZone,
  todayInTimeZone,
} from '../src/lib/utils'

/**
 * The hospital timezone is typed by hand in Settings and then decides when the
 * daily queue resets and how every timestamp on every screen is rendered.
 *
 * The regression these guard against is not a wrong clock: `Intl` throws a
 * RangeError for a zone it does not recognise, and it does so *during render*.
 * A single typo therefore took down reception, the dashboard and the TV at once,
 * behind the error boundary.
 */
describe('isValidTimeZone', () => {
  it('accepts canonical IANA zones', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true)
    expect(isValidTimeZone('UTC')).toBe(true)
    expect(isValidTimeZone('America/New_York')).toBe(true)
    expect(isValidTimeZone('Asia/Calcutta')).toBe(true)
  })

  it('accepts the legacy aliases the runtime genuinely understands', () => {
    // Deliberately not restricted to canonical names. ICU resolves 'IST' to
    // Asia/Calcutta and formats with it correctly, so treating it as invalid
    // would reject a setting that works — the check must answer "can this
    // runtime use it?", not "is this the preferred spelling?".
    //
    // Offset forms such as '+05:30' are intentionally not asserted on: whether a
    // JS engine supports them depends on its ICU version (Node only gained them
    // in v23). That variability is the reason this function asks the runtime
    // instead of pattern-matching a list of names.
    expect(isValidTimeZone('IST')).toBe(true)
    expect(isValidTimeZone('asia/kolkata')).toBe(true)
    expect(isValidTimeZone('Etc/GMT-5')).toBe(true)
  })

  it('rejects what a typed typo or a misremembered name produces', () => {
    for (const bad of [
      '',
      '  ',
      'Kolkata',
      'Asia/Kolkatta',
      'India Standard Time',
      'asia kolkata',
      'GMT+5:30',
      'India',
      'Pune',
      'Asia',
      'asdfghjkl',
    ]) {
      expect(isValidTimeZone(bad), `${JSON.stringify(bad)} should be rejected`).toBe(false)
    }
  })
})

describe('resolveTimeZone', () => {
  it('keeps a usable zone as written', () => {
    expect(resolveTimeZone('Asia/Kolkata')).toBe('Asia/Kolkata')
    expect(resolveTimeZone('IST')).toBe('IST')
  })

  it('falls back to the default instead of returning something Intl will reject', () => {
    expect(resolveTimeZone('Asia/Kolkatta')).toBe(DEFAULT_TIME_ZONE)
    expect(resolveTimeZone('India Standard Time')).toBe(DEFAULT_TIME_ZONE)
    expect(resolveTimeZone('')).toBe(DEFAULT_TIME_ZONE)
    expect(resolveTimeZone('   ')).toBe(DEFAULT_TIME_ZONE)
    expect(resolveTimeZone(null)).toBe(DEFAULT_TIME_ZONE)
    expect(resolveTimeZone(undefined)).toBe(DEFAULT_TIME_ZONE)
  })
})

describe('formatting with an unusable timezone', () => {
  const when = new Date('2026-10-07T04:30:00Z')

  // These are the calls that run during render across the patient pages, the
  // dashboard, the queue table and the TV display.
  it('degrades to the default rather than throwing', () => {
    expect(() => todayInTimeZone('Asia/Kolkatta')).not.toThrow()
    expect(() => formatTime(when, 'Asia/Kolkatta')).not.toThrow()
    expect(() => formatDate(when, 'Asia/Kolkatta')).not.toThrow()
    expect(() => formatDateWithWeekday(when, 'Asia/Kolkatta')).not.toThrow()
  })

  it('still produces a usable date and time', () => {
    expect(todayInTimeZone('Asia/Kolkatta')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // The fallback is Asia/Kolkata, so this is 10:00 rather than a blank.
    expect(formatTime(when, 'Asia/Kolkatta')).toBe('१०:००')
  })
})

describe('formatting with a valid timezone', () => {
  it('renders the hospital-local calendar date', () => {
    // 20:00 UTC on 6 October is already 01:30 on 7 October in Kolkata, and the
    // queue rolls over on the hospital's clock, not the device's.
    const when = new Date('2026-10-06T20:00:00Z')

    expect(todayInTimeZone('Asia/Kolkata')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(formatDate(when, 'Asia/Kolkata')).toBe('७ ऑक्टोबर २०२६')
    expect(formatDateWithWeekday(when, 'Asia/Kolkata')).toBe('बुधवार, ७ ऑक्टोबर २०२६')
    expect(formatTime(when, 'Asia/Kolkata')).toBe('०१:३०')
  })
})
