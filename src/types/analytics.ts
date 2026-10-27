/**
 * Analytics shapes returned by the SQL RPCs in 011_analytics.sql.
 *
 * These are aggregates only. There is deliberately no patient name, mobile
 * number or token id here: the analytics screens must never be able to show
 * personally identifiable information.
 */

export interface AnalyticsSummary {
  registered: number
  newPatients: number
  followupPatients: number
  completed: number
  skipped: number
  waiting: number
  called: number
  avgWaitSeconds: number | null
  avgConsultSeconds: number | null
  peakHour: number | null
}

export interface AnalyticsDailyPoint {
  date: string
  registered: number
  newPatients: number
  followupPatients: number
  completed: number
  skipped: number
  waiting: number
  called: number
  avgWaitSeconds: number | null
  avgConsultSeconds: number | null
  peakHour: number | null
}

export interface AnalyticsDoctorPoint {
  doctorId: string
  doctorName: string
  registered: number
  completed: number
  skipped: number
  avgWaitSeconds: number | null
  avgConsultSeconds: number | null
}

export interface AnalyticsHourlyPoint {
  hour: number
  registered: number
  completed: number
  skipped: number
}

export interface HospitalAnalytics {
  summary: AnalyticsSummary
  daily: AnalyticsDailyPoint[]
  doctors: AnalyticsDoctorPoint[]
  hourly: AnalyticsHourlyPoint[]
}

export interface PlatformHospitalPoint {
  hospitalId: string
  hospitalName: string
  registered: number
  completed: number
  skipped: number
  avgWaitSeconds: number | null
  avgConsultSeconds: number | null
}

export interface PlatformDailyPoint {
  date: string
  registered: number
  completed: number
  skipped: number
  newPatients: number
  followupPatients: number
  avgWaitSeconds: number | null
  avgConsultSeconds: number | null
}

export interface PlatformAnalytics {
  summary: AnalyticsSummary
  daily: PlatformDailyPoint[]
  hospitals: PlatformHospitalPoint[]
  hourly: AnalyticsHourlyPoint[]
}

/** `get_today_summary(...)` — live, not delayed by the aggregate refresh. */
export interface TodaySummary {
  date: string
  registered: number
  newPatients: number
  followupPatients: number
  completed: number
  skipped: number
  waiting: number
  called: number
  avgWaitSeconds: number | null
  avgConsultSeconds: number | null
  peakHour: number | null
}
