import { useEffect, useState } from 'react'

import {
  DISPLAY_ROTATION_MS,
  nextPageIndex,
  shouldRotatePages,
} from '../lib/displayLayout'

export interface UsePageRotationResult<T> {
  pageIndex: number
  pageCount: number
  pageItems: readonly T[]
  rotating: boolean
}

/**
 * Rotates a set of display pages, and reacts to the doctor list changing.
 *
 * `signature` is an ordered list of doctor ids, not the full rows: a new token
 * must not send the TV back to page one, but adding, removing or reordering a
 * doctor must, because that changes what each page contains.
 */
export function usePageRotation<T>(
  pages: readonly (readonly T[])[],
  signature: string,
  intervalMs: number = DISPLAY_ROTATION_MS,
): UsePageRotationResult<T> {
  const pageCount = pages.length
  const [pageIndex, setPageIndex] = useState(0)
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
  )

  // A structural change means the page contents changed. Start from the first
  // page so a patient is not looking at a page that no longer contains their
  // doctor, and so a 6 → 7 doctor change visibly starts the rotation.
  useEffect(() => {
    setPageIndex(0)
  }, [signature, pageCount])

  // If doctors were removed, the old index may no longer exist.
  useEffect(() => {
    setPageIndex((current) => Math.min(current, Math.max(0, pageCount - 1)))
  }, [pageCount])

  useEffect(() => {
    if (typeof document === 'undefined') return

    const updateVisibility = (): void => {
      setVisible(document.visibilityState !== 'hidden')
    }
    document.addEventListener('visibilitychange', updateVisibility)
    return () => document.removeEventListener('visibilitychange', updateVisibility)
  }, [])

  useEffect(() => {
    if (!visible || !shouldRotatePages(pageCount) || typeof window === 'undefined') return

    const timer = window.setInterval(() => {
      setPageIndex((current) => nextPageIndex(current, pageCount))
    }, intervalMs)

    return () => window.clearInterval(timer)
  }, [visible, pageCount, intervalMs, signature])

  return {
    pageIndex,
    pageCount,
    pageItems: pages[pageIndex] ?? pages[0] ?? [],
    rotating: shouldRotatePages(pageCount),
  }
}
