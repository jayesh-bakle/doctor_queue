import { useCallback, useEffect, useRef, useState } from 'react'

import { dataSource } from '../lib/datasource'
import { logTechnicalError, toUserErrorCode, type AppErrorCode } from '../lib/errors'
import type { QueueEntryView } from '../types/queue'
import { useLanguage } from './useLanguage'
import { useRealtimeQueue } from './useRealtimeQueue'

export interface UseQueueResult {
  entries: QueueEntryView[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * The reception dashboard's queue for one doctor on one day.
 *
 * Realtime updates deliberately do NOT set `loading`. A spinner flashing every
 * time a patient registers would make the dashboard feel broken; the table just
 * updates in place. `loading` is reserved for the first load and for switching
 * doctors, when there is genuinely nothing to show yet.
 */
export function useQueue(doctorId: string | null, queueDate: string): UseQueueResult {
  const { messages } = useLanguage()
  const [entries, setEntries] = useState<QueueEntryView[]>([])
  const [loading, setLoading] = useState(true)
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null)

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // A different doctor or a different day is a different queue: clear the old
  // rows immediately rather than showing yesterday's patients under today's date.
  useEffect(() => {
    setEntries([])
    setLoading(true)
  }, [doctorId, queueDate])

  const refresh = useCallback(async () => {
    if (!doctorId) {
      setEntries([])
      setLoading(false)
      return
    }

    try {
      const rows = await dataSource.listQueue(doctorId, queueDate)
      if (!mountedRef.current) return
      setEntries(rows)
      setErrorCode(null)
    } catch (caught) {
      if (!mountedRef.current) return
      logTechnicalError('useQueue', caught)
      setErrorCode(toUserErrorCode(caught))
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [doctorId, queueDate])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useRealtimeQueue(doctorId, refresh)

  return { entries, loading, error: errorCode ? messages.errors[errorCode] : null, refresh }
}
