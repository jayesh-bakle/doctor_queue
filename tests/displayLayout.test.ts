import { describe, expect, it } from 'vitest'

import {
  DISPLAY_PAGE_SIZE,
  DISPLAY_SINGLE_PAGE_LIMIT,
  buildDoctorPages,
  cardClassFor,
  displaySignature,
  gridClassFor,
  nextPageIndex,
  shouldRotatePages,
} from '../src/lib/displayLayout'

function doctors(count: number, prefix = 'd') {
  return Array.from({ length: count }, (_, index) => ({ id: `${prefix}${index + 1}`, token: index }))
}

describe('shared TV pagination', () => {
  it('has no pages when there are no active doctors', () => {
    expect(buildDoctorPages([])).toEqual([])
  })

  it('keeps one to six doctors on a single page', () => {
    for (let count = 1; count <= DISPLAY_SINGLE_PAGE_LIMIT; count += 1) {
      const list = doctors(count)
      expect(buildDoctorPages(list), `count ${count}`).toEqual([list])
    }
  })

  it('splits seven to ten doctors into pages of five', () => {
    expect(buildDoctorPages(doctors(7)).map((page) => page.length)).toEqual([5, 2])
    expect(buildDoctorPages(doctors(8)).map((page) => page.length)).toEqual([5, 3])
    expect(buildDoctorPages(doctors(9)).map((page) => page.length)).toEqual([5, 4])
    expect(buildDoctorPages(doctors(10)).map((page) => page.length)).toEqual([5, 5])
  })

  it('keeps working if reception adds more than the expected ten doctors', () => {
    const pages = buildDoctorPages(doctors(11))
    expect(pages.map((page) => page.length)).toEqual([5, 5, 1])
    expect(pages.flat().map((doctor) => doctor.id)).toEqual(
      doctors(11).map((doctor) => doctor.id),
    )
  })

  it('preserves the order reception set', () => {
    const list = doctors(7)
    expect(buildDoctorPages(list).flat()).toEqual(list)
  })

  it('uses five as the multi-page size', () => {
    expect(DISPLAY_PAGE_SIZE).toBe(5)
  })

  it('only rotates when there is more than one page', () => {
    expect(shouldRotatePages(0)).toBe(false)
    expect(shouldRotatePages(1)).toBe(false)
    expect(shouldRotatePages(2)).toBe(true)
  })

  it('wraps to the first page without ever returning an invalid index', () => {
    expect(nextPageIndex(0, 2)).toBe(1)
    expect(nextPageIndex(1, 2)).toBe(0)
    expect(nextPageIndex(0, 1)).toBe(0)
    expect(nextPageIndex(9, 2)).toBe(1)
    expect(nextPageIndex(-1, 2)).toBe(1)
  })

  it('changes the signature only when the doctor list or its order changes', () => {
    const first = doctors(3)
    const sameIdsWithNewToken = first.map((doctor) => ({ ...doctor, token: doctor.token + 1 }))
    const reordered = [first[1]!, first[0]!, first[2]!]

    const getId = (doctor: { id: string }) => doctor.id
    expect(displaySignature(sameIdsWithNewToken, getId)).toBe(displaySignature(first, getId))
    expect(displaySignature(reordered, getId)).not.toBe(displaySignature(first, getId))
  })

  it('centres the two bottom cards of a five-card page on wide screens', () => {
    expect(gridClassFor(5)).toBe('tv-grid-5')
    expect(cardClassFor(3, 5)).toContain('tv-card-5-start')
    expect(cardClassFor(0, 5)).not.toContain('tv-card-5-start')
    expect(cardClassFor(3, 4)).toBe('')
  })
})
