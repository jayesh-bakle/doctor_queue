/**
 * Gujarati numeral helpers.
 *
 * The Gujarati interface shows tokens in Gujarati numerals, zero-padded to three
 * digits, mirroring how the Marathi interface uses Devanagari: the token on the
 * TV reads `૦૨૭`, and counts read `૩ દર્દીઓ`.
 *
 * This is the deliberate twin of `marathiDigits.ts`, with the same asymmetry
 * between its two entry points:
 *
 *   toGujaratiDigits(27)  -> '૦૨૭'   (padded — for tokens)
 *   toGujaratiNumber(27)  -> '૨૭'    (unpadded — for counts, "૨૭ દર્દીઓ")
 *
 * Padding a *count* would read as nonsense, so using the wrong helper is a
 * visible bug, not a cosmetic choice.
 */

const GUJARATI_ZERO = 0x0ae6
const ASCII_ZERO = 0x30

/** Zero-pad width for token numbers: 1 -> ૦૦૧, 27 -> ૦૨૭, 100 -> ૧૦૦. */
export const TOKEN_WIDTH = 3

/** Rewrites every ASCII digit in a string as its Gujarati counterpart. */
export function mapDigitsToGujarati(input: string): string {
  let out = ''
  for (const char of input) {
    const code = char.charCodeAt(0)
    out +=
      code >= ASCII_ZERO && code <= ASCII_ZERO + 9
        ? String.fromCharCode(GUJARATI_ZERO + (code - ASCII_ZERO))
        : char
  }
  return out
}

/** Rewrites every Gujarati digit as its ASCII counterpart. */
export function toEnglishDigits(input: string): string {
  let out = ''
  for (const char of input) {
    const code = char.charCodeAt(0)
    out +=
      code >= GUJARATI_ZERO && code <= GUJARATI_ZERO + 9
        ? String.fromCharCode(ASCII_ZERO + (code - GUJARATI_ZERO))
        : char
  }
  return out
}

/**
 * Converts a value to Gujarati numerals, zero-padded to `width`.
 *
 * - Numbers are truncated and padded: `toGujaratiDigits(27)` -> `'૦૨૭'`.
 * - A string of pure digits is padded the same way.
 * - Any other string has its digits converted in place, leaving separators
 *   alone — so `toGujaratiDigits('10:24')` -> `'૧૦:૨૪'`.
 *
 * Pass `width = 0` for counts (or use {@link toGujaratiNumber}).
 */
export function toGujaratiDigits(value: number | string, width: number = TOKEN_WIDTH): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return ''
    const negative = value < 0
    const digits = Math.trunc(Math.abs(value)).toString().padStart(Math.max(width, 0), '0')
    return (negative ? '-' : '') + mapDigitsToGujarati(digits)
  }

  const trimmed = value.trim()
  if (trimmed === '') return ''

  // Purely numeric strings are padded; mixed strings (times, ranges) are not.
  if (/^-?\d+$/.test(trimmed)) {
    const negative = trimmed.startsWith('-')
    const digits = trimmed.replace('-', '').padStart(Math.max(width, 0), '0')
    return (negative ? '-' : '') + mapDigitsToGujarati(digits)
  }

  return mapDigitsToGujarati(trimmed)
}

/** Converts a number to Gujarati numerals with NO padding, for counts. */
export function toGujaratiNumber(value: number | string): string {
  return toGujaratiDigits(value, 0)
}

/** The token exactly as it is displayed and announced: `૦૨૭`. */
export function formatToken(tokenNumber: number): string {
  return toGujaratiDigits(tokenNumber, TOKEN_WIDTH)
}

/**
 * Pluralises a patient count the way Gujarati does it.
 *
 * One patient is "૧ દર્દી"; more than one is "૩ દર્દીઓ".
 */
export function patientCountLabel(count: number): string {
  const word = count === 1 ? 'દર્દી' : 'દર્દીઓ'
  return `${toGujaratiNumber(count)} ${word}`
}

/** `૩૦ મિનિટ` — for the estimated-wait line. Minutes are never padded. */
export function minutesLabel(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes))
  if (rounded === 0) return 'થોડી ક્ષણો'
  return `${toGujaratiNumber(rounded)} મિનિટ`
}
