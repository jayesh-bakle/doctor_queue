import { ExternalLink, Pencil, Plus, QrCode, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '../components/common/Button'
import { Card, CardBody, CardHeader } from '../components/common/Card'
import { EmptyState, ErrorState, LoadingState } from '../components/common/Feedback'
import { DoctorForm, type DoctorFormValues } from '../components/staff/DoctorForm'
import { useDoctors } from '../hooks/useDoctors'
import { useLanguage } from '../hooks/useLanguage'
import { dataSource } from '../lib/datasource'
import { displayUrl } from '../lib/env'
import { logTechnicalError, toUserMessage } from '../lib/errors'
import { cn } from '../lib/utils'
import { StaffLayout } from '../layouts/StaffLayout'

/**
 * Doctor management (spec §16).
 *
 * Only active doctors appear in the patient registration form, so this is also
 * how a clinic takes a doctor off the queue for the day without deleting them —
 * and without losing that doctor's historical queue records.
 */
export function DoctorsPage() {
  const { doctors, loading, error, reload } = useDoctors(true)
  const { messages } = useLanguage()
  const t = messages.ui.doctors

  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const handleCreate = async (values: DoctorFormValues) => {
    setSubmitting(true)
    setActionError(null)
    try {
      await dataSource.createDoctor(values)
      setAdding(false)
      await reload()
    } catch (caught) {
      logTechnicalError('DoctorsPage — createDoctor', caught)
      setActionError(toUserMessage(caught, messages))
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdate = async (id: string, values: DoctorFormValues) => {
    setSubmitting(true)
    setActionError(null)
    try {
      await dataSource.updateDoctor(id, values)
      setEditingId(null)
      await reload()
    } catch (caught) {
      logTechnicalError('DoctorsPage — updateDoctor', caught)
      setActionError(toUserMessage(caught, messages))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <StaffLayout>
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader
            title={t.title}
            description={t.description}
            action={
              !adding ? (
                <Button
                  icon={<Plus className="size-4" aria-hidden="true" />}
                  onClick={() => {
                    setAdding(true)
                    setEditingId(null)
                  }}
                >
                  {t.addNew}
                </Button>
              ) : null
            }
          />

          {adding ? (
            <CardBody className="border-b border-slate-200 bg-slate-50">
              <DoctorForm
                submitting={submitting}
                submitLabel={t.addSubmit}
                onSubmit={(values) => void handleCreate(values)}
                onCancel={() => setAdding(false)}
              />
            </CardBody>
          ) : null}

          {actionError ? (
            <CardBody className="border-b border-red-200 bg-red-50">
              <p role="alert" className="text-sm font-medium text-red-800">
                {actionError}
              </p>
            </CardBody>
          ) : null}

          {loading ? (
            <LoadingState message={t.loading} />
          ) : error ? (
            <ErrorState message={error} onRetry={() => void reload()} />
          ) : doctors.length === 0 ? (
            <EmptyState
              title={t.emptyTitle}
              description={t.emptyDescription}
              icon={<UserRound className="size-7" aria-hidden="true" />}
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {doctors.map((doctor) => {
                const isEditing = editingId === doctor.id

                return (
                  <li key={doctor.id} className="px-5 py-4">
                    {isEditing ? (
                      <DoctorForm
                        initial={doctor}
                        submitting={submitting}
                        onSubmit={(values) => void handleUpdate(doctor.id, values)}
                        onCancel={() => setEditingId(null)}
                      />
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-800">
                            <UserRound className="size-5" aria-hidden="true" />
                          </div>
                          <div>
                            <p className="flex items-center gap-2 text-base font-bold text-slate-900">
                              {doctor.name}
                              {!doctor.isActive ? (
                                <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                                  {t.inactiveBadge}
                                </span>
                              ) : null}
                            </p>
                            <p className="text-sm text-slate-600">
                              {doctor.department || '—'}
                              {doctor.roomNumber ? ` · ${messages.roomShort(doctor.roomNumber)}` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              'rounded-full border px-2.5 py-1 text-xs font-semibold',
                              doctor.isActive
                                ? 'border-emerald-300 bg-emerald-100 text-emerald-900'
                                : 'border-slate-300 bg-slate-100 text-slate-600',
                            )}
                          >
                            {doctor.isActive ? t.active : t.inactive}
                          </span>
                          <Link to={`/qr?doctorId=${doctor.id}`}>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<QrCode className="size-4" aria-hidden="true" />}
                            >
                              {t.qr}
                            </Button>
                          </Link>
                          <a href={displayUrl(doctor.id)} target="_blank" rel="noreferrer">
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<ExternalLink className="size-4" aria-hidden="true" />}
                            >
                              {t.display}
                            </Button>
                          </a>
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={<Pencil className="size-4" aria-hidden="true" />}
                            onClick={() => {
                              setEditingId(doctor.id)
                              setAdding(false)
                            }}
                          >
                            {t.edit}
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </StaffLayout>
  )
}
