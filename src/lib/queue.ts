/**
 * Pure queue logic.
 *
 * Everything in this file is a plain function over plain data — no Supabase, no
 * DOM, no React, and no user-facing language. That last omission is deliberate:
 * the queue *rules* are the same in every language, so they live here, while the
 * sentences built from them live in `src/lib/i18n/` where each language can
 * phrase them the way it actually speaks.
 *
 * `deriveSnapshot` and `countPatientsAhead` are deliberate mirrors of
 * `compute_queue_snapshot()` and the `patients_ahead` subquery in
 * `supabase/migrations/003_queue_functions.sql`. If you change one, change the
 * other, or the TV and the phone will disagree.
 */

import type { QueueStatus } from '../types/database'
import type { QueueSnapshot } from '../types/queue'

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
 * If token 25 was skipped, the holder of 27 is told "1 patient" ahead, not "2" —
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
