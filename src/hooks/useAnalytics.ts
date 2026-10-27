import { useCallback, useEffect, useRef, useState } from 'react'

import { dataSource } from '../lib/datasource'
import { logTechnicalError, toUserErrorCode, type AppErrorCode } from '../lib/errors'
import type {
  HospitalAnalytics,
  PlatformAnalytics,
  TodaySummary,
} from '../types/analytics'
import { useLanguage } from './useLanguage'
import { useRealtimeHospital } from './useRealtimeHospital'

interface AnalyticsResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useHospitalAnalytics(
  hospitalId: string | null,
  from: string,
  to: string,
  doctorId: string | null,
): AnalyticsResult<HospitalAnalytics> {
  const { messages } = useLanguage()
  const [data, setData] = useState<HospitalAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
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
      setData(null)
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const result = await dataSource.getHospitalAnalytics(hospitalId, from, to, doctorId)
      if (!mountedRef.current) return
      setData(result)
      setErrorCode(null)
    } catch (caught) {
      if (!mountedRef.current) return
      logTechnicalError('useHospitalAnalytics', caught)
      setErrorCode(toUserErrorCode(caught))
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [doctorId, from, hospitalId, to])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    data,
    loading,
    error: errorCode ? messages.errors[errorCode] : null,
    refresh,
  }
}

export function usePlatformAnalytics(
  from: string,
  to: string,
): AnalyticsResult<PlatformAnalytics> {
  const { messages } = useLanguage()
  const [data, setData] = useState<PlatformAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const result = await dataSource.getPlatformAnalytics(from, to)
      if (!mountedRef.current) return
      setData(result)
      setErrorCode(null)
    } catch (caught) {
      if (!mountedRef.current) return
      logTechnicalError('usePlatformAnalytics', caught)
      setErrorCode(toUserErrorCode(caught))
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [from, to])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    data,
    loading,
    error: errorCode ? messages.errors[errorCode] : null,
    refresh,
  }
}

export function useTodaySummary(hospitalId: string | null): AnalyticsResult<TodaySummary> {
  const { messages } = useLanguage()
  const [data, setData] = useState<TodaySummary | null>(null)
  const [loading, setLoading] = useState(true)
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
      setData(null)
      setLoading(false)
      return
    }

    try {
      const result = await dataSource.getTodaySummary(hospitalId)
      if (!mountedRef.current) return
      setData(result)
      setErrorCode(null)
    } catch (caught) {
      if (!mountedRef.current) return
      logTechnicalError('useTodaySummary', caught)
      setErrorCode(toUserErrorCode(caught))
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [hospitalId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // One hospital-level channel covers every doctor. The dashboard already has a
  // per-doctor queue channel; this one exists so a registration for a doctor the
  // receptionist is not currently viewing still updates today's totals.
  useRealtimeHospital(hospitalId, () => {
    void refresh()
  })

  return {
    data,
    loading,
    error: errorCode ? messages.errors[errorCode] : null,
    refresh,
  }
}
