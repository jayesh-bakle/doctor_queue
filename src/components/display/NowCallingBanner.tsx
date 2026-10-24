import { useLanguage } from '../../hooks/useLanguage'
import { TokenDisplay } from '../common/TokenDisplay'

export interface LatestCall {
  doctorId: string
  doctorName: string
  token: number
  roomNumber: string | null
}

/**
 * The most recent call, kept visible even while the TV is showing another page.
 *
 * Without this, a patient whose doctor is on page two could miss their call
 * entirely because the page they were watching did not contain that card.
 */
export function NowCallingBanner({ call }: { call: LatestCall | null }) {
  const { messages } = useLanguage()
  if (!call) return null

  const t = messages.ui.display
  const meta = call.roomNumber ? messages.roomShort(call.roomNumber) : null

  return (
    <section
      className="display-banner mx-4 mt-3 flex min-h-20 items-center gap-5 rounded-2xl border border-brand-500/70 bg-brand-800 px-5 py-3 text-white sm:mx-8"
      role="status"
    >
      <div className="shrink-0 border-r border-brand-600 pr-5">
        <p className="text-xs font-bold tracking-wider text-brand-200 uppercase">
          {t.nowCalling}
        </p>
        <TokenDisplay token={call.token} size="md" tone="light" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xl font-extrabold sm:text-2xl">{call.doctorName}</p>
        {meta ? <p className="mt-1 text-base text-brand-200">{meta}</p> : null}
      </div>
    </section>
  )
}
