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
  simple?: boolean
}

/**
 * One doctor's card on the shared TV - FULL DETAILS with LARGE TEXT.
 *
 * Shows: Doctor name, department/room, Current token (HUGE), Next token, Waiting count
 * All with VERY LARGE text sizes for TV readability.
 */
export function DoctorCard({
  doctor,
  messages,
  language,
  dense,
  highlighted,
  className,
  simple = false,
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
        'flex min-h-0 max-w-full flex-col items-center justify-center rounded-[clamp(1.5rem,calc(var(--tv-u,1vw)*2.5),4rem)] text-center transition-colors duration-300',
        dense
          ? 'px-[clamp(1rem,calc(var(--tv-u,1vw)*1.8),3rem)] py-[clamp(1rem,calc(var(--tv-u,1vw)*1.8),3rem)]'
          : 'px-[clamp(1.5rem,calc(var(--tv-u,1vw)*2.5),4rem)] py-[clamp(1.5rem,calc(var(--tv-u,1vw)*2.5),4rem)]',
        highlighted
          ? 'bg-slate-700 ring-[clamp(3px,calc(var(--tv-u,1vw)*0.5),12px)] ring-brand-400'
          : 'bg-slate-800',
        className,
      )}
      style={{
        backgroundColor: highlighted ? '#334155' : '#1e293b',
        boxShadow: highlighted
          ? '0 0 0 calc(var(--tv-u, 1vw) * 0.5) #2dd4bf'
          : undefined,
      }}
    >
      {/* Doctor Name - LARGE */}
      <p
        className={cn(
          'line-clamp-2 w-full break-words font-extrabold leading-tight text-brand-300 mb-[clamp(0.5rem,calc(var(--tv-u,1vw)*1),1.5rem)]',
          dense
            ? 'text-[clamp(1.5rem,calc(var(--tv-u,1vw)*2.5),4rem)]'
            : 'text-[clamp(2rem,calc(var(--tv-u,1vw)*3.5),6rem)]',
        )}
      >
        {doctor.doctor_name}
      </p>
      
      {/* Department / Room Meta */}
      {meta && (
        <p
          className={cn(
            'line-clamp-2 w-full break-words text-slate-300 mb-[clamp(0.75rem,calc(var(--tv-u,1vw)*1.5),2rem)]',
            dense
              ? 'text-[clamp(1rem,calc(var(--tv-u,1vw)*1.8),2.5rem)]'
              : 'text-[clamp(1.25rem,calc(var(--tv-u,1vw)*2.2),3.5rem)]',
          )}
        >
          {meta}
        </p>
      )}

      {/* Current Token - MASSIVE */}
      <div
        className={cn(
          'flex w-full flex-col items-center mb-[clamp(0.75rem,calc(var(--tv-u,1vw)*1.5),2rem)]',
          dense
            ? 'mt-[clamp(0.75rem,calc(var(--tv-u,1vw)*1.2),2rem)]'
            : 'mt-[clamp(1rem,calc(var(--tv-u,1vw)*2),3rem)]',
        )}
      >
        <p
          className={cn(
            'font-bold tracking-wide text-slate-400 uppercase mb-[clamp(0.5rem,calc(var(--tv-u,1vw)*0.8),1.5rem)]',
            dense
              ? 'text-[clamp(1rem,calc(var(--tv-u,1vw)*1.5),2.5rem)]'
              : 'text-[clamp(1.25rem,calc(var(--tv-u,1vw)*2),3rem)]',
          )}
        >
          {t.currentLabel}
        </p>
        <TokenDisplay
          token={doctor.current_token}
          size={dense ? 'tvCardLarge' : 'tvCardLarge'}
          tone="light"
          emptyText="—"
        />
      </div>

      {/* Divider */}
      <div
        className={cn(
          'h-px w-full bg-slate-700',
          dense
            ? 'mt-[clamp(0.75rem,calc(var(--tv-u,1vw)*1.5),2rem)]'
            : 'mt-[clamp(1rem,calc(var(--tv-u,1vw)*2),3rem)]',
        )}
      />

      {/* Next Token + Waiting Count - SIDE BY SIDE, LARGE */}
      <div
        className={cn(
          'flex w-full items-center justify-center gap-[clamp(2rem,calc(var(--tv-u,1vw)*4),8rem)]',
          dense
            ? 'mt-[clamp(1rem,calc(var(--tv-u,1vw)*2),3rem)]'
            : 'mt-[clamp(1.5rem,calc(var(--tv-u,1vw)*3),5rem)]',
        )}
      >
        {/* Next Token */}
        <div className="flex flex-col items-center">
          <p
            className={cn(
              'font-bold tracking-wide text-slate-400 uppercase mb-[clamp(0.5rem,calc(var(--tv-u,1vw)*0.8),1.5rem)]',
              dense
                ? 'text-[clamp(1rem,calc(var(--tv-u,1vw)*1.5),2.5rem)]'
                : 'text-[clamp(1.25rem,calc(var(--tv-u,1vw)*2),3rem)]',
            )}
          >
            {t.nextLabel}
          </p>
          <div className="text-slate-200">
            <TokenDisplay
              token={doctor.next_token}
              size={dense ? 'tvNext' : 'tvNext'}
              tone="light"
              animate={false}
              emptyText="—"
            />
          </div>
        </div>

        {/* Waiting Count */}
        <div className="flex flex-col items-center">
          <p
            className={cn(
              'font-bold tracking-wide text-slate-400 uppercase mb-[clamp(0.5rem,calc(var(--tv-u,1vw)*0.8),1.5rem)]',
              dense
                ? 'text-[clamp(1rem,calc(var(--tv-u,1vw)*1.5),2.5rem)]'
                : 'text-[clamp(1.25rem,calc(var(--tv-u,1vw)*2),3rem)]',
            )}
          >
            {t.waitingLabel}
          </p>
          <p
            className={cn(
              'token-digits mt-[clamp(0.25rem,calc(var(--tv-u,1vw)*0.5),1rem)] font-extrabold text-white',
              dense
                ? 'text-[clamp(2.5rem,calc(var(--tv-u,1vw)*4),6rem)]'
                : 'text-[clamp(3.5rem,calc(var(--tv-u,1vw)*5.5),8rem)]',
            )}
          >
            {messages.count(doctor.waiting_count ?? 0)}
          </p>
        </div>
      </div>
    </section>
  )
}
