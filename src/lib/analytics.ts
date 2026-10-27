import type { Messages } from './i18n'
import { todayInTimeZone } from './utils'

export type AnalyticsPreset =
  | 'today'
  | 'week'
  | 'month'
  | 'lastMonth'
  | 'last30'
  | 'last90'
  | 'custom'

export interface DateRange {
  from: string
  to: string
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function monthStart(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`
}

function previousMonth(isoDate: string): { from: string; to: string } {
  const year = Number(isoDate.slice(0, 4))
  const month = Number(isoDate.slice(5, 7))
  const previousYear = month === 1 ? year - 1 : year
  const previousMonthNumber = month === 1 ? 12 : month - 1
  const lastDay = new Date(Date.UTC(previousYear, previousMonthNumber, 0))
    .toISOString()
    .slice(0, 10)
  return {
    from: `${previousYear}-${String(previousMonthNumber).padStart(2, '0')}-01`,
    to: lastDay,
  }
}

/**
 * The date window behind each preset. Dates are calendar dates in the
 * hospital's timezone, which is what `queue_date` and `stat_date` store.
 */
export function rangeForPreset(preset: AnalyticsPreset, timezone: string): DateRange {
  const today = todayInTimeZone(timezone)

  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case 'week':
      return { from: addDays(today, -6), to: today }
    case 'month':
      return { from: monthStart(today), to: today }
    case 'lastMonth':
      return previousMonth(today)
    case 'last30':
      return { from: addDays(today, -29), to: today }
    case 'last90':
      return { from: addDays(today, -89), to: today }
    case 'custom':
    default:
      return { from: monthStart(today), to: today }
  }
}

/** A date-only value at midday UTC, so the label cannot slip a day in any zone. */
export function dateLabel(date: string, timezone: string, messages: Messages): string {
  return messages.date(`${date}T12:00:00Z`, timezone)
}

export function hourLabel(hour: number, messages: Messages): string {
  return `${messages.digits(String(hour).padStart(2, '0'))}:00`
}

export function secondsToMinutes(seconds: number | null): number | null {
  if (seconds === null || !Number.isFinite(seconds)) return null
  return Math.max(0, Math.round(seconds / 60))
}

/** CSV cell escaping: quotes are doubled, and commas/newlines force quoting. */
export function csvCell(value: string | number | null): string {
  if (value === null) return ''
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function downloadCsv(filename: string, rows: Array<Array<string | number | null>>): void {
  if (typeof document === 'undefined') return
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
