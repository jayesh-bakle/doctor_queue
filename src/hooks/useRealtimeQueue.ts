import { useEffect, useRef } from 'react'

import { dataSource } from '../lib/datasource'

/**
 * Subscribes to live changes for one doctor's queue.
 *
 * `onChange` is held in a ref so that passing an inline arrow function — which
 * is what every caller naturally writes — does not tear down and rebuild the
 * subscription on each render. Reconnecting a realtime channel on every render
 * would drop events and hammer the network.
 */
export function useRealtimeQueue(doctorId: string | null | undefined, onChange: () => void): void {
  const handlerRef = useRef(onChange)

  useEffect(() => {
    handlerRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!doctorId) return

    const unsubscribe = dataSource.subscribeToQueue(doctorId, () => {
      handlerRef.current()
    })

    return unsubscribe
  }, [doctorId])
}
