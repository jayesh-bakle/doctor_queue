import { Download, Filter } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'

import { SummaryCards } from '../components/analytics/SummaryCards'
import { ErrorState, LoadingState } from '../components/common/Feedback'
import { useHospitalAnalytics, usePlatformAnalytics } from '../hooks/useAnalytics'
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

const PLATFORM_TIMEZONE = 'Asia/Kolkata'

/**
 * The platform owner's all-hospital screen. The RPC checks `platform_admins`;
 * the route guard is only there to avoid showing a page that would fail.
 */
export function PlatformAdminPage() {
  const { session } = useStaffAuth()
  const { messages } = useLanguage()
  const t = messages.ui.analytics

  const [preset, setPreset] = useState<AnalyticsPreset>('month')
  const [range, setRange] = useState<DateRange>(() =>
    rangeForPreset('month', PLATFORM_TIMEZONE),
  )
  const [hospitalId, setHospitalId] = useState('all')

  useEffect(() => {
    if (preset !== 'custom') {
      setRange(rangeForPreset(preset, PLATFORM_TIMEZONE))
    }
  }, [preset])

  const analytics = usePlatformAnalytics(range.from, range.to)
  const selectedHospitalAnalytics = useHospitalAnalytics(
    hospitalId === 'all' ? null : hospitalId,
    range.from,
    range.to,
    null,
  )

  if (session && !session.isPlatformAdmin) {
    return <Navigate to="/staff/dashboard" replace />
  }

  const showingHospital = hospitalId !== 'all'
  const platformData = analytics.data
  const hospitalData = selectedHospitalAnalytics.data
  const summary = showingHospital ? hospitalData?.summary : platformData?.summary
  const daily = showingHospital ? hospitalData?.daily : platformData?.daily
  const hourly = showingHospital ? hospitalData?.hourly : platformData?.hourly
  const activeError = showingHospital ? selectedHospitalAnalytics.error : analytics.error
  const activeLoading = showingHospital
    ? selectedHospitalAnalytics.loading
    : analytics.loading
  const selectedHospitalName =
    platformData?.hospitals.find((hospital) => hospital.hospitalId === hospitalId)
      ?.hospitalName ?? ''

  const handlePreset = (next: AnalyticsPreset) => {
    setPreset(next)
    if (next !== 'custom') setRange(rangeForPreset(next, PLATFORM_TIMEZONE))
  }

  const handleExport = () => {
    if (!summary) return

    if (showingHospital) {
      if (!hospitalData) return
      const rows: Array<Array<string | number | null>> = [
        [t.doctorsTableTitle, selectedHospitalName],
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
        [t.date, t.registered, t.completed, t.skipped, t.waiting],
        ...hospitalData.daily.map((day) => [
          day.date,
          day.registered,
          day.completed,
          day.skipped,
          day.waiting,
        ]),
        [],
        [t.doctor, t.registered, t.completed, t.skipped, t.avgWait],
        ...hospitalData.doctors.map((doctor) => [
          doctor.doctorName,
          doctor.registered,
          doctor.completed,
          doctor.skipped,
          secondsToMinutes(doctor.avgWaitSeconds),
        ]),
      ]
      downloadCsv(
        `hospital-analytics-${selectedHospitalName || hospitalId}-${range.from}-${range.to}.csv`,
        rows,
      )
      return
    }

    if (!platformData) return
    const rows: Array<Array<string | number | null>> = [
      [t.platformTitle],
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
      [t.hospital, t.registered, t.completed, t.skipped, t.avgWait],
      ...platformData.hospitals.map((hospital) => [
        hospital.hospitalName,
        hospital.registered,
        hospital.completed,
        hospital.skipped,
        secondsToMinutes(hospital.avgWaitSeconds),
      ]),
    ]
    downloadCsv(`platform-analytics-${range.from}-${range.to}.csv`, rows)
  }

  return (
    <StaffLayout>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">{t.platformTitle}</h1>
            <p className="mt-1 text-sm text-slate-600">{t.platformDescription}</p>
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={!summary}
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
              {t.hospital}
              <select
                value={hospitalId}
                onChange={(event) => setHospitalId(event.target.value)}
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900"
              >
                <option value="all">{t.allHospitals}</option>
                {(platformData?.hospitals ?? []).map((hospital) => (
                  <option key={hospital.hospitalId} value={hospital.hospitalId}>
                    {hospital.hospitalName}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {activeError ? (
          <ErrorState
            message={activeError}
            onRetry={() =>
              void (showingHospital
                ? selectedHospitalAnalytics.refresh()
                : analytics.refresh())
            }
          />
        ) : activeLoading || !summary || !daily || !hourly ? (
          <LoadingState message={t.platformLoading} />
        ) : (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">{t.summaryTitle}</h2>
              <p className="mt-0.5 text-sm text-slate-600">
                {showingHospital && selectedHospitalName
                  ? selectedHospitalName
                  : t.summaryHint}
              </p>
              <div className="mt-4">
                <SummaryCards summary={summary} />
              </div>
            </section>

            <Suspense fallback={<LoadingState message={t.platformLoading} />}>
              <AnalyticsCharts
                timezone={PLATFORM_TIMEZONE}
                daily={daily}
                hourly={hourly}
                doctors={showingHospital ? hospitalData?.doctors : undefined}
                hospitals={showingHospital ? undefined : platformData?.hospitals}
              />
            </Suspense>

            {showingHospital ? (
              hospitalData ? (
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 px-5 py-4">
                    <h2 className="text-lg font-bold text-slate-900">
                      {t.doctorsTableTitle}
                    </h2>
                  </div>
                  {hospitalData.doctors.length === 0 ? (
                    <p className="px-5 py-8 text-center text-sm text-slate-500">
                      {t.noData}
                    </p>
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
                          {hospitalData.doctors.map((doctor) => {
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
              ) : null
            ) : (
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-5 py-4">
                  <h2 className="text-lg font-bold text-slate-900">
                    {t.hospitalsTableTitle}
                  </h2>
                </div>
                {platformData && platformData.hospitals.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                        <tr>
                          <th className="px-5 py-3">{t.hospital}</th>
                          <th className="px-5 py-3 text-right">{t.registered}</th>
                          <th className="px-5 py-3 text-right">{t.completed}</th>
                          <th className="px-5 py-3 text-right">{t.skipped}</th>
                          <th className="px-5 py-3 text-right">{t.avgWait}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {platformData.hospitals.map((hospital) => {
                          const wait = secondsToMinutes(hospital.avgWaitSeconds)
                          return (
                            <tr key={hospital.hospitalId}>
                              <td className="px-5 py-3 font-semibold text-slate-900">
                                {hospital.hospitalName}
                              </td>
                              <td className="token-digits px-5 py-3 text-right">
                                {messages.count(hospital.registered)}
                              </td>
                              <td className="token-digits px-5 py-3 text-right">
                                {messages.count(hospital.completed)}
                              </td>
                              <td className="token-digits px-5 py-3 text-right">
                                {messages.count(hospital.skipped)}
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
                ) : (
                  <p className="px-5 py-8 text-center text-sm text-slate-500">
                    {t.noData}
                  </p>
                )}
              </section>
            )}

            <p className="text-xs text-slate-500">
              {dateLabel(range.from, PLATFORM_TIMEZONE, messages)} —{' '}
              {dateLabel(range.to, PLATFORM_TIMEZONE, messages)}
            </p>
          </>
        )}
      </div>
    </StaffLayout>
  )
}
