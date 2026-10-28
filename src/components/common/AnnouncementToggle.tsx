import { Volume2, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { useLanguage } from '../../hooks/useLanguage'
import {
  cancelSpeech,
  getSpeechStatus,
  isAnnouncementEnabled,
  isSpeechSupported,
  onVoicesChanged,
  primeSpeech,
  setAnnouncementEnabled,
  speak,
  type SpeechStatus,
} from '../../lib/speech'
import { cn } from '../../lib/utils'

/**
 * The sound on/off control (spec §13).
 *
 * The label states what the button will do, not the current state, which is
 * what a person reaching for it actually needs to know.
 *
 * The language matters here in a way it does not elsewhere: the voice has to
 * match the language the announcement is written in, so switching the interface
 * to English asks the browser for an English voice, and the "no voice for this
 * language" note is re-evaluated rather than left over from the previous choice.
 */
export function AnnouncementToggle({ className }: { className?: string }) {
  const { language, messages } = useLanguage()
  const [enabled, setEnabled] = useState(() => isAnnouncementEnabled())
  const [status, setStatus] = useState<SpeechStatus>(() => getSpeechStatus(language))

  useEffect(() => {
    setStatus(getSpeechStatus(language))
    // Chrome populates its voice list asynchronously; re-check when it lands.
    const unsubscribe = onVoicesChanged(() => setStatus(getSpeechStatus(language)))

    // A sentence already in progress is in the old language. Stop it rather
    // than letting it finish under a screen that has just changed language.
    return () => {
      unsubscribe()
      cancelSpeech()
    }
  }, [language])

  const toggle = useCallback(() => {
    const next = !enabled
    setAnnouncementEnabled(next)
    setEnabled(next)

    if (next) {
      // A click is a user gesture, which is exactly what mobile browsers
      // require before they will allow speech at all.
      primeSpeech()
      speak(messages.ui.announcement.turnedOnSpoken, { force: true, language })
    }
  }, [enabled, language, messages])

  const supported = isSpeechSupported() && status.supported

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={enabled}
        className={cn(
          'inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors',
          enabled
            ? 'border-brand-300 bg-brand-50 text-brand-900 hover:bg-brand-100'
            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
        )}
      >
        {enabled ? (
          <Volume2 className="size-4" aria-hidden="true" />
        ) : (
          <VolumeX className="size-4" aria-hidden="true" />
        )}
        {enabled ? messages.ui.announcement.turnOff : messages.ui.announcement.turnOn}
      </button>

      {enabled && !supported ? (
        <p className="max-w-xs text-xs text-slate-500">{messages.ui.announcement.unsupported}</p>
      ) : null}

      {enabled && supported && !status.usingFallback && status.voiceName ? (
        <p className="max-w-xs text-xs text-slate-500">
          {messages.ui.announcement.usingVoice(status.voiceName)}
        </p>
      ) : null}

      {enabled && supported && status.usingFallback ? (
        <>
          <p className="max-w-xs text-xs text-amber-700">
            {messages.ui.announcement.fallbackVoice}
          </p>
          <p className="max-w-xs text-xs text-slate-500">
            {messages.ui.announcement.installHint}
          </p>
        </>
      ) : null}
    </div>
  )
}
