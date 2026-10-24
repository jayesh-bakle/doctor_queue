import type { ReactNode } from 'react'

/**
 * The frame for the public TV display.
 *
 * No navigation, no controls, nothing that a patient could accidentally
 * interact with. Dark by default so it reads as a display rather than a web
 * page, and so a bright screen in a dim waiting room is not harsh.
 */
export function DisplayLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-900 text-white">
      {children}
    </div>
  )
}
