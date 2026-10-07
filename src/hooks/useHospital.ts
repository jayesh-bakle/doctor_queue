import { useCallback, useEffect, useState } from 'react'

import { dataSource } from '../lib/datasource'
import { logTechnicalError } from '../lib/errors'
import type { HospitalRow } from '../types/database'

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
 */
export function useHospital(): UseHospitalResult {
  const [hospital, setHospital] = useState<HospitalRow | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      const result = await dataSource.getHospital()
      setHospital(result)
    } catch (caught) {
      logTechnicalError('useHospital', caught)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { hospital, loading, reload }
}
