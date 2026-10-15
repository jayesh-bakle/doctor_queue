/**
 * Registration input validation.
 *
 * These rules deliberately duplicate the checks inside `register_patient()` in
 * `supabase/migrations/003_queue_functions.sql`. The client-side copy exists so
 * a patient sees the problem instantly, in the field they are looking at; the
 * server-side copy is what actually enforces it, because anything arriving from
 * a browser is untrusted. Both must agree — if you change one, change the other.
 */

import type { PatientType } from '../types/database'
import type { Messages } from './i18n/types'
import { toEnglishDigits } from './marathiDigits'
import { normaliseName } from './utils'

export const MAX_NAME_LENGTH = 120

export interface RegistrationInput {
  patientName: string
  mobile: string
  doctorId: string
  patientType: PatientType
}

export type RegistrationField = 'patientName' | 'mobile' | 'doctorId'

/**
 * The failure, as a machine code.
 *
 * The rules below produce codes, not sentences. That split matters twice over:
 * the demo backend needs only to know *which* rule failed so it can raise the
 * same code the SQL function would, and it has no language to phrase a sentence
 * in; while the form needs a sentence in whatever language the patient chose.
 */
export type RegistrationErrorCode =
  | 'NAME_REQUIRED'
  | 'NAME_TOO_LONG'
  | 'INVALID_MOBILE'
  | 'DOCTOR_REQUIRED'

export type RegistrationErrorCodes = Partial<Record<RegistrationField, RegistrationErrorCode>>

/** Cleaned values, ready to send to the server. */
export interface NormalisedRegistration {
  patientName: string
  mobile: string | null
  doctorId: string
  patientType: PatientType
}

/** The outcome of the rules, before any language is involved. */
export interface FieldValidationResult {
  valid: boolean
  errorCodes: RegistrationErrorCodes
  normalised: NormalisedRegistration
}

export interface ValidationResult {
  valid: boolean
  errors: Partial<Record<RegistrationField, string>>
  /** Cleaned values, ready to send to the server. */
  normalised: NormalisedRegistration
}

/**
 * Normalises what an Indian patient actually types into a bare 10-digit number.
 * Accepts "98765 43210", "+91 9876543210", "09876543210" and Devanagari
 * numerals, all of which become "9876543210".
 */
export function normaliseMobile(raw: string): string | null {
  let digits = toEnglishDigits(raw).replace(/\D/g, '')

  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2)
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1)
  }

  return digits === '' ? null : digits
}

/** Indian mobiles start with 6, 7, 8 or 9 and are ten digits long. */
export function isValidMobile(mobile: string): boolean {
  return /^[6-9]\d{9}$/.test(mobile)
}

/** Groups a stored number for display: 9876543210 -> 98765 43210. */
export function formatMobileForDisplay(mobile: string | null): string {
  if (!mobile) return ''
  if (mobile.length !== 10) return mobile
  return `${mobile.slice(0, 5)} ${mobile.slice(5)}`
}

/**
 * Applies the registration rules and reports the failures as codes.
 *
 * This is the single copy of the rules. {@link validateRegistration} wraps it to
 * add the wording; the demo backend calls it directly, because it needs the code
 * to raise and has no language to phrase anything in.
 */
export function validateRegistrationFields(input: RegistrationInput): FieldValidationResult {
  const errorCodes: RegistrationErrorCodes = {}

  const patientName = normaliseName(input.patientName)
  if (patientName === '') {
    errorCodes.patientName = 'NAME_REQUIRED'
  } else if (patientName.length > MAX_NAME_LENGTH) {
    errorCodes.patientName = 'NAME_TOO_LONG'
  }

  const mobile = normaliseMobile(input.mobile)
  // Empty is fine — mobile is optional. But something *typed* that does not
  // reduce to a valid number is an error, not an absence: stripping "nonsense"
  // down to nothing and accepting it would silently discard what was entered.
  if (input.mobile.trim() !== '' && (mobile === null || !isValidMobile(mobile))) {
    errorCodes.mobile = 'INVALID_MOBILE'
  }

  const doctorId = input.doctorId.trim()
  if (doctorId === '') {
    errorCodes.doctorId = 'DOCTOR_REQUIRED'
  }

  return {
    valid: Object.keys(errorCodes).length === 0,
    errorCodes,
    normalised: {
      patientName,
      mobile,
      doctorId,
      patientType: input.patientType,
    },
  }
}

/**
 * Validates a registration and returns the problems already phrased in the
 * reader's language.
 *
 * `messages` is passed in rather than imported so the validation rules stay
 * language-agnostic — they are the same in Marathi, Hindi and English, and only
 * the sentences differ.
 */
export function validateRegistration(
  input: RegistrationInput,
  messages: Messages,
): ValidationResult {
  const { valid, errorCodes, normalised } = validateRegistrationFields(input)

  const errors: Partial<Record<RegistrationField, string>> = {}
  if (errorCodes.patientName) errors.patientName = messages.errors[errorCodes.patientName]
  if (errorCodes.mobile) errors.mobile = messages.errors[errorCodes.mobile]
  if (errorCodes.doctorId) errors.doctorId = messages.errors[errorCodes.doctorId]

  return { valid, errors, normalised }
}
