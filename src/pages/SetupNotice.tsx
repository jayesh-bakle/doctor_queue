import { Database, FlaskConical } from 'lucide-react'

import { getMessages, loadStoredLanguage } from '../lib/i18n'

/**
 * Shown when the app has neither Supabase credentials nor demo mode enabled.
 *
 * Failing here with instructions is far kinder than letting the first query
 * throw a network error that looks like a bug in the queue system.
 *
 * This renders before `LanguageProvider` exists, so it reads the stored
 * preference directly rather than through `useLanguage()`.
 */
export function SetupNotice() {
  const t = getMessages(loadStoredLanguage()).ui.setup

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-extrabold text-slate-900">{t.title}</h1>
        <p className="mt-2 text-base text-slate-600">{t.description}</p>

        <div className="mt-6 flex flex-col gap-5">
          <section>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Database className="size-5 text-brand-700" aria-hidden="true" />
              {t.optionA}
            </h2>
            <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-900 px-4 py-3 font-mono text-sm text-slate-100">
{`VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-anon-key
VITE_DEMO_MODE=false`}
            </pre>
            <p className="mt-2 text-sm text-slate-600">{t.migrationsHint(13)}</p>
          </section>

          <section>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <FlaskConical className="size-5 text-purple-700" aria-hidden="true" />
              {t.optionB}
            </h2>
            <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-900 px-4 py-3 font-mono text-sm text-slate-100">
{`VITE_DEMO_MODE=true`}
            </pre>
            <p className="mt-2 text-sm text-slate-600">{t.demoDescription}</p>
          </section>
        </div>

        <p className="mt-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t.restartHint}
        </p>
      </div>
    </div>
  )
}
