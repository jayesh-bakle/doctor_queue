import { Component, type ErrorInfo, type ReactNode } from 'react'

import { logTechnicalError } from '../../lib/errors'
import { Button } from './Button'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

/**
 * Last-resort catch for a render-time crash.
 *
 * Without this, one bad component leaves the patient staring at a blank white
 * screen with no idea what happened. The message is deliberately generic and
 * Marathi — the technical detail goes to the console, never to the patient
 * (spec §21).
 *
 * Only catches errors thrown during rendering. Async failures are handled where
 * they happen, by the loading/error states on each page.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logTechnicalError('ErrorBoundary', { error, componentStack: info.componentStack })
  }

  private readonly handleReload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-slate-50 px-4 text-center">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">
            काहीतरी तांत्रिक अडचण आली आहे.
          </h1>
          <p className="mt-2 text-base text-slate-600">
            कृपया पान पुन्हा लोड करा. अडचण कायम राहिल्यास रिसेप्शनशी संपर्क साधा.
          </p>
        </div>
        <Button size="lg" onClick={this.handleReload}>
          पान पुन्हा लोड करा
        </Button>
      </div>
    )
  }
}
