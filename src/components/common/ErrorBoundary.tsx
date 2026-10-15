import { Component, type ErrorInfo, type ReactNode } from 'react'

import { logTechnicalError } from '../../lib/errors'
import { getMessages, loadStoredLanguage } from '../../lib/i18n'
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
 * screen with no idea what happened. The message is deliberately generic and in
 * the reader's own language — the technical detail goes to the console, never to
 * the patient (spec §21).
 *
 * Only catches errors thrown during rendering. Async failures are handled where
 * they happen, by the loading/error states on each page.
 *
 * It reads the language straight from storage rather than through
 * `useLanguage()`, because it is a class component and — more importantly —
 * because it sits *outside* `LanguageProvider` so that a crash inside the
 * provider is still caught. This screen does not need to react to a language
 * change: it is the only thing on screen when it is visible.
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

    const text = getMessages(loadStoredLanguage()).ui.errorBoundary

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-slate-50 px-4 text-center">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">{text.title}</h1>
          <p className="mt-2 text-base text-slate-600">{text.description}</p>
        </div>
        <Button size="lg" onClick={this.handleReload}>
          {text.reload}
        </Button>
      </div>
    )
  }
}
