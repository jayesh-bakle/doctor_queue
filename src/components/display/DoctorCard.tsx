import type { Messages, Language } from '../../lib/i18n'
import { localizedValue } from '../../lib/i18n/content'
import type { PublicHospitalQueueRow } from '../../types/database'
import { cn } from '../../lib/utils'
import { TokenDisplay } from '../common/TokenDisplay'

interface DoctorCardProps {
  doctor: PublicHospitalQueueRow
  messages: Messages
  language: Language
  dense: boolean
  highlighted: boolean
  className?: string
}

/**
 * One doctor's card on the shared TV.
 *
 * `dense` is used from four cards upward, where two rows have to share a 720p
 * screen. Everything is sized from the card count rather than the viewport
 * width alone, because a five-card page at 1080p and a five-card page at 720p
 * need different vertical budgets.
 */
export function DoctorCard({
  doctor,
  messages,
  language,
  dense,
  highlighted,
  className,
}: DoctorCardProps) {
  const t = messages.ui.display
  const department = doctor.department
    ? localizedValue(doctor.department_i18n, language, doctor.department)
    : null
  const meta = [department, doctor.room_number ? messages.roomShort(doctor.room_number) : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <section
      className={cn(
        'flex min-h-0 flex-col items-center justify-center rounded-3xl text-center transition-colors duration-300',
        dense ? 'px-3 py-3' : 'px-5 py-5',
        highlighted ? 'bg-slate-700 ring-4 ring-brand-400' : 'bg-slate-800',
        className,
      )}
    >
      <p
        className={cn(
          'w-full truncate font-extrabold text-brand-300',
          dense ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl',
        )}
      >
        {doctor.doctor_name}
      </p>
      <p className={cn('w-full truncate text-slate-300', dense ? 'text-xs' : 'text-sm')}>
        {meta}
      </p>

      <div className={cn('flex w-full flex-col items-center', dense ? 'mt-2' : 'mt-4')}>
        <p
          className={cn(
            'font-bold tracking-wide text-slate-400 uppercase',
            dense ? 'mb-1 text-[0.65rem]' : 'mb-2 text-sm',
          )}
        >
          {t.currentLabel}
        </p>
        <TokenDisplay
          token={doctor.current_token}
          size={dense ? 'card' : 'xl'}
          tone="light"
          emptyText="—"
        />
      </div>

      <div className={cn('h-px w-full bg-slate-700', dense ? 'mt-2' : 'mt-4')} />

      <div
        className={cn(
          'flex w-full items-center justify-center',
          dense ? 'mt-1.5 gap-5' : 'mt-3 gap-8',
        )}
      >
        <div className="flex flex-col items-center">
          <p
            className={cn(
              'font-bold tracking-wide text-slate-400 uppercase',
              dense ? 'text-[0.6rem]' : 'text-sm',
            )}
          >
            {t.nextLabel}
          </p>
          <div className="text-slate-200">
            <TokenDisplay
              token={doctor.next_token}
              size={dense ? 'sm' : 'md'}
              tone="light"
              animate={false}
              emptyText="—"
            />
          </div>
        </div>

        <div className="flex flex-col items-center">
          <p
            className={cn(
              'font-bold tracking-wide text-slate-400 uppercase',
              dense ? 'text-[0.6rem]' : 'text-sm',
            )}
          >
            {t.waitingLabel}
          </p>
          <p
            className={cn(
              'token-digits mt-0.5 font-extrabold text-white',
              dense ? 'text-2xl' : 'text-3xl',
            )}
          >
            {messages.count(doctor.waiting_count ?? 0)}
          </p>
        </div>
      </div>
    </section>
  )
}
