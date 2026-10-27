import { beforeEach, describe, expect, it } from 'vitest'

import { installBrowserEnv } from './helpers/browserEnv'

// Must happen before the data source module is evaluated.
installBrowserEnv()

const { demoDataSource, DEMO_HOSPITAL_ID } = await import(
  '../src/lib/datasource/demoDataSource'
)
const { addDays, csvCell, rangeForPreset } = await import('../src/lib/analytics')
const { todayInTimeZone } = await import('../src/lib/utils')

const TODAY = todayInTimeZone('Asia/Kolkata')

async function firstDoctorId(): Promise<string> {
  const doctors = await demoDataSource.listDoctors()
  expect(doctors.length).toBeGreaterThanOrEqual(1)
  return doctors[0]!.id
}

async function register(doctorId: string, name: string) {
  return demoDataSource.registerPatient({
    doctorId,
    patientName: name,
    mobile: null,
    patientType: 'NEW',
  })
}

beforeEach(() => {
  installBrowserEnv()
})

describe('analytics date presets', () => {
  it('uses calendar dates in the hospital timezone', () => {
    expect(rangeForPreset('today', 'Asia/Kolkata')).toEqual({
      from: TODAY,
      to: TODAY,
    })
  })

  it('covers exactly 30 days for last30', () => {
    const range = rangeForPreset('last30', 'Asia/Kolkata')
    expect(range.to).toBe(TODAY)
    expect(range.from).toBe(addDays(TODAY, -29))
  })

  it('covers the whole previous calendar month', () => {
    const range = rangeForPreset('lastMonth', 'Asia/Kolkata')
    expect(range.from).toMatch(/^\d{4}-\d{2}-01$/)
    expect(range.to >= range.from).toBe(true)
    expect(range.to.slice(0, 7)).toBe(range.from.slice(0, 7))
  })

  it('escapes CSV cells that contain commas or quotes', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('a"b')).toBe('"a""b"')
    expect(csvCell(null)).toBe('')
  })
})

describe('demo analytics', () => {
  it('summarises today from the live demo queue, not synthetic history', async () => {
    const doctorId = await firstDoctorId()
    const first = await register(doctorId, 'Analytics Patient One')
    await register(doctorId, 'Analytics Patient Two')

    await demoDataSource.callNext(doctorId)
    await demoDataSource.complete(first.public_id)

    const summary = await demoDataSource.getTodaySummary(DEMO_HOSPITAL_ID)
    expect(summary.date).toBe(TODAY)
    expect(summary.registered).toBe(2)
    expect(summary.completed).toBe(1)
    expect(summary.waiting).toBe(1)
    expect(summary.skipped).toBe(0)

    const analytics = await demoDataSource.getHospitalAnalytics(
      DEMO_HOSPITAL_ID,
      TODAY,
      TODAY,
      null,
    )
    expect(analytics.summary.registered).toBe(2)
    expect(analytics.daily).toHaveLength(1)
    expect(analytics.daily[0]?.registered).toBe(2)
  })

  it('applies the doctor filter to the summary and daily series', async () => {
    const doctors = await demoDataSource.listDoctors()
    const first = doctors[0]!.id
    const second = doctors[1]!.id
    await register(first, 'First Doctor Patient')
    await register(second, 'Second Doctor Patient')

    const analytics = await demoDataSource.getHospitalAnalytics(
      DEMO_HOSPITAL_ID,
      TODAY,
      TODAY,
      second,
    )
    expect(analytics.summary.registered).toBe(1)
    expect(analytics.doctors).toHaveLength(1)
    expect(analytics.doctors[0]?.doctorId).toBe(second)
    expect(analytics.daily[0]?.registered).toBe(1)
  })

  it('returns a synthetic history for earlier days so charts are not empty', async () => {
    const range = rangeForPreset('week', 'Asia/Kolkata')
    const analytics = await demoDataSource.getHospitalAnalytics(
      DEMO_HOSPITAL_ID,
      range.from,
      range.to,
      null,
    )
    expect(analytics.daily).toHaveLength(7)
    expect(analytics.summary.registered).toBeGreaterThan(0)
    expect(analytics.hourly.some((point) => point.registered > 0)).toBe(true)
  })

  it('gives the platform view the same hospital totals', async () => {
    const doctorId = await firstDoctorId()
    await register(doctorId, 'Platform Patient')

    const platform = await demoDataSource.getPlatformAnalytics(TODAY, TODAY)
    expect(platform.hospitals).toHaveLength(1)
    expect(platform.hospitals[0]?.hospitalId).toBe(DEMO_HOSPITAL_ID)
    expect(platform.summary.registered).toBe(1)
    expect(platform.hospitals[0]?.registered).toBe(1)
  })
})
