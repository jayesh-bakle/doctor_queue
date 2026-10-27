/**
 * In-browser demo data source.
 *
 * Implements the same interface as the Supabase backend, but keeps everything
 * in localStorage and synchronises across browser tabs with BroadcastChannel.
 * It exists so the system can be demonstrated to the doctor — and developed
 * against — with no database and no internet (spec §41).
 *
 * Two deliberate design choices:
 *
 * - It uses the SAME pure helpers as the real app (`deriveSnapshot`,
 *   `countPatientsAhead`, `validateRegistrationFields`) rather than reimplementing
 *   the queue rules. A demo that behaves differently from production is worse
 *   than no demo, because it teaches the staff the wrong thing.
 *
 * - Token allocation is wrapped in the Web Locks API, so opening two tabs and
 *   submitting simultaneously genuinely does produce ००१ and ००२ rather than
 *   two ००१s. The real concurrency guarantee lives in Postgres (see
 *   `003_queue_functions.sql`); this is a faithful stand-in, not a substitute.
 *
 * Clearly labelled as demo-only: the UI shows a banner and gates the seed/reset
 * controls behind `VITE_DEMO_MODE`.
 */

import type {
  CallNextResult,
  DoctorRow,
  HospitalRow,
  PatientType,
  PublicHospitalQueueRow,
  PublicQueueResult,
  QueueEntryRow,
  QueueStatus,
  RecallResult,
  RegisterPatientResult,
  StaffRole,
  TokenPulseResult,
  TokenStatusResult,
} from '../../types/database'
import type {
  AnalyticsDailyPoint,
  AnalyticsDoctorPoint,
  AnalyticsHourlyPoint,
  AnalyticsSummary,
  HospitalAnalytics,
  PlatformAnalytics,
  TodaySummary,
} from '../../types/analytics'
import type { DoctorOption, QueueEntryView } from '../../types/queue'
import { AppError } from '../errors'
import {
  countPatientsAhead,
  deriveSnapshot,
  sortByToken,
  type MinimalEntry,
} from '../queue'
import { normaliseName, randomId, todayInTimeZone } from '../utils'
import { normaliseMobile, validateRegistrationFields } from '../validation'
import { toDoctorOption, toQueueEntryView, type DoctorInput, type HospitalSettingsInput, type QueueDataSource, type RegisterPatientInput, type StaffSession } from './types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATE_KEY = 'queue.demo.state.v1'
const SESSION_KEY = 'queue.demo.session.v1'
const CHANNEL_NAME = 'queue.demo.channel.v1'

/** The one account that works in demo mode. Shown on the login screen. */
export const DEMO_CREDENTIALS = {
  email: 'reception@demo.in',
  password: 'demo1234',
} as const

/** Fixed ids so demo QR codes, TV links and printed posters survive a reset. */
export const DEMO_HOSPITAL_ID = '11111111-1111-1111-1111-111111111111'
const DEMO_DOCTOR_GP = '22222222-2222-2222-2222-222222222222'
const DEMO_DOCTOR_ENT = '33333333-3333-3333-3333-333333333333'

const SAMPLE_PATIENT_NAMES = [
  'Sandeep Jadhav',
  'Amol Patil',
  'Priya Shinde',
  'Rahul More',
  'Sneha Kulkarni',
  'Vikas Deshmukh',
  'Anita Joshi',
  'Sachin Gaikwad',
  'Manisha Pawar',
  'Nitin Bhosale',
  'Swati Kale',
  'Prashant Thorat',
]

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface DemoState {
  hospital: HospitalRow
  doctors: DoctorRow[]
  entries: QueueEntryRow[]
}

function buildInitialHospital(): HospitalRow {
  return {
    id: DEMO_HOSPITAL_ID,
    name: 'Shree Ganesh Hospital',
    address: 'Main Road, Shivaji Nagar, Pune, Maharashtra 411005',
    phone: '+91 20 1234 5678',
    timezone: 'Asia/Kolkata',
    announcement_enabled: true,
    display_message: 'Please wait for your token number to be called.',
    avg_consultation_minutes: 10,
    retention_days: 90,
    max_daily_tokens: 500,
    created_at: new Date().toISOString(),
  }
}

function buildInitialDoctors(): DoctorRow[] {
  const now = new Date().toISOString()
  return [
    {
      id: DEMO_DOCTOR_GP,
      hospital_id: DEMO_HOSPITAL_ID,
      name: 'Dr. Amol Deshmukh',
      department: 'General Medicine',
      room_number: '1',
      is_active: true,
      display_order: 1,
      created_at: now,
    },
    {
      id: DEMO_DOCTOR_ENT,
      hospital_id: DEMO_HOSPITAL_ID,
      name: 'Dr. Swapnil Patil',
      department: 'ENT',
      room_number: '2',
      is_active: true,
      display_order: 2,
      created_at: now,
    },
  ]
}

function buildInitialState(): DemoState {
  return {
    hospital: buildInitialHospital(),
    doctors: buildInitialDoctors(),
    entries: [],
  }
}

function readState(): DemoState {
  if (typeof localStorage === 'undefined') return buildInitialState()

  try {
    const raw = localStorage.getItem(STATE_KEY)
    if (!raw) return buildInitialState()

    const parsed = JSON.parse(raw) as Partial<DemoState>
    if (!parsed.hospital || !Array.isArray(parsed.doctors) || !Array.isArray(parsed.entries)) {
      return buildInitialState()
    }

    return {
      hospital: parsed.hospital,
      doctors: parsed.doctors,
      entries: parsed.entries,
    }
  } catch {
    // Corrupt or unreadable state: start clean rather than crashing the demo.
    return buildInitialState()
  }
}

function writeState(state: DemoState): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state))
  } catch {
    // Storage full or blocked; the in-memory view stays correct for this tab.
  }
}

/**
 * Serialises read-modify-write cycles.
 *
 * Without this, two tabs registering at the same moment would both read the
 * same maximum token and both allocate the same number. The Web Locks API gives
 * a real cross-tab mutex; browsers without it fall back to running directly,
 * which is acceptable for a demo but is exactly why production uses Postgres.
 */
async function withLock<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined
  if (!locks || typeof locks.request !== 'function') {
    return fn()
  }
  return locks.request(`queue.demo.${name}`, fn) as Promise<T>
}

/** Today's queue date in the hospital's timezone. */
function currentQueueDate(state: DemoState): string {
  return todayInTimeZone(state.hospital.timezone)
}

// ---------------------------------------------------------------------------
// Demo analytics
// ---------------------------------------------------------------------------
//
// The demo has no server and no nightly aggregate job. It keeps today's real
// queue in localStorage, then fills earlier days with a deterministic synthetic
// history so the charts have something to show after a reset. Synthetic rows are
// aggregates only, never names, and are derived from a hash of the date and
// doctor id so they do not jump around on every render.

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function datesBetween(from: string, to: string): string[] {
  if (!from || !to || from > to) return []
  const dates: string[] = []
  for (let date = from; date <= to; date = addDays(date, 1)) {
    dates.push(date)
    if (dates.length > 366) break
  }
  return dates
}

function hashText(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function hourInTimeZone(iso: string, timeZone: string): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).format(new Date(iso))
  return Number(hour) % 24
}

interface DemoSyntheticDay {
  registered: number
  newPatients: number
  followupPatients: number
  completed: number
  skipped: number
  waiting: number
  called: number
  avgWaitSeconds: number
  avgConsultSeconds: number
}

function syntheticDay(date: string, doctorId: string): DemoSyntheticDay {
  const seed = hashText(`${date}:${doctorId}`)
  const registered = 12 + (seed % 24)
  const newPatients = Math.max(1, Math.round(registered * (0.55 + (seed % 9) / 100)))
  const followupPatients = registered - newPatients
  const completed = Math.max(0, Math.round(registered * (0.78 + (seed % 12) / 100)))
  const skipped = Math.max(0, Math.min(registered - completed, seed % 4))
  return {
    registered,
    newPatients,
    followupPatients,
    completed,
    skipped,
    waiting: 0,
    called: 0,
    avgWaitSeconds: 420 + (seed % 900),
    avgConsultSeconds: 240 + (seed % 480),
  }
}

/** Distributes a day's registrations over clinic hours without losing a count. */
function syntheticHours(registered: number, seed: number): number[] {
  const weights = [3, 7, 12, 15, 14, 12, 10, 8, 5, 3]
  const totalWeight = weights.reduce((total, weight) => total + weight, 0)
  const hours = Array.from({ length: 24 }, () => 0)
  let assigned = 0
  weights.forEach((weight, index) => {
    const value = Math.floor((registered * weight) / totalWeight)
    hours[9 + index] = value
    assigned += value
  })
  let remainder = registered - assigned
  let index = seed % weights.length
  while (remainder > 0) {
    hours[9 + (index % weights.length)] += 1
    index += 1
    remainder -= 1
  }
  return hours
}

function actualDay(
  state: DemoState,
  date: string,
  doctorId: string | null,
): DemoSyntheticDay {
  const entries = state.entries.filter(
    (entry) =>
      entry.queue_date === date &&
      (doctorId === null || entry.doctor_id === doctorId),
  )
  const called = entries.filter(
    (entry) => entry.status === 'CALLED' || entry.status === 'IN_CONSULTATION',
  )
  const completed = entries.filter((entry) => entry.status === 'COMPLETED')
  const skipped = entries.filter((entry) => entry.status === 'SKIPPED')

  const waitSeconds = entries
    .filter((entry) => entry.called_at !== null)
    .map((entry) => (new Date(entry.called_at as string).getTime() - new Date(entry.created_at).getTime()) / 1000)
    .filter((seconds) => Number.isFinite(seconds) && seconds >= 0)
  const consultSeconds = entries
    .filter((entry) => entry.called_at !== null && entry.completed_at !== null)
    .map(
      (entry) =>
        (new Date(entry.completed_at as string).getTime() -
          new Date(entry.called_at as string).getTime()) /
        1000,
    )
    .filter((seconds) => Number.isFinite(seconds) && seconds >= 0)

  return {
    registered: entries.length,
    newPatients: entries.filter((entry) => entry.patient_type === 'NEW').length,
    followupPatients: entries.filter((entry) => entry.patient_type === 'FOLLOWUP').length,
    completed: completed.length,
    skipped: skipped.length,
    waiting: entries.filter((entry) => entry.status === 'WAITING').length,
    called: called.length,
    avgWaitSeconds: waitSeconds.length
      ? Math.round(waitSeconds.reduce((total, seconds) => total + seconds, 0) / waitSeconds.length)
      : 0,
    avgConsultSeconds: consultSeconds.length
      ? Math.round(
          consultSeconds.reduce((total, seconds) => total + seconds, 0) /
            consultSeconds.length,
        )
      : 0,
  }
}

function dayFor(
  state: DemoState,
  date: string,
  today: string,
  doctorId: string | null,
): DemoSyntheticDay {
  if (date === today) return actualDay(state, date, doctorId)
  if (doctorId) return syntheticDay(date, doctorId)

  const doctors = state.doctors
  if (doctors.length === 0) return actualDay(state, date, null)

  const rows = doctors.map((doctor) => syntheticDay(date, doctor.id))
  return {
    registered: rows.reduce((total, day) => total + day.registered, 0),
    newPatients: rows.reduce((total, day) => total + day.newPatients, 0),
    followupPatients: rows.reduce((total, day) => total + day.followupPatients, 0),
    completed: rows.reduce((total, day) => total + day.completed, 0),
    skipped: rows.reduce((total, day) => total + day.skipped, 0),
    waiting: 0,
    called: 0,
    avgWaitSeconds:
      weightedAverage(
        rows.map((day) => ({ value: day.avgWaitSeconds, weight: day.registered })),
      ) ?? 0,
    avgConsultSeconds:
      weightedAverage(
        rows.map((day) => ({ value: day.avgConsultSeconds, weight: day.registered })),
      ) ?? 0,
  }
}

function weightedAverage(values: Array<{ value: number | null; weight: number }>): number | null {
  const weighted = values.filter((entry) => entry.value !== null && entry.weight > 0)
  const weight = weighted.reduce((total, entry) => total + entry.weight, 0)
  if (weight === 0) return null
  return Math.round(
    weighted.reduce((total, entry) => total + (entry.value as number) * entry.weight, 0) / weight,
  )
}

function demoHourly(
  state: DemoState,
  dates: string[],
  today: string,
  doctorId: string | null,
): AnalyticsHourlyPoint[] {
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    registered: 0,
    completed: 0,
    skipped: 0,
  }))

  for (const date of dates) {
    if (date === today) {
      const entries = state.entries.filter(
        (entry) =>
          entry.queue_date === date &&
          (doctorId === null || entry.doctor_id === doctorId),
      )
      for (const entry of entries) {
        const hour = hourInTimeZone(entry.created_at, state.hospital.timezone)
        hours[hour].registered += 1
        if (entry.status === 'COMPLETED') hours[hour].completed += 1
        if (entry.status === 'SKIPPED') hours[hour].skipped += 1
      }
      continue
    }

    const doctors = doctorId
      ? state.doctors.filter((doctor) => doctor.id === doctorId)
      : state.doctors
    for (const doctor of doctors) {
      const day = syntheticDay(date, doctor.id)
      const seed = hashText(`${date}:${doctor.id}:hours`)
      const distribution = syntheticHours(day.registered, seed)
      distribution.forEach((count, hour) => {
        hours[hour].registered += count
        hours[hour].completed += Math.round(count * 0.8)
        hours[hour].skipped += count > 8 && (seed + hour) % 7 === 0 ? 1 : 0
      })
    }
  }

  return hours
}

function demoAnalytics(
  state: DemoState,
  hospitalId: string,
  from: string,
  to: string,
  doctorId: string | null,
): HospitalAnalytics {
  if (state.hospital.id !== hospitalId) {
    return {
      summary: {
        registered: 0,
        newPatients: 0,
        followupPatients: 0,
        completed: 0,
        skipped: 0,
        waiting: 0,
        called: 0,
        avgWaitSeconds: null,
        avgConsultSeconds: null,
        peakHour: null,
      },
      daily: [],
      doctors: [],
      hourly: [],
    }
  }

  const today = currentQueueDate(state)
  const dates = datesBetween(from, to).filter((date) => date <= today)
  const daily: AnalyticsDailyPoint[] = dates.map((date) => {
    const day = dayFor(state, date, today, doctorId)
    return {
      date,
      registered: day.registered,
      newPatients: day.newPatients,
      followupPatients: day.followupPatients,
      completed: day.completed,
      skipped: day.skipped,
      waiting: day.waiting,
      called: day.called,
      avgWaitSeconds: day.avgWaitSeconds || null,
      avgConsultSeconds: day.avgConsultSeconds || null,
      peakHour: null,
    }
  })

  const doctors: AnalyticsDoctorPoint[] = state.doctors
    .filter((doctor) => doctorId === null || doctor.id === doctorId)
    .map((doctor) => {
      const rows = dates.map((date) => dayFor(state, date, today, doctor.id))
      return {
        doctorId: doctor.id,
        doctorName: doctor.name,
        registered: rows.reduce((total, day) => total + day.registered, 0),
        completed: rows.reduce((total, day) => total + day.completed, 0),
        skipped: rows.reduce((total, day) => total + day.skipped, 0),
        avgWaitSeconds: weightedAverage(
          rows.map((day) => ({ value: day.avgWaitSeconds || null, weight: day.registered })),
        ),
        avgConsultSeconds: weightedAverage(
          rows.map((day) => ({ value: day.avgConsultSeconds || null, weight: day.registered })),
        ),
      }
    })
    .filter((doctor) => doctor.registered > 0)
    .sort((a, b) => b.registered - a.registered || a.doctorName.localeCompare(b.doctorName, 'en'))

  const hourly = demoHourly(state, dates, today, doctorId)
  const peak = hourly.reduce<AnalyticsHourlyPoint | null>(
    (best, point) =>
      point.registered > 0 && (!best || point.registered > best.registered) ? point : best,
    null,
  )

  const summary: AnalyticsSummary = {
    registered: daily.reduce((total, day) => total + day.registered, 0),
    newPatients: daily.reduce((total, day) => total + day.newPatients, 0),
    followupPatients: daily.reduce((total, day) => total + day.followupPatients, 0),
    completed: daily.reduce((total, day) => total + day.completed, 0),
    skipped: daily.reduce((total, day) => total + day.skipped, 0),
    waiting: daily.reduce((total, day) => total + day.waiting, 0),
    called: daily.reduce((total, day) => total + day.called, 0),
    avgWaitSeconds: weightedAverage(
      daily.map((day) => ({ value: day.avgWaitSeconds, weight: day.registered })),
    ),
    avgConsultSeconds: weightedAverage(
      daily.map((day) => ({ value: day.avgConsultSeconds, weight: day.registered })),
    ),
    peakHour: peak?.hour ?? null,
  }

  return { summary, daily, doctors, hourly }
}

function demoTodaySummary(state: DemoState, hospitalId: string): TodaySummary {
  const date = currentQueueDate(state)
  if (state.hospital.id !== hospitalId) {
    return {
      date,
      registered: 0,
      newPatients: 0,
      followupPatients: 0,
      completed: 0,
      skipped: 0,
      waiting: 0,
      called: 0,
      avgWaitSeconds: null,
      avgConsultSeconds: null,
      peakHour: null,
    }
  }

  const day = actualDay(state, date, null)
  const hourly = demoHourly(state, [date], date, null)
  const peak = hourly.reduce<AnalyticsHourlyPoint | null>(
    (best, point) =>
      point.registered > 0 && (!best || point.registered > best.registered) ? point : best,
    null,
  )

  return {
    date,
    registered: day.registered,
    newPatients: day.newPatients,
    followupPatients: day.followupPatients,
    completed: day.completed,
    skipped: day.skipped,
    waiting: day.waiting,
    called: day.called,
    avgWaitSeconds: day.avgWaitSeconds || null,
    avgConsultSeconds: day.avgConsultSeconds || null,
    peakHour: peak?.hour ?? null,
  }
}

// ---------------------------------------------------------------------------
// Cross-tab notification
// ---------------------------------------------------------------------------

const listeners = new Map<string, Set<() => void>>()

let channel: BroadcastChannel | null = null

function ensureChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  if (channel) return channel

  channel = new BroadcastChannel(CHANNEL_NAME)
  channel.onmessage = (event: MessageEvent<{ doctorId: string }>) => {
    notifyLocal(event.data?.doctorId ?? '*')
  }
  return channel
}

function notifyLocal(doctorId: string): void {
  listeners.get(doctorId)?.forEach((fn) => fn())
  listeners.get('*')?.forEach((fn) => fn())
}

/** Tells every tab (including this one) that a doctor's queue may have changed. */
function broadcast(doctorId: string): void {
  notifyLocal(doctorId)
  try {
    ensureChannel()?.postMessage({ doctorId })
  } catch {
    // Channel closed during teardown; local listeners already fired.
  }
}

/** A second tab writing to localStorage also fires this in the first tab. */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STATE_KEY) notifyLocal('*')
  })
}

// ---------------------------------------------------------------------------
// Derived reads (shared by several methods)
// ---------------------------------------------------------------------------

function entriesForDoctor(state: DemoState, doctorId: string, queueDate: string): QueueEntryRow[] {
  return state.entries.filter((e) => e.doctor_id === doctorId && e.queue_date === queueDate)
}

/**
 * `queue_entries` rows as the pure queue helpers see them.
 *
 * The stored rows are snake_case (they mirror Postgres); the helpers work on the
 * camelCase view shape the rest of the UI uses. This is the seam between them.
 */
function toMinimalEntry(entry: QueueEntryRow): MinimalEntry {
  return { tokenNumber: entry.token_number, status: entry.status }
}

function publicQueueFor(state: DemoState, doctorId: string): PublicQueueResult | null {
  const doctor = state.doctors.find((d) => d.id === doctorId)
  if (!doctor) return null

  const queueDate = currentQueueDate(state)
  const entries = entriesForDoctor(state, doctorId, queueDate)
  const snapshot = deriveSnapshot(entries.map(toMinimalEntry))

  return {
    doctor_id: doctor.id,
    doctor_name: doctor.name,
    department: doctor.department,
    room_number: doctor.room_number,
    is_active: doctor.is_active,
    hospital_name: state.hospital.name,
    hospital_address: state.hospital.address,
    hospital_phone: state.hospital.phone,
    hospital_timezone: state.hospital.timezone,
    display_message: state.hospital.display_message,
    announcement_enabled: state.hospital.announcement_enabled,
    avg_consultation_minutes: state.hospital.avg_consultation_minutes,
    queue_date: queueDate,
    current_token: snapshot.currentToken,
    next_token: snapshot.nextToken,
    waiting_count: snapshot.waitingCount,
    total_today: entries.length,
    updated_at: new Date().toISOString(),
  }
}

function publicHospitalQueueFor(state: DemoState, hospitalId: string): PublicHospitalQueueRow[] {
  if (state.hospital.id !== hospitalId) return []

  const queueDate = currentQueueDate(state)
  const doctors = state.doctors
    .filter((d) => d.hospital_id === hospitalId && d.is_active)
    .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name, 'en'))

  // No active doctors: still return one row so the TV can show the hospital
  // header and the "queue has not started" message, exactly like the SQL
  // LEFT JOIN does.
  if (doctors.length === 0) {
    return [
      {
        hospital_id: state.hospital.id,
        hospital_name: state.hospital.name,
        hospital_address: state.hospital.address,
        hospital_phone: state.hospital.phone,
        hospital_timezone: state.hospital.timezone,
        display_message: state.hospital.display_message,
        announcement_enabled: state.hospital.announcement_enabled,
        avg_consultation_minutes: state.hospital.avg_consultation_minutes,
        queue_date: queueDate,
        doctor_id: null,
        doctor_name: null,
        department: null,
        room_number: null,
        display_order: null,
        current_token: null,
        next_token: null,
        waiting_count: null,
        total_today: null,
        updated_at: new Date().toISOString(),
      },
    ]
  }

  return doctors.map((doctor) => {
    const entries = entriesForDoctor(state, doctor.id, queueDate)
    const snapshot = deriveSnapshot(entries.map(toMinimalEntry))
    return {
      hospital_id: state.hospital.id,
      hospital_name: state.hospital.name,
      hospital_address: state.hospital.address,
      hospital_phone: state.hospital.phone,
      hospital_timezone: state.hospital.timezone,
      display_message: state.hospital.display_message,
      announcement_enabled: state.hospital.announcement_enabled,
      avg_consultation_minutes: state.hospital.avg_consultation_minutes,
      queue_date: queueDate,
      doctor_id: doctor.id,
      doctor_name: doctor.name,
      department: doctor.department,
      room_number: doctor.room_number,
      display_order: doctor.display_order,
      current_token: snapshot.currentToken,
      next_token: snapshot.nextToken,
      waiting_count: snapshot.waitingCount,
      total_today: entries.length,
      updated_at: new Date().toISOString(),
    }
  })
}

function tokenPulseFor(state: DemoState, publicId: string): TokenPulseResult | null {
  const entry = state.entries.find((e) => e.public_id === publicId)
  if (!entry) return null

  const entries = entriesForDoctor(state, entry.doctor_id, entry.queue_date)
  const minimal = entries.map(toMinimalEntry)
  const snapshot = deriveSnapshot(minimal)

  return {
    public_id: entry.public_id,
    status: entry.status,
    token_number: entry.token_number,
    current_token: snapshot.currentToken,
    next_token: snapshot.nextToken,
    patients_ahead: countPatientsAhead(minimal, entry.token_number),
    waiting_count: snapshot.waitingCount,
    updated_at: entry.updated_at,
  }
}

function tokenStatusFor(state: DemoState, publicId: string): TokenStatusResult | null {
  const entry = state.entries.find((e) => e.public_id === publicId)
  if (!entry) return null

  const doctor = state.doctors.find((d) => d.id === entry.doctor_id)
  if (!doctor) return null

  const entries = entriesForDoctor(state, entry.doctor_id, entry.queue_date)
  const minimal = entries.map(toMinimalEntry)
  const snapshot = deriveSnapshot(minimal)

  return {
    public_id: entry.public_id,
    token_number: entry.token_number,
    status: entry.status,
    patient_name: entry.patient_name,
    patient_type: entry.patient_type,
    queue_date: entry.queue_date,
    created_at: entry.created_at,
    called_at: entry.called_at,
    doctor_id: doctor.id,
    doctor_name: doctor.name,
    department: doctor.department,
    room_number: doctor.room_number,
    hospital_name: state.hospital.name,
    hospital_phone: state.hospital.phone,
    hospital_timezone: state.hospital.timezone,
    current_token: snapshot.currentToken,
    next_token: snapshot.nextToken,
    waiting_count: snapshot.waitingCount,
    patients_ahead: countPatientsAhead(minimal, entry.token_number),
    avg_consultation_minutes: state.hospital.avg_consultation_minutes,
    announcement_enabled: state.hospital.announcement_enabled,
  }
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

function readSession(): StaffSession | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StaffSession
    // Sessions saved by an older demo build predate the platform-admin flag.
    return { ...parsed, isPlatformAdmin: parsed.isPlatformAdmin === true }
  } catch {
    return null
  }
}

function writeSession(session: StaffSession | null): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // Ignore: the caller keeps the session in React state either way.
  }
}

// ---------------------------------------------------------------------------
// The data source
// ---------------------------------------------------------------------------

export const demoDataSource: QueueDataSource = {
  kind: 'demo',

  // ---- doctors ----------------------------------------------------------

  async listDoctors(options): Promise<DoctorOption[]> {
    const state = readState()
    return state.doctors
      .filter((d) => (options?.hospitalId ? d.hospital_id === options.hospitalId : true))
      .filter((d) => (options?.includeInactive ? true : d.is_active))
      .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name, 'en'))
      .map(toDoctorOption)
  },

  async createDoctor(input: DoctorInput): Promise<DoctorOption> {
    const state = readState()

    const doctor: DoctorRow = {
      id: randomId(),
      hospital_id: state.hospital.id,
      name: normaliseName(input.name),
      department: input.department.trim(),
      room_number: input.roomNumber.trim(),
      is_active: input.isActive,
      display_order: input.displayOrder ?? state.doctors.length + 1,
      created_at: new Date().toISOString(),
    }

    state.doctors.push(doctor)
    writeState(state)
    broadcast('*')

    return toDoctorOption(doctor)
  },

  async updateDoctor(id: string, input: Partial<DoctorInput>): Promise<DoctorOption> {
    const state = readState()
    const index = state.doctors.findIndex((d) => d.id === id)
    if (index === -1) throw new AppError('DOCTOR_NOT_FOUND')

    const existing = state.doctors[index]
    const updated: DoctorRow = {
      ...existing,
      name: input.name !== undefined ? normaliseName(input.name) : existing.name,
      department: input.department !== undefined ? input.department.trim() : existing.department,
      room_number: input.roomNumber !== undefined ? input.roomNumber.trim() : existing.room_number,
      is_active: input.isActive ?? existing.is_active,
      display_order: input.displayOrder ?? existing.display_order,
    }

    state.doctors[index] = updated
    writeState(state)
    broadcast(id)

    return toDoctorOption(updated)
  },

  async deleteDoctor(id: string): Promise<void> {
    const state = readState()
    const index = state.doctors.findIndex((d) => d.id === id)
    if (index === -1) throw new AppError('DOCTOR_NOT_FOUND')

    // Mirrors the Supabase backend and the `on delete cascade` in the schema:
    // a doctor with any patient history is not deleted, only deactivated.
    if (state.entries.some((entry) => entry.doctor_id === id)) {
      throw new AppError('DOCTOR_HAS_HISTORY')
    }

    state.doctors.splice(index, 1)
    writeState(state)
    broadcast(id)
  },

  // ---- patient ----------------------------------------------------------

  async registerPatient(input: RegisterPatientInput): Promise<RegisterPatientResult> {
    return withLock('register', async () => {
      const state = readState()

      // Same validation the SQL function applies, from the same module the form
      // uses, so the demo cannot drift from production behaviour. The rules
      // report codes, not sentences — the wording depends on the reader's
      // language, which this layer deliberately knows nothing about.
      const validation = validateRegistrationFields({
        patientName: input.patientName,
        mobile: input.mobile ?? '',
        doctorId: input.doctorId,
        patientType: input.patientType,
      })
      if (!validation.valid) {
        // Surface the specific code the SQL function would have raised, so the
        // demo raises exactly what production raises.
        const code =
          validation.errorCodes.patientName ??
          validation.errorCodes.mobile ??
          validation.errorCodes.doctorId ??
          'DOCTOR_REQUIRED'
        throw new AppError(code)
      }

      const doctor = state.doctors.find((d) => d.id === input.doctorId)
      if (!doctor) throw new AppError('DOCTOR_NOT_FOUND')
      if (!doctor.is_active) throw new AppError('DOCTOR_INACTIVE')

      const queueDate = currentQueueDate(state)
      const entries = entriesForDoctor(state, doctor.id, queueDate)

      // Mirrors the daily cap in register_patient(): the abuse backstop for the
      // public anon key.
      if (entries.length >= state.hospital.max_daily_tokens) {
        throw new AppError('QUEUE_FULL')
      }

      // Atomic within the lock: no other tab can be between this read and write.
      const nextToken = entries.reduce((max, e) => Math.max(max, e.token_number), 0) + 1

      const entry: QueueEntryRow = {
        id: randomId(),
        public_id: randomId(),
        hospital_id: state.hospital.id,
        doctor_id: doctor.id,
        queue_date: queueDate,
        token_number: nextToken,
        patient_name: validation.normalised.patientName,
        mobile: validation.normalised.mobile,
        patient_type: input.patientType,
        status: 'WAITING',
        created_at: new Date().toISOString(),
        called_at: null,
        completed_at: null,
        updated_at: new Date().toISOString(),
      }

      state.entries.push(entry)
      writeState(state)
      broadcast(doctor.id)

      return {
        public_id: entry.public_id,
        token_number: entry.token_number,
        queue_date: entry.queue_date,
        doctor_id: doctor.id,
        doctor_name: doctor.name,
        department: doctor.department,
        room_number: doctor.room_number,
        hospital_name: state.hospital.name,
      }
    })
  },

  async getTokenStatus(publicId: string): Promise<TokenStatusResult | null> {
    return tokenStatusFor(readState(), publicId)
  },

  async getTokenPulse(publicId: string): Promise<TokenPulseResult | null> {
    return tokenPulseFor(readState(), publicId)
  },

  async getPublicQueue(doctorId: string): Promise<PublicQueueResult | null> {
    return publicQueueFor(readState(), doctorId)
  },

  async getPublicHospitalQueue(hospitalId: string): Promise<PublicHospitalQueueRow[]> {
    return publicHospitalQueueFor(readState(), hospitalId)
  },

  // ---- staff ------------------------------------------------------------

  async signIn(email: string, password: string): Promise<StaffSession> {
    if (email.trim().toLowerCase() !== DEMO_CREDENTIALS.email || password !== DEMO_CREDENTIALS.password) {
      throw new AppError('INVALID_CREDENTIALS')
    }

    const state = readState()
    const session: StaffSession = {
      userId: 'demo-staff-user',
      email: DEMO_CREDENTIALS.email,
      fullName: 'Administrator (demo)',
      // ADMIN and platform admin so the demo can show the analytics screens.
      // The real backend derives both from SQL; the demo account is deliberately
      // the most privileged one so every screen can be explored.
      role: 'ADMIN' as StaffRole,
      hospitalId: state.hospital.id,
      isPlatformAdmin: true,
    }

    writeSession(session)
    return session
  },

  async signOut(): Promise<void> {
    writeSession(null)
  },

  async getCurrentStaff(): Promise<StaffSession | null> {
    return readSession()
  },

  // ---- queue ------------------------------------------------------------

  async listQueue(
    doctorId: string,
    queueDate: string,
    options?: { since?: string },
  ): Promise<QueueEntryView[]> {
    const state = readState()
    const rows = entriesForDoctor(state, doctorId, queueDate)
      .filter((entry) => (options?.since ? entry.updated_at >= options.since : true))
      .map(toQueueEntryView)
    // Convert to views first: `sortByToken` works on the camelCase view shape.
    return sortByToken(rows)
  },

  async callNext(doctorId: string): Promise<CallNextResult | null> {
    return withLock('call', async () => {
      const state = readState()
      const doctor = state.doctors.find((d) => d.id === doctorId)
      if (!doctor) throw new AppError('DOCTOR_NOT_FOUND')

      const queueDate = currentQueueDate(state)
      const entries = entriesForDoctor(state, doctorId, queueDate)
      const now = new Date().toISOString()

      // Mirrors the SQL exactly: close out whoever was being seen, then call the
      // lowest-numbered patient still waiting.
      for (const entry of entries) {
        if (entry.status === 'CALLED' || entry.status === 'IN_CONSULTATION') {
          entry.status = 'COMPLETED'
          entry.completed_at = now
          entry.updated_at = now
        }
      }

      const next = entries
        .filter((e) => e.status === 'WAITING')
        .sort((a, b) => a.token_number - b.token_number)[0]

      if (!next) {
        writeState(state)
        broadcast(doctorId)
        return null
      }

      next.status = 'CALLED'
      next.called_at = now
      next.updated_at = now

      writeState(state)
      broadcast(doctorId)

      return {
        called_token: next.token_number,
        called_public_id: next.public_id,
        out_doctor_id: doctor.id,
        doctor_name: doctor.name,
        department: doctor.department,
        room_number: doctor.room_number,
      }
    })
  },

  async recall(publicId: string): Promise<RecallResult> {
    return withLock('mutate', async () => {
      const state = readState()
      const entry = state.entries.find((e) => e.public_id === publicId)
      if (!entry) throw new AppError('TOKEN_NOT_FOUND')

      if (entry.status !== 'CALLED' && entry.status !== 'IN_CONSULTATION') {
        throw new AppError('INVALID_STATUS_TRANSITION')
      }

      const doctor = state.doctors.find((d) => d.id === entry.doctor_id)
      if (!doctor) throw new AppError('DOCTOR_NOT_FOUND')

      const now = new Date().toISOString()
      entry.status = 'CALLED'
      entry.called_at = now
      entry.updated_at = now

      writeState(state)
      broadcast(entry.doctor_id)

      return {
        token_number: entry.token_number,
        doctor_name: doctor.name,
        room_number: doctor.room_number,
      }
    })
  },

  async startConsultation(publicId: string): Promise<void> {
    await transition(publicId, ['CALLED'], 'IN_CONSULTATION')
  },

  async skip(publicId: string): Promise<void> {
    // No completed_at: a skipped patient was never seen, and writing a
    // completion time here would misreport them in any later report.
    await transition(publicId, ['WAITING', 'CALLED', 'IN_CONSULTATION'], 'SKIPPED')
  },

  async complete(publicId: string): Promise<void> {
    await transition(publicId, ['WAITING', 'CALLED', 'IN_CONSULTATION'], 'COMPLETED', true)
  },

  // ---- hospital ---------------------------------------------------------

  async getHospital(hospitalId?: string): Promise<HospitalRow | null> {
    const hospital = readState().hospital
    // The demo holds one hospital. An explicit id must match it — that is what
    // makes /h/<wrong-id> show the "scan the QR again" message in demo mode
    // exactly as it does against Supabase.
    if (hospitalId && hospitalId !== hospital.id) return null
    return hospital
  },

  async updateHospital(input: HospitalSettingsInput): Promise<void> {
    const state = readState()
    state.hospital = {
      ...state.hospital,
      name: input.name.trim(),
      address: input.address,
      phone: input.phone,
      timezone: input.timezone,
      announcement_enabled: input.announcementEnabled,
      display_message: input.displayMessage,
      avg_consultation_minutes: input.avgConsultationMinutes,
    }
    writeState(state)
    broadcast('*')
  },

  // ---- analytics --------------------------------------------------------

  async getTodaySummary(hospitalId: string): Promise<TodaySummary> {
    return demoTodaySummary(readState(), hospitalId)
  },

  async getHospitalAnalytics(
    hospitalId: string,
    from: string,
    to: string,
    doctorId?: string | null,
  ): Promise<HospitalAnalytics> {
    return demoAnalytics(readState(), hospitalId, from, to, doctorId ?? null)
  },

  async getPlatformAnalytics(from: string, to: string): Promise<PlatformAnalytics> {
    const state = readState()
    const hospital = demoAnalytics(
      state,
      state.hospital.id,
      from,
      to,
      null,
    )

    return {
      summary: hospital.summary,
      daily: hospital.daily.map((day) => ({
        date: day.date,
        registered: day.registered,
        completed: day.completed,
        skipped: day.skipped,
        newPatients: day.newPatients,
        followupPatients: day.followupPatients,
        avgWaitSeconds: day.avgWaitSeconds,
        avgConsultSeconds: day.avgConsultSeconds,
      })),
      hospitals: [
        {
          hospitalId: state.hospital.id,
          hospitalName: state.hospital.name,
          registered: hospital.summary.registered,
          completed: hospital.summary.completed,
          skipped: hospital.summary.skipped,
          avgWaitSeconds: hospital.summary.avgWaitSeconds,
          avgConsultSeconds: hospital.summary.avgConsultSeconds,
        },
      ],
      hourly: hospital.hourly,
    }
  },

  // ---- realtime ---------------------------------------------------------

  subscribeToQueue(doctorId: string, onChange: () => void): () => void {
    ensureChannel()

    const forDoctor = listeners.get(doctorId) ?? new Set<() => void>()
    forDoctor.add(onChange)
    listeners.set(doctorId, forDoctor)

    return () => {
      forDoctor.delete(onChange)
      if (forDoctor.size === 0) listeners.delete(doctorId)
    }
  },

  subscribeToHospital(hospitalId: string, onChange: () => void): () => void {
    ensureChannel()

    // The demo has one hospital and broadcasts every queue change to '*', so
    // the hospital subscription is the same as listening for any change.
    const key = hospitalId === readState().hospital.id ? '*' : `hospital:${hospitalId}`
    const forHospital = listeners.get(key) ?? new Set<() => void>()
    forHospital.add(onChange)
    listeners.set(key, forHospital)

    return () => {
      forHospital.delete(onChange)
      if (forHospital.size === 0) listeners.delete(key)
    }
  },

  // ---- demo-only controls -----------------------------------------------

  async resetDemoData(): Promise<void> {
    const fresh = buildInitialState()
    writeState(fresh)
    broadcast('*')
  },

  /**
   * Registers `count` sample patients for a doctor, going through the real
   * registration path so tokens, dates and events are all produced the same way
   * they would be by a patient at reception.
   */
  async seedDemoQueue(doctorId: string, count: number): Promise<void> {
    const state = readState()
    const doctor = state.doctors.find((d) => d.id === doctorId)
    if (!doctor) throw new AppError('DOCTOR_NOT_FOUND')

    for (let i = 0; i < count; i += 1) {
      const name = SAMPLE_PATIENT_NAMES[i % SAMPLE_PATIENT_NAMES.length]
      const suffix = i >= SAMPLE_PATIENT_NAMES.length ? ` ${Math.floor(i / SAMPLE_PATIENT_NAMES.length) + 1}` : ''
      const patientType: PatientType = i % 3 === 0 ? 'FOLLOWUP' : 'NEW'
      const mobile = `98${String(76540000 + i).slice(-8)}`

      await demoDataSource.registerPatient({
        doctorId,
        patientName: `${name}${suffix}`,
        mobile: normaliseMobile(mobile),
        patientType,
      })
    }
  },
}

/** Shared status-transition helper: validates, mutates, persists, broadcasts. */
async function transition(
  publicId: string,
  allowedFrom: QueueStatus[],
  to: QueueStatus,
  setCompletedAt = false,
): Promise<void> {
  return withLock('mutate', async () => {
    const state = readState()
    const entry = state.entries.find((e) => e.public_id === publicId)
    if (!entry) throw new AppError('TOKEN_NOT_FOUND')
    if (!allowedFrom.includes(entry.status)) throw new AppError('INVALID_STATUS_TRANSITION')

    const now = new Date().toISOString()
    entry.status = to
    if (setCompletedAt) entry.completed_at = now
    entry.updated_at = now

    writeState(state)
    broadcast(entry.doctor_id)
  })
}
