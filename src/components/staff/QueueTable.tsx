import { BellRing, Check, ChevronDown, ChevronUp, Play, SkipForward } from 'lucide-react'
import { Fragment, useState } from 'react'

import { useLanguage } from '../../hooks/useLanguage'
import { cn } from '../../lib/utils'
import { formatMobileForDisplay } from '../../lib/validation'
import type { QueueEntryView } from '../../types/queue'
import { Button } from '../common/Button'
import { StatusBadge } from '../common/StatusBadge'

interface QueueTableProps {
  entries: QueueEntryView[]
  /** The lowest WAITING token — the one "बोलवा" on a row would call. */
  nextWaitingToken: number | null
  timezone: string
  /** Public id of the row currently mid-request, so its buttons show a spinner. */
  busyPublicId: string | null
  callNextBusy: boolean
  onCallNext: () => void
  onRecall: (entry: QueueEntryView) => void
  onStart: (entry: QueueEntryView) => void
  onSkip: (entry: QueueEntryView) => void
  onComplete: (entry: QueueEntryView) => void
}

/**
 * Today's queue for one doctor.
 *
 * The actions offered on each row depend on that row's status, so reception
 * cannot attempt a transition the database would reject — the interface and the
 * state machine in `003_queue_functions.sql` agree.
 *
 * Names and mobile numbers appear here and only here. This table is behind a
 * login; the public TV never sees any of it (spec §37).
 */
export function QueueTable({
  entries,
  nextWaitingToken,
  timezone,
  busyPublicId,
  callNextBusy,
  onCallNext,
  onRecall,
  onStart,
  onSkip,
  onComplete,
}: QueueTableProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const { messages } = useLanguage()
  const t = messages.ui.queueTable

  const toggle = (publicId: string): void => {
    setExpanded((current) => (current === publicId ? null : publicId))
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[48rem] border-collapse text-left">
        <caption className="sr-only">{t.caption}</caption>
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-sm text-slate-600">
            <th scope="col" className="px-4 py-3 font-semibold">{t.token}</th>
            <th scope="col" className="px-4 py-3 font-semibold">{t.patientName}</th>
            <th scope="col" className="px-4 py-3 font-semibold">{t.registeredAt}</th>
            <th scope="col" className="px-4 py-3 font-semibold">{t.status}</th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">{t.actions}</th>
          </tr>
        </thead>

        <tbody>
          {entries.map((entry) => {
            const isBusy = busyPublicId === entry.publicId
            const isNext = entry.status === 'WAITING' && entry.tokenNumber === nextWaitingToken
            const isExpanded = expanded === entry.publicId

            return (
              <Fragment key={entry.publicId}>
                <tr
                  className={cn(
                    'border-b border-slate-100 align-middle',
                    isNext && 'bg-brand-50/60',
                    entry.status === 'CALLED' && 'bg-amber-50/60',
                  )}
                >
                  <th
                    scope="row"
                    className="token-digits px-4 py-3 text-2xl font-extrabold text-slate-900"
                  >
                    {messages.token(entry.tokenNumber)}
                  </th>

                  <td className="px-4 py-3">
                    <span className="text-base font-semibold text-slate-900">
                      {entry.patientName}
                    </span>
                    {entry.patientType === 'FOLLOWUP' ? (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {messages.patientType.FOLLOWUP}
                      </span>
                    ) : null}
                  </td>

                  <td className="token-digits px-4 py-3 text-base text-slate-600">
                    {messages.time(entry.createdAt, timezone)}
                  </td>

                  <td className="px-4 py-3">
                    <StatusBadge status={entry.status} />
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {isNext ? (
                        <Button
                          size="sm"
                          loading={callNextBusy}
                          icon={<BellRing className="size-4" aria-hidden="true" />}
                          onClick={onCallNext}
                        >
                          {t.call}
                        </Button>
                      ) : null}

                      {entry.status === 'CALLED' || entry.status === 'IN_CONSULTATION' ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={isBusy}
                          icon={<BellRing className="size-4" aria-hidden="true" />}
                          onClick={() => onRecall(entry)}
                        >
                          {t.recall}
                        </Button>
                      ) : null}

                      {entry.status === 'CALLED' ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={isBusy}
                          icon={<Play className="size-4" aria-hidden="true" />}
                          onClick={() => onStart(entry)}
                        >
                          {t.start}
                        </Button>
                      ) : null}

                      {entry.status === 'WAITING' ||
                      entry.status === 'CALLED' ||
                      entry.status === 'IN_CONSULTATION' ? (
                        <>
                          <Button
                            size="sm"
                            variant="success"
                            loading={isBusy}
                            icon={<Check className="size-4" aria-hidden="true" />}
                            onClick={() => onComplete(entry)}
                          >
                            {t.complete}
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            loading={isBusy}
                            icon={<SkipForward className="size-4" aria-hidden="true" />}
                            onClick={() => onSkip(entry)}
                          >
                            {t.skip}
                          </Button>
                        </>
                      ) : null}

                      <Button
                        size="sm"
                        variant="ghost"
                        aria-expanded={isExpanded}
                        icon={
                          isExpanded ? (
                            <ChevronUp className="size-4" aria-hidden="true" />
                          ) : (
                            <ChevronDown className="size-4" aria-hidden="true" />
                          )
                        }
                        onClick={() => toggle(entry.publicId)}
                      >
                        {t.details}
                      </Button>
                    </div>
                  </td>
                </tr>

                {isExpanded ? (
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <td colSpan={5} className="px-4 py-4">
                      <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
                        <div>
                          <dt className="font-medium text-slate-500">{t.mobile}</dt>
                          <dd className="token-digits mt-0.5 text-base font-semibold text-slate-900">
                            {entry.mobile
                              ? formatMobileForDisplay(entry.mobile)
                              : messages.ui.common.notProvided}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium text-slate-500">{t.patientType}</dt>
                          <dd className="mt-0.5 text-base font-semibold text-slate-900">
                            {messages.patientType[entry.patientType]}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium text-slate-500">{t.calledAt}</dt>
                          <dd className="token-digits mt-0.5 text-base font-semibold text-slate-900">
                            {entry.calledAt ? messages.time(entry.calledAt, timezone) : '—'}
                          </dd>
                        </div>
                      </dl>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
