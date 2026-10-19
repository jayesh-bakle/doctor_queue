import { useCallback, useEffect, useState } from 'react'

import { dataSource } from '../lib/datasource'
import { logTechnicalError } from '../lib/errors'
import type { HospitalRow } from '../types/database'
import { useHospitalId } from './useHospitalId'

export interface UseHospitalResult {
  hospital: HospitalRow | null
  loading: boolean
  reload: () => Promise<void>
}

/**
 * The hospital's settings row — its name, address, timezone and the
 * configurable average consultation time (spec §17).
 *
 * Kept in the database rather than hardcoded so the clinic can rename itself
 * without a code change, and so the timezone that decides when the queue
 * resets is one auditable value rather than something baked into the build.
 *
 * Which hospital it returns is resolved by `useHospitalId`: an explicit id, the
 * `/h/:hospitalId` route, or the signed-in staff member's hospital. On a
 * one-clinic installation with no id and no login it still returns that clinic.
 */
export function useHospital(hospitalId?: string): UseHospitalResult {
  const resolvedHospitalId = useHospitalId(hospitalId)
  const [hospital, setHospital] = useState<HospitalRow | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    // Re-runs when the resolved id changes — notably when the staff session
    // arrives and `useHospitalId` switches from `undefined` to the clinic.
    try {
      const result = await dataSource.getHospital(resolvedHospitalId)
      setHospital(result)
    } catch (caught) {
      logTechnicalError('useHospital', caught)
    } finally {
      setLoading(false)
    }
  }, [resolvedHospitalId])

  useEffect(() => {
    void reload()
  }, [reload])

  return { hospital, loading, reload }
}
