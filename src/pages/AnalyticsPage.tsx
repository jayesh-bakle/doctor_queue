import { Download, Filter } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'

import { SummaryCards } from '../components/analytics/SummaryCards'
import { ErrorState, LoadingState } from '../components/common/Feedback'
import { useDoctors } from '../hooks/useDoctors'
import { useHospital } from '../hooks/useHospital'
import { useHospitalAnalytics } from '../hooks/useAnalytics'
import { useLanguage } from '../hooks/useLanguage'
import { useStaffAuth } from '../hooks/useStaffAuth'
import { StaffLayout } from '../layouts/StaffLayout'
import {
  dateLabel,
  downloadCsv,
  rangeForPreset,
  secondsToMinutes,
  type AnalyticsPreset,
  type DateRange,
} from '../lib/analytics'
import { cn } from '../lib/utils'

const AnalyticsCharts = lazy(() => import('../components/analytics/AnalyticsCharts'))

const PRESETS: AnalyticsPreset[] = [
  'today',
  'week',
  'month',
  'lastMonth',
  'last30',
  'last90',
  'custom',
]

/**
 * The hospital ADMIN's analytics screen.
 *
 * The SQL RPC is the real gate; this guard only keeps a RECEPTION account from
 * reaching a page that would immediately show "not authorized".
 */
export function AnalyticsPage() {
  const { session } = useStaffAuth()
  const { hospital, loading: hospitalLoading } = useHospital()
  const { doctors } = useDoctors({ includeInactive: true })
  const { messages } = useLanguage()
  const t = messages.ui.analytics
  const timezone = hospital?.timezone ?? 'Asia/Kolkata'

  const [preset, setPreset] = useState<AnalyticsPreset>('month')
  const [range, setRange] = useState<DateRange>(() => rangeForPreset('month', 'Asia/Kolkata'))
  const [doctorId, setDoctorId] = useState('all')

  useEffect(() => {
    if (preset !== 'custom') {
      setRange(rangeForPreset(preset, timezone))
    }
  }, [preset, timezone])

  const analytics = useHospitalAnalytics(
    hospital?.id ?? null,
    range.from,
    range.to,
    doctorId === 'all' ? null : doctorId,
  )

  if (session && session.role !== 'ADMIN' && !session.isPlatformAdmin) {
    return <Navigate to="/staff/dashboard" replace />
  }

  if (hospitalLoading) {
    return (
      <StaffLayout>
        <LoadingState message={t.loading} />
      </StaffLayout>
    )
  }

  const data = analytics.data
  const summary = data?.summary

  const handlePreset = (next: AnalyticsPreset) => {
    setPreset(next)
    if (next !== 'custom') setRange(rangeForPreset(next, timezone))
  }

  const handleExport = () => {
    if (!data || !summary) return
    const rows: Array<Array<string | number | null>> = [
      [t.title, hospital?.name ?? ''],
      [t.from, range.from, t.to, range.to],
      [t.registered, summary.registered],
      [t.completed, summary.completed],
      [t.skipped, summary.skipped],
      [t.waiting, summary.waiting],
      [t.newPatients, summary.newPatients],
      [t.followupPatients, summary.followupPatients],
      [t.avgWait, secondsToMinutes(summary.avgWaitSeconds)],
      [t.avgConsult, secondsToMinutes(summary.avgConsultSeconds)],
      [t.peakHour, summary.peakHour],
      [],
      [
        t.date,
        t.registered,
        t.completed,
        t.skipped,
        t.waiting,
        t.newPatients,
        t.followupPatients,
        t.avgWait,
        t.avgConsult,
      ],
      ...data.daily.map((day) => [
        day.date,
        day.registered,
        day.completed,
        day.skipped,
        day.waiting,
        day.newPatients,
        day.followupPatients,
        secondsToMinutes(day.avgWaitSeconds),
        secondsToMinutes(day.avgConsultSeconds),
      ]),
    ]
    downloadCsv(`hospital-analytics-${range.from}-${range.to}.csv`, rows)
  }

  return (
    <StaffLayout>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">{t.title}</h1>
            <p className="mt-1 text-sm text-slate-600">{t.description}</p>
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={!data}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="size-4" aria-hidden="true" />
            {t.exportCsv}
          </button>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-slate-500" aria-hidden="true" />
            <h2 className="text-sm font-bold text-slate-800">{t.range}</h2>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {PRESETS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => handlePreset(item)}
                aria-pressed={preset === item}
                className={cn(
                  'min-h-10 rounded-lg border px-3 text-sm font-semibold transition-colors',
                  preset === item
                    ? 'border-brand-600 bg-brand-50 text-brand-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                {t.presets[item]}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
              {t.from}
              <input
                type="date"
                value={range.from}
                onChange={(event) => {
                  setPreset('custom')
                  setRange((current) => ({ ...current, from: event.target.value }))
                }}
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
              {t.to}
              <input
                type="date"
                value={range.to}
                onChange={(event) => {
                  setPreset('custom')
                  setRange((current) => ({ ...current, to: event.target.value }))
                }}
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900"
              />
            </label>
            <label className="flex min-w-56 flex-col gap-1 text-sm font-semibold text-slate-700">
              {t.doctor}
              <select
                value={doctorId}
                onChange={(event) => setDoctorId(event.target.value)}
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900"
              >
                <option value="all">{t.allDoctors}</option>
                {doctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {analytics.error ? (
          <ErrorState message={analytics.error} onRetry={() => void analytics.refresh()} />
        ) : analytics.loading || !data || !summary ? (
          <LoadingState message={t.loading} />
        ) : (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">{t.summaryTitle}</h2>
              <p className="mt-0.5 text-sm text-slate-600">{t.summaryHint}</p>
              <div className="mt-4">
                <SummaryCards summary={summary} />
              </div>
            </section>

            <Suspense fallback={<LoadingState message={t.loading} />}>
              <AnalyticsCharts
                timezone={timezone}
                daily={data.daily}
                hourly={data.hourly}
                doctors={data.doctors}
              />
            </Suspense>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="text-lg font-bold text-slate-900">{t.doctorsTableTitle}</h2>
              </div>
              {data.doctors.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">{t.noData}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                      <tr>
                        <th className="px-5 py-3">{t.doctor}</th>
                        <th className="px-5 py-3 text-right">{t.registered}</th>
                        <th className="px-5 py-3 text-right">{t.completed}</th>
                        <th className="px-5 py-3 text-right">{t.skipped}</th>
                        <th className="px-5 py-3 text-right">{t.avgWait}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.doctors.map((doctor) => {
                        const wait = secondsToMinutes(doctor.avgWaitSeconds)
                        return (
                          <tr key={doctor.doctorId}>
                            <td className="px-5 py-3 font-semibold text-slate-900">
                              {doctor.doctorName}
                            </td>
                            <td className="token-digits px-5 py-3 text-right">
                              {messages.count(doctor.registered)}
                            </td>
                            <td className="token-digits px-5 py-3 text-right">
                              {messages.count(doctor.completed)}
                            </td>
                            <td className="token-digits px-5 py-3 text-right">
                              {messages.count(doctor.skipped)}
                            </td>
                            <td className="px-5 py-3 text-right text-slate-600">
                              {wait === null
                                ? messages.ui.common.notProvided
                                : messages.minutes(wait)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <p className="text-xs text-slate-500">
              {dateLabel(range.from, timezone, messages)} —{' '}
              {dateLabel(range.to, timezone, messages)}
            </p>
          </>
        )}
      </div>
    </StaffLayout>
  )
}
