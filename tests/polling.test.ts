import { describe, expect, it } from 'vitest'

import {
  POLL_FAR_MS,
  POLL_MID_MS,
  POLL_NEAR_MS,
  jitteredDelay,
  pollDelayFor,
} from '../src/lib/polling'

describe('patient poll intervals', () => {
  it('polls fastest when the patient is close to being called', () => {
    expect(pollDelayFor(0)).toBe(POLL_NEAR_MS)
    expect(pollDelayFor(10)).toBe(POLL_NEAR_MS)
  })

  it('polls less often in the middle of the queue', () => {
    expect(pollDelayFor(11)).toBe(POLL_MID_MS)
    expect(pollDelayFor(25)).toBe(POLL_MID_MS)
  })

  it('polls sparsely when the patient is far away', () => {
    expect(pollDelayFor(26)).toBe(POLL_FAR_MS)
    expect(pollDelayFor(400)).toBe(POLL_FAR_MS)
  })

  it('keeps jitter within ten percent of the base interval', () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const delay = jitteredDelay(POLL_NEAR_MS)
      expect(delay).toBeGreaterThanOrEqual(POLL_NEAR_MS * 0.9 - 1)
      expect(delay).toBeLessThanOrEqual(POLL_NEAR_MS * 1.1 + 1)
    }
  })
})
