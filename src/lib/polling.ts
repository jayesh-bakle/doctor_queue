/**
 * Adaptive poll intervals for the patient's phone.
 *
 * The patient's device no longer holds a Realtime websocket. At 50–60 waiting
 * patients that fan-out alone exceeds the Supabase free Realtime message quota,
 * and each open socket is one of only 200 free concurrent connections.
 *
 * Polling is driven by how close the patient is to being called: frequent only
 * when it can actually matter, sparse while they are far away. A visible tab is
 * required — a locked phone costs nothing.
 */

export const POLL_NEAR_MS = 15_000
export const POLL_MID_MS = 30_000
export const POLL_FAR_MS = 45_000

/** How long until the next pulse, given the last known queue position. */
export function pollDelayFor(patientsAhead: number): number {
  if (patientsAhead <= 10) return POLL_NEAR_MS
  if (patientsAhead <= 25) return POLL_MID_MS
  return POLL_FAR_MS
}

/** ±10% jitter so sixty phones do not all fire on the same second. */
export function jitteredDelay(base: number): number {
  return Math.round(base * (0.9 + Math.random() * 0.2))
}
