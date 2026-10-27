# Resetting the database and setting up hospitals

A complete runbook for wiping this application's database and rebuilding it with **one login
per hospital**, chosen by you. Written for the person administering the Supabase project.

> **This deletes all queue history, doctors, hospitals and staff mappings.**
> Take a backup first. If you only need multi-hospital support and want to keep existing data,
> do **not** follow this — just run `006_multi_hospital_support.sql`.

---

## 0. Before you start

- **Back up.** Supabase Dashboard → **Database → Backups**, or:
  ```
  pg_dump "$SUPABASE_DB_URL" -f backup.sql --schema=public
  ```
- **Stop usage.** Close the dashboard, the TV pages and `/qr`. A patient registering during the
  reset will see errors.
- What is *not* deleted: Supabase Auth users (they live in the `auth` schema), your API keys, and
  any data already copied out to Google Sheets.

---

## 1. Clear the existing structure

Supabase Dashboard → **SQL Editor** → New query → paste and run:

```sql
-- Removes every table, type, function, policy and trigger this app created.
-- Supabase Auth users are in the `auth` schema and are not touched.
drop schema if exists public cascade;
create schema public;

-- Restore the privileges Supabase grants to its API roles.
grant usage on schema public to anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
```

If the editor reports a dependency error, run `drop schema public cascade;` on its own first,
then the `create schema` and grants as a second query.

---

## 2. Rebuild the structure — all eleven migrations, in this order

For each file: open `supabase/migrations/<file>`, copy the **entire** file into the SQL Editor, and
run it. Wait for success before starting the next one.

1. `001_initial_schema.sql`
2. `002_rls.sql`
3. `003_queue_functions.sql`
4. `004_fix_doctor_delete.sql`
5. `005_sheet_export.sql`
6. `006_multi_hospital_support.sql`
7. `007_quota_optimization.sql`
8. `008_daily_token_cap.sql`
9. `009_hospital_changes.sql`
10. `010_big_hospital_hardening.sql`
11. `011_analytics.sql`

Order matters: 003, 006, 007 and 008 drop and recreate overlapping RPCs, so run them in this
order. 009 adds the doctor-change signal used by the TV and recreates `prune_queue_history()` to
prune that signal table too. 010 raises the default daily cap to 2,000 and adds the export anti-join
used by `daily-sheet-export`. 011 adds the analytics tables, platform admins, read RPCs and the
90-day backfill; it depends on 009 and 010. If `pg_cron` is installed, 011 also schedules the
refresh jobs (README section 18). Do not run the `revoke execute on register_patient` statement at
the bottom of 008 until the `register-patient` Edge Function is deployed (README section 8).

**Do not run `supabase/seed.sql` for a real deployment.** It inserts the sample
"श्री गणेश हॉस्पिटल" and two demo doctors; it is only for local demos.

If PostgREST briefly reports a missing table, run `notify pgrst, 'reload schema';`.

---

## 3. Create each hospital

Run one insert per clinic and **copy the `id` it prints**:

```sql
insert into hospitals (name, address, phone, timezone)
values (
  'आदर्श क्लिनिक',
  'मुख्य रस्ता, शिवाजी नगर, पुणे, महाराष्ट्र ४११००५',
  '+91 20 1234 5678',
  'Asia/Kolkata'
)
returning id, name;
```

Repeat for every hospital, keeping a list of `hospital id → clinic name`.

`timezone` decides when the daily token sequence resets. Use `Asia/Kolkata` unless the clinic
really is elsewhere.

---

## 4. Add each hospital's doctors

Use the id from step 3:

```sql
insert into doctors (hospital_id, name, department, room_number, display_order)
values
  ('<hospital-id>', 'डॉ. अमोल देशमुख', 'सामान्य वैद्यक', '१', 1),
  ('<hospital-id>', 'डॉ. स्वप्नील पाटील', 'कान-नाक-घसा', '२', 2);
```

Doctors can also be added or edited later in the app under **डॉक्टर**, already scoped to the
signed-in receptionist's clinic.

---

## 5. Create login credentials per hospital

Credentials live in Supabase Auth, never in this application's tables. For **each staff member**:

1. Dashboard → **Authentication → Users → Add user → Create new user**.
2. Enter the email and a password.
3. Tick **Auto Confirm User** — without it, sign-in fails as unconfirmed.
4. Save, then click the user and copy their **User UID** (a UUID).

Example set for two clinics:

| Clinic | Email | User UID |
| --- | --- | --- |
| आदर्श क्लिनिक | reception.adarsh@example.com | `<uid-1>` |
| आदर्श क्लिनिक | admin.adarsh@example.com | `<uid-2>` |
| साई क्लिनिक | reception.sai@example.com | `<uid-3>` |

You choose these credentials; the app never stores the passwords.

---

## 6. Link each credential to its hospital

Run one insert per staff member, using the Auth UID from step 5 and the hospital id from step 3.
`role` must be uppercase:

```sql
insert into staff_users (id, hospital_id, full_name, role)
values
  ('<uid-1>', '<adarsh-hospital-id>', 'रिसेप्शन', 'RECEPTION'),
  ('<uid-2>', '<adarsh-hospital-id>', 'व्यवस्थापक', 'ADMIN'),
  ('<uid-3>', '<sai-hospital-id>',    'रिसेप्शन', 'RECEPTION');
```

Only `'RECEPTION'` or `'ADMIN'` is accepted. A user with no `staff_users` row can authenticate
but is refused by the app — that is the intended safety behaviour.

### Platform owner (optional)

The platform owner can see every hospital at `/admin`. Create the login in **Authentication → Users**,
link it to any hospital with a normal `staff_users` row (the app still requires a staff row to sign
in), then add the same UID to `platform_admins`:

```sql
insert into platform_admins (user_id)
values ('<owner-auth-user-id>')
on conflict (user_id) do nothing;
```

A hospital `ADMIN` sees only `/staff/analytics` for its own hospital. A `RECEPTION` account sees
only today's summary on the dashboard.

---

## 7. Verify

```sql
select
  h.id,
  h.name,
  (select count(*) from doctors d     where d.hospital_id = h.id) as doctors,
  (select count(*) from staff_users s where s.hospital_id = h.id) as staff
from hospitals h
order by h.created_at;

select s.full_name, s.role, u.email, h.name as hospital
from staff_users s
join auth.users u on u.id = s.id
join hospitals h  on h.id = s.hospital_id
order by h.name, u.email;
```

Then check isolation in the app. The SQL editor runs as `postgres` and bypasses RLS, so only the
app can prove it:

1. Open `/staff/login/<adarsh-hospital-id>` and sign in as `reception.adarsh@example.com`.
   The header shows आदर्श क्लिनिक, and **डॉक्टर** lists only its doctors.
2. Open the same login URL and sign in with `reception.sai@example.com` → the Marathi
   "हे खाते या रुग्णालयाशी जोडलेले नाही" message appears and the user is signed out.
3. Open `/staff/login/<sai-hospital-id>` and sign in as the साई receptionist → only साई's data.

---

## 8. Configure and deploy the frontend

Your Supabase URL and publishable/anon key did not change, so no key rotation is needed. Confirm
the deployment environment has:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable / anon key>
VITE_DEMO_MODE=false
```

Never put the `service_role` key in the frontend or in these variables. Rebuild and redeploy
(`npm run build`, then your usual Cloudflare/Vercel deploy). Old `/staff/login` links keep
working because the generic route remains.

---

## 9. The addresses to give each hospital

After signing in at that clinic, open **QR कोड**; the page shows all three:

| Purpose | URL |
| --- | --- |
| Patient poster (print this) | `https://<site>/h/<hospital-id>` — encoded in the QR |
| Reception login | `https://<site>/staff/login/<hospital-id>` — copy button on the QR page |
| Shared TV display | `https://<site>/display/h/<hospital-id>` — copy button on the QR page; shows every active doctor |

Each clinic gets **one** poster and **one** staff login link. Print the poster from `/qr` while
signed in to that clinic, so it carries the correct name and address.

---

## 10. Optional final check

With the direct database connection string, the Postgres concurrency suite confirms token
allocation still works after the rebuild:

```
SUPABASE_DB_URL="postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres" npm run test:sql
```

It exercises the advisory lock and the per-doctor, per-day, per-hospital token sequence.
