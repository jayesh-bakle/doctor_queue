/**
 * Postgres-side tests for the guarantees the browser cannot make.
 *
 * Token allocation is safe because `register_patient()` takes a transaction
 * scoped advisory lock before reading the current maximum, and because a unique
 * constraint backs it up. Neither of those can be proven from JavaScript — they
 * need real concurrent connections against the real function. That is what this
 * file does.
 *
 * The suite SKIPS itself when `SUPABASE_DB_URL` is not set, so `npm test` works
 * for a developer who has not connected a project yet. To run it:
 *
 *     SUPABASE_DB_URL="postgresql://postgres:…@db.<ref>.supabase.co:5432/postgres" \
 *       npm run test:sql
 *
 * The connection string is a server-side secret. It is read from the
 * environment only, is never bundled, and must never be given a `VITE_` prefix.
 */

import { Pool, type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const DB_URL = (process.env.SUPABASE_DB_URL ?? '').trim()

if (DB_URL === '') {
  console.info(
    '\n[tests/sql] SUPABASE_DB_URL is not set — skipping the Postgres concurrency tests.\n' +
      '           Set it, after running the migrations, to exercise the real\n' +
      '           advisory-lock path:\n' +
      '             SUPABASE_DB_URL="postgresql://…" npm run test:sql\n',
  )
}

const suite = DB_URL === '' ? describe.skip : describe

/** How many patients slam the registration function at the same instant. */
const CONCURRENCY = 25

interface Fixture {
  hospitalId: string
  doctorA: string
  doctorB: string
}

let pool: Pool
let fixture: Fixture

async function query<T extends Record<string, unknown>>(
  client: Pool | PoolClient,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await client.query(sql, params)
  return result.rows as T[]
}

beforeAll(async () => {
  // `describe.skip` skips the tests, but not this hook: it belongs to the root
  // suite, which is never skipped. Without this guard `npm test` would try to
  // open a connection to an empty connection string.
  if (DB_URL === '') return

  pool = new Pool({ connectionString: DB_URL, max: CONCURRENCY + 4 })

  const [hospital] = await query<{ id: string }>(
    pool,
    `insert into hospitals (name, timezone) values ($1, 'Asia/Kolkata') returning id`,
    ['चाचणी रुग्णालय'],
  )
  const hospitalId = hospital!.id

  const [doctorA] = await query<{ id: string }>(
    pool,
    `insert into doctors (hospital_id, name, department, room_number)
     values ($1, 'डॉ. चाचणी अ', 'सामान्य वैद्यक', '1') returning id`,
    [hospitalId],
  )
  const [doctorB] = await query<{ id: string }>(
    pool,
    `insert into doctors (hospital_id, name, department, room_number)
     values ($1, 'डॉ. चाचणी ब', 'कान-नाक-घसा', '2') returning id`,
    [hospitalId],
  )

  fixture = { hospitalId, doctorA: doctorA!.id, doctorB: doctorB!.id }
}, 30_000)

afterAll(async () => {
  if (!pool || !fixture) return
  // Cascades to doctors, queue_entries and queue_events. Nothing else in the
  // database references this hospital, so no real data is at risk.
  await query(pool, `delete from hospitals where id = $1`, [fixture.hospitalId])
  // hospital_changes deliberately has no FK to hospitals, so clean it up too.
  await query(pool, `delete from hospital_changes where hospital_id = $1`, [
    fixture.hospitalId,
  ])
  await pool.end()
})

/** Calls the real registration function. */
async function register(
  doctorId: string,
  name: string,
  mobile: string | null = null,
  patientType = 'NEW',
) {
  const rows = await query<{ token_number: number; public_id: string; queue_date: string }>(
    pool,
    `select * from register_patient($1, $2, $3, $4)`,
    [doctorId, name, mobile, patientType],
  )
  return rows[0]!
}

suite('register_patient — concurrency', () => {
  it(`issues ${CONCURRENCY} distinct tokens when ${CONCURRENCY} patients register at once`, async () => {
    // Every call goes out on its own pooled connection before any of them is
    // awaited, so they genuinely contend for the advisory lock.
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) => register(fixture.doctorA, `रुग्ण ${i + 1}`)),
    )

    const tokens = results.map((r) => r.token_number).sort((a, b) => a - b)
    const expected = Array.from({ length: CONCURRENCY }, (_, i) => i + 1)

    expect(tokens).toEqual(expected)
    expect(new Set(tokens).size).toBe(CONCURRENCY)
    expect(new Set(results.map((r) => r.public_id)).size).toBe(CONCURRENCY)
  }, 60_000)

  it('leaves the rows matching the tokens it issued', async () => {
    const rows = await query<{ token_number: number }>(
      pool,
      `select token_number from queue_entries where doctor_id = $1 order by token_number`,
      [fixture.doctorA],
    )
    expect(rows.map((r) => r.token_number)).toEqual(
      Array.from({ length: CONCURRENCY }, (_, i) => i + 1),
    )
  })

  it('starts the first token at 1, the same day for every connection', async () => {
    const rows = await query<{ token_number: number; queue_date: string }>(
      pool,
      `select token_number, queue_date from queue_entries
        where doctor_id = $1 order by token_number limit 1`,
      [fixture.doctorA],
    )
    expect(rows[0]!.token_number).toBe(1)

    const [today] = await query<{ today: string }>(
      pool,
      `select ((now() at time zone 'Asia/Kolkata')::date)::text as today`,
    )
    expect(rows[0]!.queue_date).toBe(today!.today)
  })
})

suite('register_patient — one queue per doctor, per day', () => {
  it('keeps a second doctor on its own numbering', async () => {
    const patient = await register(fixture.doctorB, 'दुसरा डॉक्टर रुग्ण')
    expect(patient.token_number).toBe(1)
  })

  it('does not reuse yesterday’s numbers', async () => {
    // A token from a previous day, as it would look tomorrow morning.
    await query(
      pool,
      `insert into queue_entries
         (hospital_id, doctor_id, queue_date, token_number, patient_name, status, completed_at)
       values ($1, $2, current_date - 1, 7, 'कालचा रुग्ण', 'COMPLETED', now())`,
      [fixture.hospitalId, fixture.doctorB],
    )

    const patient = await register(fixture.doctorB, 'आजचा रुग्ण')
    expect(patient.token_number).toBe(2)
  })
})

suite('the unique constraint backs up the allocation logic', () => {
  it('physically refuses two patients with the same token on the same day', async () => {
    let code: string | undefined
    try {
      await query(
        pool,
        `insert into queue_entries
           (hospital_id, doctor_id, queue_date, token_number, patient_name)
         values ($1, $2, (now() at time zone 'Asia/Kolkata')::date, 1, 'बनावट रुग्ण')`,
        [fixture.hospitalId, fixture.doctorA],
      )
    } catch (error) {
      code = (error as { code?: string }).code
    }
    expect(code).toBe('23505') // unique_violation
  })

  it('refuses a token number below 1', async () => {
    let code: string | undefined
    try {
      await query(
        pool,
        `insert into queue_entries
           (hospital_id, doctor_id, queue_date, token_number, patient_name)
         values ($1, $2, (now() at time zone 'Asia/Kolkata')::date, 0, 'बनावट रुग्ण')`,
        [fixture.hospitalId, fixture.doctorB],
      )
    } catch (error) {
      code = (error as { code?: string }).code
    }
    expect(code).toBe('23514') // check_violation
  })

  it('refuses an empty patient name', async () => {
    await expect(register(fixture.doctorA, '   ')).rejects.toThrow(/NAME_REQUIRED/)
  })

  it('refuses a malformed mobile number', async () => {
    await expect(register(fixture.doctorA, 'चाचणी', '12345')).rejects.toThrow(/INVALID_MOBILE/)
  })

  it('refuses a mobile that starts below 6', async () => {
    await expect(register(fixture.doctorA, 'चाचणी', '1234567890')).rejects.toThrow(/INVALID_MOBILE/)
  })

  it('accepts and normalises the shapes a patient actually types', async () => {
    const rows = await query<{ token_number: number }>(
      pool,
      `select * from register_patient($1, $2, $3, 'NEW')`,
      [fixture.doctorB, 'मोबाईल चाचणी', '+91 98765 43210'],
    )
    expect(rows).toHaveLength(1)

    const stored = await query<{ mobile: string }>(
      pool,
      `select mobile from queue_entries where doctor_id = $1 and patient_name = $2`,
      [fixture.doctorB, 'मोबाईल चाचणी'],
    )
    expect(stored[0]!.mobile).toBe('9876543210')
  })
})

suite('call_next_patient', () => {
  it('does not let two receptionists call two patients at once', async () => {
    const before = await query<{ public_id: string; token_number: number }>(
      pool,
      `select public_id, token_number from queue_entries
        where doctor_id = $1 and queue_date = (now() at time zone 'Asia/Kolkata')::date
        order by token_number`,
      [fixture.doctorB],
    )
    expect(before.length).toBeGreaterThanOrEqual(2)

    // Two clicks in the same instant. They serialise on the same lock key that
    // registration uses, so the outcome is deterministic: the first patient is
    // called, then closed out as the second is called.
    const results = await Promise.all([
      query<{ called_token: number }>(pool, `select * from call_next_patient($1)`, [fixture.doctorB]),
      query<{ called_token: number }>(pool, `select * from call_next_patient($1)`, [fixture.doctorB]),
    ])

    const called = results.flat().map((r) => r.called_token)
    expect(new Set(called).size).toBe(called.length)

    const state = await query<{ status: string; count: string }>(
      pool,
      `select status::text, count(*)::text from queue_entries
        where doctor_id = $1 and queue_date = (now() at time zone 'Asia/Kolkata')::date
        group by status`,
      [fixture.doctorB],
    )
    const byStatus = Object.fromEntries(state.map((r) => [r.status, Number(r.count)]))

    // At most one patient is being seen; the earlier one was closed out.
    expect(byStatus.CALLED ?? 0).toBeLessThanOrEqual(1)
    expect(byStatus.COMPLETED ?? 0).toBeGreaterThanOrEqual(1)
  }, 30_000)

  it('returns no row rather than failing when the queue is empty', async () => {
    const [hospital] = await query<{ id: string }>(
      pool,
      `insert into hospitals (name) values ('रिकामे रुग्णालय') returning id`,
    )
    const [doctor] = await query<{ id: string }>(
      pool,
      `insert into doctors (hospital_id, name) values ($1, 'डॉ. रिकामा') returning id`,
      [hospital!.id],
    )

    const rows = await query(pool, `select * from call_next_patient($1)`, [doctor!.id])
    expect(rows).toHaveLength(0)

    await query(pool, `delete from hospitals where id = $1`, [hospital!.id])
  })
})

suite('get_token_status — patients ahead', () => {
  it('counts real waiting rows, not the token arithmetic (spec §10)', async () => {
    const [hospital] = await query<{ id: string }>(
      pool,
      `insert into hospitals (name) values ('रांग चाचणी रुग्णालय') returning id`,
    )
    const [doctor] = await query<{ id: string }>(
      pool,
      `insert into doctors (hospital_id, name) values ($1, 'डॉ. रांग') returning id`,
      [hospital!.id],
    )

    const first = await register(doctor!.id, 'पहिला')
    const second = await register(doctor!.id, 'दुसरा')
    const third = await register(doctor!.id, 'तिसरा')

    const before = await query<{ patients_ahead: number }>(
      pool,
      `select * from get_token_status($1)`,
      [third.public_id],
    )
    expect(before[0]!.patients_ahead).toBe(2)

    // Token 1 is skipped — the holder of token 3 must be told "१", not "२".
    await query(pool, `select skip_patient($1)`, [first.public_id])
    expect(second.token_number).toBe(2)

    const after = await query<{ patients_ahead: number }>(
      pool,
      `select * from get_token_status($1)`,
      [third.public_id],
    )
    expect(after[0]!.patients_ahead).toBe(1)

    await query(pool, `delete from hospitals where id = $1`, [hospital!.id])
  }, 30_000)
})

suite('the public queue function carries no personal data', () => {
  it('names no patient and no mobile number', async () => {
    const rows = await query<Record<string, unknown>>(
      pool,
      `select * from get_public_queue($1)`,
      [fixture.doctorA],
    )
    const serialised = JSON.stringify(rows)

    expect(serialised).not.toContain('रुग्ण 1')
    expect(serialised).not.toContain('patient_name')
    expect(serialised).not.toContain('mobile')
  })
})

suite('row level security', () => {
  it('denies the anon role any direct access to queue_entries', async () => {
    const rows = await query<{ can_select: boolean; can_insert: boolean; can_update: boolean }>(
      pool,
      `select
         has_table_privilege('anon', 'queue_entries', 'SELECT') as can_select,
         has_table_privilege('anon', 'queue_entries', 'INSERT') as can_insert,
         has_table_privilege('anon', 'queue_entries', 'UPDATE') as can_update`,
    )
    expect(rows[0]!.can_select).toBe(false)
    expect(rows[0]!.can_insert).toBe(false)
    expect(rows[0]!.can_update).toBe(false)
  })

  it('denies the anon role any direct access to staff_users', async () => {
    const rows = await query<{ can_select: boolean }>(
      pool,
      `select has_table_privilege('anon', 'staff_users', 'SELECT') as can_select`,
    )
    expect(rows[0]!.can_select).toBe(false)
  })

  it('keeps the staff-only functions away from anon', async () => {
    for (const fn of [
      'call_next_patient(uuid)',
      'skip_patient(uuid)',
      'complete_patient(uuid)',
      'delete_doctor(uuid)',
    ]) {
      const rows = await query<{ allowed: boolean }>(
        pool,
        `select has_function_privilege('anon', $1, 'EXECUTE') as allowed`,
        [fn],
      )
      expect(rows[0]!.allowed, `anon can execute ${fn}`).toBe(false)
    }
  })

  it('lets anon call the functions a patient legitimately needs', async () => {
    // `register_patient` stays callable until the register-patient Edge Function
    // is deployed; 008_daily_token_cap.sql then documents the revoke. The three
    // read RPCs remain callable because they expose no patient data.
    for (const fn of [
      'register_patient(uuid,text,text,text)',
      'get_token_status(uuid)',
      'get_token_pulse(uuid)',
      'get_public_queue(uuid)',
      'get_public_hospital_queue(uuid)',
    ]) {
      const rows = await query<{ allowed: boolean }>(
        pool,
        `select has_function_privilege('anon', $1, 'EXECUTE') as allowed`,
        [fn],
      )
      expect(rows[0]!.allowed, `anon cannot execute ${fn}`).toBe(true)
    }
  })

  it('routes doctor deletion through the history-checking RPC', async () => {
    const [table] = await query<{ can_delete: boolean }>(
      pool,
      `select has_table_privilege('authenticated', 'doctors', 'DELETE') as can_delete`,
    )
    expect(table!.can_delete).toBe(false)

    const [rpc] = await query<{ allowed: boolean }>(
      pool,
      `select has_function_privilege('authenticated', 'delete_doctor(uuid)', 'EXECUTE') as allowed`,
    )
    expect(rpc!.allowed).toBe(true)
  })
})

suite('get_unexported_entries — bounded Sheet export', () => {
  it('is executable only by the service role', async () => {
    for (const role of ['anon', 'authenticated']) {
      const rows = await query<{ allowed: boolean }>(
        pool,
        `select has_function_privilege($1, 'get_unexported_entries(uuid,integer)', 'EXECUTE') as allowed`,
        [role],
      )
      expect(rows[0]!.allowed, `${role} can read patient export rows`).toBe(false)
    }

    const [service] = await query<{ allowed: boolean }>(
      pool,
      `select has_function_privilege('service_role', 'get_unexported_entries(uuid,integer)', 'EXECUTE') as allowed`,
    )
    expect(service!.allowed).toBe(true)
  })

  it('returns a terminal row until its export mark exists', async () => {
    const [created] = await query<{ id: string }>(
      pool,
      `insert into queue_entries (
         hospital_id, doctor_id, queue_date, token_number,
         patient_name, mobile, patient_type, status
       )
       select $1, $2, current_date, coalesce(max(token_number), 0) + 1,
              'चाचणी नाव', '9876543210', 'NEW', 'COMPLETED'
         from queue_entries
        where doctor_id = $2 and queue_date = current_date
       returning id`,
      [fixture.hospitalId, fixture.doctorB],
    )

    const [pending] = await query<{ id: string }>(
      pool,
      `select id from get_unexported_entries($1, 5000) where id = $2`,
      [fixture.hospitalId, created!.id],
    )
    expect(pending?.id).toBe(created!.id)

    await query(
      pool,
      `insert into hospital_export_marks (entry_id, hospital_id) values ($1, $2)
       on conflict (entry_id, hospital_id) do nothing`,
      [created!.id, fixture.hospitalId],
    )

    const [afterMark] = await query<{ id: string }>(
      pool,
      `select id from get_unexported_entries($1, 5000) where id = $2`,
      [fixture.hospitalId, created!.id],
    )
    expect(afterMark).toBeUndefined()
  })

  it('defaults the daily cap to 2,000', async () => {
    const [column] = await query<{ column_default: string | null }>(
      pool,
      `select column_default from information_schema.columns
        where table_schema = 'public'
          and table_name = 'hospitals'
          and column_name = 'max_daily_tokens'`,
    )
    expect(column?.column_default).toContain('2000')
  })
})

suite('hospital_changes — doctor changes reach the shared TV', () => {
  it('carries only an opaque signal, and anon may read it', async () => {
    const columns = await query<{ column_name: string }>(
      pool,
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'hospital_changes'`,
    )
    expect(columns.map((row) => row.column_name).sort()).toEqual([
      'created_at',
      'hospital_id',
      'id',
    ])

    const [privilege] = await query<{ can_select: boolean }>(
      pool,
      `select has_table_privilege('anon', 'hospital_changes', 'SELECT') as can_select`,
    )
    expect(privilege!.can_select).toBe(true)
  })

  it('emits one signal for a doctor insert, update and delete', async () => {
    const [before] = await query<{ count: number }>(
      pool,
      `select count(*)::integer as count from hospital_changes where hospital_id = $1`,
      [fixture.hospitalId],
    )

    const [created] = await query<{ id: string }>(
      pool,
      `insert into doctors (hospital_id, name, department, room_number)
       values ($1, 'डॉ. बदल', 'सामान्य वैद्यक', '9') returning id`,
      [fixture.hospitalId],
    )

    const [afterInsert] = await query<{ count: number }>(
      pool,
      `select count(*)::integer as count from hospital_changes where hospital_id = $1`,
      [fixture.hospitalId],
    )
    expect(afterInsert!.count).toBe(before!.count + 1)

    await query(pool, `update doctors set room_number = '10' where id = $1`, [created!.id])

    const [afterUpdate] = await query<{ count: number }>(
      pool,
      `select count(*)::integer as count from hospital_changes where hospital_id = $1`,
      [fixture.hospitalId],
    )
    expect(afterUpdate!.count).toBe(afterInsert!.count + 1)

    await query(pool, `delete from doctors where id = $1`, [created!.id])

    const [afterDelete] = await query<{ count: number }>(
      pool,
      `select count(*)::integer as count from hospital_changes where hospital_id = $1`,
      [fixture.hospitalId],
    )
    expect(afterDelete!.count).toBe(afterUpdate!.count + 1)
  })
})

suite('queue_events — the privacy firewall', () => {
  it('has no column capable of holding a patient name', async () => {
    const rows = await query<{ column_name: string }>(
      pool,
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'queue_events'`,
    )
    const columns = rows.map((r) => r.column_name)

    expect(columns).not.toContain('patient_name')
    expect(columns).not.toContain('mobile')
    expect(columns.sort()).toEqual(
      [
        'created_at',
        'current_token',
        'doctor_id',
        'event_type',
        'hospital_id',
        'id',
        'next_token',
        'queue_date',
        'waiting_count',
      ].sort(),
    )
  })

  it('is readable by anon, because the TV has to read it', async () => {
    const rows = await query<{ can_select: boolean }>(
      pool,
      `select has_table_privilege('anon', 'queue_events', 'SELECT') as can_select`,
    )
    expect(rows[0]!.can_select).toBe(true)
  })

  it('writes an event whenever a patient is registered', async () => {
    const rows = await query<{ event_type: string; waiting_count: number }>(
      pool,
      `select event_type, waiting_count from queue_events
        where doctor_id = $1 order by id desc limit 1`,
      [fixture.doctorA],
    )
    expect(rows[0]!.event_type).toBe('INSERT')
    expect(rows[0]!.waiting_count).toBeGreaterThan(0)
  })
})
