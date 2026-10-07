/**
 * Pure queue logic.
 *
 * Everything in this file is a plain function over plain data — no Supabase, no
 * DOM, no React. That keeps the rules that decide what a patient is told
 * testable in isolation, and lets the offline demo mode reproduce the server's
 * behaviour exactly rather than approximately.
 *
 * `deriveSnapshot` and `countPatientsAhead` are deliberate mirrors of
 * `compute_queue_snapshot()` and the `patients_ahead` subquery in
 * `supabase/migrations/003_queue_functions.sql`. If you change one, change the
 * other, or the TV and the phone will disagree.
 */

import type { PatientType, QueueStatus } from '../types/database'
import type { PatientSituation, QueueSnapshot } from '../types/queue'
import { patientCountLabel, toMarathiDigits, toMarathiNumber } from './marathiDigits'

/**
 * The subset of fields the pure helpers need.
 *
 * Deliberately the camelCase *view* shape rather than the snake_case database
 * row, so these helpers work on what the UI holds. A caller reading raw rows —
 * the demo data source, notably — maps through its own adapter first.
 */
export type MinimalEntry = {
  tokenNumber: number
  status: QueueStatus
}

// ---------------------------------------------------------------------------
// Marathi label maps
// ---------------------------------------------------------------------------

export const STATUS_LABELS: Record<QueueStatus, string> = {
  WAITING: 'प्रतीक्षेत',
  CALLED: 'बोलावले',
  IN_CONSULTATION: 'तपासणी सुरू',
  COMPLETED: 'पूर्ण',
  SKIPPED: 'वगळले',
}

export const PATIENT_TYPE_LABELS: Record<PatientType, string> = {
  NEW: 'नवीन रुग्ण',
  FOLLOWUP: 'पुनर्तपासणी',
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

/**
 * Works out the current token, the next token and the waiting count from the
 * entries themselves.
 *
 * Deriving rather than storing means the display cannot drift: there is no
 * separate "current token" field to forget to update.
 *
 * - current = lowest token that is CALLED or IN_CONSULTATION
 * - next    = lowest token still WAITING
 * - waiting = how many are still WAITING
 */
export function deriveSnapshot(entries: ReadonlyArray<MinimalEntry>): QueueSnapshot {
  let currentToken: number | null = null
  let nextToken: number | null = null
  let waitingCount = 0

  for (const entry of entries) {
    if (entry.status === 'CALLED' || entry.status === 'IN_CONSULTATION') {
      currentToken = currentToken === null ? entry.tokenNumber : Math.min(currentToken, entry.tokenNumber)
    } else if (entry.status === 'WAITING') {
      waitingCount += 1
      nextToken = nextToken === null ? entry.tokenNumber : Math.min(nextToken, entry.tokenNumber)
    }
  }

  return { currentToken, nextToken, waitingCount }
}

/**
 * How many patients are genuinely still ahead of this token.
 *
 * Counts real WAITING rows rather than subtracting token numbers (spec §10).
 * If token 25 was skipped, the holder of 27 is told "१ रुग्ण" ahead, not "२" —
 * because 25 is not waiting for anything any more. Arithmetic on token numbers
 * would also fall apart the moment two doctors' queues are compared.
 */
export function countPatientsAhead(
  entries: ReadonlyArray<MinimalEntry>,
  tokenNumber: number,
): number {
  let ahead = 0
  for (const entry of entries) {
    if (entry.status === 'WAITING' && entry.tokenNumber < tokenNumber) {
      ahead += 1
    }
  }
  return ahead
}

/** Lowest token still WAITING, or null if the queue is clear. */
export function findNextWaitingToken(entries: ReadonlyArray<MinimalEntry>): number | null {
  let next: number | null = null
  for (const entry of entries) {
    if (entry.status === 'WAITING') {
      next = next === null ? entry.tokenNumber : Math.min(next, entry.tokenNumber)
    }
  }
  return next
}

/** Queue rows in the order reception reads them: by token, ascending. */
export function sortByToken<T extends MinimalEntry>(entries: ReadonlyArray<T>): T[] {
  return [...entries].sort((a, b) => a.tokenNumber - b.tokenNumber)
}

/**
 * Patients who still need to be seen today — waiting plus the one currently
 * being called. This is the number reception cares about at a glance.
 */
export function countRemaining(entries: ReadonlyArray<MinimalEntry>): number {
  let remaining = 0
  for (const entry of entries) {
    if (entry.status === 'WAITING' || entry.status === 'CALLED' || entry.status === 'IN_CONSULTATION') {
      remaining += 1
    }
  }
  return remaining
}

// ---------------------------------------------------------------------------
// Estimates
// ---------------------------------------------------------------------------

/**
 * A deliberately rough estimate, shown only ever labelled as an estimate.
 * The clinic's own average consultation time is configurable in Settings.
 */
export function estimateWaitMinutes(
  patientsAhead: number,
  avgConsultationMinutes: number,
): number {
  const ahead = Math.max(0, Math.floor(patientsAhead))
  const perPatient = Math.max(1, Math.floor(avgConsultationMinutes) || 10)
  return ahead * perPatient
}

// ---------------------------------------------------------------------------
// Patient-facing wording
// ---------------------------------------------------------------------------

/** `कक्ष क्र. १` — short form for headers and cards. */
export function roomShortLabel(roomNumber: string): string {
  return `कक्ष क्र. ${toMarathiDigits(roomNumber, 0)}`
}

/** `कृपया तपासणी कक्ष क्रमांक १ मध्ये जा.` */
export function roomInstruction(roomNumber: string): string {
  return `कृपया तपासणी कक्ष क्रमांक ${toMarathiDigits(roomNumber, 0)} मध्ये जा.`
}

/**
 * The full spoken announcement (spec §13):
 * `टोकन क्रमांक ०२७, कृपया तपासणी कक्ष क्रमांक १ मध्ये या.`
 */
export function buildAnnouncementText(tokenNumber: number, roomNumber: string): string {
  return `टोकन क्रमांक ${toMarathiDigits(tokenNumber)}, कृपया तपासणी कक्ष क्रमांक ${toMarathiDigits(
    roomNumber,
    0,
  )} मध्ये या.`
}

/** `आपल्यापुढे: ३ रुग्ण` */
export function patientsAheadLabel(patientsAhead: number): string {
  return `आपल्यापुढे: ${patientCountLabel(patientsAhead)}`
}

/** `प्रतीक्षेत: १२` */
export function waitingCountLabel(waitingCount: number): string {
  return `प्रतीक्षेत: ${toMarathiNumber(waitingCount)}`
}

/**
 * Turns raw queue state into the single sentence the patient should read.
 *
 * Order matters: a terminal status (COMPLETED, SKIPPED) always wins, because a
 * patient who has already been seen must not be told to keep waiting just
 * because other tokens are still moving.
 */
export function describeSituation(params: {
  status: QueueStatus
  tokenNumber: number
  patientsAhead: number
  currentToken: number | null
  roomNumber: string
}): PatientSituation {
  const { status, patientsAhead, roomNumber } = params

  switch (status) {
    case 'SKIPPED':
      return {
        tone: 'attention',
        headline: 'आपला क्रमांक वगळण्यात आला आहे.',
        detail: 'कृपया रिसेप्शनशी संपर्क साधा.',
        urgent: true,
      }

    case 'COMPLETED':
      return {
        tone: 'done',
        headline: 'आपली तपासणी पूर्ण झाली आहे.',
        detail: 'आपल्या भेटीबद्दल धन्यवाद. कृपया निरोप घ्या.',
        urgent: false,
      }

    case 'IN_CONSULTATION':
      return {
        tone: 'now',
        headline: 'आपली तपासणी सुरू आहे.',
        detail: `कृपया तपासणी कक्ष क्रमांक ${toMarathiDigits(roomNumber, 0)} मध्ये राहा.`,
        urgent: false,
      }

    case 'CALLED':
      return {
        tone: 'now',
        headline: 'आता आपला क्रमांक आहे.',
        detail: roomInstruction(roomNumber),
        urgent: true,
      }

    case 'WAITING':
    default:
      if (patientsAhead <= 0) {
        return {
          tone: 'soon',
          headline: 'आपला क्रमांक जवळ आला आहे.',
          detail: 'कृपया तयार राहा — पुढील क्रमांक आपला आहे.',
          urgent: true,
        }
      }
      if (patientsAhead <= 2) {
        return {
          tone: 'soon',
          headline: 'आपला क्रमांक जवळ येत आहे.',
          detail: `${patientCountLabel(patientsAhead)} आपल्यापुढे आहेत. कृपया जवळच राहा.`,
          urgent: false,
        }
      }
      return {
        tone: 'waiting',
        headline: 'आपली नोंदणी झाली आहे. कृपया प्रतीक्षा करा.',
        detail: `${patientCountLabel(patientsAhead)} आपल्यापुढे आहेत.`,
        urgent: false,
      }
  }
}
