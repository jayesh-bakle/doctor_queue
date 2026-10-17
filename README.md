# रुग्ण रांग व्यवस्थापन प्रणाली

**Doctor Queue System** — a web-based patient token and queue management system for a small
hospital or clinic in Maharashtra.

Patients scan a QR code at reception, register from their own phone browser in Marathi, and get a
token number they can check at any time. Reception calls the next patient with one click. A TV in
the waiting area shows the current token, large enough to read from across the room.

Nothing is installed on the patient's phone. There is no app to download.

---

## 1. Project overview

Today the clinic runs its OPD queue on a paper register. A patient writes their name, is handed a
number, has to remember it, and repeatedly asks reception when their turn is coming. Reception has
no reliable view of who is waiting.

This system replaces that register with three connected screens over one dataset:

| Interface | Device | Login | Language |
|---|---|---|---|
| **Patient** | Their own phone, via QR code | None | Marathi |
| **Reception / staff** | Counter computer or tablet | Yes | Marathi |
| **TV display** | Monitor or TV in the waiting area | None | Marathi |

**Scope: queue management only.** This is deliberately *not* an EMR. The database has nowhere to
record a diagnosis, a prescription, a test result or a medical history — and that is a design
decision, not an oversight. The only personal data stored is the patient's name and an optional
mobile number, both of which exist solely so reception can tell two patients with similar tokens
apart.

**The problem it solves:** a patient registers in under a minute without installing anything, and
after that never needs to ask reception how long is left. Reception calls the next patient with one
click. Every screen — the TV and every waiting patient's phone — updates within a second, with no
refresh and no announcement over a noisy room.

**Token numbering is safe.** Numbers are allocated by Postgres, inside a transaction-scoped advisory
lock, backed by a unique constraint. Two patients registering in the same instant cannot receive the
same number, and the client never computes a token itself.

---

## 2. Features

### Patient (no login, Marathi)

- **Scan a QR code and register** — four questions: name, mobile (optional), doctor, and whether
  this is a first visit or a follow-up. Nothing clinical is ever asked for.
- **Get a token in Marathi numerals** — `००१`, `०२७`, `१००`.
- **A private status page** at `/token/<public-id>`, updatable, bookmarkable, refreshable. It shows
  the token, the doctor, the room, how many patients are genuinely still ahead, a plain-language
  sentence describing the situation, and a rough wait estimate.
- **Live updates** over Supabase Realtime, with a 30-second polling safety net so a dropped socket
  never leaves a patient staring at a stale number.
- **Spoken announcements** in Marathi via the Web Speech API, with a toggle ("आवाज सुरू" /
  "आवाज बंद"). The app works completely when speech is unavailable or muted.
- **Designed for a phone**: large touch targets, one-handed use, sensible keyboard hints, and
  screen-reader labels throughout.

### Reception / staff (authenticated, Marathi)

- **The whole queue at a glance**, colour-coded by status — never by colour alone.
- **One-click "पुढील रुग्ण बोलवा"** to call the next patient; the previous consultation is closed
  out automatically.
- **Recall** a patient who did not hear the call, **start a consultation**, **skip** someone who
  stepped out, or **complete** a visit.
- **Add, edit and deactivate doctors**, each with a department and a room number.
- **Hospital settings**: name, address, phone, timezone, announcement on/off, the message shown on
  the TV, and the average consultation time used for wait estimates.
- **A live connection indicator** that says "जोडलेले आहे" or "कनेक्शन खंडित" — and never claims a
  connection it does not have.
- **The QR poster and TV links**, ready to print or copy.

### TV display (public, no login)

- The current token, next token, waiting count, doctor name, room number, date and clock.
- **Never** a patient name, phone number, age or medical condition. Only the token, the doctor, the
  room and the queue state — this is enforced by the data layer, not by remembering to check.
- Built for a screen across a room: very large numerals, tabular figures that do not jitter, and a
  brief flash when the number changes.
- Read-only. It cannot change anything.

### Also included

- **Demo mode** — the entire system, all three interfaces, running against an in-browser mock with
  no database, no internet and no credentials. For showing the doctor before anything is set up.
- **A printed QR poster** at A4, generated in the app.
- **Seed data** for two doctors at a sample hospital.

---

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| UI | React 19 + TypeScript 5.7 | Components, and a compiler that catches mistakes before a patient does |
| Build | Vite 6 | Fast dev server; a small, static production bundle |
| Styling | Tailwind CSS v4 | Consistent spacing and sizing across two very different screens (a phone and a TV) |
| Icons | Lucide React | Small, consistent, tree-shakeable |
| Routing | React Router 7 | The nine routes in the spec, plus deep-linkable token URLs |
| Backend | Supabase (Postgres, Auth, Realtime) | Managed Postgres with row level security, and Realtime for free |
| Token allocation | PostgreSQL `pg_advisory_xact_lock` | The only place that can genuinely serialise two simultaneous registrations |
| Voice | Web Speech API (`mr-IN`) | Free, built into the browser, no paid service |
| QR | `qrcode` (npm) | Generates a print-resolution PNG in the browser |
| Hosting | Vercel | Static hosting with an SPA rewrite |
| Tests | Vitest | Unit tests over the queue logic; SQL tests over the concurrency guarantee |

**No paid third-party service is required, and none is used.** No Firebase, no SMS gateway, no
WhatsApp Business API, no Twilio, no push notification service, no AI service, no external
queue-management API.

---

## 4. Folder structure

```
Doctor-queue-system/
├── index.html                     Marathi lang attribute, Devanagari font preconnect
├── package.json
├── vite.config.ts                 React + Tailwind plugins, Vitest config
├── vercel.json                    SPA rewrite + security headers
├── .env.example                   Copy to .env — see section 8
├── .gitignore                     Includes .env
│
├── public/
│   └── assets/favicon.svg
│
├── supabase/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql Tables, enums, indexes, the unique token constraint
│   │   ├── 002_rls.sql            Row level security, the queue snapshot function
│   │   ├── 003_queue_functions.sql RPCs, the advisory lock, the queue_events trigger
│   │   └── 004_fix_doctor_delete.sql Guards the trigger during a doctor cascade delete
│   └── seed.sql                   Sample hospital and two doctors
│
├── src/
│   ├── main.tsx                   React root
│   ├── App.tsx                    Routes + error boundary
│   ├── index.css                  Tailwind theme, focus ring, print stylesheet
│   │
│   ├── types/
│   │   ├── database.ts            Shapes of the Postgres rows
│   │   └── queue.ts               View models used by the UI
│   │
│   ├── lib/
│   │   ├── marathiDigits.ts       toMarathiDigits, formatToken, count labels
│   │   ├── queue.ts               Pure queue rules — the current token, who is ahead
│   │   ├── validation.ts          Registration rules, mobile normalisation
│   │   ├── errors.ts              Error codes mapped to Marathi sentences
│   │   ├── speech.ts              Marathi speech synthesis, with a fallback chain
│   │   ├── utils.ts               Dates in the hospital timezone, class names
│   │   ├── env.ts                 Environment variables, read once
│   │   ├── supabase.ts            The Supabase client
│   │   └── datasource/
│   │       ├── types.ts           The QueueDataSource contract
│   │       ├── supabaseDataSource.ts  Real backend
│   │       ├── demoDataSource.ts      In-browser mock
│   │       └── index.ts           Picks one based on VITE_DEMO_MODE
│   │
│   ├── hooks/                     useQueue, useRealtimeQueue, useTokenStatus,
│   │                              usePublicQueue, useDoctors, useHospital,
│   │                              useStaffAuth, useOnlineStatus
│   │
│   ├── layouts/                   PatientLayout, StaffLayout, DisplayLayout
│   │
│   ├── components/
│   │   ├── common/                Button, Card, Feedback, TokenDisplay, StatusBadge,
│   │   │                          ConnectionIndicator, AnnouncementToggle,
│   │   │                          DemoBanner, ErrorBoundary
│   │   ├── patient/               RegistrationForm, TokenDetailsCard, SituationCard
│   │   └── staff/                 QueueTable, DoctorForm
│   │
│   └── pages/                     HomePage, RegisterPage, TokenStatusPage,
│                                  StaffLoginPage, StaffDashboardPage, DoctorsPage,
│                                  SettingsPage, DisplayPage, QRPage,
│                                  NotFoundPage, SetupNotice
│
└── tests/
    ├── marathiDigits.test.ts      Numeral conversion and token formatting
    ├── queue.test.ts              Current token, patients ahead, skipped patients
    ├── validation.test.ts         Registration rules
    ├── errors.test.ts             Marathi messages, no leaked database errors
    ├── demoQueue.test.ts          End-to-end against the demo backend
    ├── helpers/browserEnv.ts      Browser globals for the demo tests
    └── sql/queue.test.ts          Real concurrency against Postgres (skips without a DB URL)
```

---

## 5. Local setup

**Requirements:** Node.js 20 or newer, and npm. Nothing else — no database is needed to run the
app in demo mode.

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
cp .env.example .env      # Windows: copy .env.example .env

# 3. Run it
npm run dev
```

To see the whole system immediately, with no backend at all:

```bash
# In .env
VITE_DEMO_MODE=true
```

Then open <http://localhost:5173>. See section 9 for the full walkthrough.

### Available scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Type-check and build for production into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run all tests |
| `npm run test:watch` | Re-run tests on change |
| `npm run test:sql` | Run only the Postgres concurrency tests (needs `SUPABASE_DB_URL`) |
| `npm run typecheck` | Type-check without building |

---

## 6. Supabase setup

1. Create an account at <https://supabase.com> and **New project**.
2. Pick a region close to the clinic. For Maharashtra, **Mumbai (ap-south-1)** gives the lowest
   latency — this matters, because a patient at the counter is waiting for the response.
3. Set a database password and store it somewhere safe. You will not need it for the app itself.
4. Wait for the project to finish provisioning (about two minutes).
5. Go to **Project Settings → API** and copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **`anon` / public** key → `VITE_SUPABASE_ANON_KEY`

> **Do not copy the `service_role` key.** It bypasses row level security entirely. If it ever
> reached the browser bundle, any patient could read every other patient's record. The
> `service_role` key belongs nowhere in this project.

6. Go to **Authentication → Providers → Email** and turn **off** "Enable email signups". Staff
   accounts are created by an administrator (section 13); nobody should be able to sign themselves
   up to the staff dashboard.

---

## 7. Database migration

Four migration files, run **in order**. Together they are idempotent, so re-running them is safe
and nothing is ever dropped.

| File | What it creates |
|---|---|
| `001_initial_schema.sql` | The `hospitals`, `doctors`, `queue_entries`, `staff_users` and `queue_events` tables, the `patient_type` and `queue_status` enums, indexes, and the `unique (doctor_id, queue_date, token_number)` constraint |
| `002_rls.sql` | Row level security on every table, the helper functions that avoid policy recursion, and the realtime publication |
| `003_queue_functions.sql` | `register_patient()`, `get_token_status()`, `get_public_queue()`, `call_next_patient()`, the status transitions, the `queue_events` trigger, and the execution grants |
| `004_fix_doctor_delete.sql` | Guards the `queue_events` trigger so deleting a doctor who has queue history no longer fails with a foreign-key error during the cascade |

### Running them

**Option A — the Supabase SQL editor (easiest)**

1. Open your project → **SQL Editor** → **New query**.
2. Paste the entire contents of `001_initial_schema.sql`. Click **Run**.
3. Repeat for `002_rls.sql`, `003_queue_functions.sql`, then `004_fix_doctor_delete.sql`.
4. Finally, paste and run `supabase/seed.sql` to create the sample hospital and two doctors.

**Option B — the Supabase CLI**

```bash
npm install -g supabase
supabase link --project-ref <your-project-ref>
supabase db push
```

### Verifying the migration

Run this in the SQL editor. It should return five tables and no `false` in the last column:

```sql
select tablename, rowsecurity
  from pg_tables
 where schemaname = 'public'
 order by tablename;
```

Then confirm the security boundary is in place — **both** of these must return `false`:

```sql
select has_table_privilege('anon', 'queue_entries', 'SELECT');
select has_table_privilege('anon', 'staff_users',    'SELECT');
```

If either returns `true`, stop and re-run `002_rls.sql`. Until they are `false`, the `anon` key
that ships in the browser bundle can read patient records directly.

### What the schema deliberately does not contain

There is no table for diagnoses, prescriptions, test results, allergies, appointments, invoices or
insurance. `queue_entries` holds a name, an optional mobile, a token number, a status and two
timestamps. `queue_events` — the table the TV reads — has **no name or mobile column at all**, so
no query and no future feature can leak a patient's name onto the waiting-room screen through it.

---

## 8. Environment variables

All variables are read once, at startup, in `src/lib/env.ts`.

| Variable | Required | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes, unless demo mode | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes, unless demo mode | The **publishable/anon** key. Safe in the browser *because* RLS is on |
| `VITE_DEMO_MODE` | No | `true` runs everything against an in-browser mock. Leave `false` in production |
| `SUPABASE_DB_URL` | No | **Server-side only**, for `npm run test:sql`. Never prefix with `VITE_` |

Notes:

- Only variables prefixed `VITE_` reach the browser. Anything without that prefix is not bundled —
  which is exactly why the database password must never be given one.
- `VITE_SUPABASE_ANON_KEY` is public by design. It is not a secret, and it is not what protects the
  data — **row level security is**. Never treat the anon key as confidential and never weaken RLS
  on the assumption that it is.
- `.env` is in `.gitignore`. Do not commit it. `.env.example` is the template, and it is committed.
- If neither Supabase credentials nor demo mode are configured, the app shows a setup screen with
  these instructions rather than a network error.

---

## 9. Running locally

### Demo mode — no backend required

Set `VITE_DEMO_MODE=true` in `.env` and run `npm run dev`. Everything works: registration, tokens,
the reception dashboard, the TV display, realtime, speech, the QR poster. Data lives in this
browser's `localStorage` and is shared across tabs, so you can have the TV open in one window and
reception in another and watch them update each other.

The demo login is shown on the login screen:

```
ईमेल:    reception@demo.in
पासवर्ड:  demo1234
```

Demo mode shows a "डेमो" banner and seed/reset controls, so it can never be mistaken for the real
system. Opening two tabs and registering simultaneously produces `००१` and `००२` — the demo takes a
real cross-tab lock, so it behaves the way the real system does rather than merely looking like it.

### Against Supabase

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, leave `VITE_DEMO_MODE=false`, and run
`npm run dev`. The four migrations and `seed.sql` must already have been run.

### Walking through it

1. Open <http://localhost:5173>. The home page offers registration and the QR poster.
2. Go to `/register`, fill in a name, pick a doctor, and submit. You land on your own token page
   showing `००१`.
3. Register again — `००२`. Change the doctor and register — that doctor's queue also starts at
   `००१`.
4. Open `/display/<doctorId>` in a **second window** (the QR page lists the URLs). Sign in to
   reception at `/staff/login` in a third.
5. Click **पुढील रुग्ण बोलवा**. The TV updates without a refresh, and the patient's page changes to
   "आता आपला क्रमांक आहे."
6. Skip a patient and watch the remaining patients' "आपल्यापुढे" counts correct themselves.
7. Narrow the window to a phone width and check `/register` — one column, large targets.
8. Confirm that no patient name ever appears on `/display`.
9. Turn the speech toggle off and confirm everything still works.

### Running the tests

```bash
npm test
```

The Postgres concurrency tests **skip themselves** with a printed notice unless `SUPABASE_DB_URL`
is set. To run them for real:

```bash
SUPABASE_DB_URL="postgresql://postgres:…@db.<ref>.supabase.co:5432/postgres" npm run test:sql
```

These fire 25 simultaneous registrations down separate pooled connections and assert that exactly
the tokens 1–25 come back, with no duplicates. That is the one guarantee no JavaScript test can
make, so it is verified where it actually lives — in the database.

---

## 10. Deployment to Vercel

1. Push the project to GitHub, GitLab or Bitbucket.
2. In Vercel: **Add New → Project**, and import the repository.
3. Vercel detects Vite automatically. Confirm:
   - **Build command:** `npm run build`
   - **Output directory:** `dist`
4. Under **Environment Variables**, add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and
   `VITE_DEMO_MODE` (`false`). Add them to Production, Preview and Development.
   > Do **not** add `SUPABASE_DB_URL` here. Vercel environment variables are available at build
   > time, and a `VITE_`-prefixed mistake would put the database password in the browser bundle.
5. **Deploy.**
6. Copy the deployment URL (for example `https://queue.clinic.in`) and set it as the production
   domain. **This URL is baked into the QR code**, so set it before printing the poster — a poster
   printed against a preview URL will send patients to the wrong place.
7. In Supabase, go to **Authentication → URL Configuration** and set the **Site URL** to your
   Vercel domain, so password reset links point at the right host.

### Why `vercel.json` matters

`vercel.json` rewrites every path to `/index.html`. Without it, reloading `/token/<public-id>` or
opening a TV display URL directly returns a 404 from the static host, because those paths exist
only in the browser's router. It also sets `nosniff`, `X-Frame-Options`, a referrer policy, and a
permissions policy that switches off camera, microphone and geolocation — the app needs none of
them.

### After every deployment

Re-check that the patient-facing screens still work. The queue is a live system, and a broken
deploy at 10am on a Monday is a queue of people standing at a counter with nothing to look at.

---

## 11. Creating the QR code

1. Sign in at `/staff/login`, then open `/qr`.
2. Choose who the poster is for:
   - **सर्व डॉक्टर (सामान्य QR)** — one poster for the whole clinic. The patient picks the doctor.
   - A specific doctor — scans of that poster pre-select that doctor, which is what you want when
     each doctor has their own window.
3. Click **छापा** to print, or **PNG डाउनलोड** to save an image.
4. Print on A4, at 100% scale. A QR code scaled down to fit a smaller sheet can stop scanning.
5. Tape it to the reception counter at roughly eye level, where a patient arriving at the desk will
   see it. Add a second copy in the waiting area if the queue often reaches the door.

Testing it before you print: scan the poster with an actual phone camera, not a QR reader app, and
check that it opens the registration page on the deployed URL — not `localhost`.

The poster carries a fallback line — "मोबाईल नसल्यास रिसेप्शनवर नोंदणी करा" — because not every
patient arriving at the clinic has a smartphone. Reception can open `/register` on the counter
computer and register them there; the queue is identical either way.

---

## 12. Opening the TV display

Each doctor has their own display URL:

```
https://your-domain/display/<doctor-id>
```

The `/qr` page lists the URL for every doctor — copy it, or open it directly on the TV's browser.

**Setting it up**

1. Open the URL in the TV's browser (a smart TV, a TV stick, or a laptop on an HDMI cable).
2. Press **F11** (or the browser's fullscreen control) for fullscreen. The layout is built for a
   16:9 screen with no browser chrome.
3. Open `/staff/settings` and set the message shown under the token, if you want one.
4. Leave the tab open. It updates itself; nothing needs refreshing.

**Operating notes**

- The display is **read-only** and requires **no login**. Anyone who can see the screen can see the
  token — which is the point.
- It shows **only** the token, the doctor's name, the room number, the waiting count, the date and
  the clock. No patient name, no phone number, no age, no reason for the visit. This is enforced in
  the database: the table the display reads has no column that could hold a name.
- A screen that sleeps mid-queue is a screen nobody trusts. Set the TV or laptop to never sleep
  while it is on duty, and disable any screensaver.
- The clock is rendered in the **hospital's** timezone from `/staff/settings`, not the TV's, so a
  TV with a wrong timezone still shows the right time.
- The TV and every patient's phone subscribe to the same live feed, so a change reaches all of them
  within about a second.

---

## 13. Creating staff users

Staff accounts live in **Supabase Auth**, never in the application's database. There is no password
column anywhere in this schema, and no password is ever stored by the app. Creating a staff account
is two steps, because Postgres cannot create Supabase Auth users.

**Step 1 — create the login**

1. Supabase Dashboard → **Authentication → Users → Add user → Create new user**.
2. Enter the staff member's email and a strong password.
3. Tick **Auto Confirm User** (otherwise they must confirm by email before they can sign in).
4. Copy the new user's **UUID**.

**Step 2 — attach them to the hospital**

Run this in the SQL editor, pasting the UUID from step 1:

```sql
insert into staff_users (id, hospital_id, full_name, role)
values (
  '<paste-auth-user-uuid-here>',
  '11111111-1111-1111-1111-111111111111',   -- your hospital id
  'रिसेप्शन',
  'RECEPTION'                                -- or 'ADMIN'
);
```

Replace the hospital id with your own if you did not load `seed.sql` — find it with
`select id, name from hospitals;`.

Since the row's primary key references `auth.users`, deleting the auth user removes the staff
mapping automatically.

**If sign-in succeeds but the dashboard is empty**, Step 2 was skipped. The account is valid but
attached to no hospital, so row level security correctly shows it nothing. The login screen says so
in Marathi: "आपले खाते रुग्णालयाशी जोडलेले नाही."

**Removing a staff member:** delete the user in **Authentication → Users**. The `staff_users` row
goes with it, and every request they had in flight stops working.

---

## 14. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| A setup screen instead of the app | No `VITE_SUPABASE_URL`/`ANON_KEY` and `VITE_DEMO_MODE` is not `true` | Create `.env` (section 8) and **restart the dev server** — Vite reads env vars at startup only |
| Sign-in works, dashboard is empty | The auth user has no `staff_users` row | Section 13, Step 2 |
| "ईमेल किंवा पासवर्ड चुकीचा आहे." | Wrong password, or the user was never auto-confirmed | Check the password; re-create the user with **Auto Confirm User** ticked |
| QR code leads to `localhost` | The poster was generated from a dev server | Generate it on the deployed domain, after setting the production URL in Vercel |
| The TV never updates | The device dropped its websocket, or the display URL names the wrong doctor | Reload the tab; check the doctor id against `/qr`. Patient pages also poll every 30 seconds as a safety net |
| "सध्या रांग उपलब्ध नाही." on `/register` | No active doctors, or `seed.sql` was never run | Add a doctor at `/staff/doctors`, or run `supabase/seed.sql` |
| A patient's token page is blank | The `public_id` in the URL is wrong or was never issued | Ask reception for the link; token pages are not guessable by design |
| No Marathi voice | The device has no `mr-IN` voice installed | The app falls back to Hindi, then to any available voice, then to silence — everything else still works. On Android, add Marathi under Settings → Text-to-speech |
| "कनेक्शन खंडित" on the dashboard | The device has no internet | Check the connection. The indicator reports honestly and never claims a sync it does not have |
| The build fails with a TypeScript error | A genuine type error | Run `npm run typecheck` and read the first error — the build stops there |
| `npm run test:sql` reports skips | `SUPABASE_DB_URL` is not set | Expected. Set it to run the Postgres tests (section 9) |
| Duplicate tokens | Should be impossible | The unique constraint would refuse the insert. If you somehow see this, check that all four migrations ran, in order |

**When something is wrong in front of patients:** the paper register still works. Use it, and fix
the system afterwards. The queue matters more than the software.

---

## 15. Security considerations

**The data model is the first line of defence.** The schema cannot store a diagnosis, a
prescription or a test result, because there is no column for one. That is a deliberate limit: a
system that *cannot* hold clinical information cannot leak it.

**Row level security is on every table**, and patients' browsers have no direct access to
`queue_entries` at all — no `SELECT`, no `INSERT`, no `UPDATE`. Every patient-facing read and write
goes through a `security definer` function that returns only what that specific caller is entitled
to see:

| Function | Caller | Returns |
|---|---|---|
| `register_patient()` | patient | Their own token number and public id, nothing else |
| `get_token_status()` | patient | Their own entry, plus the queue position |
| `get_public_queue()` | anyone | Current token, next token, waiting count, doctor, room — no personal data |
| `call_next_patient()`, `skip_patient()`, `complete_patient()` | staff only | Advances the queue; re-checks authorization internally |

**Patients are identified by a random UUID**, not by a row id or a token number. A token number is
public — it is on the TV — so it must never be the key to anything. Knowing one patient's UUID
reveals that one patient's own status and nothing else.

**The TV cannot show a name.** It reads `queue_events`, a table with no name or mobile column, kept
up to date by a trigger. There is no query, no bug and no future feature that can put a patient's
name on the waiting-room screen through it.

**The anon key is public; RLS is the boundary.** The key ships in the JavaScript bundle and any
visitor can read it. That is safe because the policies, not the key, decide what it may reach.
Never weaken a policy on the assumption that the key is secret.

**The `service_role` key is never used.** It bypasses RLS completely. It appears nowhere in this
codebase and must never be added to a `VITE_`-prefixed variable. The database password
(`SUPABASE_DB_URL`) is used only by the optional SQL tests, server-side, read from the environment.

**Passwords are never stored by this application.** Authentication is Supabase Auth. There is no
password column anywhere in the schema, and no password is ever written to the application's
database.

**Errors are shown in Marathi, never raw.** A duplicate-key violation, a constraint name or a stack
trace tells a patient nothing useful and tells an attacker quite a lot. Users see a Marathi
sentence; the technical detail goes to the browser console for whoever is debugging.

**Mobile numbers are for reception only.** They are never displayed on the TV, never included in
`get_public_queue()`, and visible only to signed-in staff of that hospital. Supplying one is
optional.

**Duplicate submissions are blocked** in two places — the button is disabled while a request is in
flight, and the submission handler itself refuses to run twice — because some mobile browsers fire
a second submit on a double-tap before the disabled state paints.

**Transport is HTTPS end to end.** Vercel serves TLS; Supabase requires it. There is no plaintext
path to the database.

**What an attacker with the anon key can do:** register a token, read a token's status if they
already know its random UUID, and read the public queue — which is, by design, on a screen in the
waiting room. Nothing else.

---

## Scope

**Built (MVP):** queue and token management, patient self-registration by QR, live token status,
staff dashboard, doctor management, hospital settings, TV display, Marathi UI and numerals, Marathi
speech with a toggle, QR poster generation, staff authentication, realtime updates, demo mode,
tests.

**Not built, deliberately:** payments, billing, pharmacy, laboratory, EMR, appointment calendars,
insurance, patient accounts, SMS, WhatsApp, push notifications, an AI chatbot, analytics
dashboards, multi-branch support.

The schema leaves room for some of these later — the hospital is a table, not a constant, and
`queue_entries` already carries a `queue_date`, so appointments or a second branch would be a data
change rather than a rewrite. None of it is implemented now.
