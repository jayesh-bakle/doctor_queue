import { Wifi, WifiOff } from 'lucide-react'

import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { cn } from '../../lib/utils'

/**
 * An honest connection indicator for the reception desk.
 *
 * The queue only works while devices agree with each other, so reception is
 * told plainly when the browser has lost its connection — rather than being
 * shown a screen that looks live but silently isn't (spec §26).
 */
export function ConnectionIndicator({ className }: { className?: string }) {
  const online = useOnlineStatus()

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold',
        online
          ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
          : 'border-amber-400 bg-amber-50 text-amber-900',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      {online ? (
        <Wifi className="size-4" aria-hidden="true" />
      ) : (
        <WifiOff className="size-4" aria-hidden="true" />
      )}
      {online ? 'जोडलेले आहे' : 'कनेक्शन खंडित'}
    </span>
  )
}
