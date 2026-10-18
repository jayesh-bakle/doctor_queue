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
 * The function is deployed with `--no-verify-jwt` because cron carries no
 * Supabase user token, so `x-export-secret` is the gate. The service-role key
 * and the Google private key exist only as function secrets — never in the
 * frontend, never in the repository.
 *
 * Privacy: the Sheet is private to the clinic. Logs contain counts and error
 * text only, never a patient's name or mobile number.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import {
  appendRows,
  deleteRows,
  ensureHeader,
  getAccessToken,
  getSheetId,
  readDateColumn,
} from './google.ts'
import {
  SHEET_HEADER,
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
  doctors:
    | { name: string; department: string; room_number: string }
    | Array<{ name: string; department: string; room_number: string }>
    | null
}

const TERMINAL_STATUSES: ExportStatus[] = ['COMPLETED', 'SKIPPED']

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

async function resolveHospital(
  admin: ReturnType<typeof createAdmin>,
): Promise<{ id: string; timeZone: string }> {
  const hospitalId = Deno.env.get('HOSPITAL_ID')?.trim()
  let query = admin.from('hospitals').select('id, timezone').limit(1)
  if (hospitalId) query = query.eq('id', hospitalId)

  const { data, error } = await query.single()
  if (error || !data) {
    throw new Error(
      hospitalId
        ? `HOSPITAL_ID does not match a hospital row: ${error?.message ?? 'not found'}`
        : `No hospital row found: ${error?.message ?? 'empty table'}`,
    )
  }

  return { id: data.id as string, timeZone: (data.timezone as string) || 'Asia/Kolkata' }
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

function toExportEntry(row: QueueRow, doctorOrders: Map<string, number>): ExportEntry {
  const doctor = Array.isArray(row.doctors) ? row.doctors[0] : row.doctors

  return {
    id: row.id,
    queueDate: row.queue_date,
    tokenNumber: row.token_number,
    doctorName: doctor?.name ?? '',
    doctorDisplayOrder: doctorOrders.get(row.doctor_id) ?? 0,
    department: doctor?.department ?? '',
    roomNumber: doctor?.room_number ?? '',
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

async function fetchPendingEntries(
  admin: ReturnType<typeof createAdmin>,
  hospitalId: string,
  doctorOrders: Map<string, number>,
): Promise<ExportEntry[]> {
  const { data, error } = await admin
    .from('queue_entries')
    .select(ENTRY_COLUMNS)
    .eq('hospital_id', hospitalId)
    .is('exported_at', null)
    .in('status', TERMINAL_STATUSES)
    .order('queue_date', { ascending: true })
    .order('token_number', { ascending: true })
    .limit(INCREMENTAL_LIMIT)

  if (error) throw new Error(`Could not read pending queue entries: ${error.message}`)

  return (data ?? []).map((row) => toExportEntry(row as unknown as QueueRow, doctorOrders))
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
  ids: ReadonlyArray<string>,
): Promise<void> {
  for (const batch of chunk(ids, MARK_BATCH_SIZE)) {
    const { error } = await admin
      .from('queue_entries')
      .update({ exported_at: new Date().toISOString() })
      .in('id', batch)

    if (error) throw new Error(`Could not mark rows exported: ${error.message}`)
  }
}

async function runIncremental(
  admin: ReturnType<typeof createAdmin>,
  spreadsheetId: string,
  tab: string,
  accessToken: string,
  hospitalId: string,
  timeZone: string,
): Promise<{ appended: number }> {
  const doctorOrders = await fetchDoctorOrders(admin, hospitalId)
  const entries = await fetchPendingEntries(admin, hospitalId, doctorOrders)

  if (entries.length === 0) return { appended: 0 }

  await ensureHeader(spreadsheetId, tab, SHEET_HEADER, accessToken)
  await appendRows(spreadsheetId, tab, toSheetRows(entries, timeZone), accessToken)
  await markExported(admin, entries.map((entry) => entry.id))

  return { appended: entries.length }
}

async function runDaily(
  admin: ReturnType<typeof createAdmin>,
  spreadsheetId: string,
  tab: string,
  accessToken: string,
  hospitalId: string,
  timeZone: string,
  days: number,
): Promise<{ appended: number; deleted: number }> {
  const dates = recentDates(timeZone, days)
  const target = new Set(dates)

  const doctorOrders = await fetchDoctorOrders(admin, hospitalId)
  const entries = await fetchEntriesForDates(admin, hospitalId, dates, doctorOrders)

  await ensureHeader(spreadsheetId, tab, SHEET_HEADER, accessToken)
  const gridId = await getSheetId(spreadsheetId, tab, accessToken)
  const dateColumn = await readDateColumn(spreadsheetId, tab, accessToken)

  // Indices come from the column *before* the append, so they still name the
  // old rows afterwards: appended rows land below them.
  const staleIndices: number[] = []
  dateColumn.forEach((row, index) => {
    const value = (row[0] ?? '').trim()
    if (target.has(value)) staleIndices.push(index)
  })

  // Append before deleting. If the append fails, the Sheet keeps the previous
  // copy of those days instead of losing them until the next nightly run.
  await appendRows(spreadsheetId, tab, toSheetRows(entries, timeZone), accessToken)
  await deleteRows(spreadsheetId, gridId, staleIndices, accessToken)
  await markExported(admin, entries.map((entry) => entry.id))

  return { appended: entries.length, deleted: staleIndices.length }
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

    const spreadsheetId = requireEnv('GOOGLE_SHEET_ID')
    const tab = Deno.env.get('GOOGLE_SHEET_TAB')?.trim() || 'Queue'

    const admin = createAdmin()
    const hospital = await resolveHospital(admin)
    const accessToken = await getAccessToken(
      requireEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
      requireEnv('GOOGLE_PRIVATE_KEY'),
    )

    const result =
      body.mode === 'incremental'
        ? await runIncremental(
            admin,
            spreadsheetId,
            tab,
            accessToken,
            hospital.id,
            hospital.timeZone,
          )
        : await runDaily(
            admin,
            spreadsheetId,
            tab,
            accessToken,
            hospital.id,
            hospital.timeZone,
            days,
          )

    return json({ ok: true, mode: body.mode, ...result })
  } catch (error) {
    // Error text only: it can carry column names, never patient data.
    const message = error instanceof Error ? error.message : String(error)
    console.error('[daily-sheet-export]', message)
    return json({ error: 'EXPORT_FAILED' }, 500)
  }
})
