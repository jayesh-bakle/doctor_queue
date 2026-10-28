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
    <div
      className="flex h-screen w-screen flex-col overflow-hidden bg-slate-900 text-white supports-[height:100dvh]:h-dvh"
      style={{ backgroundColor: '#0f172a', color: '#ffffff', colorScheme: 'dark' }}
    >
      {children}
    </div>
  )
}
