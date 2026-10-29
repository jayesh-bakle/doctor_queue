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
  isTv: boolean
  tvOs: string
}

function detectTvOS(): { isTv: boolean; tvOs: string } {
  const ua = navigator.userAgent.toLowerCase()
  
  // Samsung Tizen
  if (ua.includes('tizen')) return { isTv: true, tvOs: 'tizen' }
  // LG webOS
  if (ua.includes('webos') || ua.includes('web0s')) return { isTv: true, tvOs: 'webos' }
  // Android TV
  if (ua.includes('android') && (ua.includes('tv') || ua.includes('googletv') || ua.includes('aft'))) return { isTv: true, tvOs: 'android-tv' }
  // Fire TV
  if (ua.includes('firetv') || ua.includes('aft') || (ua.includes('android') && ua.includes('silk'))) return { isTv: true, tvOs: 'fire-tv' }
  // Roku
  if (ua.includes('roku')) return { isTv: true, tvOs: 'roku' }
  // ChromeCast / Google TV
  if (ua.includes('crkey') || ua.includes('google tv') || ua.includes('chromecast')) return { isTv: true, tvOs: 'chromecast' }
  // Generic smart TV indicators
  if (ua.includes('smart-tv') || ua.includes('smarttv') || ua.includes('tv browser') || ua.includes('hbbtv')) return { isTv: true, tvOs: 'generic-tv' }
  // Large screen detection - treat as TV if screen is large
  if (typeof screen !== 'undefined' && screen.width >= 1280 && screen.height >= 720) {
    return { isTv: true, tvOs: 'large-screen' }
  }
  
  return { isTv: false, tvOs: 'unknown' }
}

function getBestViewportDimensions(): { width: number; height: number; screenWidth: number; screenHeight: number } {
  // Try multiple sources for viewport dimensions
  const visualViewport = window.visualViewport
  
  // Primary: visualViewport (most accurate on mobile/TV)
  let width = visualViewport?.width ?? window.innerWidth
  let height = visualViewport?.height ?? window.innerHeight
  
  // Fallback: documentElement clientWidth/Height
  if (!width || !height || width < 100 || height < 100) {
    width = document.documentElement.clientWidth || window.innerWidth
    height = document.documentElement.clientHeight || window.innerHeight
  }
  
  // Fallback: screen dimensions (for kiosk/fullscreen TV browsers)
  const screenWidth = window.screen?.width ?? 0
  const screenHeight = window.screen?.height ?? 0
  
  // If we still have tiny dimensions, use screen as last resort
  if ((!width || width < 320) && screenWidth > 0) {
    width = screenWidth
  }
  if ((!height || height < 200) && screenHeight > 0) {
    height = screenHeight
  }
  
  // For TV: if screen is much larger than viewport, use screen dimensions
  // This handles TV browsers that report mobile viewport on large screens
  const { isTv } = detectTvOS()
  if (isTv && screenWidth > 0 && screenHeight > 0) {
    if (screenWidth > width * 1.5 || screenHeight > height * 1.5) {
      // Screen is significantly larger than reported viewport - use screen
      width = Math.max(width, screenWidth)
      height = Math.max(height, screenHeight)
    }
  }
  
  // Clamp to reasonable bounds
  width = Math.max(320, Math.min(width, 7680))
  height = Math.max(200, Math.min(height, 4320))
  
  return { width, height, screenWidth, screenHeight }
}

export function useTvViewport<T extends HTMLElement>(
  ref: RefObject<T | null>,
): TvViewportMetrics | null {
  const [metrics, setMetrics] = useState<TvViewportMetrics | null>(null)
  const { isTv, tvOs } = detectTvOS()

  useLayoutEffect(() => {
    const shell = ref.current
    if (!shell) return

    let animationFrameId: number | null = null
    let lastUpdate = 0

    const update = (): void => {
      const now = performance.now()
      // Throttle updates to 60fps max
      if (now - lastUpdate < 16) {
        animationFrameId = requestAnimationFrame(update)
        return
      }
      lastUpdate = now

      const { width, height, screenWidth, screenHeight } = getBestViewportDimensions()
      
      // For TV, use a more stable unit calculation
      // Base unit on the smaller dimension to ensure readability
      const baseUnit = Math.min(width, height * (16/9)) / 100
      const unit = isTv ? Math.max(baseUnit, 12) : baseUnit // Minimum 12px unit on TV (increased from 8)
      
      const aspectRatio = height > 0 ? width / height : 0
      const screenAspectRatio = screenWidth > 0 && screenHeight > 0 
        ? screenWidth / screenHeight 
        : aspectRatio
      
      // More generous wide/portrait detection for TV
      const wide = screenAspectRatio >= 1.3 // Slightly lower threshold
      const ultrawide = screenAspectRatio >= 1.8
      const portrait = screenAspectRatio < 1.1

      // Set CSS custom properties
      shell.style.setProperty('--tv-vw', `${width / 100}px`)
      shell.style.setProperty('--tv-vh', `${height / 100}px`)
      shell.style.setProperty('--tv-u', `${unit}px`)
      shell.style.setProperty('--tv-screen-vh', `${screenHeight > 0 ? screenHeight / 100 : height / 100}px`)
      shell.dataset.tvWide = String(wide)
      shell.dataset.tvUltrawide = String(ultrawide)
      shell.dataset.tvPortrait = String(portrait)
      shell.dataset.tvOs = tvOs
      shell.dataset.tvIsTv = String(isTv)

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
        isTv,
        tvOs,
      })
    }

    // Initial update
    update()
    
    // Use requestAnimationFrame for smoother updates
    animationFrameId = requestAnimationFrame(update)

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId)
      animationFrameId = requestAnimationFrame(update)
    }) : null
    observer?.observe(shell)

    const handleResize = () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId)
      animationFrameId = requestAnimationFrame(update)
    }
    
    window.addEventListener('resize', handleResize, { passive: true })
    window.visualViewport?.addEventListener('resize', handleResize, { passive: true })
    
    // Also listen for orientation change
    window.addEventListener('orientationchange', handleResize, { passive: true })

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId)
      observer?.disconnect()
      window.removeEventListener('resize', handleResize)
      window.visualViewport?.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleResize)
    }
  }, [ref, isTv, tvOs])

  return metrics
}
