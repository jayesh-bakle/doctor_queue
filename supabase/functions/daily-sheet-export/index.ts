/**
 * Daily Google Sheets export.
 *
 * Two modes, both driven by Supabase Cron:
 *
 *   incremental — every few minutes. Appends rows that have reached a terminal
 *                 status (COMPLETED or SKIPPED) and not been copied yet.
 *
 *   daily       — once a night. Rewrites the last N days in the Sheet from the
 *                 database, which repairs any run that failed and replaces the
 *                 incremental rows with a complete, ordered copy of each day.
 *
 * Both modes write one tab per month (`<tab> YYYY-MM`). A single tab hits the
 * 10,000,000-cell limit after about 14 months at 2,000 patients/day.
 *
 * One deployment serves several clinics, each with its own private spreadsheet
 * (mapped in `hospital_sheet_exports`) and its own export marks (in
 * `hospital_export_marks`). A single run therefore loops over every enabled
 * mapping, and a failure in one clinic does not block the rest.
 *
 * The function is deployed with `--no-verify-jwt` because cron carries no
 * Supabase user token, so `x-export-secret` is the gate. The service-role key
 * and the Google private key exist only as function secrets — never in the
 * frontend, never in the repository.
 *
 * Privacy: each Sheet is private to its clinic. Logs contain counts and error
 * text only, never a patient's name or mobile number.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import {
  appendRows,
  deleteRows,
  ensureHeader,
  ensureSheet,
  getAccessToken,
  readDateColumn,
} from './google.ts'
import {
  SHEET_HEADER,
  groupEntriesByMonth,
  monthKey,
  monthlyTab,
  recentDates,
  toSheetRows,
  type ExportEntry,
  type ExportPatientType,
  type ExportStatus,
} from './rows.ts'

type Mode = 'incremental' | 'daily'

interface QueueRow {
  id: string
  queue_date: string
  token_number: number
  patient_name: string
  mobile: string | null
  patient_type: ExportPatientType
  status: ExportStatus
  created_at: string
  called_at: string | null
  completed_at: string | null
  doctor_id: string
  doctors?:
    | { name: string; department: string; room_number: string }
    | Array<{ name: string; department: string; room_number: string }>
    | null
  /** Flat doctor fields returned by get_unexported_entries(). */
  doctor_name?: string
  department?: string
  room_number?: string
  doctor_display_order?: number
}

/** One run copies at most this many rows; the next run continues. */
const INCREMENTAL_LIMIT = 5_000

/** PostgREST caps URL length, so ids are marked in batches. */
const MARK_BATCH_SIZE = 500

function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value || value.trim() === '') {
    throw new Error(`Missing function secret: ${name}`)
  }
  return value
}

/** Length-safe comparison; the secret is long enough that timing does not help. */
function secretMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false
  let difference = 0
  for (let index = 0; index < provided.length; index += 1) {
    difference |= provided.charCodeAt(index) ^ expected.charCodeAt(index)
  }
  return difference === 0
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function chunk<T>(items: ReadonlyArray<T>, size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function createAdmin() {
  return createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

interface ExportTarget {
  id: string
  timeZone: string
  spreadsheetId: string
  /** Prefix for the monthly tabs, e.g. `Queue` -> `Queue 2026-10`. */
  tab: string
}

/**
 * Every clinic that has an enabled Sheet mapping.
 *
 * One deployment serves several hospitals, so the old single `HOSPITAL_ID` and
 * single `GOOGLE_SHEET_ID` configuration is gone. Each row in
 * `hospital_sheet_exports` names that clinic's own private spreadsheet, and the
 * service account is shared because it is added as an editor to each one.
 */
async function resolveExportTargets(
  admin: ReturnType<typeof createAdmin>,
): Promise<ExportTarget[]> {
  const { data, error } = await admin
    .from('hospital_sheet_exports')
    .select('hospital_id, spreadsheet_id, tab, hospitals!inner(timezone)')
    .eq('enabled', true)

  if (error) throw new Error(`Could not read hospital sheet mappings: ${error.message}`)

  const targets: ExportTarget[] = []
  for (const row of data ?? []) {
    const relation = row.hospitals as
      | { timezone: string | null }
      | Array<{ timezone: string | null }>
      | null
    const hospital = Array.isArray(relation) ? relation[0] : relation

    targets.push({
      id: row.hospital_id as string,
      timeZone: (hospital?.timezone as string | undefined) || 'Asia/Kolkata',
      spreadsheetId: row.spreadsheet_id as string,
      tab: (row.tab as string | null)?.trim() || 'Queue',
    })
  }

  return targets
}

async function fetchDoctorOrders(
  admin: ReturnType<typeof createAdmin>,
  hospitalId: string,
): Promise<Map<string, number>> {
  const { data, error } = await admin
    .from('doctors')
    .select('id, display_order')
    .eq('hospital_id', hospitalId)

  if (error) throw new Error(`Could not read doctors: ${error.message}`)

  const orders = new Map<string, number>()
  for (const row of data ?? []) {
    orders.set(row.id as string, (row.display_order as number) ?? 0)
  }
  return orders
}

function toExportEntry(
  row: QueueRow,
  doctorOrders?: Map<string, number>,
): ExportEntry {
  const doctor = Array.isArray(row.doctors) ? row.doctors[0] : row.doctors

  return {
    id: row.id,
    queueDate: row.queue_date,
    tokenNumber: row.token_number,
    doctorName: doctor?.name ?? row.doctor_name ?? '',
    doctorDisplayOrder:
      doctorOrders?.get(row.doctor_id) ?? row.doctor_display_order ?? 0,
    department: doctor?.department ?? row.department ?? '',
    roomNumber: doctor?.room_number ?? row.room_number ?? '',
    patientName: row.patient_name,
    mobile: row.mobile,
    patientType: row.patient_type,
    status: row.status,
    createdAt: row.created_at,
    calledAt: row.called_at,
    completedAt: row.completed_at,
  }
}

const ENTRY_COLUMNS =
  'id, queue_date, token_number, patient_name, mobile, patient_type, status, ' +
  'created_at, called_at, completed_at, doctor_id, doctors(name, department, room_number)'

/**
 * Terminal entries not yet copied to this hospital's Sheet.
 *
 * The anti-join runs in Postgres and returns at most INCREMENTAL_LIMIT rows.
 * The previous version downloaded every export mark and every terminal row
 * before filtering in JavaScript; at 2,000 patients/day that grows without
 * bound inside the retention window.
 */
async function fetchPendingEntries(
  admin: ReturnType<typeof createAdmin>,
  hospitalId: string,
): Promise<ExportEntry[]> {
  const { data, error } = await admin.rpc('get_unexported_entries', {
    p_hospital_id: hospitalId,
    p_limit: INCREMENTAL_LIMIT,
  })

  if (error) throw new Error(`Could not read pending queue entries: ${error.message}`)

  return ((data ?? []) as unknown as QueueRow[]).map((row) => toExportEntry(row))
}

async function fetchEntriesForDates(
  admin: ReturnType<typeof createAdmin>,
  hospitalId: string,
  dates: ReadonlyArray<string>,
  doctorOrders: Map<string, number>,
): Promise<ExportEntry[]> {
  const { data, error } = await admin
    .from('queue_entries')
    .select(ENTRY_COLUMNS)
    .eq('hospital_id', hospitalId)
    .in('queue_date', [...dates])
    .order('queue_date', { ascending: true })
    .order('token_number', { ascending: true })

  if (error) throw new Error(`Could not read queue entries for export: ${error.message}`)

  return (data ?? []).map((row) => toExportEntry(row as unknown as QueueRow, doctorOrders))
}

async function markExported(
  admin: ReturnType<typeof createAdmin>,
  hospitalId: string,
  ids: ReadonlyArray<string>,
): Promise<void> {
  for (const batch of chunk(ids, MARK_BATCH_SIZE)) {
    const { error } = await admin
      .from('hospital_export_marks')
      .upsert(
        batch.map((entryId) => ({ entry_id: entryId, hospital_id: hospitalId })),
        { onConflict: 'entry_id,hospital_id', ignoreDuplicates: true },
      )

    if (error) throw new Error(`Could not mark rows exported: ${error.message}`)
  }
}

async function runIncremental(
  admin: ReturnType<typeof createAdmin>,
  target: ExportTarget,
  accessToken: string,
): Promise<{ appended: number }> {
  const entries = await fetchPendingEntries(admin, target.id)

  if (entries.length === 0) return { appended: 0 }

  let appended = 0
  for (const [month, monthEntries] of groupEntriesByMonth(entries)) {
    const tab = monthlyTab(target.tab, month)
    await ensureSheet(target.spreadsheetId, tab, accessToken)
    await ensureHeader(target.spreadsheetId, tab, SHEET_HEADER, accessToken)
    await appendRows(
      target.spreadsheetId,
      tab,
      toSheetRows(monthEntries, target.timeZone),
      accessToken,
    )
    await markExported(admin, target.id, monthEntries.map((entry) => entry.id))
    appended += monthEntries.length
  }

  return { appended }
}

async function runDaily(
  admin: ReturnType<typeof createAdmin>,
  target: ExportTarget,
  accessToken: string,
  days: number,
): Promise<{ appended: number; deleted: number }> {
  const dates = recentDates(target.timeZone, days)
  const targetDates = new Set(dates)

  const doctorOrders = await fetchDoctorOrders(admin, target.id)
  const entries = await fetchEntriesForDates(admin, target.id, dates, doctorOrders)
  const entriesByMonth = groupEntriesByMonth(entries)

  // Even a month with no entries may hold stale rows for a deleted day, so
  // reconcile every month touched by the window, not only the months returned
  // by the database.
  const months = [...new Set(dates.map(monthKey))].sort()

  let appended = 0
  let deleted = 0

  for (const month of months) {
    const tab = monthlyTab(target.tab, month)
    const gridId = await ensureSheet(target.spreadsheetId, tab, accessToken)
    await ensureHeader(target.spreadsheetId, tab, SHEET_HEADER, accessToken)

    const dateColumn = await readDateColumn(target.spreadsheetId, tab, accessToken)

    // Indices come from the column *before* the append, so they still name the
    // old rows afterwards: appended rows land below them.
    const staleIndices: number[] = []
    dateColumn.forEach((row, index) => {
      const value = (row[0] ?? '').trim()
      if (targetDates.has(value)) staleIndices.push(index)
    })

    const monthEntries = entriesByMonth.get(month) ?? []

    // Append before deleting. If the append fails, the Sheet keeps the previous
    // copy of those days instead of losing them until the next nightly run.
    await appendRows(
      target.spreadsheetId,
      tab,
      toSheetRows(monthEntries, target.timeZone),
      accessToken,
    )
    await deleteRows(target.spreadsheetId, gridId, staleIndices, accessToken)
    await markExported(admin, target.id, monthEntries.map((entry) => entry.id))

    appended += monthEntries.length
    deleted += staleIndices.length
  }

  return { appended, deleted }
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const expectedSecret = Deno.env.get('EXPORT_SECRET') ?? ''
    if (!expectedSecret) {
      console.error('[daily-sheet-export] EXPORT_SECRET is not configured')
      return json({ error: 'EXPORT_FAILED' }, 500)
    }

    const provided = request.headers.get('x-export-secret') ?? ''
    if (!secretMatches(provided, expectedSecret)) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const body = (await request.json().catch(() => ({}))) as {
      mode?: Mode
      days?: number
    }

    if (body.mode !== 'incremental' && body.mode !== 'daily') {
      return json({ error: 'mode must be "incremental" or "daily"' }, 400)
    }

    const requestedDays = Number(body.days)
    const days = Number.isFinite(requestedDays)
      ? Math.min(31, Math.max(1, Math.floor(requestedDays)))
      : 7

    const admin = createAdmin()
    const targets = await resolveExportTargets(admin)

    if (targets.length === 0) {
      return json({ ok: true, mode: body.mode, hospitals: [], errors: [] })
    }

    const accessToken = await getAccessToken(
      requireEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
      requireEnv('GOOGLE_PRIVATE_KEY'),
    )

    const results: Array<{ hospitalId: string; appended: number; deleted?: number }> = []
    const errors: string[] = []

    // One clinic's misconfigured Sheet must not stop the others from exporting.
    for (const target of targets) {
      try {
        if (body.mode === 'incremental') {
          const result = await runIncremental(admin, target, accessToken)
          results.push({ hospitalId: target.id, appended: result.appended })
        } else {
          const result = await runDaily(admin, target, accessToken, days)
          results.push({ hospitalId: target.id, ...result })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`[daily-sheet-export] hospital ${target.id}:`, message)
        errors.push(target.id)
      }
    }

    return json({ ok: errors.length === 0, mode: body.mode, hospitals: results, errors })
  } catch (error) {
    // Error text only: it can carry column names, never patient data.
    const message = error instanceof Error ? error.message : String(error)
    console.error('[daily-sheet-export]', message)
    return json({ error: 'EXPORT_FAILED' }, 500)
  }
})
