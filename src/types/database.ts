/**
 * Database row shapes.
 *
 * These mirror the SQL in `supabase/migrations/` by hand. The project does not
 * use generated Supabase types so that the schema stays readable to whoever
 * maintains the clinic's database — if you change a migration, change the
 * matching type here.
 */

export type PatientType = 'NEW' | 'FOLLOWUP'

export type QueueStatus = 'WAITING' | 'CALLED' | 'IN_CONSULTATION' | 'COMPLETED' | 'SKIPPED'

export type StaffRole = 'RECEPTION' | 'ADMIN'

export interface HospitalRow {
  id: string
  name: string
  address: string | null
  phone: string | null
  timezone: string
  announcement_enabled: boolean
  display_message: string
  avg_consultation_minutes: number
  created_at: string
}

export interface DoctorRow {
  id: string
  hospital_id: string
  name: string
  department: string
  room_number: string
  is_active: boolean
  display_order: number
  created_at: string
}

export interface QueueEntryRow {
  id: string
  public_id: string
  hospital_id: string
  doctor_id: string
  queue_date: string
  token_number: number
  patient_name: string
  mobile: string | null
  patient_type: PatientType
  status: QueueStatus
  created_at: string
  called_at: string | null
  completed_at: string | null
}

/** A row of `queue_events`. Contains no personal data by design. */
export interface QueueEventRow {
  id: number
  hospital_id: string
  doctor_id: string
  queue_date: string
  event_type: string
  current_token: number | null
  next_token: number | null
  waiting_count: number
  created_at: string
}

export interface StaffUserRow {
  id: string
  hospital_id: string
  full_name: string
  role: StaffRole
  created_at: string
}

// ---------------------------------------------------------------------------
// RPC return shapes
// ---------------------------------------------------------------------------

/** `register_patient(...)` */
export interface RegisterPatientResult {
  public_id: string
  token_number: number
  queue_date: string
  doctor_id: string
  doctor_name: string
  department: string
  room_number: string
  hospital_name: string
}

/** `get_token_status(...)` */
export interface TokenStatusResult {
  public_id: string
  token_number: number
  status: QueueStatus
  patient_name: string
  patient_type: PatientType
  queue_date: string
  created_at: string
  called_at: string | null
  doctor_id: string
  doctor_name: string
  department: string
  room_number: string
  hospital_name: string
  hospital_phone: string | null
  /** The hospital's own clock, so the token page never assumes IST. */
  hospital_timezone: string
  current_token: number | null
  next_token: number | null
  waiting_count: number
  patients_ahead: number
  avg_consultation_minutes: number
  announcement_enabled: boolean
}

/** `get_public_queue(...)` — the TV payload. No patient data. */
export interface PublicQueueResult {
  doctor_id: string
  doctor_name: string
  department: string
  room_number: string
  is_active: boolean
  hospital_name: string
  hospital_address: string | null
  hospital_phone: string | null
  /** The hospital's own clock, so the TV never assumes IST. */
  hospital_timezone: string
  display_message: string
  announcement_enabled: boolean
  avg_consultation_minutes: number
  queue_date: string
  current_token: number | null
  next_token: number | null
  waiting_count: number
  total_today: number
  updated_at: string
}

/** `call_next_patient(...)` — also used to build the spoken announcement. */
export interface CallNextResult {
  called_token: number
  called_public_id: string
  out_doctor_id: string
  doctor_name: string
  department: string
  room_number: string
}

/** `recall_patient(...)` */
export interface RecallResult {
  token_number: number
  doctor_name: string
  room_number: string
}
