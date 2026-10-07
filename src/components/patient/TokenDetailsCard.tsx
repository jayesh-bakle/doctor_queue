import { Building2, CalendarDays, DoorOpen, Stethoscope, Timer } from 'lucide-react'
import type { ReactNode } from 'react'

import { minutesLabel, toMarathiDigits } from '../../lib/marathiDigits'
import { estimateWaitMinutes } from '../../lib/queue'
import { cn } from '../../lib/utils'

interface DetailRowProps {
  icon: ReactNode
  label: string
  value: string
}

function DetailRow({ icon, label, value }: DetailRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="flex items-center gap-2 text-sm font-medium text-slate-600">
        <span className="text-slate-400">{icon}</span>
        {label}
      </span>
      <span className="text-right text-base font-bold text-slate-900">{value}</span>
    </div>
  )
}

interface TokenDetailsCardProps {
  doctorName: string
  department: string
  roomNumber: string
  hospitalName: string
  queueDateLabel: string
  patientsAhead?: number
  avgConsultationMinutes?: number
  showEstimate?: boolean
  className?: string
}

/**
 * Supporting details beneath the token: who the patient is seeing, where, and
 * roughly how long they will wait.
 *
 * The wait is always presented as an estimate, and always with the assumption
 * spelled out, because an unqualified "20 minutes" is a promise this system has
 * no ability to keep (spec §29).
 */
export function TokenDetailsCard({
  doctorName,
  department,
  roomNumber,
  hospitalName,
  queueDateLabel,
  patientsAhead,
  avgConsultationMinutes = 10,
  showEstimate = false,
  className,
}: TokenDetailsCardProps) {
  const showWait =
    showEstimate && patientsAhead !== undefined && patientsAhead > 0

  const waitMinutes = showWait
    ? estimateWaitMinutes(patientsAhead, avgConsultationMinutes)
    : 0

  return (
    <div className={cn('rounded-2xl border border-slate-200 bg-white px-5 py-2 shadow-sm', className)}>
      <div className="divide-y divide-slate-100">
        <DetailRow
          icon={<Stethoscope className="size-4" aria-hidden="true" />}
          label="डॉक्टर"
          value={doctorName}
        />
        {department ? (
          <DetailRow
            icon={<Building2 className="size-4" aria-hidden="true" />}
            label="विभाग"
            value={department}
          />
        ) : null}
        {roomNumber ? (
          <DetailRow
            icon={<DoorOpen className="size-4" aria-hidden="true" />}
            label="तपासणी कक्ष"
            value={toMarathiDigits(roomNumber, 0)}
          />
        ) : null}
        <DetailRow
          icon={<CalendarDays className="size-4" aria-hidden="true" />}
          label="दिनांक"
          value={queueDateLabel}
        />
        {hospitalName ? (
          <DetailRow
            icon={<Building2 className="size-4" aria-hidden="true" />}
            label="रुग्णालय"
            value={hospitalName}
          />
        ) : null}
      </div>

      {showWait ? (
        <div className="border-t border-slate-100 py-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Timer className="size-4 text-slate-400" aria-hidden="true" />
            अंदाजे प्रतीक्षा वेळ: {minutesLabel(waitMinutes)}
          </p>
          <p className="mt-1 pl-6 text-xs text-slate-500">
            हा फक्त अंदाज आहे — प्रत्यक्ष वेळ थोडा कमी-जास्त होऊ शकतो.
          </p>
        </div>
      ) : null}
    </div>
  )
}
