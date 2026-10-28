/**
 * Audio announcements via the browser's Web Speech API.
 *
 * The app uses voices the browser already exposes — local system voices first,
 * then browser-provided voices, then the browser's default voice. It never
 * calls a paid TTS service and never makes the queue depend on speech: if the
 * API is unavailable, every function degrades to a silent no-op.
 *
 * The announcement follows the language on screen. A Marathi sentence read
 * aloud by an English voice is a poor approximation, but it is still better
 * than silence for a patient who cannot see the screen. The status API says
 * which case is in effect, and the UI warns when the default voice is used.
 */

import type { Language } from './i18n/types'

const STORAGE_KEY = 'queue.announcementEnabled'

/**
 * Preferred voices per language, best first.
 *
 * Each language lists only tags in its own language. There is deliberately no
 * cross-language preference: a Hindi voice reading Marathi, or an English voice
 * reading Gujarati, is not a substitute for the right voice. When none of these
 * match, `pickVoice` reports a fallback and the browser decides what to use.
 */
const VOICE_PREFERENCE: Record<Language, readonly string[]> = {
  en: ['en-IN', 'en-GB', 'en-US', 'en'],
  mr: ['mr-IN', 'mr'],
  gu: ['gu-IN', 'gu'],
}

/** The BCP-47 tag used when no matching voice exists. */
const NEUTRAL_TAG: Record<Language, string> = {
  en: 'en-IN',
  mr: 'mr-IN',
  gu: 'gu-IN',
}

export type VoiceSource = 'local' | 'browser' | 'fallback' | 'none'

export interface SpeechStatus {
  supported: boolean
  /** The BCP-47 tag the chosen voice will use, or null in fallback mode. */
  voiceLang: string | null
  voiceName: string | null
  /** True when no voice matched and the browser's default will be used. */
  usingFallback: boolean
  /** Where the chosen voice came from. */
  source: VoiceSource
  /** True when the chosen voice is installed on the device. */
  local: boolean
}

interface VoiceChoice {
  voice: SpeechSynthesisVoice | null
  source: 'local' | 'browser' | 'fallback'
  lang: string
}

let cachedVoices: SpeechSynthesisVoice[] = []
let voicesLoaded = false

function synth(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null
  if (!('speechSynthesis' in window)) return null
  return window.speechSynthesis
}

/** Whether this browser can speak at all. */
export function isSpeechSupported(): boolean {
  return synth() !== null && typeof window !== 'undefined' && 'SpeechSynthesisUtterance' in window
}

/**
 * Voice lists load asynchronously in Chrome, and synchronously in some other
 * browsers. This normalises both, and keeps listening for later updates.
 */
export function loadVoices(): SpeechSynthesisVoice[] {
  const s = synth()
  if (!s) return []

  const voices = s.getVoices()
  if (voices.length > 0) {
    cachedVoices = voices
    voicesLoaded = true
  }
  return cachedVoices
}

/** Notifies the caller whenever the browser's voice list changes. */
export function onVoicesChanged(callback: () => void): () => void {
  const s = synth()
  if (!s || !('onvoiceschanged' in s)) return () => {}

  const handler = (): void => {
    loadVoices()
    callback()
  }
  s.addEventListener('voiceschanged', handler)
  // Some browsers only populate the list once asked.
  loadVoices()

  return () => s.removeEventListener('voiceschanged', handler)
}

function voiceLanguage(voice: SpeechSynthesisVoice): string {
  return (voice.lang ?? '').toLowerCase().split('-')[0] ?? ''
}

/**
 * Finds a voice for a language in one source tier.
 *
 * `local` is true for voices installed on the device. Everything else is
 * treated as a browser-provided voice, including browsers that do not expose
 * `localService`.
 */
function findVoice(
  voices: readonly SpeechSynthesisVoice[],
  language: Language,
  local: boolean,
): SpeechSynthesisVoice | null {
  const candidates = voices.filter((voice) =>
    local ? voice.localService === true : voice.localService !== true,
  )

  for (const preferred of VOICE_PREFERENCE[language]) {
    const exact = candidates.find(
      (voice) => voice.lang?.toLowerCase() === preferred.toLowerCase(),
    )
    if (exact) return exact
  }

  return candidates.find((voice) => voiceLanguage(voice) === language) ?? null
}

/**
 * Picks the best available voice for a language.
 *
 * The three tiers are deliberate:
 *   1. a voice installed on the device, so it works offline;
 *   2. a browser-provided voice, which may need the network but costs nothing;
 *   3. the browser default, which may pronounce the text badly.
 */
function pickVoice(language: Language): VoiceChoice {
  const voices = voicesLoaded ? cachedVoices : loadVoices()

  const local = findVoice(voices, language, true)
  if (local) {
    return {
      voice: local,
      source: 'local',
      lang: local.lang || NEUTRAL_TAG[language],
    }
  }

  const browser = findVoice(voices, language, false)
  if (browser) {
    return {
      voice: browser,
      source: 'browser',
      lang: browser.lang || NEUTRAL_TAG[language],
    }
  }

  return {
    voice: null,
    source: 'fallback',
    lang: NEUTRAL_TAG[language],
  }
}

/** Describes what the announcement will actually sound like on this device. */
export function getSpeechStatus(language: Language = 'en'): SpeechStatus {
  if (!isSpeechSupported()) {
    return {
      supported: false,
      voiceLang: null,
      voiceName: null,
      usingFallback: false,
      source: 'none',
      local: false,
    }
  }

  const choice = pickVoice(language)
  return {
    supported: true,
    voiceLang: choice.voice?.lang ?? null,
    voiceName: choice.voice?.name ?? null,
    usingFallback: choice.source === 'fallback',
    source: choice.source,
    local: choice.source === 'local',
  }
}

// ---------------------------------------------------------------------------
// The user's on/off preference
// ---------------------------------------------------------------------------

/**
 * Defaults to ON, because a hospital display with silent announcements is not
 * doing its job — but the toggle is remembered, so turning it off once is
 * permanent until someone turns it back on.
 */
export function isAnnouncementEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === null ? true : stored === 'true'
  } catch {
    return true
  }
}

export function setAnnouncementEnabled(enabled: boolean): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled))
  } catch {
    // Private browsing with storage disabled: the toggle still works for this
    // page view, it just will not be remembered.
  }
  if (!enabled) cancelSpeech()
}

// ---------------------------------------------------------------------------
// Speaking
// ---------------------------------------------------------------------------

let primed = false

/**
 * Mobile browsers — iOS Safari especially — refuse to speak until the page has
 * seen a real user gesture. Call this from a click handler once; it "spends" a
 * silent utterance so later announcements are allowed through.
 */
export function primeSpeech(): void {
  const s = synth()
  if (!s || primed || !isSpeechSupported()) return

  try {
    const utterance = new SpeechSynthesisUtterance(' ')
    utterance.volume = 0
    utterance.rate = 10
    s.speak(utterance)
    primed = true
  } catch {
    // Non-fatal: announcements simply may not play until the user interacts.
  }
}

export function cancelSpeech(): void {
  resetSpeechQueue()
  try {
    synth()?.cancel()
  } catch {
    // Nothing to cancel.
  }
}

// ---------------------------------------------------------------------------
// The TV announcement queue
// ---------------------------------------------------------------------------
//
// The shared screen can call two doctors within a few seconds of each other.
// The old `speak()` cancelled whatever was playing, so the second call could
// erase the first. This queue lets the current sentence finish, keeps at most
// three pending, and replaces a doctor's older announcement if they are recalled
// before it is spoken. Anything older than fifteen seconds is no longer useful
// in a waiting room and is dropped.

interface QueuedAnnouncement {
  key: string | null
  text: string
  language: Language
  queuedAt: number
}

const MAX_PENDING_ANNOUNCEMENTS = 3
const MAX_ANNOUNCEMENT_AGE_MS = 15_000
const announcementQueue: QueuedAnnouncement[] = []

let speaking = false
let speechGeneration = 0
let speechTimer: number | null = null

function resetSpeechQueue(): void {
  speechGeneration += 1
  announcementQueue.length = 0
  speaking = false

  if (speechTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(speechTimer)
  }
  speechTimer = null
}

function finishAnnouncement(generation: number): void {
  if (generation !== speechGeneration) return

  speaking = false
  if (speechTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(speechTimer)
  }
  speechTimer = null
  drainAnnouncementQueue()
}

function speakQueued(item: QueuedAnnouncement): void {
  const s = synth()
  if (!s) {
    speaking = false
    return
  }

  const generation = speechGeneration

  try {
    const choice = pickVoice(item.language)
    const utterance = new SpeechSynthesisUtterance(item.text)
    if (choice.voice) utterance.voice = choice.voice
    utterance.lang = choice.lang
    utterance.rate = 0.9
    utterance.pitch = 1
    utterance.volume = 1

    let finished = false
    const done = (): void => {
      if (finished) return
      finished = true
      finishAnnouncement(generation)
    }

    utterance.onend = done
    utterance.onerror = done

    // Some engines never fire `onend` when the page loses focus. The fallback
    // keeps the queue moving instead of spending the rest of the day thinking
    // it is still speaking.
    speechTimer = window.setTimeout(done, Math.max(6_000, item.text.length * 120))

    if (s.paused) s.resume()
    s.speak(utterance)
  } catch {
    // Invalidate this utterance's callbacks before moving on: some engines
    // throw after accepting the utterance, and a late `onend` must not stop
    // the next announcement mid-sentence.
    speechGeneration += 1
    speaking = false
    if (speechTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(speechTimer)
    }
    speechTimer = null
    drainAnnouncementQueue()
  }
}

function drainAnnouncementQueue(): void {
  if (speaking || announcementQueue.length === 0) return

  const s = synth()
  if (!s) {
    announcementQueue.length = 0
    return
  }

  const now = Date.now()
  while (
    announcementQueue.length > 0 &&
    now - announcementQueue[0]!.queuedAt > MAX_ANNOUNCEMENT_AGE_MS
  ) {
    announcementQueue.shift()
  }

  const next = announcementQueue.shift()
  if (!next) return

  speaking = true
  speakQueued(next)
}

/**
 * Queues an announcement for the shared TV instead of cancelling the one that
 * is already playing. `key` is normally the doctor id, so recalling the same
 * doctor replaces the pending sentence rather than speaking twice.
 *
 * Returns whether the sentence entered the queue. It can return false when the
 * browser cannot speak, announcements are off, or the text is empty.
 */
export function enqueueSpeech(
  text: string,
  options?: { language?: Language; key?: string | null },
): boolean {
  if (!isSpeechSupported()) return false
  if (!isAnnouncementEnabled()) return false
  if (!text.trim()) return false

  const key = options?.key ?? null

  if (key !== null) {
    for (let index = announcementQueue.length - 1; index >= 0; index -= 1) {
      if (announcementQueue[index]!.key === key) announcementQueue.splice(index, 1)
    }
  }

  while (announcementQueue.length >= MAX_PENDING_ANNOUNCEMENTS) {
    announcementQueue.shift()
  }

  announcementQueue.push({
    key,
    text,
    language: options?.language ?? 'en',
    queuedAt: Date.now(),
  })

  drainAnnouncementQueue()
  return true
}

/**
 * Speaks an announcement such as
 * `टोकन क्रमांक ०२७, कृपया तपासणी कक्ष क्रमांक १ मध्ये या.`
 *
 * This is the immediate path used by reception when it calls or recalls a
 * patient: it clears any pending TV backlog and speaks now. The shared TV uses
 * {@link enqueueSpeech} so simultaneous calls are not cut off.
 *
 * `language` should be the language the sentence was written in and the screen
 * is showing, so the voice matches the words.
 *
 * Returns whether speech was actually attempted, so callers can surface a
 * caption instead when it was not.
 */
export function speak(text: string, options?: { force?: boolean; language?: Language }): boolean {
  if (!isSpeechSupported()) return false
  if (!options?.force && !isAnnouncementEnabled()) return false
  if (!text.trim()) return false

  const language = options?.language ?? 'en'

  const s = synth()
  if (!s) return false

  try {
    // A queued backlog of stale tokens is worse than no announcement at all.
    resetSpeechQueue()
    s.cancel()

    const choice = pickVoice(language)
    const utterance = new SpeechSynthesisUtterance(text)
    if (choice.voice) utterance.voice = choice.voice
    // Tag the utterance even in fallback mode, so engines with no explicit
    // voice still attempt the right pronunciation rather than the system
    // default's own language.
    utterance.lang = choice.lang
    // Slightly slower than default: token numbers are read to people who may be
    // hard of hearing, in a noisy waiting room.
    utterance.rate = 0.9
    utterance.pitch = 1
    utterance.volume = 1

    // Chrome on desktop silently stops speaking after a period of inactivity.
    if (s.paused) s.resume()

    s.speak(utterance)
    return true
  } catch {
    // Speech is a nice-to-have; a failure here must never break the queue.
    return false
  }
}

/** Repeats an announcement a second time, a beat later — how a real desk calls. */
export function speakTwice(text: string, options?: { language?: Language }): boolean {
  const spoke = speak(text, options)
  if (!spoke) return false

  window.setTimeout(() => speak(text, { force: true, language: options?.language }), 3500)
  return true
}
