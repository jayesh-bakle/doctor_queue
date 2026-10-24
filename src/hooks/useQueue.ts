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

/** Collapse a burst of realtime events into one delta read. */
const DELTA_DEBOUNCE_MS = 1_000

function maxUpdatedAt(rows: ReadonlyArray<QueueEntryView>): string | null {
  let latest: string | null = null
  for (const row of rows) {
    if (!latest || row.updatedAt > latest) latest = row.updatedAt
  }
  return latest
}

/**
 * The reception dashboard's queue for one doctor on one day.
 *
 * Realtime still tells the dashboard that something changed, but the event is
 * only a signal: the row itself is fetched with `listQueue(..., { since })`,
 * which asks for the handful of rows updated since the last read. Re-reading
 * the whole day on every registration was the largest egress cost in the app.
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
  const sinceRef = useRef<string | null>(null)
  const debounceRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current)
    }
  }, [])

  // A different doctor or a different day is a different queue: clear the old
  // rows immediately rather than showing yesterday's patients under today's date.
  useEffect(() => {
    setEntries([])
    sinceRef.current = null
    setLoading(true)
  }, [doctorId, queueDate])

  const refresh = useCallback(async () => {
    if (!doctorId) {
      setEntries([])
      sinceRef.current = null
      setLoading(false)
      return
    }

    try {
      const rows = await dataSource.listQueue(doctorId, queueDate)
      if (!mountedRef.current) return
      setEntries(rows)
      sinceRef.current = maxUpdatedAt(rows)
      setErrorCode(null)
    } catch (caught) {
      if (!mountedRef.current) return
      logTechnicalError('useQueue', caught)
      setErrorCode(toUserErrorCode(caught))
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [doctorId, queueDate])

  const refreshDelta = useCallback(async () => {
    if (!doctorId) return

    // No cursor yet (first load still in flight): fall back to a full read.
    if (!sinceRef.current) {
      await refresh()
      return
    }

    try {
      const rows = await dataSource.listQueue(doctorId, queueDate, { since: sinceRef.current })
      if (!mountedRef.current || rows.length === 0) return

      setEntries((previous) => {
        const byId = new Map(previous.map((entry) => [entry.publicId, entry]))
        for (const row of rows) byId.set(row.publicId, row)
        return Array.from(byId.values()).sort((a, b) => a.tokenNumber - b.tokenNumber)
      })

      const latest = maxUpdatedAt(rows)
      if (latest && (!sinceRef.current || latest > sinceRef.current)) {
        sinceRef.current = latest
      }
      setErrorCode(null)
    } catch (caught) {
      if (!mountedRef.current) return
      logTechnicalError('useQueue — delta', caught)
      setErrorCode(toUserErrorCode(caught))
    }
  }, [doctorId, queueDate, refresh])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const onQueueEvent = useCallback(() => {
    if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = undefined
      void refreshDelta()
    }, DELTA_DEBOUNCE_MS)
  }, [refreshDelta])

  useRealtimeQueue(doctorId, onQueueEvent)

  return { entries, loading, error: errorCode ? messages.errors[errorCode] : null, refresh }
}
