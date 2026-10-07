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
import { toEnglishDigits } from './marathiDigits'
import { ERROR_MESSAGES } from './errors'
import { normaliseName } from './utils'

export const MAX_NAME_LENGTH = 120

export interface RegistrationInput {
  patientName: string
  mobile: string
  doctorId: string
  patientType: PatientType
}

export type RegistrationField = 'patientName' | 'mobile' | 'doctorId'

export interface ValidationResult {
  valid: boolean
  errors: Partial<Record<RegistrationField, string>>
  /** Cleaned values, ready to send to the server. */
  normalised: {
    patientName: string
    mobile: string | null
    doctorId: string
    patientType: PatientType
  }
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

export function validateRegistration(input: RegistrationInput): ValidationResult {
  const errors: Partial<Record<RegistrationField, string>> = {}

  const patientName = normaliseName(input.patientName)
  if (patientName === '') {
    errors.patientName = ERROR_MESSAGES.NAME_REQUIRED
  } else if (patientName.length > MAX_NAME_LENGTH) {
    errors.patientName = ERROR_MESSAGES.NAME_TOO_LONG
  }

  const mobile = normaliseMobile(input.mobile)
  // Empty is fine — mobile is optional. But something *typed* that does not
  // reduce to a valid number is an error, not an absence: stripping "nonsense"
  // down to nothing and accepting it would silently discard what was entered.
  if (input.mobile.trim() !== '' && (mobile === null || !isValidMobile(mobile))) {
    errors.mobile = ERROR_MESSAGES.INVALID_MOBILE
  }

  const doctorId = input.doctorId.trim()
  if (doctorId === '') {
    errors.doctorId = ERROR_MESSAGES.DOCTOR_REQUIRED
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    normalised: {
      patientName,
      mobile,
      doctorId,
      patientType: input.patientType,
    },
  }
}
