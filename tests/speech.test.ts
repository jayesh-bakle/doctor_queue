import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The Web Speech API is not available under Node, so these tests install a
 * deliberately small fake. The point is to pin the voice-selection policy and
 * the TV queue behaviour, not to emulate every browser quirk.
 */

class FakeUtterance {
  text: string
  voice: SpeechSynthesisVoice | null = null
  lang = ''
  rate = 1
  pitch = 1
  volume = 1
  onend: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(text: string) {
    this.text = text
  }
}

interface FakeVoice {
  name: string
  lang: string
  localService: boolean
}

interface FakeSynthesis {
  voices: FakeVoice[]
  spoken: FakeUtterance[]
  cancelCount: number
  paused: boolean
  getVoices(): FakeVoice[]
  speak(utterance: FakeUtterance): void
  cancel(): void
  pause(): void
  resume(): void
  addEventListener(): void
  removeEventListener(): void
}

let activeSpeech: { cancelSpeech(): void } | null = null

function installSpeech(voices: FakeVoice[]): FakeSynthesis {
  const synthesis: FakeSynthesis = {
    voices,
    spoken: [],
    cancelCount: 0,
    paused: false,
    getVoices: () => synthesis.voices,
    speak: (utterance) => {
      synthesis.spoken.push(utterance)
    },
    cancel: () => {
      synthesis.cancelCount += 1
    },
    pause: () => {
      synthesis.paused = true
    },
    resume: () => {
      synthesis.paused = false
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  }

  const fakeWindow = {
    speechSynthesis: synthesis,
    SpeechSynthesisUtterance: FakeUtterance,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  }

  Object.defineProperty(globalThis, 'window', {
    value: fakeWindow,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
    value: FakeUtterance,
    configurable: true,
    writable: true,
  })

  return synthesis
}

function voice(name: string, lang: string, localService: boolean): FakeVoice {
  return { name, lang, localService }
}

async function loadSpeech() {
  vi.resetModules()
  const speech = await import('../src/lib/speech')
  activeSpeech = speech
  return speech
}

afterEach(() => {
  activeSpeech?.cancelSpeech()
  activeSpeech = null
  Reflect.deleteProperty(globalThis, 'window')
  Reflect.deleteProperty(globalThis, 'SpeechSynthesisUtterance')
  vi.resetModules()
})

describe('voice selection', () => {
  it('prefers a local voice over a browser-provided voice', async () => {
    installSpeech([
      voice('Google UK English Female', 'en-GB', false),
      voice('English India', 'en-IN', true),
    ])
    const speech = await loadSpeech()

    expect(speech.getSpeechStatus('en')).toMatchObject({
      supported: true,
      source: 'local',
      voiceName: 'English India',
      usingFallback: false,
      local: true,
    })
  })

  it('uses a browser-provided voice when no local voice matches', async () => {
    installSpeech([
      voice('English India', 'en-IN', true),
      voice('Marathi browser voice', 'mr-IN', false),
    ])
    const speech = await loadSpeech()

    expect(speech.getSpeechStatus('mr')).toMatchObject({
      supported: true,
      source: 'browser',
      voiceName: 'Marathi browser voice',
      usingFallback: false,
      local: false,
    })
  })

  it('reports a fallback rather than selecting a wrong-language voice', async () => {
    installSpeech([voice('English India', 'en-IN', true)])
    const speech = await loadSpeech()

    expect(speech.getSpeechStatus('gu')).toMatchObject({
      supported: true,
      source: 'fallback',
      voiceName: null,
      voiceLang: null,
      usingFallback: true,
      local: false,
    })
  })

  it('speaks with the selected language tag when only the default voice exists', async () => {
    const synthesis = installSpeech([voice('English India', 'en-IN', true)])
    const speech = await loadSpeech()

    expect(speech.speak('नमस्कार', { language: 'mr', force: true })).toBe(true)

    expect(synthesis.spoken).toHaveLength(1)
    expect(synthesis.spoken[0]?.voice).toBeNull()
    expect(synthesis.spoken[0]?.lang).toBe('mr-IN')
  })
})

describe('TV announcement queue', () => {
  it('lets the current sentence finish and then speaks the next one', async () => {
    const synthesis = installSpeech([voice('English India', 'en-IN', true)])
    const speech = await loadSpeech()

    expect(speech.enqueueSpeech('Token 27', { key: 'a', language: 'en' })).toBe(true)
    expect(speech.enqueueSpeech('Token 28', { key: 'b', language: 'en' })).toBe(true)

    expect(synthesis.spoken).toHaveLength(1)
    expect(synthesis.spoken[0]?.text).toBe('Token 27')

    synthesis.spoken[0]?.onend?.()

    expect(synthesis.spoken).toHaveLength(2)
    expect(synthesis.spoken[1]?.text).toBe('Token 28')
  })

  it('replaces a pending announcement for the same doctor', async () => {
    const synthesis = installSpeech([voice('English India', 'en-IN', true)])
    const speech = await loadSpeech()

    speech.enqueueSpeech('Token 27', { key: 'a', language: 'en' })
    speech.enqueueSpeech('Token 28', { key: 'b', language: 'en' })
    speech.enqueueSpeech('Token 28 again', { key: 'b', language: 'en' })

    synthesis.spoken[0]?.onend?.()

    expect(synthesis.spoken).toHaveLength(2)
    expect(synthesis.spoken[1]?.text).toBe('Token 28 again')
  })

  it('drops the pending queue when reception calls someone immediately', async () => {
    const synthesis = installSpeech([voice('English India', 'en-IN', true)])
    const speech = await loadSpeech()

    speech.enqueueSpeech('Token 27', { key: 'a', language: 'en' })
    speech.enqueueSpeech('Token 28', { key: 'b', language: 'en' })

    expect(speech.speak('Token 29', { language: 'en', force: true })).toBe(true)

    expect(synthesis.cancelCount).toBeGreaterThan(0)
    expect(synthesis.spoken).toHaveLength(2)
    expect(synthesis.spoken[1]?.text).toBe('Token 29')
  })
})
