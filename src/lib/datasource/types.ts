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
  PublicQueueResult,
  QueueEntryRow,
  RecallResult,
  RegisterPatientResult,
  StaffRole,
  TokenStatusResult,
} from '../../types/database'
import type { DoctorOption, QueueEntryView } from '../../types/queue'

export interface RegisterPatientInput {
  doctorId: string
  patientName: string
  mobile: string | null
  patientType: PatientType
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
  listDoctors(options?: { includeInactive?: boolean }): Promise<DoctorOption[]>
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
  getPublicQueue(doctorId: string): Promise<PublicQueueResult | null>

  // ---- staff ------------------------------------------------------------
  signIn(email: string, password: string): Promise<StaffSession>
  signOut(): Promise<void>
  getCurrentStaff(): Promise<StaffSession | null>

  listQueue(doctorId: string, queueDate: string): Promise<QueueEntryView[]>
  callNext(doctorId: string): Promise<CallNextResult | null>
  recall(publicId: string): Promise<RecallResult>
  startConsultation(publicId: string): Promise<void>
  skip(publicId: string): Promise<void>
  complete(publicId: string): Promise<void>

  // ---- hospital settings ------------------------------------------------
  getHospital(): Promise<HospitalRow | null>
  updateHospital(input: HospitalSettingsInput): Promise<void>

  // ---- realtime ---------------------------------------------------------
  /**
   * Calls `onChange` whenever this doctor's queue may have changed. Returns an
   * unsubscribe function. Implementations must not leak subscriptions or throw
   * when the network drops.
   */
  subscribeToQueue(doctorId: string, onChange: () => void): () => void

  // ---- demo only (absent on the Supabase backend) -----------------------
  resetDemoData?(): Promise<void>
  seedDemoQueue?(doctorId: string, count: number): Promise<void>
}
