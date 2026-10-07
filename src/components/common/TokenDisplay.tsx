import { useEffect, useRef, useState } from 'react'

import { formatToken } from '../../lib/marathiDigits'
import { cn } from '../../lib/utils'

type TokenSize = 'md' | 'lg' | 'xl' | 'display'

const SIZE_CLASSES: Record<TokenSize, string> = {
  md: 'text-5xl',
  lg: 'text-7xl',
  xl: 'text-8xl sm:text-9xl',
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
 * A token number, rendered the only way a patient should ever see it: in
 * Marathi numerals, zero-padded, with tabular figures so the width never jumps
 * as it counts up.
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

      <div
        className={cn(
          'token-digits font-extrabold',
          tone === 'dark' ? 'text-slate-900' : 'text-white',
          SIZE_CLASSES[size],
          flashing && 'token-flash',
        )}
        // Screen readers should hear the Marathi number, not the digits.
        aria-live={animate ? 'polite' : undefined}
        aria-atomic="true"
      >
        {token === null ? (
          <span className="text-slate-300">{emptyText}</span>
        ) : (
          formatToken(token)
        )}
      </div>
    </div>
  )
}
