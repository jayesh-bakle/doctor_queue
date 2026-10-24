import { useEffect, useRef } from 'react'

import { TURNSTILE_SITE_KEY, isTurnstileEnabled } from '../../lib/env'

interface TurnstileApi {
  render: (container: HTMLElement, options: Record<string, unknown>) => string
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let scriptPromise: Promise<void> | null = null

/**
 * Loads Cloudflare's script once per page, however many widgets mount.
 *
 * A failed load rejects permanently, which makes the form show the captcha
 * error instead of leaving a blank box — silently letting registration through
 * without the check would defeat the point.
 */
function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.turnstile) return Promise.resolve()

  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile]')
      const script = existing ?? document.createElement('script')

      const onLoad = () => resolve()
      const onError = () => reject(new Error('Turnstile failed to load'))

      script.addEventListener('load', onLoad, { once: true })
      script.addEventListener('error', onError, { once: true })

      if (!existing) {
        script.src = SCRIPT_SRC
        script.async = true
        script.defer = true
        script.dataset.turnstile = 'true'
        document.head.appendChild(script)
      }
    })
  }

  return scriptPromise
}

interface TurnstileWidgetProps {
  /** Called with the token when solved, and with null when it expires or fails. */
  onVerify: (token: string | null) => void
  className?: string
  /** Remount key; change it to discard a used token and show a fresh challenge. */
  resetKey?: number
}

/**
 * The invisible-to-most-people abuse check on the registration form.
 *
 * Rendered only when `VITE_TURNSTILE_SITE_KEY` is set, so demo mode and local
 * development keep working with no Cloudflare account. The matching secret
 * belongs only to the `register-patient` Edge Function.
 *
 * A single token can be used once. If the submit fails, the parent changes
 * `resetKey` to force a new challenge rather than letting the patient resubmit
 * a spent token.
 */
export function TurnstileWidget({ onVerify, className, resetKey = 0 }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const callbackRef = useRef(onVerify)

  useEffect(() => {
    callbackRef.current = onVerify
  }, [onVerify])

  useEffect(() => {
    if (!isTurnstileEnabled) return

    let cancelled = false
    let widgetId: string | null = null

    void loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return

        // `language: 'auto'` follows the browser, which is right for Marathi
        // and Gujarati where Cloudflare may not have a matching UI language.
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          language: 'auto',
          theme: 'light',
          callback: (token: string) => callbackRef.current(token),
          'expired-callback': () => callbackRef.current(null),
          'error-callback': () => callbackRef.current(null),
        })
      })
      .catch(() => callbackRef.current(null))

    return () => {
      cancelled = true
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId)
    }
  }, [resetKey])

  if (!isTurnstileEnabled) return null

  return <div ref={containerRef} className={className} />
}
