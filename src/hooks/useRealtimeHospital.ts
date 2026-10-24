import { useEffect, useRef } from 'react'

import { dataSource } from '../lib/datasource'

/**
 * Subscribes to live queue and doctor-list changes for one hospital.
 *
 * The shared waiting-room TV uses this: one socket and one channel for the
 * whole hospital, rather than one per doctor. `onChange` is held in a ref so an
 * inline callback does not tear down and rebuild the subscription on each
 * render.
 */
export function useRealtimeHospital(
  hospitalId: string | null | undefined,
  onChange: () => void,
): void {
  const handlerRef = useRef(onChange)

  useEffect(() => {
    handlerRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!hospitalId) return

    const unsubscribe = dataSource.subscribeToHospital(hospitalId, () => {
      handlerRef.current()
    })

    return unsubscribe
  }, [hospitalId])
}
