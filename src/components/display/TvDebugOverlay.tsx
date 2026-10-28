import type { TvViewportMetrics } from '../../hooks/useTvViewport'

function format(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1) : '—'
}

export function TvDebugOverlay({ metrics }: { metrics: TvViewportMetrics }) {
  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-[9998] border-2 border-fuchsia-400" />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[9999] bg-black/95 px-3 py-2 font-mono text-[11px] leading-tight text-lime-300"
      >
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 md:grid-cols-4">
          <span>
            shell {format(metrics.width)} × {format(metrics.height)}
          </span>
          <span>
            inner {metrics.innerWidth} × {metrics.innerHeight}
          </span>
          <span>
            client {metrics.clientWidth} × {metrics.clientHeight}
          </span>
          <span>
            screen {metrics.screenWidth} × {metrics.screenHeight}
          </span>
          <span>dpr {format(metrics.devicePixelRatio)}</span>
          <span>
            visual {metrics.visualWidth === null ? '—' : format(metrics.visualWidth)} ×{' '}
            {metrics.visualHeight === null ? '—' : format(metrics.visualHeight)}
          </span>
          <span>--tv-vw {format(metrics.width / 100)}px</span>
          <span>--tv-vh {format(metrics.height / 100)}px</span>
          <span>--tv-u {format(metrics.unit)}px</span>
          <span>aspect {format(metrics.aspectRatio)}</span>
        </div>

        <div className="mt-2 space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-10 shrink-0">100%</span>
            <div className="h-1.5 bg-lime-400" style={{ width: '100%' }} />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-10 shrink-0">100vw</span>
            <div className="h-1.5 bg-amber-400" style={{ width: '100vw' }} />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-10 shrink-0">100vh</span>
            <div className="h-1.5 bg-cyan-400" style={{ height: '100vh', width: '2px' }} />
          </div>
        </div>
      </div>
    </>
  )
}
