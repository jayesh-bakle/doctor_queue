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
        'flex min-h-0 max-w-full flex-col items-center justify-center rounded-[clamp(1rem,1.6vw,2.5rem)] text-center transition-colors duration-300',
        dense
          ? 'px-[clamp(0.75rem,1.2vw,2rem)] py-[clamp(0.75rem,1.2vw,2rem)]'
          : 'px-[clamp(1rem,1.8vw,3rem)] py-[clamp(1rem,1.8vw,3rem)]',
        highlighted
          ? 'bg-slate-700 ring-[clamp(2px,0.35vw,8px)] ring-brand-400'
          : 'bg-slate-800',
        className,
      )}
      style={{
        backgroundColor: highlighted ? '#334155' : '#1e293b',
        boxShadow: highlighted ? '0 0 0 0.35vw #2dd4bf' : undefined,
      }}
    >
      <p
        className={cn(
          'line-clamp-2 w-full break-words font-extrabold leading-tight text-brand-300',
          dense
            ? 'text-[clamp(1rem,1.6vw,2.5rem)]'
            : 'text-[clamp(1.5rem,2.4vw,4rem)]',
        )}
      >
        {doctor.doctor_name}
      </p>
      <p
        className={cn(
          'line-clamp-2 w-full break-words text-slate-300',
          dense
            ? 'text-[clamp(0.75rem,1vw,1.5rem)]'
            : 'text-[clamp(0.9rem,1.2vw,1.75rem)]',
        )}
      >
        {meta}
      </p>

      <div
        className={cn(
          'flex w-full flex-col items-center',
          dense ? 'mt-[clamp(0.5rem,0.8vw,1.25rem)]' : 'mt-[clamp(0.75rem,1.2vw,2rem)]',
        )}
      >
        <p
          className={cn(
            'font-bold tracking-wide text-slate-400 uppercase',
            dense
              ? 'mb-[clamp(0.25rem,0.4vw,0.75rem)] text-[clamp(0.65rem,0.85vw,1.25rem)]'
              : 'mb-[clamp(0.5rem,0.8vw,1rem)] text-[clamp(0.8rem,1.1vw,1.75rem)]',
          )}
        >
          {t.currentLabel}
        </p>
        <TokenDisplay
          token={doctor.current_token}
          size={dense ? 'tvCard' : 'tvCardLarge'}
          tone="light"
          emptyText="—"
        />
      </div>

      <div
        className={cn(
          'h-px w-full bg-slate-700',
          dense ? 'mt-[clamp(0.5rem,1vw,1.25rem)]' : 'mt-[clamp(0.75rem,1.5vw,2rem)]',
        )}
      />

      <div
        className={cn(
          'flex w-full items-center justify-center',
          dense
            ? 'mt-[clamp(0.375rem,0.6vw,1rem)] gap-[clamp(1rem,2vw,3rem)]'
            : 'mt-[clamp(0.75rem,1.2vw,1.5rem)] gap-[clamp(1.5rem,3vw,5rem)]',
        )}
      >
        <div className="flex flex-col items-center">
          <p
            className={cn(
              'font-bold tracking-wide text-slate-400 uppercase',
              dense
                ? 'text-[clamp(0.6rem,0.8vw,1.1rem)]'
                : 'text-[clamp(0.8rem,1.1vw,1.75rem)]',
            )}
          >
            {t.nextLabel}
          </p>
          <div className="text-slate-200">
            <TokenDisplay
              token={doctor.next_token}
              size={dense ? 'tvNextSmall' : 'tvNext'}
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
              dense
                ? 'text-[clamp(0.6rem,0.8vw,1.1rem)]'
                : 'text-[clamp(0.8rem,1.1vw,1.75rem)]',
            )}
          >
            {t.waitingLabel}
          </p>
          <p
            className={cn(
              'token-digits mt-[clamp(0.125rem,0.2vw,0.5rem)] font-extrabold text-white',
              dense
                ? 'text-[clamp(1.75rem,2.8vw,4rem)]'
                : 'text-[clamp(2.5rem,4vw,6rem)]',
            )}
          >
            {messages.count(doctor.waiting_count ?? 0)}
          </p>
        </div>
      </div>
    </section>
  )
}
