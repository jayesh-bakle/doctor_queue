/**
 * Machine error codes and the mapping from technical failures to them.
 *
 * The database raises stable machine codes ('NAME_REQUIRED', 'DOCTOR_INACTIVE')
 * rather than human text. This module keeps those codes and the machinery that
 * recognises them; the sentences a patient reads live in the locale modules
 * (`src/lib/i18n/`), because with three languages there is no longer one
 * correct sentence for `toUserMessage` to return on its own.
 *
 * The technical detail is never discarded: `logTechnicalError` writes it to the
 * console for whoever is debugging (spec §21).
 */

export const ERROR_CODES = [
  'NAME_REQUIRED',
  'NAME_TOO_LONG',
  'INVALID_MOBILE',
  'INVALID_PATIENT_TYPE',
  'DOCTOR_REQUIRED',
  'DOCTOR_NOT_FOUND',
  'DOCTOR_INACTIVE',
  'HOSPITAL_NOT_FOUND',
  'TOKEN_NOT_FOUND',
  'NOT_AUTHORIZED',
  'INVALID_STATUS_TRANSITION',
  'INVALID_CREDENTIALS',
  'STAFF_NOT_LINKED',
  'QUEUE_EMPTY',
  'INVALID_TIME_ZONE',
  'OFFLINE',
  'TIMEOUT',
  'NETWORK',
  'UNKNOWN',
] as const

export type AppErrorCode = (typeof ERROR_CODES)[number]

const KNOWN_CODES = new Set<string>(ERROR_CODES)

/**
 * An error already carrying a code the UI knows how to phrase.
 *
 * Its `message` is the machine code, not display text: the sentence depends on
 * the language the reader has chosen, which this layer deliberately knows
 * nothing about. Call `toUserMessage` to turn it into something readable.
 */
export class AppError extends Error {
  readonly code: AppErrorCode

  constructor(code: AppErrorCode, options?: { cause?: unknown }) {
    super(code)
    this.name = 'AppError'
    this.code = code
    if (options?.cause !== undefined) {
      this.cause = options.cause
    }
  }
}

/** Pulls a code out of whatever shape the failure arrived in. */
export function extractErrorCode(error: unknown): string | null {
  if (!error) return null

  if (error instanceof AppError) return error.code

  if (typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message ?? '').trim()
    if (KNOWN_CODES.has(message)) return message
    // PostgREST sometimes wraps the raised message in extra context.
    const firstToken = message.split(/[\s:]+/)[0]?.toUpperCase()
    if (firstToken && KNOWN_CODES.has(firstToken)) return firstToken
  }

  if (typeof error === 'string' && KNOWN_CODES.has(error.trim())) {
    return error.trim()
  }

  return null
}

/** Narrows a loose code to one the catalogue can actually phrase. */
export function isKnownErrorCode(value: string | null | undefined): value is AppErrorCode {
  return typeof value === 'string' && KNOWN_CODES.has(value)
}

/**
 * Wraps any failure as an `AppError`, keeping a recognised code when there is
 * one and falling back to the generic code when there is not.
 *
 * The original error is attached as `cause` so the technical detail survives for
 * whoever is debugging — it just never reaches a screen (spec §21).
 */
export function toAppError(error: unknown): AppError {
  const code = extractErrorCode(error)
  return new AppError(isKnownErrorCode(code) ? code : 'UNKNOWN', { cause: error })
}

function isNetworkFailure(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true

  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message ?? '')
      : String(error ?? '')

  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|offline/i.test(
    message,
  )
}

/**
 * The code this failure should be reported under.
 *
 * Separated from {@link toUserMessage} so a component or hook can hold onto the
 * code instead of a finished sentence: a stored code re-renders in whatever
 * language the reader has since chosen, a stored sentence does not.
 */
export function toUserErrorCode(error: unknown): AppErrorCode {
  const code = extractErrorCode(error)
  if (isKnownErrorCode(code)) return code

  if (isNetworkFailure(error)) {
    return typeof navigator !== 'undefined' && navigator.onLine === false ? 'OFFLINE' : 'NETWORK'
  }

  return 'UNKNOWN'
}

/**
 * The one function the UI should call when something fails.
 * Always returns a sentence in the reader's chosen language, safe to show a
 * patient.
 *
 * Takes the message catalogue as an argument rather than importing one, so this
 * stays a pure function and the caller — a component holding `useLanguage()` —
 * decides which language the sentence comes out in.
 */
export function toUserMessage(
  error: unknown,
  messages: { errors: Record<AppErrorCode, string> },
): string {
  return messages.errors[toUserErrorCode(error)]
}

/**
 * Writes the technical detail somewhere developers can find it, without putting
 * it in front of a patient.
 */
export function logTechnicalError(context: string, error: unknown): void {
  // eslint-disable-next-line no-console
  console.error(`[queue] ${context}`, error)
}
