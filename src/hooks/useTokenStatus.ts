import { useCallback, useEffect, useState } from 'react'

import { dataSource } from '../lib/datasource'
import { logTechnicalError, toMarathiError } from '../lib/errors'
import type { TokenStatusResult } from '../types/database'
import { useRealtimeQueue } from './useRealtimeQueue'

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
 * There is no session to key a subscription on, and the patient has no
 * privileges on `queue_entries`, so live updates work in two steps:
 *
 *   1. subscribe to `queue_events` for this patient's doctor — a table that is
 *      public by design and carries no personal data
 *   2. on any event, re-read this patient's own row through `get_token_status()`
 *
 * The phone therefore updates the instant reception calls anyone, without ever
 * being able to see another patient.
 */
export function useTokenStatus(publicId: string | undefined): UseTokenStatusResult {
  const [data, setData] = useState<TokenStatusResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [doctorId, setDoctorId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!publicId) {
      setNotFound(true)
      setLoading(false)
      return
    }

    try {
      const result = await dataSource.getTokenStatus(publicId)
      if (!result) {
        setNotFound(true)
        setData(null)
      } else {
        setNotFound(false)
        setData(result)
        setDoctorId((current) => (current === result.doctor_id ? current : result.doctor_id))
      }
      setError(null)
    } catch (caught) {
      logTechnicalError('useTokenStatus', caught)
      setError(toMarathiError(caught))
    } finally {
      setLoading(false)
    }
  }, [publicId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useRealtimeQueue(doctorId, refresh)

  return { data, loading, notFound, error, refresh }
}
