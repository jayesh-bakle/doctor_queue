import type { LocalizedText } from '../lib/i18n/content'
import type { PatientType, QueueStatus } from './database'

/** The derived state of one doctor's queue — mirrors `compute_queue_snapshot()` in SQL. */
export interface QueueSnapshot {
  currentToken: number | null
  nextToken: number | null
  waitingCount: number
}

export type SituationTone = 'waiting' | 'soon' | 'now' | 'done' | 'attention'

/**
 * What the patient's phone should say right now.
 *
 * `tone` drives colour, but every situation also carries its own wording and an
 * icon, so status is never communicated by colour alone (spec §36).
 */
export interface PatientSituation {
  tone: SituationTone
  headline: string
  detail: string
  /** True when the patient must act now — the phone draws attention to itself. */
  urgent: boolean
}

export interface DoctorOption {
  id: string
  name: string
  department: string
  departmentI18n: LocalizedText
  roomNumber: string
  isActive: boolean
  displayOrder: number
}

/** A queue row as the reception dashboard renders it. */
export interface QueueEntryView {
  publicId: string
  tokenNumber: number
  patientName: string
  mobile: string | null
  patientType: PatientType
  status: QueueStatus
  createdAt: string
  calledAt: string | null
  /** Server-side timestamp used as the delta cursor for live dashboard refreshes. */
  updatedAt: string
}
