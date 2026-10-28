import { useLayoutEffect, useState, type RefObject } from 'react'

export interface TvViewportMetrics {
  width: number
  height: number
  unit: number
  aspectRatio: number
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

      shell.style.setProperty('--tv-vw', `${width / 100}px`)
      shell.style.setProperty('--tv-vh', `${height / 100}px`)
      shell.style.setProperty('--tv-u', `${unit}px`)

      setMetrics({
        width,
        height,
        unit,
        aspectRatio: height > 0 ? width / height : 0,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        clientWidth: document.documentElement.clientWidth,
        clientHeight: document.documentElement.clientHeight,
        screenWidth: window.screen?.width ?? 0,
        screenHeight: window.screen?.height ?? 0,
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
