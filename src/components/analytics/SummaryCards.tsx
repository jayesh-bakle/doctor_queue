import { useLanguage } from '../../hooks/useLanguage'
import { hourLabel, secondsToMinutes } from '../../lib/analytics'
import type { AnalyticsSummary } from '../../types/analytics'

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</p>
      <p className="token-digits mt-1 text-2xl font-extrabold text-slate-900">{value}</p>
    </div>
  )
}

export function SummaryCards({ summary }: { summary: AnalyticsSummary }) {
  const { messages } = useLanguage()
  const t = messages.ui.analytics
  const notProvided = messages.ui.common.notProvided

  const wait = secondsToMinutes(summary.avgWaitSeconds)
  const consult = secondsToMinutes(summary.avgConsultSeconds)

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      <Stat label={t.registered} value={messages.count(summary.registered)} />
      <Stat label={t.completed} value={messages.count(summary.completed)} />
      <Stat label={t.skipped} value={messages.count(summary.skipped)} />
      <Stat label={t.waiting} value={messages.count(summary.waiting)} />
      <Stat label={t.newPatients} value={messages.count(summary.newPatients)} />
      <Stat label={t.followupPatients} value={messages.count(summary.followupPatients)} />
      <Stat
        label={t.avgWait}
        value={wait === null ? notProvided : messages.minutes(wait)}
      />
      <Stat
        label={t.avgConsult}
        value={consult === null ? notProvided : messages.minutes(consult)}
      />
      <Stat
        label={t.peakHour}
        value={summary.peakHour === null ? notProvided : hourLabel(summary.peakHour, messages)}
      />
    </div>
  )
}
