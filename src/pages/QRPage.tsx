import { Copy, Download, Printer, QrCode as QrCodeIcon } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Button } from '../components/common/Button'
import { Card, CardBody, CardHeader } from '../components/common/Card'
import { useDoctors } from '../hooks/useDoctors'
import { useHospital } from '../hooks/useHospital'
import { useLanguage } from '../hooks/useLanguage'
import { displayUrl, hospitalRegistrationUrl, hospitalStaffLoginUrl, siteOrigin } from '../lib/env'
import { logTechnicalError } from '../lib/errors'
import { StaffLayout } from '../layouts/StaffLayout'

/**
 * QR code generation and printing (spec §15).
 *
 * The poster is designed to be printed on A4, taped to the reception counter,
 * and scanned by an ordinary phone camera from about 30cm. That drives the
 * choices here: high error correction, a generous quiet margin, and a QR image
 * rendered at print resolution rather than screen resolution.
 *
 * A doctor-specific poster pre-selects that doctor on the registration form,
 * which is useful when a clinic runs separate queues at separate windows.
 */
export function QRPage() {
  const [searchParams] = useSearchParams()
  const { hospital } = useHospital()
  const { messages } = useLanguage()
  const t = messages.ui.qr
  const { doctors } = useDoctors()

  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(searchParams.get('doctorId') ?? '')
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [qrError, setQrError] = useState(false)
  const [loginLinkCopied, setLoginLinkCopied] = useState(false)
  const [displayLinkCopied, setDisplayLinkCopied] = useState(false)

  // One poster per clinic. The hospital id in the path is what makes the scan
  // land on this hospital's queue rather than an ambiguous /register. The
  // optional doctor id only preselects a doctor on that same form.
  const targetUrl = useMemo(() => {
    if (!hospital) return ''
    const base = hospitalRegistrationUrl(hospital.id)
    return selectedDoctorId ? `${base}?doctorId=${selectedDoctorId}` : base
  }, [hospital, selectedDoctorId])

  useEffect(() => {
    let cancelled = false

    if (!targetUrl) {
      setDataUrl(null)
      return
    }

    void (async () => {
      try {
        const url = await QRCode.toDataURL(targetUrl, {
          width: 900,
          margin: 2,
          // Medium correction survives a crease, a coffee ring or a phone
          // camera held slightly off-angle — all of which happen to a poster.
          errorCorrectionLevel: 'M',
          color: { dark: '#0f172a', light: '#ffffff' },
        })
        if (!cancelled) {
          setDataUrl(url)
          setQrError(false)
        }
      } catch (caught) {
        logTechnicalError('QRPage — generate QR', caught)
        if (!cancelled) {
          setQrError(true)
          setDataUrl(null)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [targetUrl])

  const selectedDoctor = doctors.find((d) => d.id === selectedDoctorId) ?? null

  const handleDownload = () => {
    if (!dataUrl) return
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = 'ruggna-nondani-qr.png'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  /**
   * The reception login link contains a UUID, so it can only be shared by
   * copying. Clipboard access is denied on some browsers and insecure origins,
   * hence the try — the URL stays on screen either way, so nothing is lost.
   */
  const handleCopyLoginLink = async () => {
    if (!hospital) return
    try {
      await navigator.clipboard.writeText(hospitalStaffLoginUrl(hospital.id))
      setLoginLinkCopied(true)
      window.setTimeout(() => setLoginLinkCopied(false), 2000)
    } catch (caught) {
      logTechnicalError('QRPage — copy staff login link', caught)
    }
  }

  const handleCopyDisplayLink = async () => {
    if (!hospital) return
    try {
      await navigator.clipboard.writeText(displayUrl(hospital.id))
      setDisplayLinkCopied(true)
      window.setTimeout(() => setDisplayLinkCopied(false), 2000)
    } catch (caught) {
      logTechnicalError('QRPage — copy display link', caught)
    }
  }

  const origin = siteOrigin()

  return (
    <StaffLayout>
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        {/* ---- Controls (never printed) ---------------------------------- */}
        <Card className="no-print">
          <CardHeader
            title={t.title}
            description={t.description}
            action={
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  icon={<Download className="size-4" aria-hidden="true" />}
                  disabled={!dataUrl}
                  onClick={handleDownload}
                >
                  {t.download}
                </Button>
                <Button
                  icon={<Printer className="size-4" aria-hidden="true" />}
                  disabled={!dataUrl}
                  onClick={() => window.print()}
                >
                  {t.print}
                </Button>
              </div>
            }
          />

          <CardBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="qr-doctor" className="text-sm font-semibold text-slate-800">
                {t.forWhom}
              </label>
              <select
                id="qr-doctor"
                value={selectedDoctorId}
                onChange={(event) => setSelectedDoctorId(event.target.value)}
                className="w-full max-w-md rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-brand-600 focus:outline-none"
              >
                <option value="">{t.allDoctors}</option>
                {doctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.name}
                    {doctor.roomNumber ? ` — ${messages.roomShort(doctor.roomNumber)}` : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">{t.doctorHint}</p>
            </div>

            {targetUrl ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                {t.addressInQr}{' '}
                <span className="font-mono break-all text-slate-800">{targetUrl}</span>
              </p>
            ) : null}

            {qrError ? (
              <p role="alert" className="text-sm font-medium text-red-700">
                {t.generateFailed}
              </p>
            ) : null}
          </CardBody>
        </Card>

        {/* ---- The printable poster --------------------------------------- */}
        <div className="print-poster rounded-2xl border-4 border-brand-700 bg-white px-8 py-10 text-center shadow-sm">
          <p className="text-2xl font-extrabold text-brand-800">
            {hospital?.name ?? messages.ui.common.hospitalFallback}
          </p>
          {hospital?.address ? (
            <p className="mt-1 text-sm text-slate-500">{hospital.address}</p>
          ) : null}

          <div className="mx-auto my-6 h-1 w-24 rounded-full bg-brand-700" />

          <h1 className="text-3xl leading-snug font-extrabold text-slate-900 sm:text-4xl">
            {t.posterHeading}
          </h1>

          <div className="my-8 flex justify-center">
            {dataUrl ? (
              <img
                src={dataUrl}
                alt={t.qrAlt(targetUrl)}
                className="size-72 rounded-xl border-4 border-slate-900 bg-white p-3 sm:size-80"
              />
            ) : (
              <div className="flex size-72 items-center justify-center rounded-xl border-4 border-dashed border-slate-300 text-slate-400 sm:size-80">
                <QrCodeIcon className="size-16" aria-hidden="true" />
              </div>
            )}
          </div>

          <p className="text-xl font-bold text-slate-800">{t.scanInstruction}</p>
          <p className="mt-2 text-2xl font-extrabold text-brand-800">{t.getTokenOnMobile}</p>

          <ol className="mx-auto mt-6 flex max-w-md flex-col gap-1.5 text-left text-base text-slate-700">
            {t.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>

          {selectedDoctor ? (
            <p className="mt-6 text-lg font-bold text-slate-800">
              {selectedDoctor.name}
              {selectedDoctor.roomNumber ? ` · ${messages.roomShort(selectedDoctor.roomNumber)}` : ''}
            </p>
          ) : null}

          <p className="mt-6 rounded-xl border-2 border-dashed border-slate-300 px-4 py-3 text-base font-semibold text-slate-700">
            {t.noMobile}
          </p>

          {origin ? <p className="mt-4 text-xs text-slate-400">{origin}</p> : null}
        </div>

        {/* ---- Display URLs ---------------------------------------------- */}
        <Card className="no-print">
          <CardHeader title={t.displayLinksTitle} description={t.displayLinksDescription} />
          <CardBody>
            {hospital ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3">
                <code className="font-mono text-xs break-all text-slate-600">
                  {displayUrl(hospital.id)}
                </code>
                <Button
                  variant="secondary"
                  onClick={() => void handleCopyDisplayLink()}
                  icon={<Copy className="size-4" aria-hidden="true" />}
                >
                  {displayLinkCopied ? t.copied : t.copyLink}
                </Button>
              </div>
            ) : null}
          </CardBody>
        </Card>

        {/* ---- This clinic's reception login link ------------------------ */}
        {hospital ? (
          <Card className="no-print">
            <CardHeader title={t.staffLinkTitle} description={t.staffLinkDescription} />
            <CardBody>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3">
                <code className="font-mono text-xs break-all text-slate-600">
                  {hospitalStaffLoginUrl(hospital.id)}
                </code>
                <Button
                  variant="secondary"
                  onClick={handleCopyLoginLink}
                  icon={<Copy className="size-4" aria-hidden="true" />}
                >
                  {loginLinkCopied ? t.copied : t.copyLink}
                </Button>
              </div>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </StaffLayout>
  )
}
