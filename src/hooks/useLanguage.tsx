import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import {
  DEFAULT_LANGUAGE,
  getMessages,
  loadStoredLanguage,
  saveStoredLanguage,
  type Language,
  type Messages,
} from '../lib/i18n'

interface LanguageValue {
  language: Language
  setLanguage: (next: Language) => void
  /** The catalogue for the current language, ready to read strings from. */
  messages: Messages
}

const LanguageContext = createContext<LanguageValue | null>(null)

/**
 * Holds the interface language for the whole application.
 *
 * A context rather than a hook-per-component for the same reason as
 * `StaffAuthProvider`: nearly every screen reads from it, and threading a
 * language argument down through the tree would touch every component anyway.
 *
 * Switching calls `setState`, which re-renders the tree in place. That is the
 * whole mechanism behind "translates without a reload" — there is no navigation,
 * no document request, and the URL does not change, so nothing in flight (a
 * realtime subscription, a half-filled registration form) is lost.
 *
 * Deliberately no cross-tab synchronisation, matching the existing
 * `queue.announcementEnabled` preference: the TV sets its own language and keeps
 * it, independently of the phone in a patient's hand.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => loadStoredLanguage())

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next)
    saveStoredLanguage(next)
  }, [])

  // Tell the browser which language is on screen, so a screen reader uses the
  // right voice and the browser stops offering to translate the page itself.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language
    }
  }, [language])

  const value = useMemo<LanguageValue>(
    () => ({ language, setLanguage, messages: getMessages(language) }),
    [language, setLanguage],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage(): LanguageValue {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within a <LanguageProvider>')
  }
  return context
}

/**
 * The starting language, for the rare caller outside the provider.
 *
 * `ErrorBoundary` is a class component and sits *outside* the provider so that a
 * crash inside the provider is still caught — which means it cannot call the
 * hook. Reading the stored preference directly gives it the right language
 * anyway, and its text never changes while it is on screen.
 */
export { DEFAULT_LANGUAGE, loadStoredLanguage }
