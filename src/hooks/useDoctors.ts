import { useCallback, useEffect, useState } from 'react'

import { dataSource } from '../lib/datasource'
import { logTechnicalError, toUserErrorCode, type AppErrorCode } from '../lib/errors'
import type { DoctorOption } from '../types/queue'
import { useHospitalId } from './useHospitalId'
import { useLanguage } from './useLanguage'

export interface UseDoctorsOptions {
  /** Staff screens need inactive doctors too; the patient form must not. */
  includeInactive?: boolean
  /** Overrides the resolved hospital — normally only `/h/:hospitalId` does. */
  hospitalId?: string
}

export interface UseDoctorsResult {
  doctors: DoctorOption[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

/**
 * The doctors of one hospital, used by the registration form, the dashboard
 * selector and doctor management.
 *
 * The hospital is resolved by `useHospitalId` — the route's `hospitalId`, the
 * signed-in staff member's clinic, or an explicit override — so no screen can
 * accidentally offer another clinic's doctors.
 *
 * On the patient-facing side the RLS policy returns active doctors only, which
 * is exactly the set the registration form should offer (spec §16).
 *
 * The failure is held as a code rather than a finished sentence, so switching
 * language re-renders the message in the new one instead of leaving a stale
 * sentence behind.
 */
export function useDoctors(options: UseDoctorsOptions = {}): UseDoctorsResult {
  const { includeInactive = false } = options
  const hospitalId = useHospitalId(options.hospitalId)
  const { messages } = useLanguage()
  const [doctors, setDoctors] = useState<DoctorOption[]>([])
  const [loading, setLoading] = useState(true)
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null)

  const reload = useCallback(async () => {
    try {
      const result = await dataSource.listDoctors({ includeInactive, hospitalId })
      setDoctors(result)
      setErrorCode(null)
    } catch (caught) {
      logTechnicalError('useDoctors', caught)
      setErrorCode(toUserErrorCode(caught))
    } finally {
      setLoading(false)
    }
  }, [includeInactive, hospitalId])

  useEffect(() => {
    void reload()
  }, [reload])

  return { doctors, loading, error: errorCode ? messages.errors[errorCode] : null, reload }
}
