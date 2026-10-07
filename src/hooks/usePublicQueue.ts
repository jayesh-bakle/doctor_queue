import { useCallback, useEffect, useRef, useState } from 'react'

import { dataSource } from '../lib/datasource'
import { logTechnicalError, toMarathiError } from '../lib/errors'
import type { PublicQueueResult } from '../types/database'
import { useRealtimeQueue } from './useRealtimeQueue'

export interface UsePublicQueueResult {
  data: PublicQueueResult | null
  loading: boolean
  notFound: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * The public TV display's data.
 *
 * `get_public_queue()` returns only the doctor's name, room, the current and
 * next token and a waiting count — no patient names, no mobile numbers. The
 * display could not show personal data even if a future change asked it to,
 * because the data never arrives.
 */
export function usePublicQueue(doctorId: string | undefined): UsePublicQueueResult {
  const [data, setData] = useState<PublicQueueResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!doctorId) {
      setNotFound(true)
      setLoading(false)
      return
    }

    try {
      const result = await dataSource.getPublicQueue(doctorId)
      if (!mountedRef.current) return
      if (!result) {
        setNotFound(true)
        setData(null)
      } else {
        setNotFound(false)
        setData(result)
      }
      setError(null)
    } catch (caught) {
      if (!mountedRef.current) return
      logTechnicalError('usePublicQueue', caught)
      setError(toMarathiError(caught))
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [doctorId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useRealtimeQueue(doctorId, refresh)

  return { data, loading, notFound, error, refresh }
}
