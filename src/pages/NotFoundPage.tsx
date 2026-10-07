import { Compass } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '../components/common/Button'

export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-slate-50 px-4 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-slate-200 text-slate-500">
        <Compass className="size-8" aria-hidden="true" />
      </div>
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">हे पान सापडले नाही.</h1>
        <p className="mt-1 text-base text-slate-600">
          कृपया रिसेप्शनने दिलेली लिंक तपासा किंवा मुख्य पानावर जा.
        </p>
      </div>
      <Link to="/">
        <Button size="lg">मुख्य पान</Button>
      </Link>
    </div>
  )
}
