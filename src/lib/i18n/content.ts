import type { Language } from './types'

/**
 * Per-language values stored beside their English original.
 *
 * The database keeps `department` and `display_message` as the canonical English
 * text, and these maps carry optional translations. Missing keys fall back to
 * English, then to the stored original, so a half-filled form never produces a
 * blank label.
 */
export type LocalizedText = Partial<Record<Language, string>>

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/** Picks the best translation for a language, falling back to English then the original. */
export function localizedValue(
  value: LocalizedText | null | undefined,
  language: Language,
  fallback: string,
): string {
  return clean(value?.[language]) ?? clean(value?.en) ?? fallback
}

/** Builds a translation map, dropping blank inputs so they fall back cleanly. */
export function buildLocalizedText(
  english: string,
  marathi?: string | null,
  gujarati?: string | null,
): LocalizedText {
  const value: LocalizedText = {}
  const en = clean(english)
  const mr = clean(marathi)
  const gu = clean(gujarati)

  if (en) value.en = en
  if (mr) value.mr = mr
  if (gu) value.gu = gu
  return value
}
