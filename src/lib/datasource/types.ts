/**
 * The contract every backend satisfies.
 *
 * Both the real Supabase backend and the offline demo backend implement this
 * one interface, and every hook and page depends only on the interface. That is
 * what lets the entire application — patient registration, reception dashboard,
 * TV display, live updates — run with no database at all, and what keeps the
 * demo honest: it is the same code path, not a mock of the UI.
 */

import type {
  CallNextResult,
  DoctorRow,
  HospitalRow,
  PatientType,
  PublicHospitalQueueRow,
  PublicQueueResult,
  QueueEntryRow,
  RecallResult,
  RegisterPatientResult,
  StaffRole,
  TokenPulseResult,
  TokenStatusResult,
} from '../../types/database'
import type {
  HospitalAnalytics,
  PlatformAnalytics,
  TodaySummary,
} from '../../types/analytics'
import type { DoctorOption, QueueEntryView } from '../../types/queue'

export interface RegisterPatientInput {
  doctorId: string
  patientName: string
  mobile: string | null
  patientType: PatientType
  /**
   * Cloudflare Turnstile response token. Required in production, where the
   * `register-patient` Edge Function verifies it before calling the RPC.
   */
  turnstileToken?: string | null
}

export interface DoctorInput {
  name: string
  department: string
  roomNumber: string
  isActive: boolean
  displayOrder?: number
}

export interface HospitalSettingsInput {
  name: string
  address: string | null
  phone: string | null
  timezone: string
  announcementEnabled: boolean
  displayMessage: string
  avgConsultationMinutes: number
}

export interface StaffSession {
  userId: string
  email: string
  fullName: string
  role: StaffRole
  hospitalId: string
  /** True only for a user listed in `platform_admins`. */
  isPlatformAdmin: boolean
}

/** Maps a raw `queue_entries` row to the shape the dashboard renders. */
export function toQueueEntryView(row: QueueEntryRow): QueueEntryView {
  return {
    publicId: row.public_id,
    tokenNumber: row.token_number,
    patientName: row.patient_name,
    mobile: row.mobile,
    patientType: row.patient_type,
    status: row.status,
    createdAt: row.created_at,
    calledAt: row.called_at,
    updatedAt: row.updated_at,
  }
}

export function toDoctorOption(row: DoctorRow): DoctorOption {
  return {
    id: row.id,
    name: row.name,
    department: row.department,
    roomNumber: row.room_number,
    isActive: row.is_active,
    displayOrder: row.display_order,
  }
}

export interface QueueDataSource {
  /** Distinguishes the demo backend for gating demo-only controls. */
  readonly kind: 'supabase' | 'demo'

  // ---- doctors ----------------------------------------------------------
  /**
   * Active doctors, optionally for one hospital.
   *
   * `hospitalId` is what keeps tenants apart: one deployment serves several
   * clinics, so an unfiltered list would show another clinic's doctors on the
   * registration form. Without it the query keeps its old behaviour — the RLS
   * policy still hides other hospitals from a signed-in staff member.
   */
  listDoctors(options?: { includeInactive?: boolean; hospitalId?: string }): Promise<DoctorOption[]>
  /**
   * Adds a doctor to the signed-in staff member's hospital. The hospital is not
   * a parameter on purpose: it comes from `staff_users`, and the RLS `with
   * check` on `doctors` rejects any other hospital.
   */
  createDoctor(input: DoctorInput): Promise<DoctorOption>
  updateDoctor(id: string, input: Partial<DoctorInput>): Promise<DoctorOption>
  /**
   * Removes a doctor outright, for one added by mistake.
   *
   * Refuses with `DOCTOR_HAS_HISTORY` if the doctor has ever had a patient:
   * `queue_entries` and `queue_events` both cascade from `doctors`, so a bare
   * delete would silently destroy those patients' records. Deactivation is the
   * correct way to take a real doctor off the queue.
   */
  deleteDoctor(id: string): Promise<void>

  // ---- patient (no authentication) --------------------------------------
  registerPatient(input: RegisterPatientInput): Promise<RegisterPatientResult>
  getTokenStatus(publicId: string): Promise<TokenStatusResult | null>
  /**
   * The tiny polled payload for a patient's phone: status, token and counts
   * only. `getTokenStatus` is the full record, read once on page load.
   */
  getTokenPulse(publicId: string): Promise<TokenPulseResult | null>
  getPublicQueue(doctorId: string): Promise<PublicQueueResult | null>
  /**
   * The hospital-wide public payload: one row per active doctor, with no
   * patient data. The shared TV and the registration page both use this instead
   * of one `getPublicQueue` call per doctor.
   */
  getPublicHospitalQueue(hospitalId: string): Promise<PublicHospitalQueueRow[]>

  // ---- staff ------------------------------------------------------------
  signIn(email: string, password: string): Promise<StaffSession>
  signOut(): Promise<void>
  getCurrentStaff(): Promise<StaffSession | null>

  /**
   * The staff dashboard's queue.
   *
   * `since` is an ISO timestamp: when supplied only rows whose `updated_at` is
   * at or after it are returned, which is how a live event becomes a small
   * delta fetch instead of a full re-read of the day.
   */
  listQueue(
    doctorId: string,
    queueDate: string,
    options?: { since?: string },
  ): Promise<QueueEntryView[]>
  callNext(doctorId: string): Promise<CallNextResult | null>
  recall(publicId: string): Promise<RecallResult>
  startConsultation(publicId: string): Promise<void>
  skip(publicId: string): Promise<void>
  complete(publicId: string): Promise<void>

  // ---- hospital settings ------------------------------------------------
  /**
   * One hospital's settings row.
   *
   * With an id, that hospital (a patient scanning `/h/:hospitalId`). Without
   * one, the signed-in staff member's hospital, and otherwise the only hospital
   * in the database — `null` once there are two or more, because guessing would
   * show the wrong clinic's name and timezone.
   */
  getHospital(hospitalId?: string): Promise<HospitalRow | null>
  /** Updates the signed-in staff member's hospital; scoped by RLS. */
  updateHospital(input: HospitalSettingsInput): Promise<void>

  // ---- analytics --------------------------------------------------------
  /**
   * Today's live counts for the reception dashboard. Uses raw queue rows so it
   * is current even before the 15-minute aggregate refresh runs.
   */
  getTodaySummary(hospitalId: string): Promise<TodaySummary>
  /**
   * One hospital's monthly aggregates. The database rejects RECEPTION callers;
   * the page also hides the route from them.
   */
  getHospitalAnalytics(
    hospitalId: string,
    from: string,
    to: string,
    doctorId?: string | null,
  ): Promise<HospitalAnalytics>
  /** All-hospital aggregates. Only a platform admin can call this RPC. */
  getPlatformAnalytics(from: string, to: string): Promise<PlatformAnalytics>

  // ---- realtime ---------------------------------------------------------
  /**
   * Calls `onChange` whenever this doctor's queue may have changed. Returns an
   * unsubscribe function. Implementations must not leak subscriptions or throw
   * when the network drops.
   */
  subscribeToQueue(doctorId: string, onChange: () => void): () => void

  /**
   * Calls `onChange` whenever a queue or the active-doctor list for this
   * hospital may have changed. The shared TV uses one subscription per
   * hospital instead of one per doctor, and must also react when reception
   * adds, edits, reorders or deactivates a doctor.
   */
  subscribeToHospital(hospitalId: string, onChange: () => void): () => void

  // ---- demo only (absent on the Supabase backend) -----------------------
  resetDemoData?(): Promise<void>
  seedDemoQueue?(doctorId: string, count: number): Promise<void>
}
