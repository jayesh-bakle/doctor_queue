import { Volume2, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import {
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
 * The "आवाज सुरू / आवाज बंद" control (spec §13).
 *
 * The label states what the button will do, not the current state, which is
 * what a person reaching for it actually needs to know.
 */
export function AnnouncementToggle({ className }: { className?: string }) {
  const [enabled, setEnabled] = useState(() => isAnnouncementEnabled())
  const [status, setStatus] = useState<SpeechStatus>(() => getSpeechStatus())

  useEffect(() => {
    // Chrome populates its voice list asynchronously; re-check when it lands.
    return onVoicesChanged(() => setStatus(getSpeechStatus()))
  }, [])

  const toggle = useCallback(() => {
    const next = !enabled
    setAnnouncementEnabled(next)
    setEnabled(next)

    if (next) {
      // A click is a user gesture, which is exactly what mobile browsers
      // require before they will allow speech at all.
      primeSpeech()
      speak('आवाज सुरू केला आहे.', { force: true })
    }
  }, [enabled])

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
        {enabled ? 'आवाज बंद करा' : 'आवाज सुरू करा'}
      </button>

      {enabled && !supported ? (
        <p className="max-w-xs text-xs text-slate-500">
          या ब्राउझरमध्ये मराठी आवाज उपलब्ध नाही. रांग मात्र योग्य चालू राहील.
        </p>
      ) : null}

      {enabled && supported && status.usingFallback ? (
        <p className="max-w-xs text-xs text-amber-700">
          मराठी आवाज सापडला नाही — हिंदी आवाज वापरला जाईल. उच्चार थोडा वेगळा असू शकतो.
        </p>
      ) : null}
    </div>
  )
}
