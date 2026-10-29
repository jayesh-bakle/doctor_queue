import { Clock } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'

import { AnnouncementToggle } from '../components/common/AnnouncementToggle'
import { LanguageSwitcher } from '../components/common/LanguageSwitcher'
import { DoctorCard } from '../components/display/DoctorCard'
import { NowCallingBanner, type LatestCall } from '../components/display/NowCallingBanner'
import { usePageRotation } from '../hooks/usePageRotation'
import { usePublicDisplayQueue } from '../hooks/usePublicDisplayQueue'
import { useLanguage } from '../hooks/useLanguage'
import {
  buildDoctorPages,
  cardClassFor,
  displaySignature,
  gridClassFor,
} from '../lib/displayLayout'
import { displayUrl } from '../lib/env'
import { localizedValue } from '../lib/i18n/content'
import { DEFAULT_TIME_ZONE, cn } from '../lib/utils'
import { enqueueSpeech } from '../lib/speech'
import { DisplayLayout } from '../layouts/DisplayLayout'
import type { PublicHospitalQueueRow } from '../types/database'

const HIGHLIGHT_DURATION_MS = 30_000

/**
 * The shared waiting-room TV - FULL FEATURES with LARGE TEXT.
 *
 * Shows: Clinic Name, Date, Time, Language, Announcements, Page rotation,
 *        Now Calling banner, Doctor cards with all details (name, dept, room, current/next token, waiting),
 *        Footer with custom message
 * All with VERY LARGE text sizes for TV readability.
 */
export function DisplayPage() {
  const { hospitalId, doctorId } = useParams<{ hospitalId?: string; doctorId?: string }>()
  const { doctors, hospital, loading, notFound, error } = usePublicDisplayQueue(
    { hospitalId, doctorId },
    { realtime: true },
  )
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
    !doctorId &&
    (doctors.length === 0 ||
      doctors.every((doctor) => doctor.current_token === null && doctor.next_token === null))

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
          <p className="text-[clamp(3rem,calc(var(--tv-u,1vw)*5),8rem)] text-slate-400">{t.loading}</p>
        </div>
      </DisplayLayout>
    )
  }

  if (notFound || error || !hospital) {
    return (
      <DisplayLayout>
        <div className="flex flex-1 flex-col items-center justify-center gap-[clamp(1.5rem,calc(var(--tv-u,1vw)*3),4rem)] px-[clamp(3rem,calc(var(--tv-u,1vw)*6),10rem)] text-center">
          <p className="max-w-full break-words text-[clamp(3rem,calc(var(--tv-u,1vw)*6),10rem)] font-bold">
            {error ?? t.unavailable}
          </p>
          <p className="max-w-full break-words text-[clamp(2rem,calc(var(--tv-u,1vw)*4),6rem)] text-slate-400">
            {t.checkUrl}
          </p>
          {hospitalId ? (
            <p className="text-[clamp(1.5rem,calc(var(--tv-u,1vw)*3),4rem)] text-slate-500">
              {displayUrl(hospitalId)}
            </p>
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
      {/* FULL HEADER - Clinic Name + Date + Time + Language + Announcements + Page */}
      <header className="display-header flex shrink-0 items-center justify-between gap-[clamp(1.5rem,calc(var(--tv-u,1vw)*3),4rem)] border-b border-slate-700 px-[clamp(2rem,calc(var(--tv-u,1vw)*4),8rem)] py-[clamp(1rem,calc(var(--tv-u,1vw)*2),3rem)]">
        <div className="flex min-w-0 flex-col">
          <p className="line-clamp-2 break-words text-[clamp(2.5rem,calc(var(--tv-u,1vw)*5),8rem)] leading-tight font-extrabold tracking-wide text-white">
            {hospital.hospital_name}
          </p>
          <p className="display-date mt-[clamp(0.25rem,calc(var(--tv-u,1vw)*0.5),1rem)] text-[clamp(1.25rem,calc(var(--tv-u,1vw)*2.5),3.5rem)] text-slate-400">
            {messages.dateWithWeekday(now, timezone)}
          </p>
        </div>

        <div className="tv-controls flex shrink-0 items-center gap-[clamp(1rem,calc(var(--tv-u,1vw)*2),3rem)]">
          {rotating && !allIdle ? (
            <p className="token-digits rounded-full bg-slate-800 px-[clamp(1rem,calc(var(--tv-u,1vw)*2),3rem)] py-[clamp(0.5rem,calc(var(--tv-u,1vw)*1),1.5rem)] text-[clamp(1.5rem,calc(var(--tv-u,1vw)*3),4rem)] font-bold text-slate-300">
              {messages.count(pageIndex + 1)} / {messages.count(pageCount)}
            </p>
          ) : null}
          <p className="token-digits flex items-center gap-[clamp(0.75rem,calc(var(--tv-u,1vw)*1.5),2rem)] text-[clamp(1.75rem,calc(var(--tv-u,1vw)*3.5),5rem)] font-bold text-slate-300">
            <Clock className="size-[clamp(1.75rem,calc(var(--tv-u,1vw)*3.5),5rem)]" aria-hidden="true" />
            {messages.time(now, timezone)}
          </p>
          <LanguageSwitcher tone="dark" className="no-print" />
          <AnnouncementToggle className="no-print" />
        </div>
      </header>

      {/* Now Calling Banner */}
      <NowCallingBanner call={latestCall} />

      {/* MAIN CONTENT - Doctor cards with ALL details */}
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-[clamp(2rem,calc(var(--tv-u,1vw)*4),8rem)] py-[clamp(1rem,calc(var(--tv-u,1vw)*2),3rem)]">
        {allIdle ? (
          <div className="flex max-w-full flex-col items-center gap-[clamp(1.5rem,calc(var(--tv-u,1vw)*3),4rem)] px-[clamp(2rem,calc(var(--tv-u,1vw)*4),8rem)] text-center">
            <p className="max-w-full break-words text-[clamp(3rem,calc(var(--tv-u,1vw)*6),10rem)] font-bold text-slate-300">
              {t.emptyQueue}
            </p>
            <p className="max-w-full break-words text-[clamp(2rem,calc(var(--tv-u,1vw)*4),6rem)] text-slate-500">
              {localizedValue(hospital.display_message_i18n, language, hospital.display_message)}
            </p>
          </div>
        ) : (
          <div
            key={pageIndex}
            className="display-page-enter flex min-h-0 w-full flex-1 items-center justify-center"
          >
            <div
              className={cn(
                'tv-grid grid content-center',
                dense
                  ? 'gap-[clamp(1rem,calc(var(--tv-u,1vw)*2),3rem)]'
                  : 'gap-[clamp(1.5rem,calc(var(--tv-u,1vw)*3),5rem)]',
                gridClassFor(pageItems.length),
              )}
            >
              {pageItems.map((doctor, index) => (
                <DoctorCard
                  key={doctor.doctor_id ?? `${doctor.doctor_name ?? 'doctor'}-${index}`}
                  doctor={doctor}
                  messages={messages}
                  language={language}
                  dense={dense}
                  highlighted={Boolean(doctor.doctor_id && recentCalls[doctor.doctor_id])}
                  className={cardClassFor(index, pageItems.length)}
                  // simple={false} - using full mode with all details
                />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* FULL FOOTER - Custom message */}
      <footer className="display-footer shrink-0 border-t border-slate-700 px-[clamp(2rem,calc(var(--tv-u,1vw)*4),8rem)] py-[clamp(1rem,calc(var(--tv-u,1vw)*2),3rem)] text-center">
        <p className="line-clamp-2 break-words text-[clamp(1.5rem,calc(var(--tv-u,1vw)*3),4rem)] leading-snug font-semibold text-slate-300">
          {localizedValue(hospital.display_message_i18n, language, hospital.display_message)}
        </p>
      </footer>
    </DisplayLayout>
  )
}
