import { describe, expect, it } from 'vitest'

import type { QueueStatus } from '../src/types/database'
import {
  buildAnnouncementText,
  countPatientsAhead,
  countRemaining,
  deriveSnapshot,
  describeSituation,
  estimateWaitMinutes,
  findNextWaitingToken,
  PATIENT_TYPE_LABELS,
  patientsAheadLabel,
  roomInstruction,
  roomShortLabel,
  sortByToken,
  STATUS_LABELS,
  waitingCountLabel,
} from '../src/lib/queue'

interface Row {
  tokenNumber: number
  status: QueueStatus
}

const row = (tokenNumber: number, status: QueueStatus): Row => ({ tokenNumber, status })

/**
 * A busy morning: tokens 1–3 seen, 4 skipped (patient stepped out), 5–7 waiting.
 * This is the fixture most of the queue rules are checked against, because it
 * contains a skip — the case naive token arithmetic gets wrong.
 */
const morningQueue: Row[] = [
  row(1, 'COMPLETED'),
  row(2, 'COMPLETED'),
  row(3, 'COMPLETED'),
  row(4, 'SKIPPED'),
  row(5, 'CALLED'),
  row(6, 'WAITING'),
  row(7, 'WAITING'),
]

describe('deriveSnapshot', () => {
  it('takes the current token from the entry being called, not from a counter', () => {
    expect(deriveSnapshot(morningQueue).currentToken).toBe(5)
  })

  it('takes the next token from the lowest entry still waiting', () => {
    expect(deriveSnapshot(morningQueue).nextToken).toBe(6)
  })

  it('counts only the waiting entries', () => {
    expect(deriveSnapshot(morningQueue).waitingCount).toBe(2)
  })

  it('reports null current and next for an empty queue rather than zero', () => {
    // Zero would render as token ००० on the TV. Null renders as a dash.
    expect(deriveSnapshot([])).toEqual({ currentToken: null, nextToken: null, waitingCount: 0 })
  })

  it('treats an in-consultation patient as the current token', () => {
    expect(deriveSnapshot([row(1, 'IN_CONSULTATION'), row(2, 'WAITING')]).currentToken).toBe(1)
  })

  it('has no current token when nobody has been called yet', () => {
    expect(deriveSnapshot([row(1, 'WAITING')]).currentToken).toBeNull()
  })

  it('has no next token once everyone has been seen or skipped', () => {
    const finished = [row(1, 'COMPLETED'), row(2, 'SKIPPED')]
    expect(deriveSnapshot(finished).nextToken).toBeNull()
    expect(deriveSnapshot(finished).waitingCount).toBe(0)
  })

  it('picks the lowest when several entries are in flight', () => {
    const snapshot = deriveSnapshot([row(9, 'CALLED'), row(4, 'IN_CONSULTATION')])
    expect(snapshot.currentToken).toBe(4)
  })
})

describe('countPatientsAhead', () => {
  it('counts real waiting rows, not the arithmetic difference', () => {
    // Token 7 has one patient ahead of it (6). Token 6 is next, so nothing ahead.
    expect(countPatientsAhead(morningQueue, 7)).toBe(1)
    expect(countPatientsAhead(morningQueue, 6)).toBe(0)
  })

  it('does not count a skipped token as being ahead (spec §10)', () => {
    // The scenario from the spec: 25 was skipped, current token is 24, and the
    // patient holding 27 must be told the truth — 26 is ahead, 25 is not.
    const queue = [row(24, 'CALLED'), row(25, 'SKIPPED'), row(26, 'WAITING'), row(27, 'WAITING')]
    expect(countPatientsAhead(queue, 27)).toBe(1)
    expect(countPatientsAhead(queue, 26)).toBe(0)
  })

  it('does not count a completed token either', () => {
    const queue = [row(1, 'COMPLETED'), row(2, 'COMPLETED'), row(3, 'WAITING')]
    expect(countPatientsAhead(queue, 3)).toBe(0)
  })

  it('returns zero for the first patient of the day', () => {
    expect(countPatientsAhead([row(1, 'WAITING')], 1)).toBe(0)
  })

  it('ignores tokens ahead of the caller that belong to a later number', () => {
    expect(countPatientsAhead(morningQueue, 1)).toBe(0)
  })
})

describe('findNextWaitingToken', () => {
  it('returns the lowest waiting token regardless of array order', () => {
    expect(findNextWaitingToken([row(7, 'WAITING'), row(6, 'WAITING')])).toBe(6)
  })

  it('skips over called and completed entries', () => {
    expect(findNextWaitingToken([row(1, 'CALLED'), row(2, 'COMPLETED'), row(3, 'WAITING')])).toBe(3)
  })

  it('does not resurrect a skipped patient', () => {
    expect(findNextWaitingToken([row(1, 'SKIPPED'), row(2, 'WAITING')])).toBe(2)
  })

  it('returns null for an empty queue', () => {
    expect(findNextWaitingToken([])).toBeNull()
  })
})

describe('sortByToken', () => {
  it('orders rows by token ascending', () => {
    const sorted = sortByToken([row(9, 'WAITING'), row(2, 'WAITING'), row(5, 'WAITING')])
    expect(sorted.map((r) => r.tokenNumber)).toEqual([2, 5, 9])
  })

  it('does not mutate the array it was given', () => {
    const input = [row(3, 'WAITING'), row(1, 'WAITING')]
    sortByToken(input)
    expect(input.map((r) => r.tokenNumber)).toEqual([3, 1])
  })
})

describe('countRemaining', () => {
  it('includes waiting, called and in-consultation patients', () => {
    expect(countRemaining(morningQueue)).toBe(3)
  })

  it('excludes completed and skipped patients', () => {
    expect(countRemaining([row(1, 'COMPLETED'), row(2, 'SKIPPED')])).toBe(0)
  })
})

describe('estimateWaitMinutes', () => {
  it('multiplies patients ahead by the clinic average', () => {
    expect(estimateWaitMinutes(3, 10)).toBe(30)
  })

  it('respects a clinic that has configured a different average', () => {
    expect(estimateWaitMinutes(4, 7)).toBe(28)
  })

  it('never returns a negative wait', () => {
    expect(estimateWaitMinutes(-3, 10)).toBe(0)
  })

  it('falls back to ten minutes when the average is nonsense', () => {
    expect(estimateWaitMinutes(2, 0)).toBe(20)
  })
})

describe('Marathi wording', () => {
  it('labels every status in Marathi', () => {
    expect(STATUS_LABELS.WAITING).toBe('प्रतीक्षेत')
    expect(STATUS_LABELS.CALLED).toBe('बोलावले')
    expect(STATUS_LABELS.IN_CONSULTATION).toBe('तपासणी सुरू')
    expect(STATUS_LABELS.COMPLETED).toBe('पूर्ण')
    expect(STATUS_LABELS.SKIPPED).toBe('वगळले')
  })

  it('labels both patient types in Marathi', () => {
    expect(PATIENT_TYPE_LABELS.NEW).toBe('नवीन रुग्ण')
    expect(PATIENT_TYPE_LABELS.FOLLOWUP).toBe('पुनर्तपासणी')
  })

  it('renders the room number in Marathi numerals', () => {
    expect(roomShortLabel('1')).toBe('कक्ष क्र. १')
    expect(roomInstruction('2')).toBe('कृपया तपासणी कक्ष क्रमांक २ मध्ये जा.')
  })

  it('builds the spoken announcement exactly as the spec writes it', () => {
    expect(buildAnnouncementText(27, '1')).toBe(
      'टोकन क्रमांक ०२७, कृपया तपासणी कक्ष क्रमांक १ मध्ये या.',
    )
  })

  it('pads the token and the room number differently, on purpose', () => {
    expect(buildAnnouncementText(5, '1')).toContain('००५')
    expect(buildAnnouncementText(5, '1')).toContain('कक्ष क्रमांक १ मध्ये')
  })

  it('labels queue position and waiting count', () => {
    expect(patientsAheadLabel(3)).toBe('आपल्यापुढे: ३ रुग्णे')
    expect(waitingCountLabel(12)).toBe('प्रतीक्षेत: १२')
  })
})

describe('describeSituation', () => {
  const base = { tokenNumber: 7, patientsAhead: 3, currentToken: 5, roomNumber: '1' }

  it('tells a called patient it is their turn and to go to the room', () => {
    const situation = describeSituation({ ...base, status: 'CALLED' })
    expect(situation.tone).toBe('now')
    expect(situation.headline).toBe('आता आपला क्रमांक आहे.')
    expect(situation.detail).toBe('कृपया तपासणी कक्ष क्रमांक १ मध्ये जा.')
    expect(situation.urgent).toBe(true)
  })

  it('tells an in-consultation patient to stay in the room', () => {
    const situation = describeSituation({ ...base, status: 'IN_CONSULTATION' })
    expect(situation.headline).toBe('आपली तपासणी सुरू आहे.')
    expect(situation.detail).toContain('कक्ष क्रमांक १')
  })

  it('urges a waiting patient with nobody ahead to be ready', () => {
    const situation = describeSituation({ ...base, status: 'WAITING', patientsAhead: 0 })
    expect(situation.headline).toBe('आपला क्रमांक जवळ आला आहे.')
    expect(situation.urgent).toBe(true)
  })

  it('warns a waiting patient who is nearly next', () => {
    const situation = describeSituation({ ...base, status: 'WAITING', patientsAhead: 2 })
    expect(situation.headline).toBe('आपला क्रमांक जवळ येत आहे.')
    expect(situation.detail).toContain('२ रुग्णे')
  })

  it('asks a waiting patient further back simply to wait', () => {
    const situation = describeSituation({ ...base, status: 'WAITING', patientsAhead: 6 })
    expect(situation.headline).toBe('आपली नोंदणी झाली आहे. कृपया प्रतीक्षा करा.')
    expect(situation.detail).toBe('६ रुग्णे आपल्यापुढे आहेत.')
  })

  it('sends a skipped patient to reception instead of leaving them waiting', () => {
    const situation = describeSituation({ ...base, status: 'SKIPPED' })
    expect(situation.headline).toBe('आपला क्रमांक वगळण्यात आला आहे.')
    expect(situation.detail).toBe('कृपया रिसेप्शनशी संपर्क साधा.')
    expect(situation.urgent).toBe(true)
  })

  it('lets a completed patient leave, even while the queue is still moving', () => {
    const situation = describeSituation({ ...base, status: 'COMPLETED', patientsAhead: 0 })
    expect(situation.tone).toBe('done')
    expect(situation.urgent).toBe(false)
  })

  it('lets a terminal status win over a queue that still looks busy', () => {
    // A patient who has been seen must not be told to keep waiting.
    expect(describeSituation({ ...base, status: 'COMPLETED', patientsAhead: 9 }).tone).toBe('done')
    expect(describeSituation({ ...base, status: 'SKIPPED', patientsAhead: 9 }).tone).toBe('attention')
  })
})
