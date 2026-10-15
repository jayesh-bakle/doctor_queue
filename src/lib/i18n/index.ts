/**
 * The locale registry, and the storage preference that remembers the choice.
 *
 * `REGISTRY` is typed `Record<Language, Messages>`, and that is the single most
 * useful line in this folder: adding a string to the `Messages` interface makes
 * the build fail until *all three* locales supply it. A half-translated screen
 * cannot ship, because it cannot compile.
 */

import { en } from './en'
import { hi } from './hi'
import { mr } from './mr'
import type { Language, Messages } from './types'

export type { Language, Messages, DescribeSituationParams, UiMessages } from './types'

/** Marathi is the clinic's working language; anything else is a fallback. */
export const DEFAULT_LANGUAGE: Language = 'mr'

export const LANGUAGES = ['mr', 'hi', 'en'] as const

export const REGISTRY: Record<Language, Messages> = { mr, hi, en }

/**
 * Each language's own name for itself — an autonym.
 *
 * Deliberately NOT read from `Messages.name`. A switcher that renders "Marathi"
 * in English, "मराठी" in Marathi and "मराठी" in Hindi would move its own labels
 * around as the user switches, and a reader who cannot read the current language
 * is exactly the person who needs the switcher. Written in its own script, each
 * option stays recognisable no matter what is on screen.
 */
export const LANGUAGE_LABELS: Record<Language, string> = {
  mr: 'मराठी',
  hi: 'हिंदी',
  en: 'English',
}

/** Narrows an arbitrary stored string to a language this build actually has. */
export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)
}

/**
 * The catalogue for a language. Total by construction, but it still refuses to
 * hand back `undefined` if a caller passes something the type system could not
 * catch (a value from localStorage, say).
 */
export function getMessages(language: Language): Messages {
  return REGISTRY[language] ?? REGISTRY[DEFAULT_LANGUAGE]
}

// ---------------------------------------------------------------------------
// The user's preference, remembered per device
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'queue.language'

/**
 * The language to start in.
 *
 * Deliberately the same defensive shape as `isAnnouncementEnabled` in
 * `speech.ts`: private browsing with storage disabled, or a value written by an
 * older build, must degrade to the default rather than break the first render.
 */
export function loadStoredLanguage(): Language {
  if (typeof localStorage === 'undefined') return DEFAULT_LANGUAGE
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isLanguage(stored) ? stored : DEFAULT_LANGUAGE
  } catch {
    return DEFAULT_LANGUAGE
  }
}

export function saveStoredLanguage(language: Language): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, language)
  } catch {
    // Private browsing with storage disabled: the switch still works for this
    // page view, it just will not be remembered.
  }
}
