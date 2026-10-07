/**
 * Marathi error messages and the mapping from technical failures to them.
 *
 * The database raises stable machine codes ('NAME_REQUIRED', 'DOCTOR_INACTIVE')
 * rather than human text. This module is the single place those codes become
 * something a patient or a receptionist can act on, so no raw Postgres error —
 * and no English stack trace — ever reaches a screen (spec §21).
 *
 * The technical detail is not discarded: `logTechnicalError` writes it to the
 * console for whoever is debugging.
 */

export const ERROR_MESSAGES = {
  NAME_REQUIRED: 'कृपया रुग्णाचे नाव भरा.',
  NAME_TOO_LONG: 'नाव खूप मोठे आहे. कृपया थोडक्यात लिहा.',
  INVALID_MOBILE: 'कृपया योग्य १० अंकी मोबाईल क्रमांक भरा.',
  INVALID_PATIENT_TYPE: 'कृपया रुग्णाचा प्रकार निवडा.',
  DOCTOR_REQUIRED: 'कृपया डॉक्टर निवडा.',
  DOCTOR_NOT_FOUND: 'सध्या रांग उपलब्ध नाही. कृपया रिसेप्शनशी संपर्क साधा.',
  DOCTOR_INACTIVE: 'ही रांग सध्या बंद आहे. कृपया रिसेप्शनशी संपर्क साधा.',
  HOSPITAL_NOT_FOUND: 'सध्या रांग उपलब्ध नाही. कृपया रिसेप्शनशी संपर्क साधा.',
  TOKEN_NOT_FOUND: 'हा टोकन क्रमांक सापडला नाही. कृपया रिसेप्शनशी संपर्क साधा.',
  NOT_AUTHORIZED: 'आपल्याला ही कृती करण्याची परवानगी नाही. कृपया पुन्हा लॉगिन करा.',
  INVALID_STATUS_TRANSITION: 'ही कृती आता करता येत नाही. कृपया पान ताजे करा.',
  INVALID_CREDENTIALS: 'ईमेल किंवा पासवर्ड चुकीचा आहे.',
  STAFF_NOT_LINKED:
    'आपले खाते रुग्णालयाशी जोडलेले नाही. कृपया प्रशासकाशी संपर्क साधा.',
  QUEUE_EMPTY: 'रांगेत आता कोणीही प्रतीक्षेत नाही.',
  INVALID_TIME_ZONE:
    'हा टाइम झोन ओळखला जात नाही. कृपया इंग्रजीत "Asia/Kolkata" या स्वरूपात लिहा.',
  OFFLINE: 'इंटरनेट कनेक्शन तपासा.',
  TIMEOUT: 'सर्व्हरला उत्तर द्यायला वेळ लागत आहे. कृपया पुन्हा प्रयत्न करा.',
  NETWORK: 'काहीतरी तांत्रिक अडचण आली आहे. कृपया पुन्हा प्रयत्न करा.',
  UNKNOWN: 'काहीतरी तांत्रिक अडचण आली आहे. कृपया पुन्हा प्रयत्न करा.',
} as const

export type AppErrorCode = keyof typeof ERROR_MESSAGES

const KNOWN_CODES = new Set<string>(Object.keys(ERROR_MESSAGES))

/**
 * An error already carrying a code the UI knows how to phrase.
 * Its `message` is the Marathi text, so it can be rendered directly.
 */
export class AppError extends Error {
  readonly code: AppErrorCode

  constructor(code: AppErrorCode, options?: { cause?: unknown }) {
    super(ERROR_MESSAGES[code])
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
 * one and falling back to the generic Marathi sentence when there is not.
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
 * The one function the UI should call when something fails.
 * Always returns a Marathi sentence safe to show a patient.
 */
export function toMarathiError(error: unknown): string {
  const code = extractErrorCode(error)
  if (code && KNOWN_CODES.has(code)) return ERROR_MESSAGES[code as AppErrorCode]

  if (isNetworkFailure(error)) {
    return typeof navigator !== 'undefined' && navigator.onLine === false
      ? ERROR_MESSAGES.OFFLINE
      : ERROR_MESSAGES.NETWORK
  }

  return ERROR_MESSAGES.UNKNOWN
}

/**
 * Writes the technical detail somewhere developers can find it, without putting
 * it in front of a patient.
 */
export function logTechnicalError(context: string, error: unknown): void {
  // eslint-disable-next-line no-console
  console.error(`[queue] ${context}`, error)
}
