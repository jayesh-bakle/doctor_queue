import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { dataSource } from '../lib/datasource'
import { logTechnicalError, toUserErrorCode, type AppErrorCode } from '../lib/errors'
import type { PublicHospitalQueueRow } from '../types/database'
import { useLanguage } from './useLanguage'
import { useRealtimeHospital } from './useRealtimeHospital'

export interface UsePublicHospitalQueueResult {
  /** One row per active doctor. */
  doctors: PublicHospitalQueueRow[]
  /** Hospital header fields, taken from the first row. */
  hospital: PublicHospitalQueueRow | null
  loading: boolean
  notFound: boolean
  error: string | null
  refresh: () => Promise<void>
}

export interface UsePublicHospitalQueueOptions {
  /** The TV uses Realtime; patient phones should poll only. */
  realtime?: boolean
  /** How often to refresh when visible. 0 disables the fallback poll. */
  pollMs?: number
}

/**
 * One hospital's public queue: the shared TV and the registration page.
 *
 * One RPC returns one row per active doctor for the hospital, instead of one
 * request per doctor. The TV additionally opens one Realtime subscription for
 * the whole hospital; the registration page leaves `realtime` off because many
 * patient phones polling are cheaper than many patient websockets. The payload
 * contains no patient name, mobile number or clinical detail — the SQL function
 * selects no such columns.
 */
export function usePublicHospitalQueue(
  hospitalId: string | undefined,
  options: UsePublicHospitalQueueOptions = {},
): UsePublicHospitalQueueResult {
  const realtime = options.realtime ?? true
  const pollMs = options.pollMs ?? 60_000
  const { messages } = useLanguage()
  const [rows, setRows] = useState<PublicHospitalQueueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null)

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!hospitalId) {
      setNotFound(true)
      setLoading(false)
      return
    }

    try {
      const result = await dataSource.getPublicHospitalQueue(hospitalId)
      if (!mountedRef.current) return

      if (result.length === 0) {
        setNotFound(true)
        setRows([])
      } else {
        setNotFound(false)
        setRows(result)
      }
      setErrorCode(null)
    } catch (caught) {
      if (!mountedRef.current) return
      logTechnicalError('usePublicHospitalQueue', caught)
      setErrorCode(toUserErrorCode(caught))
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [hospitalId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Realtime is the TV's primary path, but a single missed doctor-change
  // signal must not leave the screen wrong for the rest of the day. The
  // registration page uses the same RPC with `realtime: false`, so one poll
  // covers every doctor instead of one poll per doctor.
  useEffect(() => {
    if (!hospitalId || pollMs <= 0 || typeof window === 'undefined') return

    const timer = window.setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
        void refresh()
      }
    }, pollMs)
    return () => window.clearInterval(timer)
  }, [hospitalId, pollMs, refresh])

  useRealtimeHospital(realtime ? hospitalId : null, refresh)

  const doctors = useMemo(
    () => rows.filter((row) => row.doctor_id !== null),
    [rows],
  )
  const hospital = rows[0] ?? null

  return {
    doctors,
    hospital,
    loading,
    notFound,
    error: errorCode ? messages.errors[errorCode] : null,
    refresh,
  }
}
