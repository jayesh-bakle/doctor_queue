/**
 * Minimal browser globals so the demo backend can be exercised under Node.
 *
 * The demo data source is real application code — it is what the doctor will be
 * shown — so it deserves real tests rather than being excluded from the suite
 * for want of a `localStorage`. This module supplies just enough of the browser
 * for it to run: two in-memory storages, and a Web Locks stand-in.
 *
 * The lock manager is the important part. Node has no `navigator.locks`, so
 * without it `withLock()` degrades to calling straight through and concurrent
 * registrations would prove nothing. This implementation genuinely serialises
 * per name by chaining promises, which is what lets the concurrency test below
 * be a real test of the critical section.
 *
 * Note that this is a stand-in for testing, not the production guarantee. In
 * production the concurrency guarantee is Postgres' (`pg_advisory_xact_lock`),
 * verified separately in `tests/sql/`.
 */

interface StorageLike {
  readonly length: number
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  clear(): void
  key(index: number): string | null
}

export function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    getItem: (key) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key, value) => {
      map.set(key, String(value))
    },
    removeItem: (key) => {
      map.delete(key)
    },
    clear: () => map.clear(),
    key: (index) => [...map.keys()][index] ?? null,
  }
}

/**
 * A serialising lock manager with the same shape as `navigator.locks`.
 *
 * Requests for the same name run one after another in arrival order; a rejected
 * holder does not break the chain for the next one.
 */
export function createLockManager() {
  const chains = new Map<string, Promise<unknown>>()

  return {
    request<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
      const previous = chains.get(name) ?? Promise.resolve()
      const run = previous.then(() => fn())
      chains.set(
        name,
        run.catch(() => undefined),
      )
      return run
    },
  }
}

function define(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, writable: true, configurable: true })
}

/** `globalThis` as a plain bag, so these installs never depend on a declared global. */
const globalScope = globalThis as unknown as Record<string, unknown>

/**
 * The storage the most recent `installBrowserEnv()` installed.
 *
 * Tests reach for this instead of the bare `localStorage` global because the
 * Node test tsconfig has no DOM lib, so that global is not declared — and
 * because reaching for whatever the ambient global happens to be is exactly the
 * kind of thing that makes a test pass for the wrong reason.
 */
let currentLocalStorage: StorageLike | null = null

/** The in-memory `localStorage` the demo backend is currently writing to. */
export function demoStorage(): StorageLike {
  if (!currentLocalStorage) installBrowserEnv()
  return currentLocalStorage as StorageLike
}

/**
 * Installs the globals. Call before importing the demo data source, and again
 * in `beforeEach` to get a clean storage per test.
 */
export function installBrowserEnv(): void {
  const local = createMemoryStorage()
  currentLocalStorage = local

  define(globalScope, 'localStorage', local)
  define(globalScope, 'sessionStorage', createMemoryStorage())
  define(globalScope, 'window', undefined)

  // The demo backend broadcasts across tabs when it changes. Under test there
  // are no other tabs, and leaving Node's real BroadcastChannel in place would
  // open a port that keeps the process alive after the suite finishes.
  define(globalScope, 'BroadcastChannel', undefined)

  try {
    define(globalScope, 'navigator', { locks: createLockManager(), onLine: true })
  } catch {
    // Node 21+ exposes `navigator` as a non-configurable accessor we cannot
    // replace. The demo hands out correct tokens either way — nothing inside the
    // critical section awaits, so concurrent calls cannot interleave — it just
    // stops exercising the lock path. Production's guarantee is Postgres'.
  }
}

/** The key the demo backend persists to. Mirrors `STATE_KEY` in the data source. */
export const DEMO_STATE_KEY = 'queue.demo.state.v1'
