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

export interface MarathiDateParts {
  day: number
  monthIndex: number
  year: number
  weekdayIndex: number
}

/** Splits an instant into hospital-local calendar parts. */
export function marathiDateParts(date: Date, timeZone: string): MarathiDateParts | null {
  if (Number.isNaN(date.getTime())) return null

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
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
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
  return toMarathiDigits(formatted, 0)
}

/** `६ ऑक्टोबर २०२६` */
export function formatDate(iso: string | Date, timeZone: string): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso
  const parts = marathiDateParts(date, timeZone)
  if (!parts) return ''
  return `${toMarathiDigits(parts.day, 0)} ${MARATHI_MONTHS[parts.monthIndex]} ${toMarathiDigits(
    parts.year,
    0,
  )}`
}

/** `सोमवार, ६ ऑक्टोबर २०२६` — used in the dashboard and TV headers. */
export function formatDateWithWeekday(iso: string | Date, timeZone: string): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso
  const parts = marathiDateParts(date, timeZone)
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
    timeZone,
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
