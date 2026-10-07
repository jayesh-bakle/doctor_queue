import { AlertTriangle, Bell, CheckCircle2, Clock, Stethoscope } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'
import type { PatientSituation, SituationTone } from '../../types/queue'

interface ToneStyle {
  wrapper: string
  iconWrapper: string
  icon: ReactNode
}

/**
 * Tone maps to colour, but each tone also has its own icon and its own wording,
 * so the state is legible without relying on colour alone (spec §36).
 */
const TONE_STYLES: Record<SituationTone, ToneStyle> = {
  waiting: {
    wrapper: 'border-slate-300 bg-slate-50 text-slate-900',
    iconWrapper: 'bg-slate-200 text-slate-700',
    icon: <Clock className="size-6" aria-hidden="true" />,
  },
  soon: {
    wrapper: 'border-amber-400 bg-amber-50 text-amber-950',
    iconWrapper: 'bg-amber-200 text-amber-900',
    icon: <Bell className="size-6" aria-hidden="true" />,
  },
  now: {
    wrapper: 'border-brand-500 bg-brand-50 text-brand-950',
    iconWrapper: 'bg-brand-200 text-brand-900',
    icon: <Stethoscope className="size-6" aria-hidden="true" />,
  },
  done: {
    wrapper: 'border-emerald-400 bg-emerald-50 text-emerald-950',
    iconWrapper: 'bg-emerald-200 text-emerald-900',
    icon: <CheckCircle2 className="size-6" aria-hidden="true" />,
  },
  attention: {
    wrapper: 'border-red-400 bg-red-50 text-red-950',
    iconWrapper: 'bg-red-200 text-red-900',
    icon: <AlertTriangle className="size-6" aria-hidden="true" />,
  },
}

/**
 * The single most important sentence on the patient's phone.
 *
 * `aria-live` means a screen-reader user hears the status change without having
 * to go looking for it — the same courtesy the visual flash extends to everyone
 * else.
 */
export function SituationCard({ situation }: { situation: PatientSituation }) {
  const style = TONE_STYLES[situation.tone]

  return (
    <div
      className={cn('flex items-start gap-4 rounded-2xl border-2 px-5 py-5', style.wrapper)}
      role="status"
      aria-live="polite"
    >
      <div className={cn('flex size-11 shrink-0 items-center justify-center rounded-full', style.iconWrapper)}>
        {style.icon}
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-lg leading-snug font-bold">{situation.headline}</p>
        <p className="text-base leading-relaxed opacity-90">{situation.detail}</p>
      </div>
    </div>
  )
}
