import { Clock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'

import { AnnouncementToggle } from '../components/common/AnnouncementToggle'
import { TokenDisplay } from '../components/common/TokenDisplay'
import { usePublicQueue } from '../hooks/usePublicQueue'
import { useHospital } from '../hooks/useHospital'
import { displayUrl } from '../lib/env'
import { toMarathiNumber } from '../lib/marathiDigits'
import { buildAnnouncementText, roomShortLabel } from '../lib/queue'
import { speak } from '../lib/speech'
import { formatDateWithWeekday, formatTime } from '../lib/utils'
import { DisplayLayout } from '../layouts/DisplayLayout'

/**
 * The public TV display.
 *
 * Two things about this page are non-negotiable:
 *
 * 1. It shows NO patient information. Not a name, not a mobile number, not an
 *    age. It cannot, in fact, because `get_public_queue()` selects no such
 *    columns — the data never reaches the browser (spec §37).
 *
 * 2. The current token is enormous. It has to be readable by someone with
 *    ordinary eyesight sitting at the far end of a waiting room, which drives
 *    every layout decision here.
 *
 * When the token changes the number flashes and, if audio is on, is announced
 * aloud — so a patient who looked away still catches their turn (spec §14).
 */
export function DisplayPage() {
  const { doctorId } = useParams<{ doctorId: string }>()
  const { data, loading, notFound, error } = usePublicQueue(doctorId)
  const { hospital } = useHospital()

  const [now, setNow] = useState(() => new Date())
  const announcedRef = useRef<number | null>(null)

  // A wall clock so the display is visibly alive even when the queue is still.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 20_000)
    return () => window.clearInterval(timer)
  }, [])

  const currentToken = data?.current_token ?? null
  const roomNumber = data?.room_number ?? ''

  useEffect(() => {
    if (currentToken === null) return

    // Skip the first sighting — on page load this is the token that was already
    // being served, and announcing it would be noise, not news.
    if (announcedRef.current === null) {
      announcedRef.current = currentToken
      return
    }
    if (announcedRef.current === currentToken) return

    announcedRef.current = currentToken
    speak(buildAnnouncementText(currentToken, roomNumber))
  }, [currentToken, roomNumber])

  if (loading) {
    return (
      <DisplayLayout>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-2xl text-slate-400">माहिती लोड होत आहे…</p>
        </div>
      </DisplayLayout>
    )
  }

  if (notFound || error || !data) {
    return (
      <DisplayLayout>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="text-3xl font-bold">{error ?? 'हा डिस्प्ले उपलब्ध नाही.'}</p>
          <p className="text-lg text-slate-400">
            कृपया रिसेप्शनशी संपर्क साधा किंवा URL तपासा.
          </p>
          {doctorId ? (
            <p className="text-sm text-slate-500">{displayUrl(doctorId)}</p>
          ) : null}
        </div>
      </DisplayLayout>
    )
  }

  const timezone = hospital?.timezone ?? 'Asia/Kolkata'
  const queueEmpty = data.current_token === null && data.next_token === null

  return (
    <DisplayLayout>
      {/* ---- Header ------------------------------------------------------- */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-700 px-8 py-5">
        <div className="flex flex-col">
          <p className="text-2xl font-extrabold tracking-wide text-white sm:text-3xl">
            {data.hospital_name}
          </p>
          <p className="mt-0.5 text-base text-slate-400">
            {formatDateWithWeekday(now, timezone)}
          </p>
        </div>

        <div className="flex items-center gap-6">
          <p className="token-digits flex items-center gap-2 text-2xl font-bold text-slate-300">
            <Clock className="size-6" aria-hidden="true" />
            {formatTime(now, timezone)}
          </p>
          <AnnouncementToggle className="no-print" />
        </div>
      </header>

      {/* ---- Doctor ------------------------------------------------------- */}
      <div className="border-b border-slate-700 px-8 py-6">
        <p className="text-3xl font-extrabold text-brand-300 sm:text-4xl">{data.doctor_name}</p>
        <p className="mt-1 text-xl text-slate-300">
          {data.department}
          {data.room_number ? ` · ${roomShortLabel(data.room_number)}` : ''}
        </p>
      </div>

      {/* ---- The tokens --------------------------------------------------- */}
      <main className="flex flex-1 flex-col items-center justify-center px-8 py-10">
        {queueEmpty ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-4xl font-bold text-slate-300">आजची रांग सुरू झालेली नाही.</p>
            <p className="text-xl text-slate-500">{data.display_message}</p>
          </div>
        ) : (
          <div className="grid w-full max-w-7xl flex-1 items-center gap-10 lg:grid-cols-[2fr_1fr]">
            {/* Current token — the one thing readable from the far wall. */}
            <div className="flex flex-col items-center justify-center rounded-3xl bg-slate-800 px-6 py-10">
              <p className="mb-4 text-2xl font-bold tracking-wide text-brand-300 uppercase sm:text-3xl">
                सध्या सुरू असलेला क्रमांक
              </p>
              <div aria-live="polite" aria-atomic="true">
                <TokenDisplay token={data.current_token} size="display" tone="light" emptyText="—" />
              </div>
              {data.current_token !== null && data.room_number ? (
                <p className="mt-6 text-3xl font-bold text-brand-200 sm:text-4xl">
                  {roomShortLabel(data.room_number)}
                </p>
              ) : null}
            </div>

            {/* Next token */}
            <div className="flex flex-col items-center justify-center gap-6 rounded-3xl bg-slate-800/60 px-6 py-10">
              <div className="flex flex-col items-center">
                <p className="mb-3 text-xl font-bold tracking-wide text-slate-400 uppercase">
                  पुढील क्रमांक
                </p>
                <div className="text-slate-200">
                  <TokenDisplay
                    token={data.next_token}
                    size="xl"
                    tone="light"
                    animate={false}
                    emptyText="—"
                  />
                </div>
              </div>

              <div className="h-px w-full bg-slate-700" />

              <div className="flex flex-col items-center">
                <p className="text-xl font-bold tracking-wide text-slate-400 uppercase">
                  प्रतीक्षेत
                </p>
                <p className="token-digits mt-1 text-6xl font-extrabold text-white">
                  {toMarathiNumber(data.waiting_count)}
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ---- Footer ------------------------------------------------------- */}
      <footer className="border-t border-slate-700 px-8 py-5 text-center">
        <p className="text-2xl font-semibold text-slate-300">{data.display_message}</p>
      </footer>
    </DisplayLayout>
  )
}
