import { Bell, CheckCircle2, Clock, MinusCircle, Stethoscope } from 'lucide-react'
import type { ReactNode } from 'react'

import { STATUS_LABELS } from '../../lib/queue'
import { cn } from '../../lib/utils'
import type { QueueStatus } from '../../types/database'

interface StatusStyle {
  className: string
  icon: ReactNode
}

/**
 * Every status carries its own icon and its own Marathi word, so the meaning
 * survives greyscale printing, colour-blindness and a washed-out clinic
 * monitor. Colour is reinforcement, never the message (spec §36).
 */
const STATUS_STYLES: Record<QueueStatus, StatusStyle> = {
  WAITING: {
    className: 'bg-slate-100 text-slate-800 border-slate-300',
    icon: <Clock className="size-3.5" aria-hidden="true" />,
  },
  CALLED: {
    className: 'bg-amber-100 text-amber-900 border-amber-300',
    icon: <Bell className="size-3.5" aria-hidden="true" />,
  },
  IN_CONSULTATION: {
    className: 'bg-brand-100 text-brand-900 border-brand-300',
    icon: <Stethoscope className="size-3.5" aria-hidden="true" />,
  },
  COMPLETED: {
    className: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    icon: <CheckCircle2 className="size-3.5" aria-hidden="true" />,
  },
  SKIPPED: {
    className: 'bg-red-100 text-red-900 border-red-300',
    icon: <MinusCircle className="size-3.5" aria-hidden="true" />,
  },
}

interface StatusBadgeProps {
  status: QueueStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const style = STATUS_STYLES[status]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold',
        style.className,
        className,
      )}
    >
      {style.icon}
      {STATUS_LABELS[status]}
    </span>
  )
}
