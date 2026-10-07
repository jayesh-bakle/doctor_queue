import { BellRing, ExternalLink, Info, Users } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { AnnouncementToggle } from '../components/common/AnnouncementToggle'
import { Button } from '../components/common/Button'
import { Card, CardBody, CardHeader } from '../components/common/Card'
import { DemoBanner } from '../components/common/DemoBanner'
import { EmptyState, ErrorState, LoadingState } from '../components/common/Feedback'
import { TokenDisplay } from '../components/common/TokenDisplay'
import { QueueTable } from '../components/staff/QueueTable'
import { useDoctors } from '../hooks/useDoctors'
import { useHospital } from '../hooks/useHospital'
import { useQueue } from '../hooks/useQueue'
import { dataSource } from '../lib/datasource'
import { displayUrl } from '../lib/env'
import { logTechnicalError, toMarathiError } from '../lib/errors'
import { toMarathiNumber, formatToken } from '../lib/marathiDigits'
import {
  buildAnnouncementText,
  countRemaining,
  deriveSnapshot,
  findNextWaitingToken,
  roomShortLabel,
} from '../lib/queue'
import { speak } from '../lib/speech'
import { cn, todayInTimeZone } from '../lib/utils'
import { StaffLayout } from '../layouts/StaffLayout'
import type { QueueEntryView } from '../types/queue'

/**
 * The reception dashboard.
 *
 * Built around one action: "पुढील रुग्ण बोलवा". Everything else — recalling,
 * skipping, completing — is secondary and sits on the individual row. A
 * receptionist with a queue in front of them should be able to work this screen
 * with a single large button and never wonder which one to press.
 */
export function StaffDashboardPage() {
  const { hospital } = useHospital()
  const { doctors, loading: doctorsLoading, error: doctorsError, reload: reloadDoctors } = useDoctors()

  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null)
  const [busyPublicId, setBusyPublicId] = useState<string | null>(null)
  const [callNextBusy, setCallNextBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const timezone = hospital?.timezone ?? 'Asia/Kolkata'
  const queueDate = todayInTimeZone(timezone)

  // Default to the first doctor once the list arrives, without clobbering a
  // choice the user has already made.
  const activeDoctorId = selectedDoctorId ?? doctors[0]?.id ?? null
  const activeDoctor = doctors.find((d) => d.id === activeDoctorId) ?? null

  const { entries, loading, error, refresh } = useQueue(activeDoctorId, queueDate)

  const snapshot = useMemo(() => deriveSnapshot(entries), [entries])
  const nextWaitingToken = useMemo(() => findNextWaitingToken(entries), [entries])
  const remaining = useMemo(() => countRemaining(entries), [entries])

  /** Wraps a queue mutation with busy state and error reporting. */
  const runAction = useCallback(
    async (publicId: string | null, action: () => Promise<void>) => {
      setBusyPublicId(publicId)
      setActionError(null)
      try {
        await action()
        await refresh()
      } catch (caught) {
        logTechnicalError('StaffDashboardPage — action', caught)
        setActionError(toMarathiError(caught))
      } finally {
        setBusyPublicId(null)
      }
    },
    [refresh],
  )

  const handleCallNext = useCallback(async () => {
    if (!activeDoctorId || callNextBusy) return

    setCallNextBusy(true)
    setActionError(null)
    setNotice(null)

    try {
      const result = await dataSource.callNext(activeDoctorId)

      if (!result) {
        setNotice('रांगेत आता कोणीही प्रतीक्षेत नाही.')
        return
      }

      // Announced aloud where the button was pressed. The TV page can announce
      // too; the two toggles are independent, so a clinic that hears it twice
      // turns one of them off (see README).
      speak(buildAnnouncementText(result.called_token, result.room_number))

      await refresh()
    } catch (caught) {
      logTechnicalError('StaffDashboardPage — callNext', caught)
      setActionError(toMarathiError(caught))
    } finally {
      setCallNextBusy(false)
    }
  }, [activeDoctorId, callNextBusy, refresh])

  const handleRecall = (entry: QueueEntryView) =>
    runAction(entry.publicId, async () => {
      const result = await dataSource.recall(entry.publicId)
      speak(buildAnnouncementText(result.token_number, result.room_number))
    })

  const handleStart = (entry: QueueEntryView) =>
    runAction(entry.publicId, () => dataSource.startConsultation(entry.publicId))

  const handleSkip = (entry: QueueEntryView) =>
    runAction(entry.publicId, () => dataSource.skip(entry.publicId))

  const handleComplete = (entry: QueueEntryView) =>
    runAction(entry.publicId, () => dataSource.complete(entry.publicId))

  const handleDoctorChanged = () => {
    setActionError(null)
    setNotice(null)
    void refresh()
  }

  // ---- loading / error / empty -------------------------------------------

  if (doctorsLoading) {
    return (
      <StaffLayout>
        <LoadingState message="डॉक्टरांची माहिती लोड होत आहे…" />
      </StaffLayout>
    )
  }

  if (doctorsError) {
    return (
      <StaffLayout>
        <ErrorState message={doctorsError} onRetry={() => void reloadDoctors()} />
      </StaffLayout>
    )
  }

  if (doctors.length === 0) {
    return (
      <StaffLayout>
        <EmptyState
          title="अजून एकही डॉक्टर जोडलेले नाहीत."
          description="रांग सुरू करण्यापूर्वी डॉक्टर जोडा."
          icon={<Users className="size-7" aria-hidden="true" />}
          action={
            <Link to="/staff/doctors">
              <Button>डॉक्टर जोडा</Button>
            </Link>
          }
        />
      </StaffLayout>
    )
  }

  // ---- dashboard ----------------------------------------------------------

  return (
    <StaffLayout>
      <div className="flex flex-col gap-5">
        <DemoBanner doctorId={activeDoctorId} onChanged={handleDoctorChanged} />

        {/* ---- Doctor selector ------------------------------------------- */}
        {doctors.length > 1 ? (
          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-600">डॉक्टर निवडा</h2>
            <div className="flex flex-wrap gap-2">
              {doctors.map((doctor) => {
                const selected = doctor.id === activeDoctorId
                return (
                  <button
                    key={doctor.id}
                    type="button"
                    onClick={() => setSelectedDoctorId(doctor.id)}
                    aria-pressed={selected}
                    className={cn(
                      'flex min-h-12 flex-col items-start rounded-xl border-2 px-4 py-2 text-left transition-colors',
                      selected
                        ? 'border-brand-600 bg-brand-50'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                    )}
                  >
                    <span className="text-base font-bold text-slate-900">{doctor.name}</span>
                    <span className="text-xs text-slate-500">
                      {doctor.department} · {roomShortLabel(doctor.roomNumber)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        {/* ---- Current state + primary action ----------------------------- */}
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardBody className="flex flex-wrap items-center justify-between gap-6 py-6">
              <div className="flex flex-col gap-1">
                <p className="text-lg font-bold text-slate-900">{activeDoctor?.name}</p>
                <p className="text-sm text-slate-600">
                  {activeDoctor?.department} · {roomShortLabel(activeDoctor?.roomNumber ?? '')}
                </p>

                <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                      प्रतीक्षेत
                    </p>
                    <p className="token-digits text-3xl font-extrabold text-slate-900">
                      {toMarathiNumber(snapshot.waitingCount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                      एकूण आज
                    </p>
                    <p className="token-digits text-3xl font-extrabold text-slate-900">
                      {toMarathiNumber(entries.length)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                      बाकी
                    </p>
                    <p className="token-digits text-3xl font-extrabold text-slate-900">
                      {toMarathiNumber(remaining)}
                    </p>
                  </div>
                </div>
              </div>

              <TokenDisplay
                token={snapshot.currentToken}
                size="lg"
                label="सध्या सुरू"
                emptyText="—"
              />
            </CardBody>
          </Card>

          <Card>
            <CardBody className="flex flex-col gap-4 py-6">
              <Button
                size="xl"
                fullWidth
                loading={callNextBusy}
                disabled={nextWaitingToken === null}
                icon={<BellRing className="size-6" aria-hidden="true" />}
                onClick={() => void handleCallNext()}
              >
                पुढील रुग्ण बोलवा
              </Button>

              {nextWaitingToken !== null ? (
                <p className="text-center text-sm text-slate-600">
                  पुढील क्रमांक: <strong className="token-digits">{formatToken(nextWaitingToken)}</strong>
                </p>
              ) : (
                <p className="text-center text-sm text-slate-500">प्रतीक्षेत कोणी नाही</p>
              )}

              <AnnouncementToggle />

              {activeDoctorId ? (
                <a
                  href={displayUrl(activeDoctorId)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <ExternalLink className="size-4" aria-hidden="true" />
                  टीव्ही डिस्प्ले उघडा
                </a>
              ) : null}
            </CardBody>
          </Card>
        </div>

        {/* ---- Transient notices ------------------------------------------ */}
        {actionError ? (
          <p
            role="alert"
            className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
          >
            {actionError}
          </p>
        ) : null}

        {notice ? (
          <p
            role="status"
            className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700"
          >
            <Info className="size-4 shrink-0" aria-hidden="true" />
            {notice}
          </p>
        ) : null}

        {/* ---- The queue --------------------------------------------------- */}
        <Card>
          <CardHeader
            title="आजची रांग"
            description={`एकूण ${toMarathiNumber(entries.length)} नोंदी`}
          />

          {loading ? (
            <LoadingState message="रांग लोड होत आहे…" />
          ) : error ? (
            <ErrorState message={error} onRetry={() => void refresh()} />
          ) : entries.length === 0 ? (
            <EmptyState
              title="आज अजून एकही रुग्ण नोंदणी झालेला नाही."
              description="रुग्ण QR कोड स्कॅन करून नोंदणी करतील, तसे ते येथे दिसतील."
            />
          ) : (
            <QueueTable
              entries={entries}
              nextWaitingToken={nextWaitingToken}
              timezone={timezone}
              busyPublicId={busyPublicId}
              callNextBusy={callNextBusy}
              onCallNext={() => void handleCallNext()}
              onRecall={(entry) => void handleRecall(entry)}
              onStart={(entry) => void handleStart(entry)}
              onSkip={(entry) => void handleSkip(entry)}
              onComplete={(entry) => void handleComplete(entry)}
            />
          )}
        </Card>
      </div>
    </StaffLayout>
  )
}
