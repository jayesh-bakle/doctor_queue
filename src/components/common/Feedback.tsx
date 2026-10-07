import { AlertTriangle, Inbox, Loader2, WifiOff } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'

/** A centred spinner with a Marathi caption. */
export function LoadingState({ message = 'कृपया थोडी वाट पाहा…' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <Loader2 className="size-8 animate-spin text-brand-700" aria-hidden="true" />
      <p className="text-base text-slate-600" role="status">
        {message}
      </p>
    </div>
  )
}

interface ErrorStateProps {
  message: string
  onRetry?: () => void
  retryLabel?: string
  className?: string
}

/**
 * A friendly Marathi failure notice. The technical detail is logged to the
 * console by `toMarathiError`, never rendered here (spec §21).
 */
export function ErrorState({
  message,
  onRetry,
  retryLabel = 'पुन्हा प्रयत्न करा',
  className,
}: ErrorStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-4 px-4 py-12 text-center', className)}>
      <div className="flex size-14 items-center justify-center rounded-full bg-red-50">
        <AlertTriangle className="size-7 text-red-600" aria-hidden="true" />
      </div>
      <p className="max-w-md text-base font-medium text-slate-800" role="alert">
        {message}
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 rounded-xl border border-slate-300 bg-white px-5 font-semibold text-slate-800 hover:bg-slate-50"
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  )
}

interface EmptyStateProps {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-4 py-14 text-center', className)}>
      <div className="flex size-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        {icon ?? <Inbox className="size-7" aria-hidden="true" />}
      </div>
      <p className="text-lg font-semibold text-slate-800">{title}</p>
      {description ? <p className="max-w-md text-sm text-slate-600">{description}</p> : null}
      {action}
    </div>
  )
}

/** Shown when the browser is offline. Never lets the UI imply it is synced. */
export function OfflineNotice({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900',
        className,
      )}
      role="status"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden="true" />
      इंटरनेट कनेक्शन तपासा.
    </div>
  )
}
