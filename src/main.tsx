import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import './index.css'

/**
 * Keeps the app alive if a browser machine-translates the page anyway.
 *
 * `index.html` already opts out of translation (`translate="no"`,
 * `class="notranslate"`, and the `google: notranslate` meta tag). But a user who
 * has explicitly ticked "always translate Marathi" can override that, and
 * translation is actively harmful here: Chrome rewrites React's text nodes into
 * its own `<font>` wrappers, so the real DOM stops matching React's virtual DOM.
 * The next re-render then calls `removeChild` for a node that is no longer a
 * child, and React throws
 *
 *   NotFoundError: Failed to execute 'removeChild' on 'Node'
 *
 * which unmounts the entire screen behind the error boundary — the dashboard
 * appears to break the instant anything is clicked.
 *
 * A translated-text mismatch is not a bug in this application, so rather than
 * letting it take the screen down we finish the removal browser-side and hand
 * React back a tree it can keep working with. Normal calls are untouched.
 */
function tolerateTranslatedDom(): void {
  if (typeof Node === 'undefined' || typeof Node.prototype.removeChild !== 'function') return

  const nativeRemoveChild = Node.prototype.removeChild

  Node.prototype.removeChild = function removeChild<T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      // The node was moved elsewhere (or is already detached). Remove it from
      // wherever it actually lives, and report success — which is the state the
      // caller was asking for anyway.
      child.parentNode?.removeChild(child)
      return child
    }

    return nativeRemoveChild.call(this, child) as T
  }
}

tolerateTranslatedDom()

const container = document.getElementById('root')

if (!container) {
  throw new Error('Root element #root not found in index.html')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
