import { Database, FlaskConical } from 'lucide-react'

/**
 * Shown when the app has neither Supabase credentials nor demo mode enabled.
 *
 * Failing here with instructions is far kinder than letting the first query
 * throw a network error that looks like a bug in the queue system.
 */
export function SetupNotice() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-extrabold text-slate-900">
          Setup is not complete
        </h1>
        <p className="mt-2 text-base text-slate-600">
          The application needs a Supabase project, or demo mode to run without one. Create a{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-sm">.env</code> file in
          the project root with one of the following.
        </p>

        <div className="mt-6 flex flex-col gap-5">
          <section>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Database className="size-5 text-brand-700" aria-hidden="true" />
              Option A — connect to Supabase
            </h2>
            <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-900 px-4 py-3 font-mono text-sm text-slate-100">
{`VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-anon-key
VITE_DEMO_MODE=false`}
            </pre>
            <p className="mt-2 text-sm text-slate-600">
              Then run the six migrations in <code>supabase/migrations/</code> in order, followed
              by <code>supabase/seed.sql</code>. See the README for the full walkthrough.
            </p>
          </section>

          <section>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <FlaskConical className="size-5 text-purple-700" aria-hidden="true" />
              Option B — run offline in demo mode
            </h2>
            <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-900 px-4 py-3 font-mono text-sm text-slate-100">
{`VITE_DEMO_MODE=true`}
            </pre>
            <p className="mt-2 text-sm text-slate-600">
              Runs the whole system against an in-browser mock — no database, no internet, no
              credentials. All three interfaces work. Data lives only in this browser.
            </p>
          </section>
        </div>

        <p className="mt-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Restart the dev server after creating <code>.env</code> — Vite reads environment variables
          at startup.
        </p>
      </div>
    </div>
  )
}
