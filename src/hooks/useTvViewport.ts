import { useLayoutEffect, useState, type RefObject } from 'react'

export interface TvViewportMetrics {
  width: number
  height: number
  unit: number
  aspectRatio: number
  screenAspectRatio: number
  innerWidth: number
  innerHeight: number
  clientWidth: number
  clientHeight: number
  screenWidth: number
  screenHeight: number
  devicePixelRatio: number
  visualWidth: number | null
  visualHeight: number | null
}

export function useTvViewport<T extends HTMLElement>(
  ref: RefObject<T | null>,
): TvViewportMetrics | null {
  const [metrics, setMetrics] = useState<TvViewportMetrics | null>(null)

  useLayoutEffect(() => {
    const shell = ref.current
    if (!shell) return

    const update = (): void => {
      const rect = shell.getBoundingClientRect()
      const width = rect.width || shell.clientWidth || window.innerWidth
      const height = rect.height || shell.clientHeight || window.innerHeight
      const unit = Math.min(width / 100, (height * 16) / 9 / 100)
      const visualViewport = window.visualViewport
      const screenWidth = window.screen?.width ?? 0
      const screenHeight = window.screen?.height ?? 0
      const aspectRatio = height > 0 ? width / height : 0
      const screenAspectRatio =
        screenWidth > 0 && screenHeight > 0 ? screenWidth / screenHeight : aspectRatio
      const wide = screenAspectRatio >= 1.5
      const ultrawide = screenAspectRatio >= 2
      const portrait = screenAspectRatio < 1

      shell.style.setProperty('--tv-vw', `${width / 100}px`)
      shell.style.setProperty('--tv-vh', `${height / 100}px`)
      shell.style.setProperty('--tv-u', `${unit}px`)
      shell.style.setProperty('--tv-screen-vh', `${screenHeight / 100}px`)
      shell.dataset.tvWide = String(wide)
      shell.dataset.tvUltrawide = String(ultrawide)
      shell.dataset.tvPortrait = String(portrait)

      setMetrics({
        width,
        height,
        unit,
        aspectRatio,
        screenAspectRatio,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        clientWidth: document.documentElement.clientWidth,
        clientHeight: document.documentElement.clientHeight,
        screenWidth,
        screenHeight,
        devicePixelRatio: window.devicePixelRatio || 1,
        visualWidth: visualViewport?.width ?? null,
        visualHeight: visualViewport?.height ?? null,
      })
    }

    update()

    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(shell)

    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('resize', update)
    }
  }, [ref])

  return metrics
}
