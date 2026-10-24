import { useEffect, useRef, useState } from 'react'

import { useLanguage } from '../../hooks/useLanguage'
import { cn } from '../../lib/utils'

type TokenSize = 'sm' | 'md' | 'lg' | 'xl' | 'card' | 'display'

const SIZE_CLASSES: Record<TokenSize, string> = {
  sm: 'text-3xl',
  md: 'text-5xl',
  lg: 'text-7xl',
  xl: 'text-8xl sm:text-9xl',
  // Sized by viewport height so the same card remains legible at 720p and
  // 1080p without making the page overflow either screen.
  card: 'text-[clamp(3.5rem,9vh,7rem)]',
  // Sized in viewport units so the number fills a 1080p TV from across the
  // room, and still fits a laptop when the same page is opened there.
  display: 'text-[clamp(5rem,20vw,17rem)]',
}

interface TokenDisplayProps {
  token: number | null
  size?: TokenSize
  /** Text shown above the number, e.g. "सध्या सुरू असलेला क्रमांक". */
  label?: string
  /** Shown instead of a number when the queue has not started. */
  emptyText?: string
  className?: string
  /** Skip the highlight animation (used for the smaller "next token" panel). */
  animate?: boolean
  /**
   * Colour scheme. The TV display renders tokens on a dark background, where
   * the default dark numerals would be invisible — this picks the right pair
   * explicitly rather than relying on CSS order to break the tie.
   */
  tone?: 'dark' | 'light'
}

/**
 * A token number, rendered the only way a patient should ever see it: zero-padded
 * to three digits, with tabular figures so the width never jumps as it counts up.
 *
 * The numerals follow the interface language — `०२७` in Marathi, `૦૨૭` in
 * Gujarati, `027` in English (spec §8). The padding does not: the token is always
 * three digits wide, so it occupies the same space whichever language is on
 * screen.
 *
 * When the number changes the component briefly scales and brightens. On a TV
 * that is the difference between a patient noticing their turn and missing it
 * (spec §14).
 */
export function TokenDisplay({
  token,
  size = 'lg',
  label,
  emptyText = '—',
  className,
  animate = true,
  tone = 'dark',
}: TokenDisplayProps) {
  const { messages } = useLanguage()
  const [flashing, setFlashing] = useState(false)
  const previousRef = useRef<number | null>(token)

  useEffect(() => {
    const previous = previousRef.current
    previousRef.current = token

    // Only flash on a real transition to a new number, never on first paint.
    if (!animate || previous === null || token === null || previous === token) return

    setFlashing(true)
    const timer = window.setTimeout(() => setFlashing(false), 900)
    return () => window.clearTimeout(timer)
  }, [token, animate])

  return (
    <div className={cn('flex flex-col items-center text-center', className)}>
      {label ? (
        <p className="mb-2 text-sm font-semibold tracking-wide text-slate-600 uppercase sm:text-base">
          {label}
        </p>
      ) : null}

      {/* `aria-live` so a screen reader announces the new number, in whichever
          language the interface is currently writing it. */}
      <div
        className={cn(
          'token-digits font-extrabold',
          tone === 'dark' ? 'text-slate-900' : 'text-white',
          SIZE_CLASSES[size],
          flashing && 'token-flash',
        )}
        aria-live={animate ? 'polite' : undefined}
        aria-atomic="true"
      >
        {token === null ? (
          <span className="text-slate-300">{emptyText}</span>
        ) : (
          messages.token(token)
        )}
      </div>
    </div>
  )
}
