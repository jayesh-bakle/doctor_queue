import { Clock } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'

import { AnnouncementToggle } from '../components/common/AnnouncementToggle'
import { LanguageSwitcher } from '../components/common/LanguageSwitcher'
import { DoctorCard } from '../components/display/DoctorCard'
import { NowCallingBanner, type LatestCall } from '../components/display/NowCallingBanner'
import { usePageRotation } from '../hooks/usePageRotation'
import { usePublicHospitalQueue } from '../hooks/usePublicHospitalQueue'
import { useLanguage } from '../hooks/useLanguage'
import {
  buildDoctorPages,
  cardClassFor,
  displaySignature,
  gridClassFor,
} from '../lib/displayLayout'
import { displayUrl } from '../lib/env'
import { DEFAULT_TIME_ZONE, cn } from '../lib/utils'
import { enqueueSpeech } from '../lib/speech'
import { DisplayLayout } from '../layouts/DisplayLayout'
import type { PublicHospitalQueueRow } from '../types/database'

const HIGHLIGHT_DURATION_MS = 30_000

/**
 * The shared waiting-room TV.
 *
 * One screen per clinic, showing every active doctor. The list is not fixed:
 * page size and rotation are derived from the active doctor count, and the
 * Supabase subscription also listens for doctor changes so a doctor added at
 * reception appears without waiting for the next queue event.
 *
 * It shows NO patient information. The RPC selects no name, mobile number or
 * clinical column, and the doctor-change signal carries only a hospital id.
 */
export function DisplayPage() {
  const { hospitalId } = useParams<{ hospitalId: string }>()
  const { doctors, hospital, loading, notFound, error } = usePublicHospitalQueue(hospitalId)
  const { language, messages } = useLanguage()
  const t = messages.ui.display

  const [now, setNow] = useState(() => new Date())
  const [latestCall, setLatestCall] = useState<LatestCall | null>(null)
  const [recentCalls, setRecentCalls] = useState<Record<string, true>>({})

  // The last token announced, per doctor. A map rather than one value, because
  // two doctors can be called at almost the same moment.
  const announcedRef = useRef<Map<string, number | null>>(new Map())
  const latestCallRef = useRef<LatestCall | null>(null)
  const highlightTimersRef = useRef<Map<string, number>>(new Map())

  const allIdle =
    doctors.length === 0 ||
    doctors.every((doctor) => doctor.current_token === null && doctor.next_token === null)

  // Do not rotate behind the empty-queue screen: when the first patient is
  // called, the TV should start on page one, not wherever the idle timer left it.
  const pages = useMemo(
    () => (allIdle ? [] : buildDoctorPages(doctors)),
    [allIdle, doctors],
  )
  const signature = useMemo(
    () => displaySignature(doctors, (doctor) => doctor.doctor_id ?? ''),
    [doctors],
  )
  const { pageIndex, pageCount, pageItems, rotating } = usePageRotation(pages, signature)
  const dense = pageItems.length >= 4

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 20_000)
    return () => window.clearInterval(timer)
  }, [])

  const rememberCall = useCallback(
    (doctor: PublicHospitalQueueRow, token: number, highlight = true) => {
      const doctorId = doctor.doctor_id
      if (!doctorId) return

      const call: LatestCall = {
        doctorId,
        doctorName: doctor.doctor_name ?? '',
        token,
        roomNumber: doctor.room_number,
      }
      latestCallRef.current = call
      setLatestCall(call)
      if (!highlight) return

      setRecentCalls((previous) =>
        previous[doctorId] ? previous : { ...previous, [doctorId]: true },
      )

      const existing = highlightTimersRef.current.get(doctorId)
      if (existing !== undefined) window.clearTimeout(existing)

      const timer = window.setTimeout(() => {
        highlightTimersRef.current.delete(doctorId)
        setRecentCalls((previous) => {
          if (!previous[doctorId]) return previous
          const next = { ...previous }
          delete next[doctorId]
          return next
        })
      }, HIGHLIGHT_DURATION_MS)

      highlightTimersRef.current.set(doctorId, timer)
    },
    [],
  )

  useEffect(() => {
    return () => {
      for (const timer of highlightTimersRef.current.values()) {
        window.clearTimeout(timer)
      }
      highlightTimersRef.current.clear()
    }
  }, [])

  useEffect(() => {
    const announced = announcedRef.current
    const present = new Set<string>()

    for (const doctor of doctors) {
      if (!doctor.doctor_id) continue
      present.add(doctor.doctor_id)

      const token = doctor.current_token
      if (token === null) {
        // Remember the doctor as seen, so their first call after an idle period
        // is announced rather than mistaken for the page-load token.
        announced.set(doctor.doctor_id, null)
        continue
      }

      const previous = announced.get(doctor.doctor_id)

      if (previous === undefined) {
        announced.set(doctor.doctor_id, token)
        // Seed the banner with the call already on screen when the TV loads,
        // but do not highlight a card for a call that may be long finished.
        if (latestCallRef.current === null) rememberCall(doctor, token, false)
        continue
      }

      if (previous === token) {
        // A rename or room change should update the banner without making it
        // look like a new call.
        if (latestCallRef.current?.doctorId === doctor.doctor_id) {
          const current = latestCallRef.current
          const name = doctor.doctor_name ?? ''
          if (current.doctorName !== name || current.roomNumber !== doctor.room_number) {
            const updated = { ...current, doctorName: name, roomNumber: doctor.room_number }
            latestCallRef.current = updated
            setLatestCall(updated)
          }
        }
        continue
      }

      announced.set(doctor.doctor_id, token)
      rememberCall(doctor, token)
      enqueueSpeech(messages.announcement(token, doctor.room_number ?? ''), {
        language,
        key: doctor.doctor_id,
      })
    }

    // A deactivated or deleted doctor must not leave a stale banner behind.
    if (latestCallRef.current && !present.has(latestCallRef.current.doctorId)) {
      latestCallRef.current = null
      setLatestCall(null)
    }

    for (const id of announced.keys()) {
      if (!present.has(id)) announced.delete(id)
    }
  }, [doctors, language, messages, rememberCall])

  if (loading) {
    return (
      <DisplayLayout>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-2xl text-slate-400">{t.loading}</p>
        </div>
      </DisplayLayout>
    )
  }

  if (notFound || error || !hospital) {
    return (
      <DisplayLayout>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="text-3xl font-bold">{error ?? t.unavailable}</p>
          <p className="text-lg text-slate-400">{t.checkUrl}</p>
          {hospitalId ? (
            <p className="text-sm text-slate-500">{displayUrl(hospitalId)}</p>
          ) : null}
        </div>
      </DisplayLayout>
    )
  }

  // The RPC returns the hospital's own timezone, so a display screen never has
  // to assume which clinic it belongs to.
  const timezone = hospital.hospital_timezone || DEFAULT_TIME_ZONE

  return (
    <DisplayLayout>
      <header className="display-header flex shrink-0 items-center justify-between gap-4 border-b border-slate-700 px-4 py-4 sm:px-8">
        <div className="flex min-w-0 flex-col">
          <p className="truncate text-xl font-extrabold tracking-wide text-white sm:text-2xl">
            {hospital.hospital_name}
          </p>
          <p className="display-date mt-0.5 text-sm text-slate-400">
            {messages.dateWithWeekday(now, timezone)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3 sm:gap-5">
          {rotating && !allIdle ? (
            <p className="token-digits rounded-full bg-slate-800 px-3 py-1 text-base font-bold text-slate-300">
              {messages.count(pageIndex + 1)} / {messages.count(pageCount)}
            </p>
          ) : null}
          <p className="token-digits flex items-center gap-2 text-lg font-bold text-slate-300 sm:text-xl">
            <Clock className="size-5" aria-hidden="true" />
            {messages.time(now, timezone)}
          </p>
          <LanguageSwitcher tone="dark" className="no-print" />
          <AnnouncementToggle className="no-print" />
        </div>
      </header>

      <NowCallingBanner call={latestCall} />

      <main className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-4 py-3 sm:px-8">
        {allIdle ? (
          <div className="flex flex-col items-center gap-4 px-4 text-center">
            <p className="text-3xl font-bold text-slate-300 sm:text-4xl">{t.emptyQueue}</p>
            <p className="text-lg text-slate-500 sm:text-xl">{hospital.display_message}</p>
          </div>
        ) : (
          <div
            key={pageIndex}
            className="display-page-enter flex min-h-0 w-full flex-1 items-center justify-center"
          >
            <div
              className={cn(
                'grid w-full content-center',
                dense ? 'gap-3' : 'gap-5',
                gridClassFor(pageItems.length),
              )}
            >
              {pageItems.map((doctor, index) => (
                <DoctorCard
                  key={doctor.doctor_id ?? `${doctor.doctor_name ?? 'doctor'}-${index}`}
                  doctor={doctor}
                  messages={messages}
                  dense={dense}
                  highlighted={Boolean(doctor.doctor_id && recentCalls[doctor.doctor_id])}
                  className={cardClassFor(index, pageItems.length)}
                />
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="display-footer shrink-0 border-t border-slate-700 px-4 py-3 text-center sm:px-8">
        <p className="truncate text-lg font-semibold text-slate-300 sm:text-xl">
          {hospital.display_message}
        </p>
      </footer>
    </DisplayLayout>
  )
}
