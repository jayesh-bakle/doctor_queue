import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import { TvDebugOverlay } from '../components/display/TvDebugOverlay'
import { useTvViewport } from '../hooks/useTvViewport'

/**
 * The frame for the public TV display.
 *
 * No navigation, no controls, nothing that a patient could accidentally
 * interact with. Dark by default so it reads as a display rather than a web
 * page, and so a bright screen in a dim waiting room is not harsh.
 */
export function DisplayLayout({ children }: { children: ReactNode }) {
  const shellRef = useRef<HTMLDivElement>(null)
  const metrics = useTvViewport(shellRef)
  const [debug] = useState(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('tvdebug') === '1',
  )
  
  useLayoutEffect(() => {
    const html = document.documentElement
    const body = document.body
    const root = document.getElementById('root')
    const previous = {
      htmlBackground: html.style.backgroundColor,
      htmlOverflow: html.style.overflow,
      htmlWidth: html.style.width,
      htmlHeight: html.style.height,
      htmlMargin: html.style.margin,
      htmlPadding: html.style.padding,
      bodyBackground: body.style.backgroundColor,
      bodyOverflow: body.style.overflow,
      bodyMargin: body.style.margin,
      bodyWidth: body.style.width,
      bodyHeight: body.style.height,
      bodyPadding: body.style.padding,
      rootWidth: root?.style.width ?? '',
      rootHeight: root?.style.height ?? '',
    }

    // Apply TV-optimized styles immediately
    html.style.backgroundColor = '#0f172a'
    html.style.overflow = 'hidden'
    html.style.width = '100%'
    html.style.height = '100%'
    html.style.margin = '0'
    html.style.padding = '0'
    
    body.style.backgroundColor = '#0f172a'
    body.style.overflow = 'hidden'
    body.style.margin = '0'
    body.style.width = '100%'
    body.style.height = '100%'
    body.style.padding = '0'
    
    if (root) {
      root.style.width = '100%'
      root.style.height = '100%'
      root.style.margin = '0'
      root.style.padding = '0'
    }
    
    // Disable text selection on TV
    html.style.userSelect = 'none'
    body.style.userSelect = 'none'
    
    // Mark as TV-initialized for CSS targeting
    html.dataset.tvInitialized = 'true'

    // Force initial viewport calculation
    if (shellRef.current) {
      shellRef.current.style.setProperty('--tv-vw', '1vw')
      shellRef.current.style.setProperty('--tv-vh', '1vh')
      shellRef.current.style.setProperty('--tv-u', '8px')
      shellRef.current.style.setProperty('--tv-screen-vh', '1vh')
    }

    return () => {
      html.style.backgroundColor = previous.htmlBackground
      html.style.overflow = previous.htmlOverflow
      html.style.width = previous.htmlWidth
      html.style.height = previous.htmlHeight
      html.style.margin = previous.htmlMargin || ''
      html.style.padding = previous.htmlPadding || ''
      html.style.userSelect = ''
      delete html.dataset.tvInitialized
      
      body.style.backgroundColor = previous.bodyBackground
      body.style.overflow = previous.bodyOverflow
      body.style.margin = previous.bodyMargin
      body.style.width = previous.bodyWidth
      body.style.height = previous.bodyHeight
      body.style.padding = previous.bodyPadding || ''
      body.style.userSelect = ''
      
      if (root) {
        root.style.width = previous.rootWidth
        root.style.height = previous.rootHeight
        root.style.margin = ''
        root.style.padding = ''
      }
    }
  }, [])

  return (
    <div
      ref={shellRef}
      className="fixed inset-0 flex h-full w-full flex-col overflow-hidden bg-slate-900 text-white"
      style={{ 
        backgroundColor: '#0f172a', 
        color: '#ffffff', 
        colorScheme: 'dark',
        // Ensure proper sizing even before JS runs
        minHeight: '100vh',
        minWidth: '100vw',
        height: '100vh',
        width: '100vw',
        maxHeight: '100vh',
        maxWidth: '100vw',
      }}
    >
      {children}
      {debug && metrics ? <TvDebugOverlay metrics={metrics} /> : null}
    </div>
  )
}
