import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { useLanguage } from '../../hooks/useLanguage'
import { dateLabel, hourLabel } from '../../lib/analytics'
import type {
  AnalyticsDoctorPoint,
  AnalyticsHourlyPoint,
  PlatformHospitalPoint,
} from '../../types/analytics'

interface AnalyticsChartsProps {
  timezone: string
  daily: Array<{
    date: string
    registered: number
    completed: number
    skipped: number
  }>
  hourly: AnalyticsHourlyPoint[]
  doctors?: AnalyticsDoctorPoint[]
  hospitals?: PlatformHospitalPoint[]
}

const COLORS = {
  registered: '#0f766e',
  completed: '#2563eb',
  skipped: '#dc2626',
  newPatients: '#7c3aed',
  followupPatients: '#d97706',
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-sm text-slate-500">
      {message}
    </div>
  )
}

/**
 * Recharts is kept in this one lazily-loaded module so the patient registration
 * page and the TV display do not download a charting library they never use.
 */
export default function AnalyticsCharts({
  timezone,
  daily,
  hourly,
  doctors,
  hospitals,
}: AnalyticsChartsProps) {
  const { messages } = useLanguage()
  const t = messages.ui.analytics

  const dailyData = daily.map((day) => ({
    ...day,
    label: dateLabel(day.date, timezone, messages),
  }))
  const hourlyData = hourly.map((point) => ({
    ...point,
    label: hourLabel(point.hour, messages),
  }))
  const doctorData = (doctors ?? []).map((doctor) => ({
    ...doctor,
    label: doctor.doctorName,
  }))
  const hospitalData = (hospitals ?? []).map((hospital) => ({
    ...hospital,
    label: hospital.hospitalName,
  }))

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">{t.dailyTrend}</h2>
        <p className="mt-0.5 text-sm text-slate-600">{t.dailyTrendHint}</p>
        <div className="mt-4">
          {dailyData.length === 0 ? (
            <ChartEmpty message={t.noData} />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={dailyData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="analyticsRegistered" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.registered} stopOpacity={0.28} />
                    <stop offset="95%" stopColor={COLORS.registered} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} minTickGap={24} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="registered"
                  name={t.registered}
                  stroke={COLORS.registered}
                  fill="url(#analyticsRegistered)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="completed"
                  name={t.completed}
                  stroke={COLORS.completed}
                  fillOpacity={0}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">{t.hourlyLoad}</h2>
        <p className="mt-0.5 text-sm text-slate-600">{t.hourlyLoadHint}</p>
        <div className="mt-4">
          {hourlyData.every((point) => point.registered === 0) ? (
            <ChartEmpty message={t.noData} />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={hourlyData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={1} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="registered" name={t.registered} fill={COLORS.registered} radius={[4, 4, 0, 0]} />
                <Bar dataKey="completed" name={t.completed} fill={COLORS.completed} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {doctors ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">{t.doctorLoad}</h2>
          <p className="mt-0.5 text-sm text-slate-600">{t.doctorLoadHint}</p>
          <div className="mt-4">
            {doctorData.length === 0 ? (
              <ChartEmpty message={t.noData} />
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(280, doctorData.length * 46)}>
                <BarChart
                  data={doctorData}
                  layout="vertical"
                  margin={{ top: 8, right: 20, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={130}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="registered" name={t.registered} fill={COLORS.registered} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="completed" name={t.completed} fill={COLORS.completed} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      ) : null}

      {hospitals ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">{t.hospitalLoad}</h2>
          <p className="mt-0.5 text-sm text-slate-600">{t.hospitalLoadHint}</p>
          <div className="mt-4">
            {hospitalData.length === 0 ? (
              <ChartEmpty message={t.noData} />
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(280, hospitalData.length * 46)}>
                <BarChart
                  data={hospitalData}
                  layout="vertical"
                  margin={{ top: 8, right: 20, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="registered" name={t.registered} fill={COLORS.registered} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="completed" name={t.completed} fill={COLORS.completed} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      ) : null}
    </div>
  )
}
