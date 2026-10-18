/**
 * Pure row shaping for the Google Sheets export.
 *
 * Deliberately free of Deno, Supabase and Google APIs so it can be unit-tested
 * with Vitest in `tests/sheetRows.test.ts`. The edge function does the talking;
 * this file only decides what a row looks like.
 */

export type ExportStatus =
  | 'WAITING'
  | 'CALLED'
  | 'IN_CONSULTATION'
  | 'COMPLETED'
  | 'SKIPPED'

export type ExportPatientType = 'NEW' | 'FOLLOWUP'

/** One queue entry, already joined to its doctor. */
export interface ExportEntry {
  id: string
  /** The queue day, 'YYYY-MM-DD', resolved in the hospital's timezone. */
  queueDate: string
  tokenNumber: number
  doctorName: string
  doctorDisplayOrder: number
  department: string
  roomNumber: string
  patientName: string
  mobile: string | null
  patientType: ExportPatientType
  status: ExportStatus
  createdAt: string
  calledAt: string | null
  completedAt: string | null
}

export const SHEET_HEADER = [
  'Date',
  'Token',
  'Doctor',
  'Department',
  'Room',
  'Patient',
  'Mobile',
  'Type',
  'Status',
  'Registered',
  'Called',
  'Completed',
] as const

const timeFormatters = new Map<string, Intl.DateTimeFormat>()

function timeFormatter(timeZone: string): Intl.DateTimeFormat {
  const existing = timeFormatters.get(timeZone)
  if (existing) return existing

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    // h23 avoids the "24:00" some locales produce at midnight, which would
    // read as a different day to a person scanning the Sheet.
    hourCycle: 'h23',
  })
  timeFormatters.set(timeZone, formatter)
  return formatter
}

/** `23:54` in the given timezone, or an empty cell for a null timestamp. */
export function formatTime(iso: string | null, timeZone: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return timeFormatter(timeZone).format(date)
}

/** The calendar date in a timezone, as 'YYYY-MM-DD'. */
export function formatDateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const get = (type: string): string =>
    parts.find((part) => part.type === type)?.value ?? ''

  return `${get('year')}-${get('month')}-${get('day')}`
}

/**
 * The last `days` dates in the hospital's timezone, today first.
 *
 * Used by the nightly reconcile, which rewrites a window of days rather than a
 * single one so that a missed run repairs itself the following night.
 */
export function recentDates(
  timeZone: string,
  days: number,
  now: Date = new Date(),
): string[] {
  const today = formatDateInTimeZone(now, timeZone)
  const [year, month, day] = today.split('-').map(Number)
  const midnightUtc = Date.UTC(year, month - 1, day)

  const result: string[] = []
  for (let offset = 0; offset < Math.max(1, Math.floor(days)); offset += 1) {
    result.push(
      new Date(midnightUtc - offset * 86_400_000).toISOString().slice(0, 10),
    )
  }
  return result
}

/** Chronological, then by doctor's configured order, then by token. */
export function sortForSheet(entries: ReadonlyArray<ExportEntry>): ExportEntry[] {
  return [...entries].sort((a, b) => {
    if (a.queueDate !== b.queueDate) return a.queueDate < b.queueDate ? -1 : 1
    if (a.doctorDisplayOrder !== b.doctorDisplayOrder) {
      return a.doctorDisplayOrder - b.doctorDisplayOrder
    }
    if (a.doctorName !== b.doctorName) return a.doctorName < b.doctorName ? -1 : 1
    return a.tokenNumber - b.tokenNumber
  })
}

export function toSheetRow(entry: ExportEntry, timeZone: string): string[] {
  return [
    entry.queueDate,
    String(entry.tokenNumber),
    entry.doctorName,
    entry.department,
    entry.roomNumber,
    entry.patientName,
    entry.mobile ?? '',
    entry.patientType,
    entry.status,
    formatTime(entry.createdAt, timeZone),
    formatTime(entry.calledAt, timeZone),
    formatTime(entry.completedAt, timeZone),
  ]
}

export function toSheetRows(
  entries: ReadonlyArray<ExportEntry>,
  timeZone: string,
): string[][] {
  return sortForSheet(entries).map((entry) => toSheetRow(entry, timeZone))
}
