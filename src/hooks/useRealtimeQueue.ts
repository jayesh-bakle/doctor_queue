import { useEffect, useRef } from 'react'

import { dataSource } from '../lib/datasource'

export interface UseRealtimeQueueOptions {
  /**
   * Drop the connection while the tab is hidden and re-subscribe (with a
   * refresh) when it becomes visible. Defaults to true: a background staff tab
   * or a phone should not consume one of the 200 free Realtime connections.
   * The TV display passes false because it is always the foreground screen.
   */
  pauseWhenHidden?: boolean
}

/**
 * Subscribes to live changes for one doctor's queue.
 *
 * `onChange` is held in a ref so that passing an inline arrow function — which
 * is what every caller naturally writes — does not tear down and rebuild the
 * subscription on each render. Reconnecting a realtime channel on every render
 * would drop events and hammer the network.
 */
export function useRealtimeQueue(
  doctorId: string | null | undefined,
  onChange: () => void,
  options: UseRealtimeQueueOptions = {},
): void {
  const pauseWhenHidden = options.pauseWhenHidden ?? true
  const handlerRef = useRef(onChange)

  useEffect(() => {
    handlerRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!doctorId) return

    let cancelled = false
    let unsubscribe: (() => void) | null = null

    const subscribe = () => {
      if (cancelled || unsubscribe) return
      unsubscribe = dataSource.subscribeToQueue(doctorId, () => {
        handlerRef.current()
      })
    }

    const unsubscribeNow = () => {
      if (unsubscribe) {
        unsubscribe()
        unsubscribe = null
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        subscribe()
        // A re-subscription may have missed events; the caller's refresh is
        // idempotent, so ask for one now.
        handlerRef.current()
      } else {
        unsubscribeNow()
      }
    }

    if (!pauseWhenHidden || document.visibilityState === 'visible') {
      subscribe()
    }

    if (pauseWhenHidden) {
      document.addEventListener('visibilitychange', onVisibilityChange)
    }

    return () => {
      cancelled = true
      unsubscribeNow()
      if (pauseWhenHidden) {
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
    }
  }, [doctorId, pauseWhenHidden])
}
