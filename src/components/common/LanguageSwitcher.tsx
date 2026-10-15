import { useLanguage } from '../../hooks/useLanguage'
import { LANGUAGES, LANGUAGE_LABELS } from '../../lib/i18n'
import { cn } from '../../lib/utils'

interface LanguageSwitcherProps {
  /**
   * `light` for the pale patient and reception headers, `dark` for the TV
   * display, where the surrounding chrome is slate-900.
   */
  tone?: 'light' | 'dark'
  className?: string
}

/**
 * Marathi / हिंदी / English, switchable in place (spec §10).
 *
 * Labels are **autonyms** — each language written in its own script — and come
 * from `LANGUAGE_LABELS` rather than the message catalogue on purpose. A
 * switcher whose own labels are translated is useless to precisely the person
 * who needs it: someone who cannot read the language currently on screen.
 *
 * Marked `no-print` so it never appears on the printed QR poster.
 */
export function LanguageSwitcher({ tone = 'light', className }: LanguageSwitcherProps) {
  const { language, setLanguage, messages } = useLanguage()

  return (
    <div
      role="group"
      aria-label={messages.ui.common.language}
      className={cn(
        'no-print inline-flex shrink-0 items-center gap-0.5 rounded-full border p-0.5',
        tone === 'dark' ? 'border-slate-600 bg-slate-800' : 'border-slate-300 bg-slate-100',
        className,
      )}
    >
      {LANGUAGES.map((option) => {
        const selected = option === language
        return (
          <button
            key={option}
            type="button"
            // The accessible name is the language's own name, which is what a
            // screen-reader user searching for their language will recognise.
            aria-label={LANGUAGE_LABELS[option]}
            aria-pressed={selected}
            onClick={() => setLanguage(option)}
            className={cn(
              'min-h-9 rounded-full px-2.5 text-sm font-semibold transition-colors sm:px-3',
              selected
                ? tone === 'dark'
                  ? 'bg-white text-slate-900'
                  : 'bg-white text-brand-800 shadow-sm'
                : tone === 'dark'
                  ? 'text-slate-300 hover:text-white'
                  : 'text-slate-500 hover:text-slate-800',
            )}
          >
            {LANGUAGE_LABELS[option]}
          </button>
        )
      })}
    </div>
  )
}
