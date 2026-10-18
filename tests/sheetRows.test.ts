import { describe, expect, it } from 'vitest'

import {
  SHEET_HEADER,
  formatDateInTimeZone,
  formatTime,
  recentDates,
  sortForSheet,
  toSheetRow,
  type ExportEntry,
} from '../supabase/functions/daily-sheet-export/rows'

function entry(overrides: Partial<ExportEntry> = {}): ExportEntry {
  return {
    id: 'e1',
    queueDate: '2026-10-18',
    tokenNumber: 1,
    doctorName: 'डॉ. अ',
    doctorDisplayOrder: 0,
    department: 'सामान्य वैद्यक',
    roomNumber: '१',
    patientName: 'रुग्ण',
    mobile: '9876543210',
    patientType: 'NEW',
    status: 'COMPLETED',
    createdAt: '2026-10-18T04:00:00Z',
    calledAt: null,
    completedAt: null,
    ...overrides,
  }
}

describe('formatTime', () => {
  it('formats in the hospital timezone, not UTC', () => {
    // 18:24 UTC is 23:54 in Asia/Kolkata.
    expect(formatTime('2026-10-18T18:24:00Z', 'Asia/Kolkata')).toBe('23:54')
  })

  it('returns an empty cell for missing or invalid timestamps', () => {
    expect(formatTime(null, 'Asia/Kolkata')).toBe('')
    expect(formatTime('not-a-date', 'Asia/Kolkata')).toBe('')
  })
})

describe('formatDateInTimeZone', () => {
  it('uses the hospital’s midnight, not the server’s', () => {
    // 23:59 IST on the 18th.
    expect(formatDateInTimeZone(new Date('2026-10-18T18:29:00Z'), 'Asia/Kolkata')).toBe(
      '2026-10-18',
    )
    // 00:01 IST on the 19th — the same UTC evening.
    expect(formatDateInTimeZone(new Date('2026-10-18T18:31:00Z'), 'Asia/Kolkata')).toBe(
      '2026-10-19',
    )
  })
})

describe('recentDates', () => {
  it('returns the last N dates, today first', () => {
    const now = new Date('2026-10-18T18:29:00Z') // 23:59 IST on the 18th
    expect(recentDates('Asia/Kolkata', 3, now)).toEqual([
      '2026-10-18',
      '2026-10-17',
      '2026-10-16',
    ])
  })

  it('crosses a month boundary correctly', () => {
    const now = new Date('2026-11-01T06:00:00Z') // 11:30 IST on 1 Nov
    expect(recentDates('Asia/Kolkata', 3, now)).toEqual([
      '2026-11-01',
      '2026-10-31',
      '2026-10-30',
    ])
  })
})

describe('sortForSheet', () => {
  it('orders by date, then doctor order, then token', () => {
    const sorted = sortForSheet([
      entry({ id: 'd', queueDate: '2026-10-18', doctorDisplayOrder: 1, tokenNumber: 2 }),
      entry({ id: 'a', queueDate: '2026-10-17', doctorDisplayOrder: 0, tokenNumber: 9 }),
      entry({ id: 'c', queueDate: '2026-10-18', doctorDisplayOrder: 0, tokenNumber: 7 }),
      entry({ id: 'b', queueDate: '2026-10-18', doctorDisplayOrder: 0, tokenNumber: 3 }),
    ])
    expect(sorted.map((row) => row.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('toSheetRow', () => {
  it('matches the header width and leaves an absent mobile blank', () => {
    const row = toSheetRow(entry({ mobile: null }), 'Asia/Kolkata')
    expect(row).toHaveLength(SHEET_HEADER.length)
    expect(row[6]).toBe('')
    expect(row[0]).toBe('2026-10-18')
    expect(row[1]).toBe('1')
    expect(row[8]).toBe('COMPLETED')
  })

  it('puts times in the hospital timezone', () => {
    const row = toSheetRow(
      entry({ createdAt: '2026-10-18T04:05:00Z', completedAt: '2026-10-18T05:30:00Z' }),
      'Asia/Kolkata',
    )
    expect(row[9]).toBe('09:35')
    expect(row[11]).toBe('11:00')
  })
})
