import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { dataSource } from '../lib/datasource'
import { isDisplayableDoctorQueue, publicQueueToDisplayRow } from '../lib/displayQueue'
import { logTechnicalError, toUserErrorCode, type AppErrorCode } from '../lib/errors'
import type { PublicHospitalQueueRow } from '../types/database'
import { useLanguage } from './useLanguage'
import type { UsePublicHospitalQueueResult } from './usePublicHospitalQueue'
import { useRealtimeHospital } from './useRealtimeHospital'
import { useRealtimeQueue } from './useRealtimeQueue'

export interface UsePublicDisplayQueueParams {
  hospitalId?: string
  doctorId?: string
}

export interface UsePublicDisplayQueueOptions {
  realtime?: boolean
  pollMs?: number
}

export function usePublicDisplayQueue(
  { hospitalId, doctorId }: UsePublicDisplayQueueParams,
  options: UsePublicDisplayQueueOptions = {},
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
    if (!hospitalId && !doctorId) {
      setNotFound(true)
      setLoading(false)
      return
    }

    try {
      let nextRows: PublicHospitalQueueRow[]

      if (doctorId) {
        const result = await dataSource.getPublicQueue(doctorId)
        nextRows = isDisplayableDoctorQueue(result) ? [publicQueueToDisplayRow(result)] : []
      } else if (hospitalId) {
        nextRows = await dataSource.getPublicHospitalQueue(hospitalId)
      } else {
        nextRows = []
      }

      if (!mountedRef.current) return

      if (nextRows.length === 0) {
        setNotFound(true)
        setRows([])
      } else {
        setNotFound(false)
        setRows(nextRows)
      }
      setErrorCode(null)
    } catch (caught) {
      if (!mountedRef.current) return
      logTechnicalError('usePublicDisplayQueue', caught)
      setErrorCode(toUserErrorCode(caught))
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [doctorId, hospitalId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if ((!hospitalId && !doctorId) || pollMs <= 0 || typeof window === 'undefined') return

    const timer = window.setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
        void refresh()
      }
    }, pollMs)
    return () => window.clearInterval(timer)
  }, [doctorId, hospitalId, pollMs, refresh])

  useRealtimeHospital(realtime && !doctorId ? hospitalId : null, refresh)
  useRealtimeQueue(realtime && doctorId ? doctorId : null, refresh, {
    pauseWhenHidden: false,
  })

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
