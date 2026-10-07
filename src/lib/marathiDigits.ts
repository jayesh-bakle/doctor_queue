/**
 * Marathi (Devanagari) numeral helpers.
 *
 * The patient-facing interface shows tokens in Marathi numerals, zero-padded to
 * three digits, because that is what reception announces aloud and what the TV
 * displays ("टोकन क्र. ०२७"). Arabic numerals appear nowhere in the patient UI.
 *
 * Note the deliberate asymmetry between the two entry points:
 *
 *   toMarathiDigits(27)  -> '०२७'   (padded — for tokens)
 *   toMarathiNumber(27)  -> '२७'    (unpadded — for counts, "२७ रुग्ण")
 *
 * Padding a *count* would read as nonsense in Marathi, so the count helper is
 * not merely a convenience — using the wrong one is a visible bug.
 */

const DEVANAGARI_ZERO = 0x0966
const ASCII_ZERO = 0x30

/** Zero-pad width for token numbers: 1 -> ००१, 27 -> ०२७, 100 -> १००. */
export const TOKEN_WIDTH = 3

/** Rewrites every ASCII digit in a string as its Devanagari counterpart. */
export function mapDigitsToMarathi(input: string): string {
  let out = ''
  for (const char of input) {
    const code = char.charCodeAt(0)
    out +=
      code >= ASCII_ZERO && code <= ASCII_ZERO + 9
        ? String.fromCharCode(DEVANAGARI_ZERO + (code - ASCII_ZERO))
        : char
  }
  return out
}

/** Rewrites every Devanagari digit as its ASCII counterpart. */
export function toEnglishDigits(input: string): string {
  let out = ''
  for (const char of input) {
    const code = char.charCodeAt(0)
    out +=
      code >= DEVANAGARI_ZERO && code <= DEVANAGARI_ZERO + 9
        ? String.fromCharCode(ASCII_ZERO + (code - DEVANAGARI_ZERO))
        : char
  }
  return out
}

/**
 * Converts a value to Devanagari numerals, zero-padded to `width`.
 *
 * - Numbers are truncated and padded: `toMarathiDigits(27)` -> `'०२७'`.
 * - A string of pure digits is padded the same way.
 * - Any other string has its digits converted in place, leaving separators
 *   alone — so `toMarathiDigits('10:24')` -> `'१०:२४'`. This is what lets a
 *   clock time pass through without being turned into `'०१०:२४'`.
 *
 * Pass `width = 0` for counts (or use {@link toMarathiNumber}).
 */
export function toMarathiDigits(value: number | string, width: number = TOKEN_WIDTH): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return ''
    const negative = value < 0
    const digits = Math.trunc(Math.abs(value)).toString().padStart(Math.max(width, 0), '0')
    return (negative ? '-' : '') + mapDigitsToMarathi(digits)
  }

  const trimmed = value.trim()
  if (trimmed === '') return ''

  // Purely numeric strings are padded; mixed strings (times, ranges) are not.
  if (/^-?\d+$/.test(trimmed)) {
    const negative = trimmed.startsWith('-')
    const digits = trimmed.replace('-', '').padStart(Math.max(width, 0), '0')
    return (negative ? '-' : '') + mapDigitsToMarathi(digits)
  }

  return mapDigitsToMarathi(trimmed)
}

/**
 * Converts a number to Devanagari numerals with NO padding.
 * Use this for counts, durations and anything a patient reads as a quantity.
 */
export function toMarathiNumber(value: number | string): string {
  return toMarathiDigits(value, 0)
}

/** The token exactly as it is displayed and announced: `०२७`. */
export function formatToken(tokenNumber: number): string {
  return toMarathiDigits(tokenNumber, TOKEN_WIDTH)
}

/** The token with its label, as printed on screen: `टोकन क्र. ०२७`. */
export function tokenLabel(tokenNumber: number): string {
  return `टोकन क्र. ${formatToken(tokenNumber)}`
}

/**
 * Pluralises a patient count the way Marathi actually does it.
 *
 * Marathi marks plurality on the noun: one patient is "१ रुग्ण", more than one
 * is "३ रुग्णे". Getting this wrong is immediately noticeable to a reader.
 */
export function patientCountLabel(count: number): string {
  const word = count === 1 ? 'रुग्ण' : 'रुग्णे'
  return `${toMarathiNumber(count)} ${word}`
}

/** `३० मिनिटे` — for the estimated-wait line. Minutes are never padded. */
export function minutesLabel(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes))
  if (rounded === 0) return 'काही क्षण'
  return `${toMarathiNumber(rounded)} मिनिटे`
}
