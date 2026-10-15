import { toMarathiDigits } from './marathiDigits'

/** Joins class names, dropping falsy values. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

// ---------------------------------------------------------------------------
// Time and date, always rendered in the HOSPITAL's timezone
// ---------------------------------------------------------------------------
//
// A patient's phone may be set to any timezone, and the TV may be anywhere.
// Every timestamp the user sees is therefore formatted against the hospital's
// configured zone rather than the device's, so all screens agree on what time
// it is and which day's queue is on display.

const MARATHI_MONTHS = [
  'जानेवारी',
  'फेब्रुवारी',
  'मार्च',
  'एप्रिल',
  'मे',
  'जून',
  'जुलै',
  'ऑगस्ट',
  'सप्टेंबर',
  'ऑक्टोबर',
  'नोव्हेंबर',
  'डिसेंबर',
]

const MARATHI_WEEKDAYS = [
  'रविवार',
  'सोमवार',
  'मंगळवार',
  'बुधवार',
  'गुरुवार',
  'शुक्रवार',
  'शनिवार',
]

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

/** The timezone used when the configured one is unusable. */
export const DEFAULT_TIME_ZONE = 'Asia/Kolkata'

/**
 * Memoised check that `timeZone` is an IANA zone this runtime understands.
 *
 * `Intl` throws a RangeError for anything it does not recognise, and the value
 * arrives from a free-text field in Settings. The cache keeps the check off the
 * hot path — `resolveTimeZone` runs once per row of the dashboard table.
 */
const KNOWN_TIME_ZONES = new Map<string, boolean>()

export function isValidTimeZone(timeZone: string): boolean {
  const cached = KNOWN_TIME_ZONES.get(timeZone)
  if (cached !== undefined) return cached

  let valid: boolean
  try {
    // Construction alone is enough to throw, but formatting proves the zone is
    // genuinely usable rather than merely parseable.
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0)
    valid = true
  } catch {
    valid = false
  }

  KNOWN_TIME_ZONES.set(timeZone, valid)
  return valid
}

/**
 * The timezone to actually format with: the configured one when it is usable,
 * the default otherwise.
 *
 * A single mistyped character in Settings would otherwise make `Intl` throw on
 * every screen that shows a date — reception, the dashboard and the TV at once —
 * because the error happens during render. A clock that is briefly wrong is a
 * far smaller failure than a clinic that cannot see its own queue, so degrade to
 * the default here and let the settings form report the mistake where it can
 * still be corrected.
 */
export function resolveTimeZone(timeZone: string | null | undefined): string {
  const candidate = (timeZone ?? '').trim()
  return isValidTimeZone(candidate) ? candidate : DEFAULT_TIME_ZONE
}

export interface DateParts {
  day: number
  monthIndex: number
  year: number
  weekdayIndex: number
}

/**
 * Splits an instant into hospital-local calendar parts.
 *
 * The output is language-neutral — day, month index, year, weekday index — so
 * every locale can render it with its own month and weekday names.
 */
export function dateParts(date: Date, timeZone: string): DateParts | null {
  if (Number.isNaN(date.getTime())) return null

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: resolveTimeZone(timeZone),
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).formatToParts(date)

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? ''

  const weekday = get('weekday')
  return {
    day: Number(get('day')),
    monthIndex: Number(get('month')) - 1,
    year: Number(get('year')),
    weekdayIndex: WEEKDAY_INDEX[weekday] ?? 0,
  }
}

/** `१०:२४` */
export function formatTime(iso: string | Date, timeZone: string): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(date.getTime())) return ''
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: resolveTimeZone(timeZone),
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
  return toMarathiDigits(formatted, 0)
}

/** `६ ऑक्टोबर २०२६` — the Marathi rendering; other locales build their own. */
export function formatDate(iso: string | Date, timeZone: string): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso
  const parts = dateParts(date, timeZone)
  if (!parts) return ''
  return `${toMarathiDigits(parts.day, 0)} ${MARATHI_MONTHS[parts.monthIndex]} ${toMarathiDigits(
    parts.year,
    0,
  )}`
}

/** `सोमवार, ६ ऑक्टोबर २०२६` — Marathi; used in the dashboard and TV headers. */
export function formatDateWithWeekday(iso: string | Date, timeZone: string): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso
  const parts = dateParts(date, timeZone)
  if (!parts) return ''
  return `${MARATHI_WEEKDAYS[parts.weekdayIndex]}, ${toMarathiDigits(parts.day, 0)} ${
    MARATHI_MONTHS[parts.monthIndex]
  } ${toMarathiDigits(parts.year, 0)}`
}

/**
 * Today's date as `YYYY-MM-DD` in the given timezone.
 *
 * `en-CA` is used because it formats as an ISO-style date, which is exactly the
 * shape `queue_date` takes in Postgres.
 */
export function todayInTimeZone(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: resolveTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/**
 * Trims and collapses internal whitespace so that " संदीप   जाधव " and
 * "संदीप जाधव" are stored identically and read identically on the dashboard.
 */
export function normaliseName(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/** Sleeps for the given milliseconds. Used for retry backoff. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Deterministic, non-cryptographic id for demo mode and React keys. */
export function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
