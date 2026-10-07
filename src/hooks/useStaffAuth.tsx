import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { dataSource, type StaffSession } from '../lib/datasource'
import { logTechnicalError } from '../lib/errors'

interface StaffAuthValue {
  session: StaffSession | null
  /** True while the initial session is being restored. */
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const StaffAuthContext = createContext<StaffAuthValue | null>(null)

/**
 * Holds the signed-in staff member for the whole staff area.
 *
 * A context rather than a hook-per-component because the dashboard header, the
 * doctor pages and the settings page all need the same session, and each one
 * re-reading it would mean a separate Supabase Auth round trip.
 *
 * `signIn` deliberately rethrows: the login page needs to distinguish a wrong
 * password from a network failure to show the right Marathi message.
 */
export function StaffAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StaffSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const current = await dataSource.getCurrentStaff()
        if (!cancelled) setSession(current)
      } catch (caught) {
        logTechnicalError('StaffAuthProvider — restore session', caught)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const next = await dataSource.signIn(email, password)
    setSession(next)
  }, [])

  const signOut = useCallback(async () => {
    try {
      await dataSource.signOut()
    } catch (caught) {
      logTechnicalError('StaffAuthProvider — signOut', caught)
    } finally {
      // Drop the local session even if the server call failed, so the user is
      // never stuck on a dashboard they asked to leave.
      setSession(null)
    }
  }, [])

  const value = useMemo<StaffAuthValue>(
    () => ({ session, loading, signIn, signOut }),
    [session, loading, signIn, signOut],
  )

  return <StaffAuthContext.Provider value={value}>{children}</StaffAuthContext.Provider>
}

export function useStaffAuth(): StaffAuthValue {
  const context = useContext(StaffAuthContext)
  if (!context) {
    throw new Error('useStaffAuth must be used within a <StaffAuthProvider>')
  }
  return context
}
