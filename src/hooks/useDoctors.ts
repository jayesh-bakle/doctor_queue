import { useCallback, useEffect, useState } from 'react'

import { dataSource } from '../lib/datasource'
import { toMarathiError, logTechnicalError } from '../lib/errors'
import type { DoctorOption } from '../types/queue'

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
 */
export function useDoctors(includeInactive = false): UseDoctorsResult {
  const [doctors, setDoctors] = useState<DoctorOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const result = await dataSource.listDoctors({ includeInactive })
      setDoctors(result)
      setError(null)
    } catch (caught) {
      logTechnicalError('useDoctors', caught)
      setError(toMarathiError(caught))
    } finally {
      setLoading(false)
    }
  }, [includeInactive])

  useEffect(() => {
    void reload()
  }, [reload])

  return { doctors, loading, error, reload }
}
