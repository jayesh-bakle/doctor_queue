import { FlaskConical, RotateCcw, Users } from 'lucide-react'
import { useState } from 'react'

import { useLanguage } from '../../hooks/useLanguage'
import { dataSource } from '../../lib/datasource'
import { logTechnicalError } from '../../lib/errors'
import { showDemoControls } from '../../lib/env'
import { Button } from './Button'

/** How many sample patients the seed button creates. */
const SEED_COUNT = 8

/**
 * Demo mode banner and controls.
 *
 * Rendered only when `VITE_DEMO_MODE=true`, which in practice means only on a
 * laptop showing the system to the doctor. It is structurally impossible for
 * this to appear in front of a patient at reception.
 */
export function DemoBanner({ doctorId, onChanged }: { doctorId?: string | null; onChanged?: () => void }) {
  const [busy, setBusy] = useState<'seed' | 'reset' | null>(null)
  const { messages } = useLanguage()

  if (!showDemoControls) return null

  const run = async (action: 'seed' | 'reset') => {
    setBusy(action)
    try {
      if (action === 'seed' && doctorId) {
        await dataSource.seedDemoQueue?.(doctorId, SEED_COUNT)
      } else if (action === 'reset') {
        await dataSource.resetDemoData?.()
      }
      onChanged?.()
    } catch (caught) {
      logTechnicalError(`DemoBanner — ${action}`, caught)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="no-print flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-purple-400 bg-purple-50 px-4 py-3">
      <span className="inline-flex items-center gap-2 text-sm font-semibold text-purple-900">
        <FlaskConical className="size-4" aria-hidden="true" />
        {messages.ui.demo.label}
      </span>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          icon={<Users className="size-4" aria-hidden="true" />}
          loading={busy === 'seed'}
          disabled={!doctorId || busy !== null}
          onClick={() => void run('seed')}
        >
          {messages.ui.demo.seed(SEED_COUNT)}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={<RotateCcw className="size-4" aria-hidden="true" />}
          loading={busy === 'reset'}
          disabled={busy !== null}
          onClick={() => void run('reset')}
        >
          {messages.ui.demo.reset}
        </Button>
      </div>
    </div>
  )
}
