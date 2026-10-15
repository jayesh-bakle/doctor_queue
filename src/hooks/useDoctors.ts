import { useCallback, useEffect, useState } from 'react'

import { dataSource } from '../lib/datasource'
import { logTechnicalError, toUserErrorCode, type AppErrorCode } from '../lib/errors'
import type { DoctorOption } from '../types/queue'
import { useLanguage } from './useLanguage'

export interface UseDoctorsResult {
  doctors: DoctorOption[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

/**
 * The list of doctors, used by the registration form, the dashboard selector
 * and doctor management.
 *
 * On the patient-facing side the RLS policy returns active doctors only, which
 * is exactly the set the registration form should offer (spec §16).
 *
 * The failure is held as a code rather than a finished sentence, so switching
 * language re-renders the message in the new one instead of leaving a stale
 * sentence behind.
 */
export function useDoctors(includeInactive = false): UseDoctorsResult {
  const { messages } = useLanguage()
  const [doctors, setDoctors] = useState<DoctorOption[]>([])
  const [loading, setLoading] = useState(true)
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null)

  const reload = useCallback(async () => {
    try {
      const result = await dataSource.listDoctors({ includeInactive })
      setDoctors(result)
      setErrorCode(null)
    } catch (caught) {
      logTechnicalError('useDoctors', caught)
      setErrorCode(toUserErrorCode(caught))
    } finally {
      setLoading(false)
    }
  }, [includeInactive])

  useEffect(() => {
    void reload()
  }, [reload])

  return { doctors, loading, error: errorCode ? messages.errors[errorCode] : null, reload }
}
