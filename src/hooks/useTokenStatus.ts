import { useCallback, useEffect, useRef, useState } from 'react'

import { dataSource } from '../lib/datasource'
import { logTechnicalError, toUserErrorCode, type AppErrorCode } from '../lib/errors'
import { jitteredDelay, pollDelayFor } from '../lib/polling'
import type { TokenStatusResult } from '../types/database'
import { useLanguage } from './useLanguage'

export interface UseTokenStatusResult {
  data: TokenStatusResult | null
  loading: boolean
  /** The public id is valid in shape but matches no entry. */
  notFound: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * The patient's live token.
 *
 * Two mechanisms, on purpose:
 *
 *   1. `getTokenStatus()` once on mount, for the full record (name, doctor,
 *      hospital, timezone, estimate).
 *   2. `getTokenPulse()` on an adaptive timer, for the tiny set of fields that
 *      change while waiting. The pulse returns only this patient's row, keyed
 *      by the unguessable `public_id`.
 *
 * Polling pauses while the tab is hidden and resumes immediately when it is
 * shown again or the device comes back online. It stops entirely once the
 * consultation is over.
 */
export function useTokenStatus(publicId: string | undefined): UseTokenStatusResult {
  const { messages } = useLanguage()
  const [data, setData] = useState<TokenStatusResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null)

  const mountedRef = useRef(true)
  const dataRef = useRef<TokenStatusResult | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    dataRef.current = data
  }, [data])

  const loadFull = useCallback(async () => {
    // Clear the cursor first: on a route change the previous token's data is
    // still in the ref, and a COMPLETED status there would stop the new token's
    // poll loop before it ever ran.
    dataRef.current = null

    if (!publicId) {
      setNotFound(true)
      setLoading(false)
      return
    }

    try {
      const result = await dataSource.getTokenStatus(publicId)
      if (!mountedRef.current) return
      if (!result) {
        setNotFound(true)
        setData(null)
        dataRef.current = null
      } else {
        setNotFound(false)
        setData(result)
        dataRef.current = result
      }
      setErrorCode(null)
    } catch (caught) {
      if (!mountedRef.current) return
      logTechnicalError('useTokenStatus', caught)
      setErrorCode(toUserErrorCode(caught))
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [publicId])

  /** One poll. Falls back to the full read if the first load has not landed. */
  const poll = useCallback(async () => {
    if (!publicId || !mountedRef.current) return

    try {
      if (!dataRef.current) {
        await loadFull()
        return
      }

      const pulse = await dataSource.getTokenPulse(publicId)
      if (!mountedRef.current) return

      if (!pulse) {
        setNotFound(true)
        setData(null)
        dataRef.current = null
        return
      }

      const merged = { ...dataRef.current, ...pulse }
      setNotFound(false)
      setData(merged)
      dataRef.current = merged
      setErrorCode(null)
    } catch (caught) {
      if (!mountedRef.current) return
      logTechnicalError('useTokenStatus — pulse', caught)
      setErrorCode(toUserErrorCode(caught))
    }
  }, [publicId, loadFull])

  // First, the full record.
  useEffect(() => {
    void loadFull()
  }, [loadFull])

  // Then, the adaptive pulse loop.
  useEffect(() => {
    if (!publicId) return

    let cancelled = false
    let timer: number | undefined

    const clearTimer = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer)
        timer = undefined
      }
    }

    const schedule = () => {
      clearTimer()
      if (cancelled) return

      const current = dataRef.current
      // Nothing left to wait for.
      if (current && (current.status === 'COMPLETED' || current.status === 'SKIPPED')) return
      // A hidden tab costs nothing; `visibilitychange` restarts this.
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return

      const delay = jitteredDelay(pollDelayFor(current?.patients_ahead ?? 0))
      timer = window.setTimeout(() => {
        void (async () => {
          await poll()
          schedule()
        })()
      }, delay)
    }

    const pollNowAndReschedule = () => {
      void (async () => {
        await poll()
        schedule()
      })()
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        pollNowAndReschedule()
      } else {
        clearTimer()
      }
    }

    const onOnline = () => {
      pollNowAndReschedule()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('online', onOnline)
    schedule()

    return () => {
      cancelled = true
      clearTimer()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('online', onOnline)
    }
  }, [publicId, poll])

  return { data, loading, notFound, error: errorCode ? messages.errors[errorCode] : null, refresh: loadFull }
}
