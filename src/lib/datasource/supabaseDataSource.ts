/**
 * Supabase-backed data source — the production implementation.
 *
 * Everything that touches patient data goes through an RPC rather than a table
 * query, because the anon role has no privileges on `queue_entries` at all. The
 * functions in `supabase/migrations/003_queue_functions.sql` are the API; this
 * file is a thin, typed wrapper over them.
 */

import type {
  CallNextResult,
  DoctorRow,
  HospitalRow,
  PublicHospitalQueueRow,
  PublicQueueResult,
  QueueEntryRow,
  QueueStatus,
  RecallResult,
  RegisterPatientResult,
  StaffUserRow,
  TokenPulseResult,
  TokenStatusResult,
} from '../../types/database'
import type {
  HospitalAnalytics,
  PlatformAnalytics,
  TodaySummary,
} from '../../types/analytics'
import type { DoctorOption, QueueEntryView } from '../../types/queue'
import { isTurnstileEnabled } from '../env'
import { AppError, isKnownErrorCode, logTechnicalError, toAppError } from '../errors'
import { getSupabase } from '../supabase'
import {
  toDoctorOption,
  toQueueEntryView,
  type DoctorInput,
  type HospitalSettingsInput,
  type QueueDataSource,
  type RegisterPatientInput,
  type StaffSession,
} from './types'

/** Runs an RPC and converts any failure into an AppError carrying a known code. */
async function callRpc<T>(
  fn: string,
  args: Record<string, unknown>,
  context: string,
): Promise<T> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc(fn, args)

  if (error) {
    logTechnicalError(`${context} — rpc ${fn}`, error)
    throw toAppError(error)
  }

  return data as T
}

/** RPCs declared `returns table (...)` come back as an array; take the first row. */
function firstRow<T>(rows: T[] | null | undefined): T | null {
  if (!Array.isArray(rows) || rows.length === 0) return null
  return rows[0] ?? null
}

async function fetchStaffSession(): Promise<StaffSession | null> {
  const supabase = getSupabase()
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData?.user) return null

  const { data, error } = await supabase
    .from('staff_users')
    .select('*')
    .eq('id', userData.user.id)
    .maybeSingle<StaffUserRow>()

  if (error) {
    logTechnicalError('fetchStaffSession', error)
    return null
  }
  if (!data) return null

  // The RPC is added by 011_analytics.sql. Before that migration is applied the
  // call fails; treat that as "not a platform admin" so normal staff login keeps
  // working while a project is being upgraded.
  const { data: platformAdmin, error: platformError } = await supabase.rpc('is_platform_admin')
  if (platformError) {
    logTechnicalError('fetchStaffSession — platform admin check', platformError)
  }

  return {
    userId: data.id,
    email: userData.user.email ?? '',
    fullName: data.full_name,
    role: data.role,
    hospitalId: data.hospital_id,
    isPlatformAdmin: platformAdmin === true,
  }
}

export const supabaseDataSource: QueueDataSource = {
  kind: 'supabase',

  // ---- doctors ----------------------------------------------------------

  async listDoctors(options): Promise<DoctorOption[]> {
    const supabase = getSupabase()
    let query = supabase.from('doctors').select('*')

    // One deployment serves several clinics, so the hospital filter is what
    // keeps the registration form and the dashboard from listing another
    // clinic's doctors. RLS is the second line of defence for staff.
    if (options?.hospitalId) {
      query = query.eq('hospital_id', options.hospitalId)
    }

    // Note: the anon role's RLS policy only exposes active doctors, so
    // includeInactive is meaningful for staff only.
    if (!options?.includeInactive) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query
      .order('display_order', { ascending: true })
      .order('name', { ascending: true })
      .returns<DoctorRow[]>()

    if (error) {
      logTechnicalError('listDoctors', error)
      throw toAppError(error)
    }

    return (data ?? []).map(toDoctorOption)
  },

  async createDoctor(input: DoctorInput): Promise<DoctorOption> {
    const supabase = getSupabase()
    const staff = await fetchStaffSession()
    if (!staff) throw new AppError('NOT_AUTHORIZED')

    const { data, error } = await supabase
      .from('doctors')
      .insert({
        hospital_id: staff.hospitalId,
        name: input.name.trim(),
        department: input.department.trim(),
        room_number: input.roomNumber.trim(),
        is_active: input.isActive,
        display_order: input.displayOrder ?? 0,
      })
      .select('*')
      .single<DoctorRow>()

    if (error) {
      logTechnicalError('createDoctor', error)
      throw toAppError(error)
    }

    return toDoctorOption(data)
  },

  async updateDoctor(id: string, input: Partial<DoctorInput>): Promise<DoctorOption> {
    const supabase = getSupabase()

    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name.trim()
    if (input.department !== undefined) patch.department = input.department.trim()
    if (input.roomNumber !== undefined) patch.room_number = input.roomNumber.trim()
    if (input.isActive !== undefined) patch.is_active = input.isActive
    if (input.displayOrder !== undefined) patch.display_order = input.displayOrder

    const { data, error } = await supabase
      .from('doctors')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single<DoctorRow>()

    if (error) {
      logTechnicalError('updateDoctor', error)
      throw toAppError(error)
    }

    return toDoctorOption(data)
  },

  async deleteDoctor(id: string): Promise<void> {
    const supabase = getSupabase()

    // Both `queue_entries.doctor_id` and `queue_events.doctor_id` are
    // `on delete cascade`, so a bare DELETE would quietly take every patient
    // record this doctor ever saw along with it. Check first and refuse: a
    // real doctor is taken off the queue by deactivating, which keeps their
    // history and simply hides them from the patient form.
    const { count, error: countError } = await supabase
      .from('queue_entries')
      .select('public_id', { count: 'exact', head: true })
      .eq('doctor_id', id)

    if (countError) {
      logTechnicalError('deleteDoctor — history check', countError)
      throw toAppError(countError)
    }
    if ((count ?? 0) > 0) throw new AppError('DOCTOR_HAS_HISTORY')

    const { error } = await supabase.from('doctors').delete().eq('id', id)

    if (error) {
      logTechnicalError('deleteDoctor', error)
      throw toAppError(error)
    }
  },

  // ---- patient ----------------------------------------------------------

  async registerPatient(input: RegisterPatientInput): Promise<RegisterPatientResult> {
    const args = {
      p_doctor_id: input.doctorId,
      p_patient_name: input.patientName,
      p_mobile: input.mobile,
      p_patient_type: input.patientType,
    }

    // With Turnstile configured, registration goes through the Edge Function:
    // it verifies the captcha with the secret key, then calls the RPC with the
    // service role. The anon role is no longer granted `register_patient`, so
    // spamming the RPC directly is not possible.
    if (isTurnstileEnabled) {
      const supabase = getSupabase()
      const { data, error } = await supabase.functions.invoke('register-patient', {
        body: { ...args, turnstileToken: input.turnstileToken ?? '' },
      })

      if (error) {
        logTechnicalError('registerPatient — edge function', error)

        // The function returns `{ error: 'QUEUE_FULL' }` with a 4xx status;
        // `functions.invoke` turns that into an error, so read it back out.
        const context = (error as { context?: Response }).context
        let code: string | null = null
        if (context) {
          try {
            const body = (await context.clone().json()) as { error?: unknown }
            code = typeof body.error === 'string' ? body.error : null
          } catch {
            // Non-JSON error body — fall through to the generic mapping.
          }
        }

        if (isKnownErrorCode(code)) throw new AppError(code, { cause: error })
        throw toAppError(error)
      }

      if (!data || typeof (data as { public_id?: unknown }).public_id !== 'string') {
        throw new AppError('UNKNOWN')
      }
      return data as RegisterPatientResult
    }

    const rows = await callRpc<RegisterPatientResult[]>('register_patient', args, 'registerPatient')

    const row = firstRow(rows)
    if (!row) throw new AppError('UNKNOWN')
    return row
  },

  async getTokenStatus(publicId: string): Promise<TokenStatusResult | null> {
    const rows = await callRpc<TokenStatusResult[]>('get_token_status', { p_public_id: publicId }, 'getTokenStatus')
    return firstRow(rows)
  },

  async getTokenPulse(publicId: string): Promise<TokenPulseResult | null> {
    const rows = await callRpc<TokenPulseResult[]>(
      'get_token_pulse',
      { p_public_id: publicId },
      'getTokenPulse',
    )
    return firstRow(rows)
  },

  async getPublicQueue(doctorId: string): Promise<PublicQueueResult | null> {
    const rows = await callRpc<PublicQueueResult[]>('get_public_queue', { p_doctor_id: doctorId }, 'getPublicQueue')
    return firstRow(rows)
  },

  async getPublicHospitalQueue(hospitalId: string): Promise<PublicHospitalQueueRow[]> {
    const rows = await callRpc<PublicHospitalQueueRow[]>(
      'get_public_hospital_queue',
      { p_hospital_id: hospitalId },
      'getPublicHospitalQueue',
    )
    return Array.isArray(rows) ? rows : []
  },

  // ---- staff ------------------------------------------------------------

  async signIn(email: string, password: string): Promise<StaffSession> {
    const supabase = getSupabase()

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) {
      logTechnicalError('signIn', error)
      throw new AppError('INVALID_CREDENTIALS', { cause: error })
    }
    if (!data.user) throw new AppError('INVALID_CREDENTIALS')

    const session = await fetchStaffSession()
    if (!session) {
      // Authenticated, but no row in staff_users — an administrator has not
      // linked this account to a hospital yet. Say so, rather than showing an
      // empty dashboard and letting them wonder.
      await supabase.auth.signOut()
      throw new AppError('STAFF_NOT_LINKED')
    }

    return session
  },

  async signOut(): Promise<void> {
    const supabase = getSupabase()
    await supabase.auth.signOut()
  },

  async getCurrentStaff(): Promise<StaffSession | null> {
    return fetchStaffSession()
  },

  // ---- queue ------------------------------------------------------------

  async listQueue(
    doctorId: string,
    queueDate: string,
    options?: { since?: string },
  ): Promise<QueueEntryView[]> {
    const supabase = getSupabase()

    // Explicit columns rather than `*`: export bookkeeping has no business
    // reaching the browser, and every byte avoided counts against free egress.
    let query = supabase
      .from('queue_entries')
      .select(
        'id, public_id, hospital_id, doctor_id, queue_date, token_number, ' +
          'patient_name, mobile, patient_type, status, created_at, called_at, ' +
          'completed_at, updated_at',
      )
      .eq('doctor_id', doctorId)
      .eq('queue_date', queueDate)

    // A live event usually changes one row. `gte` rather than `gt` so two rows
    // sharing a timestamp cannot be missed; merging by id makes the duplicate
    // harmless.
    if (options?.since) {
      query = query.gte('updated_at', options.since)
    }

    const { data, error } = await query
      .order('token_number', { ascending: true })
      .returns<QueueEntryRow[]>()

    if (error) {
      logTechnicalError('listQueue', error)
      throw toAppError(error)
    }

    return (data ?? []).map(toQueueEntryView)
  },

  async callNext(doctorId: string): Promise<CallNextResult | null> {
    const rows = await callRpc<CallNextResult[]>('call_next_patient', { p_doctor_id: doctorId }, 'callNext')
    // An empty result means nobody is waiting — a normal outcome, not an error.
    return firstRow(rows)
  },

  async recall(publicId: string): Promise<RecallResult> {
    const rows = await callRpc<RecallResult[]>('recall_patient', { p_public_id: publicId }, 'recall')
    const row = firstRow(rows)
    if (!row) throw new AppError('TOKEN_NOT_FOUND')
    return row
  },

  async startConsultation(publicId: string): Promise<void> {
    await callRpc<QueueStatus>('start_consultation', { p_public_id: publicId }, 'startConsultation')
  },

  async skip(publicId: string): Promise<void> {
    await callRpc<QueueStatus>('skip_patient', { p_public_id: publicId }, 'skip')
  },

  async complete(publicId: string): Promise<void> {
    await callRpc<QueueStatus>('complete_patient', { p_public_id: publicId }, 'complete')
  },

  // ---- hospital ---------------------------------------------------------

  async getHospital(hospitalId?: string): Promise<HospitalRow | null> {
    const supabase = getSupabase()

    // 1. An explicit id — a patient on /h/:hospitalId. The anon policy allows
    //    reading a hospital's public details.
    if (hospitalId) {
      const { data, error } = await supabase
        .from('hospitals')
        .select('*')
        .eq('id', hospitalId)
        .maybeSingle<HospitalRow>()

      if (error) {
        logTechnicalError('getHospital', error)
        return null
      }
      return data ?? null
    }

    // 2. A signed-in staff member: their own hospital, always.
    const staff = await fetchStaffSession()
    if (staff) {
      const { data, error } = await supabase
        .from('hospitals')
        .select('*')
        .eq('id', staff.hospitalId)
        .maybeSingle<HospitalRow>()

      if (error) {
        logTechnicalError('getHospital — staff', error)
        return null
      }
      return data ?? null
    }

    // 3. Nobody signed in and no id — the single-hospital installation, which
    //    is how every deployment started. Read TWO rows: with one hospital
    //    there is nothing to guess, but two or more means the caller has not
    //    told us which clinic it is, and returning the first would show a
    //    patient the wrong clinic's name.
    const { data, error } = await supabase
      .from('hospitals')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(2)

    if (error) {
      logTechnicalError('getHospital', error)
      return null
    }

    const rows = (data ?? []) as HospitalRow[]
    return rows.length === 1 ? (rows[0] ?? null) : null
  },

  async updateHospital(input: HospitalSettingsInput): Promise<void> {
    const supabase = getSupabase()
    const staff = await fetchStaffSession()
    if (!staff) throw new AppError('NOT_AUTHORIZED')

    const { error } = await supabase
      .from('hospitals')
      .update({
        name: input.name.trim(),
        address: input.address,
        phone: input.phone,
        timezone: input.timezone,
        announcement_enabled: input.announcementEnabled,
        display_message: input.displayMessage,
        avg_consultation_minutes: input.avgConsultationMinutes,
      })
      .eq('id', staff.hospitalId)

    if (error) {
      logTechnicalError('updateHospital', error)
      throw toAppError(error)
    }
  },

  // ---- analytics --------------------------------------------------------

  async getTodaySummary(hospitalId: string): Promise<TodaySummary> {
    return callRpc<TodaySummary>(
      'get_today_summary',
      { p_hospital_id: hospitalId },
      'getTodaySummary',
    )
  },

  async getHospitalAnalytics(
    hospitalId: string,
    from: string,
    to: string,
    doctorId?: string | null,
  ): Promise<HospitalAnalytics> {
    return callRpc<HospitalAnalytics>(
      'get_hospital_analytics',
      {
        p_hospital_id: hospitalId,
        p_from: from,
        p_to: to,
        p_doctor_id: doctorId ?? null,
      },
      'getHospitalAnalytics',
    )
  },

  async getPlatformAnalytics(from: string, to: string): Promise<PlatformAnalytics> {
    return callRpc<PlatformAnalytics>(
      'get_platform_analytics',
      { p_from: from, p_to: to },
      'getPlatformAnalytics',
    )
  },

  // ---- realtime ---------------------------------------------------------

  subscribeToQueue(doctorId: string, onChange: () => void): () => void {
    const supabase = getSupabase()

    const channel = supabase
      .channel(`queue-events:${doctorId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'queue_events',
          filter: `doctor_id=eq.${doctorId}`,
        },
        () => onChange(),
      )
      .subscribe((status) => {
        // After a reconnect the client has missed whatever happened while it was
        // away, so re-read once rather than waiting for the next event.
        if (status === 'SUBSCRIBED') onChange()
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  },

  subscribeToHospital(hospitalId: string, onChange: () => void): () => void {
    const supabase = getSupabase()

    const channel = supabase
      .channel(`hospital:${hospitalId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'queue_events',
          filter: `hospital_id=eq.${hospitalId}`,
        },
        () => onChange(),
      )
      // The TV's doctor list comes from `get_public_hospital_queue()`. A
      // queue-event subscription alone would leave the screen stale when
      // reception adds, edits, reorders or deactivates a doctor. This tiny
      // PII-free table is written by a trigger on `doctors`; receiving it only
      // means "refetch the active-doctor list".
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'hospital_changes',
          filter: `hospital_id=eq.${hospitalId}`,
        },
        () => onChange(),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') onChange()
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  },
}
