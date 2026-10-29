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
 * One doctor's card on the shared TV.
 *
 * `dense` is used from four cards upward, where two rows have to share a 720p
 * screen. Everything is sized from the card count rather than the viewport
 * width alone, because a five-card page at 1080p and a five-card page at 720p
 * need different vertical budgets.
 *
 * `simple` mode shows ONLY Doctor Name + Current Token (HUGE) for TV display.
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

  // SIMPLE MODE: Only Doctor Name + Current Token (HUGE)
  if (simple) {
    return (
      <section
        className={cn(
          'flex min-h-0 max-w-full flex-col items-center justify-center rounded-[clamp(1.5rem,calc(var(--tv-u,1vw)*2.5),4rem)] text-center transition-colors duration-300',
          dense
            ? 'px-[clamp(1.5rem,calc(var(--tv-u,1vw)*2.5),4rem)] py-[clamp(1.5rem,calc(var(--tv-u,1vw)*2.5),4rem)]'
            : 'px-[clamp(2rem,calc(var(--tv-u,1vw)*3.5),6rem)] py-[clamp(2rem,calc(var(--tv-u,1vw)*3.5),6rem)]',
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
        
        {/* Meta (dept/room) - optional but visible */}
        {meta && (
          <p
            className={cn(
              'line-clamp-2 w-full break-words text-slate-300 mb-[clamp(1rem,calc(var(--tv-u,1vw)*1.5),2rem)]',
              dense
                ? 'text-[clamp(1rem,calc(var(--tv-u,1vw)*1.8),2.5rem)]'
                : 'text-[clamp(1.25rem,calc(var(--tv-u,1vw)*2.2),3.5rem)]',
            )}
          >
            {meta}
          </p>
        )}

        {/* Current Token - MASSIVE */}
        <div className="flex w-full flex-col items-center">
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
      </section>
    )
  }

  // NORMAL MODE (full details)
  return (
    <section
      className={cn(
        'flex min-h-0 max-w-full flex-col items-center justify-center rounded-[clamp(1rem,calc(var(--tv-u,1vw)*1.6),2.5rem)] text-center transition-colors duration-300',
        dense
          ? 'px-[clamp(0.75rem,calc(var(--tv-u,1vw)*1.2),2rem)] py-[clamp(0.75rem,calc(var(--tv-u,1vw)*1.2),2rem)]'
          : 'px-[clamp(1rem,calc(var(--tv-u,1vw)*1.8),3rem)] py-[clamp(1rem,calc(var(--tv-u,1vw)*1.8),3rem)]',
        highlighted
          ? 'bg-slate-700 ring-[clamp(2px,calc(var(--tv-u,1vw)*0.35),8px)] ring-brand-400'
          : 'bg-slate-800',
        className,
      )}
      style={{
        backgroundColor: highlighted ? '#334155' : '#1e293b',
        boxShadow: highlighted
          ? '0 0 0 calc(var(--tv-u, 1vw) * 0.35) #2dd4bf'
          : undefined,
      }}
    >
      <p
        className={cn(
          'line-clamp-2 w-full break-words font-extrabold leading-tight text-brand-300',
          dense
            ? 'text-[clamp(1rem,calc(var(--tv-u,1vw)*1.6),2.5rem)]'
            : 'text-[clamp(1.5rem,calc(var(--tv-u,1vw)*2.4),4rem)]',
        )}
      >
        {doctor.doctor_name}
      </p>
      <p
        className={cn(
          'line-clamp-2 w-full break-words text-slate-300',
          dense
            ? 'text-[clamp(0.75rem,calc(var(--tv-u,1vw)*1),1.5rem)]'
            : 'text-[clamp(0.9rem,calc(var(--tv-u,1vw)*1.2),1.75rem)]',
        )}
      >
        {meta}
      </p>

      <div
        className={cn(
          'flex w-full flex-col items-center',
          dense
            ? 'mt-[clamp(0.5rem,calc(var(--tv-u,1vw)*0.8),1.25rem)]'
            : 'mt-[clamp(0.75rem,calc(var(--tv-u,1vw)*1.2),2rem)]',
        )}
      >
        <p
          className={cn(
            'font-bold tracking-wide text-slate-400 uppercase',
            dense
              ? 'mb-[clamp(0.25rem,calc(var(--tv-u,1vw)*0.4),0.75rem)] text-[clamp(0.65rem,calc(var(--tv-u,1vw)*0.85),1.25rem)]'
              : 'mb-[clamp(0.5rem,calc(var(--tv-u,1vw)*0.8),1rem)] text-[clamp(0.8rem,calc(var(--tv-u,1vw)*1.1),1.75rem)]',
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
          dense
            ? 'mt-[clamp(0.5rem,calc(var(--tv-u,1vw)*1),1.25rem)]'
            : 'mt-[clamp(0.75rem,calc(var(--tv-u,1vw)*1.5),2rem)]',
        )}
      />

      <div
        className={cn(
          'flex w-full items-center justify-center',
          dense
            ? 'mt-[clamp(0.375rem,calc(var(--tv-u,1vw)*0.6),1rem)] gap-[clamp(1rem,calc(var(--tv-u,1vw)*2),3rem)]'
            : 'mt-[clamp(0.75rem,calc(var(--tv-u,1vw)*1.2),1.5rem)] gap-[clamp(1.5rem,calc(var(--tv-u,1vw)*3),5rem)]',
        )}
      >
        <div className="flex flex-col items-center">
          <p
            className={cn(
              'font-bold tracking-wide text-slate-400 uppercase',
              dense
                ? 'text-[clamp(0.6rem,calc(var(--tv-u,1vw)*0.8),1.1rem)]'
                : 'text-[clamp(0.8rem,calc(var(--tv-u,1vw)*1.1),1.75rem)]',
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
                ? 'text-[clamp(0.6rem,calc(var(--tv-u,1vw)*0.8),1.1rem)]'
                : 'text-[clamp(0.8rem,calc(var(--tv-u,1vw)*1.1),1.75rem)]',
            )}
          >
            {t.waitingLabel}
          </p>
          <p
            className={cn(
              'token-digits mt-[clamp(0.125rem,calc(var(--tv-u,1vw)*0.2),0.5rem)] font-extrabold text-white',
              dense
                ? 'text-[clamp(1.75rem,calc(var(--tv-u,1vw)*2.8),4rem)]'
                : 'text-[clamp(2.5rem,calc(var(--tv-u,1vw)*4),6rem)]',
            )}
          >
            {messages.count(doctor.waiting_count ?? 0)}
          </p>
        </div>
      </div>
    </section>
  )
}
