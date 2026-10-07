import { useEffect, useState } from 'react'

/**
 * Tracks whether the browser thinks it is online.
 *
 * The queue depends on connectivity — several devices have to agree on the same
 * state — so reception gets an honest indicator rather than a screen that looks
 * fine while silently failing to update (spec §26).
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  useEffect(() => {
    const goOnline = (): void => setOnline(true)
    const goOffline = (): void => setOnline(false)

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)

    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return online
}
