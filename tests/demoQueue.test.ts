import { beforeEach, describe, expect, it } from 'vitest'

import { installBrowserEnv, demoStorage, DEMO_STATE_KEY } from './helpers/browserEnv'

// Must happen before the data source module is evaluated: it decides at import
// time whether a `window` exists, and reads localStorage lazily.
installBrowserEnv()

const { demoDataSource, DEMO_CREDENTIALS, DEMO_HOSPITAL_ID } = await import(
  '../src/lib/datasource/demoDataSource'
)
const { AppError } = await import('../src/lib/errors')
const { formatToken } = await import('../src/lib/marathiDigits')

type DataSource = typeof demoDataSource

/**
 * End-to-end tests against the demo backend.
 *
 * These are not tests of a throwaway mock: the demo backend is the same
 * `QueueDataSource` the Supabase backend implements, sharing the same pure
 * helpers as production. Every rule the clinic depends on — token order, the
 * daily reset, per-doctor queues, the skipped-patient arithmetic — is asserted
 * here against real running code.
 *
 * The one guarantee that CANNOT be proven here is genuine cross-process
 * concurrency, which belongs to Postgres. See `tests/sql/`.
 */
async function twoDoctors(source: DataSource) {
  const doctors = await source.listDoctors()
  expect(doctors.length).toBeGreaterThanOrEqual(2)
  return { first: doctors[0]!.id, second: doctors[1]!.id }
}

function register(
  source: DataSource,
  doctorId: string,
  patientName = 'संदीप जाधव',
  mobile: string | null = null,
  patientType: 'NEW' | 'FOLLOWUP' = 'NEW',
) {
  return source.registerPatient({ doctorId, patientName, mobile, patientType })
}

beforeEach(() => {
  // Fresh storage per test, so tokens always start at ००१.
  installBrowserEnv()
})

describe('token generation', () => {
  it('starts the day at token 1', async () => {
    const { first } = await twoDoctors(demoDataSource)
    const result = await register(demoDataSource, first)

    expect(result.token_number).toBe(1)
    expect(formatToken(result.token_number)).toBe('००१')
  })

  it('gives each successive patient the next number', async () => {
    const { first } = await twoDoctors(demoDataSource)

    const a = await register(demoDataSource, first)
    const b = await register(demoDataSource, first)
    const c = await register(demoDataSource, first)

    expect([a.token_number, b.token_number, c.token_number]).toEqual([1, 2, 3])
    expect(formatToken(c.token_number)).toBe('००३')
  })

  it('keeps a separate queue per doctor, each starting at 1', async () => {
    const { first, second } = await twoDoctors(demoDataSource)

    const a1 = await register(demoDataSource, first)
    const a2 = await register(demoDataSource, first)
    const b1 = await register(demoDataSource, second)

    expect([a1.token_number, a2.token_number]).toEqual([1, 2])
    expect(b1.token_number).toBe(1)
  })

  it('never issues the same token twice under simultaneous registration', async () => {
    const { first } = await twoDoctors(demoDataSource)

    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => register(demoDataSource, first, `रुग्ण ${i + 1}`)),
    )

    const tokens = results.map((r) => r.token_number).sort((a, b) => a - b)
    expect(tokens).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(new Set(tokens).size).toBe(12)
  })

  it('gives every patient a distinct public id, which is the only handle they hold', async () => {
    const { first } = await twoDoctors(demoDataSource)

    const results = await Promise.all(
      Array.from({ length: 8 }, () => register(demoDataSource, first)),
    )

    const ids = new Set(results.map((r) => r.public_id))
    expect(ids.size).toBe(8)
  })

  it('resets to 1 the next day while keeping the previous day’s rows', async () => {
    const { first } = await twoDoctors(demoDataSource)

    await register(demoDataSource, first)
    await register(demoDataSource, first)

    // Age the two entries into yesterday's queue.
    const raw = JSON.parse(demoStorage().getItem(DEMO_STATE_KEY) as string)
    expect(raw.entries).toHaveLength(2)
    for (const entry of raw.entries) entry.queue_date = '2020-01-01'
    demoStorage().setItem(DEMO_STATE_KEY, JSON.stringify(raw))

    const today = await register(demoDataSource, first)

    expect(today.token_number).toBe(1)
    const after = JSON.parse(demoStorage().getItem(DEMO_STATE_KEY) as string)
    expect(after.entries).toHaveLength(3)
  })

  it('records the queue date in the hospital timezone', async () => {
    const { first } = await twoDoctors(demoDataSource)
    const hospital = await demoDataSource.getHospital()
    const result = await register(demoDataSource, first)

    const expected = new Intl.DateTimeFormat('en-CA', {
      timeZone: hospital!.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())

    expect(result.queue_date).toBe(expected)
  })
})

describe('registration validation', () => {
  it('refuses a registration with no name', async () => {
    const { first } = await twoDoctors(demoDataSource)

    // A valid registration goes in first, so there is a real stored queue for the
    // rejected one to fail to join. Asserting against an absent key would pass for
    // the wrong reason — it could not tell "the write was refused" apart from
    // "nothing was ever written at all".
    await register(demoDataSource, first)

    await expect(register(demoDataSource, first, '   ')).rejects.toBeInstanceOf(AppError)

    const state = JSON.parse(demoStorage().getItem(DEMO_STATE_KEY) as string)
    expect(state.entries).toHaveLength(1)
    expect(state.entries[0].token_number).toBe(1)
  })

  it('refuses a registration with no doctor', async () => {
    await expect(register(demoDataSource, '')).rejects.toMatchObject({ code: 'DOCTOR_REQUIRED' })
  })

  it('refuses a malformed mobile number', async () => {
    const { first } = await twoDoctors(demoDataSource)

    await expect(register(demoDataSource, first, 'संदीप जाधव', '12345')).rejects.toMatchObject({
      code: 'INVALID_MOBILE',
    })
  })

  it('refuses a doctor that does not exist', async () => {
    await expect(register(demoDataSource, '99999999-9999-9999-9999-999999999999')).rejects.toMatchObject(
      { code: 'DOCTOR_NOT_FOUND' },
    )
  })

  it('refuses a doctor whose queue has been switched off', async () => {
    const { first } = await twoDoctors(demoDataSource)
    await demoDataSource.updateDoctor(first, { isActive: false })

    await expect(register(demoDataSource, first)).rejects.toMatchObject({
      code: 'DOCTOR_INACTIVE',
    })
  })

  it('raises a code the UI can phrase, never a raw error', async () => {
    // The data layer raises machine codes; the sentence a patient reads is
    // chosen at the edge, from their language (`toUserMessage`).
    await expect(register(demoDataSource, '')).rejects.toMatchObject({
      code: 'DOCTOR_REQUIRED',
      message: 'DOCTOR_REQUIRED',
    })
  })

  it('accepts a registration with no mobile number', async () => {
    const { first } = await twoDoctors(demoDataSource)
    const result = await register(demoDataSource, first, 'संदीप जाधव', null)

    expect(result.token_number).toBe(1)
    const state = JSON.parse(demoStorage().getItem(DEMO_STATE_KEY) as string)
    expect(state.entries[0].mobile).toBeNull()
  })

  it('normalises the mobile before storing it', async () => {
    const { first } = await twoDoctors(demoDataSource)
    await register(demoDataSource, first, 'संदीप जाधव', '+91 98765 43210')

    const state = JSON.parse(demoStorage().getItem(DEMO_STATE_KEY) as string)
    expect(state.entries[0].mobile).toBe('9876543210')
  })
})

describe("a patient's own token status", () => {
  it('reports the token, the doctor and the room', async () => {
    const { first } = await twoDoctors(demoDataSource)
    const created = await register(demoDataSource, first)

    const status = await demoDataSource.getTokenStatus(created.public_id)

    expect(status?.token_number).toBe(1)
    expect(status?.status).toBe('WAITING')
    expect(status?.doctor_name).toBe(created.doctor_name)
    expect(status?.room_number).toBe(created.room_number)
    expect(status?.queue_date).toBe(created.queue_date)
  })

  it('counts patients ahead from the real rows', async () => {
    const { first } = await twoDoctors(demoDataSource)

    await register(demoDataSource, first)
    await register(demoDataSource, first)
    const third = await register(demoDataSource, first)

    const status = await demoDataSource.getTokenStatus(third.public_id)
    expect(status?.token_number).toBe(3)
    expect(status?.patients_ahead).toBe(2)
  })

  it('stops counting a patient who was skipped (spec §10)', async () => {
    const { first } = await twoDoctors(demoDataSource)

    const one = await register(demoDataSource, first)
    await register(demoDataSource, first)
    const three = await register(demoDataSource, first)

    expect((await demoDataSource.getTokenStatus(three.public_id))?.patients_ahead).toBe(2)

    await demoDataSource.skip(one.public_id)

    // Token 2 was skipped, so only token 2 is genuinely ahead of token 3.
    expect((await demoDataSource.getTokenStatus(three.public_id))?.patients_ahead).toBe(1)
  })

  it('returns null for a public id that does not exist rather than leaking anything', async () => {
    expect(await demoDataSource.getTokenStatus('00000000-0000-0000-0000-000000000000')).toBeNull()
  })

  it('exposes the patient their own name but nobody else through a public id', async () => {
    const { first } = await twoDoctors(demoDataSource)
    const a = await register(demoDataSource, first, 'संदीप जाधव')
    await register(demoDataSource, first, 'प्रिया शिंदे')

    const status = await demoDataSource.getTokenStatus(a.public_id)
    expect(status?.patient_name).toBe('संदीप जाधव')
    expect(JSON.stringify(status)).not.toContain('प्रिया शिंदे')
  })
})

describe('the public queue (what the TV shows)', () => {
  it('carries no patient name and no mobile number at all', async () => {
    const { first } = await twoDoctors(demoDataSource)
    await register(demoDataSource, first, 'संदीप जाधव', '9876543210')
    await register(demoDataSource, first, 'प्रिया शिंदे', '9812345678')

    const queue = await demoDataSource.getPublicQueue(first)
    const serialised = JSON.stringify(queue)

    // The privacy firewall (spec §14, §19): a name or number on the TV screen
    // in a waiting room full of people is the one mistake that cannot be undone.
    expect(serialised).not.toContain('संदीप')
    expect(serialised).not.toContain('जाधव')
    expect(serialised).not.toContain('प्रिया')
    expect(serialised).not.toContain('9876543210')
    expect(serialised).not.toContain('9812345678')
    expect(queue).not.toHaveProperty('patient_name')
    expect(queue).not.toHaveProperty('mobile')
  })

  it('reports the current, next and waiting numbers', async () => {
    const { first } = await twoDoctors(demoDataSource)
    await register(demoDataSource, first)
    await register(demoDataSource, first)
    await register(demoDataSource, first)

    const queue = await demoDataSource.getPublicQueue(first)
    expect(queue?.waiting_count).toBe(3)
    expect(queue?.next_token).toBe(1)
    expect(queue?.current_token).toBeNull()
    expect(queue?.total_today).toBe(3)
  })

  it('reports nulls rather than zeros for an empty queue', async () => {
    const { first } = await twoDoctors(demoDataSource)
    const queue = await demoDataSource.getPublicQueue(first)

    expect(queue?.current_token).toBeNull()
    expect(queue?.next_token).toBeNull()
    expect(queue?.waiting_count).toBe(0)
  })

  it('returns null for an unknown doctor', async () => {
    expect(await demoDataSource.getPublicQueue('nope')).toBeNull()
  })
})

describe('calling the next patient', () => {
  it('calls the lowest waiting token', async () => {
    const { first } = await twoDoctors(demoDataSource)
    await register(demoDataSource, first)
    await register(demoDataSource, first)

    const result = await demoDataSource.callNext(first)
    expect(result?.called_token).toBe(1)

    const queue = await demoDataSource.getPublicQueue(first)
    expect(queue?.current_token).toBe(1)
    expect(queue?.waiting_count).toBe(1)
  })

  it('completes whoever was being seen before calling the next patient', async () => {
    const { first } = await twoDoctors(demoDataSource)
    const one = await register(demoDataSource, first)
    await register(demoDataSource, first)

    await demoDataSource.callNext(first)
    await demoDataSource.startConsultation(one.public_id)
    await demoDataSource.callNext(first)

    expect((await demoDataSource.getTokenStatus(one.public_id))?.status).toBe('COMPLETED')

    const two = (await demoDataSource.listQueue(first, todayIso())).find((e) => e.tokenNumber === 2)
    expect(two?.status).toBe('CALLED')
  })

  it('returns null instead of throwing when nobody is waiting', async () => {
    const { first } = await twoDoctors(demoDataSource)
    expect(await demoDataSource.callNext(first)).toBeNull()
  })

  it('does not call two patients when reception clicks twice at once', async () => {
    const { first } = await twoDoctors(demoDataSource)
    await register(demoDataSource, first)
    await register(demoDataSource, first)

    const results = await Promise.all([demoDataSource.callNext(first), demoDataSource.callNext(first)])
    const called = results.filter((r) => r !== null).map((r) => r!.called_token)

    // Whoever was called first has already been closed out; the second call
    // moves on to the next patient rather than calling the same one twice.
    expect(new Set(called).size).toBe(called.length)
  })

  it('advances past a skipped patient', async () => {
    const { first } = await twoDoctors(demoDataSource)
    const one = await register(demoDataSource, first)
    await register(demoDataSource, first)

    await demoDataSource.skip(one.public_id)
    const result = await demoDataSource.callNext(first)

    expect(result?.called_token).toBe(2)
  })
})

describe('queue ordering and the staff view', () => {
  it('lists the queue by token, ascending', async () => {
    const { first } = await twoDoctors(demoDataSource)
    await register(demoDataSource, first, 'पहिला')
    await register(demoDataSource, first, 'दुसरा')
    await register(demoDataSource, first, 'तिसरा')

    const entries = await demoDataSource.listQueue(first, todayIso())

    expect(entries.map((e) => e.tokenNumber)).toEqual([1, 2, 3])
    expect(entries.map((e) => e.patientName)).toEqual(['पहिला', 'दुसरा', 'तिसरा'])
  })

  it('keeps the two doctors\' queues apart', async () => {
    const { first, second } = await twoDoctors(demoDataSource)
    await register(demoDataSource, first, 'अ')
    await register(demoDataSource, second, 'ब')
    await register(demoDataSource, second, 'क')

    const firstQueue = await demoDataSource.listQueue(first, todayIso())
    const secondQueue = await demoDataSource.listQueue(second, todayIso())

    expect(firstQueue.map((e) => e.patientName)).toEqual(['अ'])
    expect(secondQueue.map((e) => e.patientName)).toEqual(['ब', 'क'])
  })
})

describe('recall and status transitions', () => {
  it('re-announces a patient who did not hear the call', async () => {
    const { first } = await twoDoctors(demoDataSource)
    const created = await register(demoDataSource, first)
    await demoDataSource.callNext(first)

    const recall = await demoDataSource.recall(created.public_id)
    expect(recall.token_number).toBe(1)
    expect((await demoDataSource.getTokenStatus(created.public_id))?.status).toBe('CALLED')
  })

  it('refuses to recall a patient who is only waiting', async () => {
    const { first } = await twoDoctors(demoDataSource)
    const created = await register(demoDataSource, first)

    await expect(demoDataSource.recall(created.public_id)).rejects.toMatchObject({
      code: 'INVALID_STATUS_TRANSITION',
    })
  })

  it('refuses to start a consultation for a patient who was never called', async () => {
    const { first } = await twoDoctors(demoDataSource)
    const created = await register(demoDataSource, first)

    await expect(demoDataSource.startConsultation(created.public_id)).rejects.toMatchObject({
      code: 'INVALID_STATUS_TRANSITION',
    })
  })

  it('refuses to touch a token that does not exist', async () => {
    await expect(demoDataSource.skip('nope')).rejects.toMatchObject({ code: 'TOKEN_NOT_FOUND' })
  })

  it('completes a patient and takes them out of the waiting count', async () => {
    const { first } = await twoDoctors(demoDataSource)
    const created = await register(demoDataSource, first)
    await demoDataSource.callNext(first)
    await demoDataSource.complete(created.public_id)

    const queue = await demoDataSource.getPublicQueue(first)
    expect(queue?.waiting_count).toBe(0)
    expect(queue?.current_token).toBeNull()
  })
})

describe('staff authentication', () => {
  it('signs in the demo administrator and remembers the session', async () => {
    const session = await demoDataSource.signIn(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password)

    expect(session.role).toBe('ADMIN')
    expect(session.isPlatformAdmin).toBe(true)
    expect(await demoDataSource.getCurrentStaff()).toEqual(session)
  })

  it('refuses a wrong password with a code, not a sentence', async () => {
    await expect(
      demoDataSource.signIn(DEMO_CREDENTIALS.email, 'wrong'),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
  })

  it('forgets the session on sign out', async () => {
    await demoDataSource.signIn(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password)
    await demoDataSource.signOut()

    expect(await demoDataSource.getCurrentStaff()).toBeNull()
  })

  it('is signed out to begin with', async () => {
    expect(await demoDataSource.getCurrentStaff()).toBeNull()
  })
})

describe('doctor management', () => {
  it('hides an inactive doctor from the patient-facing list', async () => {
    const { first } = await twoDoctors(demoDataSource)
    await demoDataSource.updateDoctor(first, { isActive: false })

    const active = await demoDataSource.listDoctors()
    const all = await demoDataSource.listDoctors({ includeInactive: true })

    expect(active.map((d) => d.id)).not.toContain(first)
    expect(all.map((d) => d.id)).toContain(first)
  })

  it('adds a doctor to the end of the list and keeps them for the day', async () => {
    const created = await demoDataSource.createDoctor({
      name: 'डॉ. नवीन',
      department: 'त्वचारोग',
      roomNumber: '3',
      isActive: true,
    })

    const doctors = await demoDataSource.listDoctors()
    expect(doctors.map((d) => d.id)).toContain(created.id)
  })

  it('refuses to update a doctor that does not exist', async () => {
    await expect(demoDataSource.updateDoctor('nope', { name: 'x' })).rejects.toMatchObject({
      code: 'DOCTOR_NOT_FOUND',
    })
  })

  it('deletes a doctor who has never had a patient', async () => {
    const created = await demoDataSource.createDoctor({
      name: 'डॉ. चुकीचे नाव',
      department: 'सामान्य वैद्यक',
      roomNumber: '4',
      isActive: true,
    })

    await demoDataSource.deleteDoctor(created.id)

    const all = await demoDataSource.listDoctors({ includeInactive: true })
    expect(all.map((d) => d.id)).not.toContain(created.id)
  })

  it('refuses to delete a doctor with patient history, rather than cascading it away', async () => {
    const { first } = await twoDoctors(demoDataSource)
    await register(demoDataSource, first)

    await expect(demoDataSource.deleteDoctor(first)).rejects.toMatchObject({
      code: 'DOCTOR_HAS_HISTORY',
    })

    // Both the doctor and the patient record survive — deactivating is the
    // supported way to take a real doctor off the queue.
    const all = await demoDataSource.listDoctors({ includeInactive: true })
    expect(all.map((d) => d.id)).toContain(first)
  })
})

describe('hospital settings', () => {
  it('saves the settings reception changes', async () => {
    await demoDataSource.updateHospital({
      name: 'नवीन रुग्णालय',
      address: null,
      phone: null,
      timezone: 'Asia/Kolkata',
      announcementEnabled: false,
      displayMessage: 'लवकरच सुरू होईल',
      avgConsultationMinutes: 15,
    })

    const hospital = await demoDataSource.getHospital()
    expect(hospital?.name).toBe('नवीन रुग्णालय')
    expect(hospital?.announcement_enabled).toBe(false)
    expect(hospital?.avg_consultation_minutes).toBe(15)
  })

  it('starts with the clinic timezone set to Asia/Kolkata, not the device timezone', async () => {
    expect((await demoDataSource.getHospital())?.timezone).toBe('Asia/Kolkata')
  })
})

describe('demo controls', () => {
  it('seeds a queue through the real registration path', async () => {
    const { first } = await twoDoctors(demoDataSource)
    // The demo-only controls are optional on the shared interface, so they need
    // asserting here; the demo backend is known to implement them.
    await demoDataSource.seedDemoQueue!(first, 5)

    const queue = await demoDataSource.getPublicQueue(first)
    expect(queue?.waiting_count).toBe(5)
    expect(queue?.next_token).toBe(1)
  })

  it('clears the queue when the demo data is reset', async () => {
    const { first } = await twoDoctors(demoDataSource)
    await register(demoDataSource, first)

    await demoDataSource.resetDemoData!()

    expect((await demoDataSource.getPublicQueue(first))?.waiting_count).toBe(0)
    expect((await demoDataSource.listDoctors()).length).toBeGreaterThanOrEqual(2)
  })
})

describe('realtime notifications', () => {
  it('notifies a subscriber when the queue changes', async () => {
    const { first } = await twoDoctors(demoDataSource)

    let notified = 0
    const unsubscribe = demoDataSource.subscribeToQueue(first, () => {
      notified += 1
    })

    await register(demoDataSource, first)
    expect(notified).toBeGreaterThan(0)

    unsubscribe()
  })

  it('stops notifying once the subscriber unsubscribes', async () => {
    const { first } = await twoDoctors(demoDataSource)

    let notified = 0
    demoDataSource.subscribeToQueue(first, () => {
      notified += 1
    })()

    await register(demoDataSource, first)
    expect(notified).toBe(0)
  })

  it('does not notify a subscriber watching a different doctor', async () => {
    const { first, second } = await twoDoctors(demoDataSource)

    let notified = 0
    const unsubscribe = demoDataSource.subscribeToQueue(second, () => {
      notified += 1
    })

    // Registering on the first doctor's queue must not wake the second TV.
    await register(demoDataSource, first)

    expect(notified).toBe(0)
    unsubscribe()
  })

  it('notifies the shared TV when reception adds, edits or removes a doctor', async () => {
    let notified = 0
    const unsubscribe = demoDataSource.subscribeToHospital(DEMO_HOSPITAL_ID, () => {
      notified += 1
    })

    const created = await demoDataSource.createDoctor({
      name: 'डॉ. नवीन',
      department: 'त्वचारोग',
      roomNumber: '3',
      isActive: true,
    })
    await demoDataSource.updateDoctor(created.id, { roomNumber: '4' })
    await demoDataSource.deleteDoctor(created.id)

    expect(notified).toBeGreaterThanOrEqual(3)
    unsubscribe()
  })
})

describe('multi-hospital scoping', () => {
  const OTHER_HOSPITAL_ID = '99999999-9999-9999-9999-999999999999'

  it('lists only the doctors of the requested hospital', async () => {
    const scoped = await demoDataSource.listDoctors({ hospitalId: DEMO_HOSPITAL_ID })

    expect(scoped.length).toBeGreaterThanOrEqual(2)
    expect(await demoDataSource.listDoctors({ hospitalId: OTHER_HOSPITAL_ID })).toEqual([])
  })

  it('returns the hospital by id, and null for an unknown id', async () => {
    const found = await demoDataSource.getHospital(DEMO_HOSPITAL_ID)
    expect(found?.id).toBe(DEMO_HOSPITAL_ID)

    expect(await demoDataSource.getHospital(OTHER_HOSPITAL_ID)).toBeNull()
  })

  it('returns the hospital when no id is given, as on a one-clinic install', async () => {
    expect((await demoDataSource.getHospital())?.id).toBe(DEMO_HOSPITAL_ID)
  })

  it('publishes the hospital timezone so no screen has to assume IST', async () => {
    const { first } = await twoDoctors(demoDataSource)
    const queue = await demoDataSource.getPublicQueue(first)

    expect(queue?.hospital_timezone).toBe('Asia/Kolkata')
  })
})

describe('patient pulse and shared TV payload', () => {
  it('returns only the pulse fields, never the patient name or mobile', async () => {
    const { first } = await twoDoctors(demoDataSource)
    const created = await register(demoDataSource, first, 'संदीप जाधव', '9876543210')

    const pulse = await demoDataSource.getTokenPulse(created.public_id)

    expect(pulse?.token_number).toBe(created.token_number)
    expect(pulse?.status).toBe('WAITING')
    expect(pulse).not.toBeNull()
    expect('patient_name' in pulse!).toBe(false)
    expect('mobile' in pulse!).toBe(false)
  })

  it('returns null for an unknown public id', async () => {
    expect(await demoDataSource.getTokenPulse('no-such-token')).toBeNull()
  })

  it('tracks the doctor current token after a call', async () => {
    const { first } = await twoDoctors(demoDataSource)
    const created = await register(demoDataSource, first)
    await register(demoDataSource, first)

    await demoDataSource.callNext(first)

    const pulse = await demoDataSource.getTokenPulse(created.public_id)
    expect(pulse?.current_token).toBe(1)
    expect(pulse?.waiting_count).toBe(1)
  })

  it('returns one row per active doctor for the shared TV, with no patient data', async () => {
    const { first } = await twoDoctors(demoDataSource)
    await register(demoDataSource, first, 'संदीप जाधव', '9876543210')

    const rows = await demoDataSource.getPublicHospitalQueue(DEMO_HOSPITAL_ID)

    expect(rows.length).toBeGreaterThanOrEqual(2)
    expect(rows[0]?.hospital_name).toBeTruthy()
    expect('patient_name' in rows[0]!).toBe(false)
    expect('mobile' in rows[0]!).toBe(false)
  })

  it('returns no rows for an unknown hospital id', async () => {
    expect(await demoDataSource.getPublicHospitalQueue('99999999-9999-9999-9999-999999999999')).toEqual([])
  })
})

// ---------------------------------------------------------------------------

function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}
