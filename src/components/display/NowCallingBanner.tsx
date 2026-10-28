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
      className="display-banner mx-[clamp(1rem,calc(var(--tv-u,1vw)*2),3rem)] mt-[clamp(0.75rem,calc(var(--tv-u,1vw)*1.2),1.5rem)] flex max-w-full min-h-[clamp(5rem,calc(var(--tv-vh,1vh)*10),12rem)] items-center gap-[clamp(1rem,calc(var(--tv-u,1vw)*2),3rem)] rounded-[clamp(1rem,calc(var(--tv-u,1vw)*1.5),2.5rem)] border border-brand-500/70 bg-brand-800 px-[clamp(1rem,calc(var(--tv-u,1vw)*2),3rem)] py-[clamp(0.75rem,calc(var(--tv-u,1vw)*1.2),2rem)] text-white"
      style={{ backgroundColor: '#115e59', borderColor: '#14b8a6' }}
      role="status"
    >
      <div className="shrink-0 border-r border-brand-600 pr-[clamp(1rem,calc(var(--tv-u,1vw)*2),3rem)]">
        <p className="text-[clamp(0.75rem,calc(var(--tv-u,1vw)*1),1.5rem)] font-bold tracking-wider text-brand-200 uppercase">
          {t.nowCalling}
        </p>
        <TokenDisplay token={call.token} size="tvBanner" tone="light" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 break-words text-[clamp(1.5rem,calc(var(--tv-u,1vw)*2.6),5rem)] leading-tight font-extrabold">
          {call.doctorName}
        </p>
        {meta ? (
          <p className="mt-[clamp(0.25rem,calc(var(--tv-u,1vw)*0.4),0.75rem)] break-words text-[clamp(1rem,calc(var(--tv-u,1vw)*1.4),2.5rem)] text-brand-200">
            {meta}
          </p>
        ) : null}
      </div>
    </section>
  )
}
