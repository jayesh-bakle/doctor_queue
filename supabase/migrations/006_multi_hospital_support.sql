-- =============================================================================
-- 006_multi_hospital_support.sql
-- Doctor Queue System — several clinics on one deployment and one database
--
-- Two changes, both small:
--
-- 1. Staff may read only their own hospital's settings row. The old policy
--    applied to `anon, authenticated` with `using (true)`, which meant a
--    receptionist at Clinic A could read Clinic B's row. Patients still read
--    the row for the clinic whose QR they scanned, which is what `/h/:id`
--    needs, and a hospital's name, address and phone are printed on its own
--    signage anyway.
--
-- 2. `get_public_queue()` and `get_token_status()` now return the hospital's
--    timezone. Without it the TV and the patient's token page assumed IST, so
--    a clinic that configured another timezone saw dates formatted against the
--    wrong clock. Postgres cannot add an OUT column with `create or replace`,
--    so both functions are dropped and recreated — in this file, therefore in
--    one transaction (the Supabase SQL editor runs a script atomically), and
--    their grants are re-issued because a dropped function loses them.
--
-- Everything else was already tenant-correct: `register_patient()` derives the
-- hospital from the doctor and refuses an inactive one; `authorize_entry()`
-- refuses a staff member from another hospital; the RLS policies on `doctors`
-- and `queue_entries` filter by `current_staff_hospital()`.
--
-- Safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. hospitals — public read stays, staff read becomes tenant-scoped
-- -----------------------------------------------------------------------------
drop policy if exists hospitals_public_read on hospitals;
create policy hospitals_public_read
  on hospitals for select
  to anon
  using (true);

drop policy if exists hospitals_staff_read on hospitals;
create policy hospitals_staff_read
  on hospitals for select
  to authenticated
  using (id = current_staff_hospital());

-- -----------------------------------------------------------------------------
-- 2. get_public_queue — the TV payload, now carrying the hospital's timezone
-- -----------------------------------------------------------------------------
drop function if exists get_public_queue(uuid);

create function get_public_queue(p_doctor_id uuid)
returns table (
  doctor_id                uuid,
  doctor_name              text,
  department               text,
  room_number              text,
  is_active                boolean,
  hospital_name            text,
  hospital_address         text,
  hospital_phone           text,
  hospital_timezone        text,
  display_message          text,
  announcement_enabled     boolean,
  avg_consultation_minutes integer,
  queue_date               date,
  current_token            integer,
  next_token               integer,
  waiting_count            integer,
  total_today              integer,
  updated_at               timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    d.id,
    d.name,
    d.department,
    d.room_number,
    d.is_active,
    h.name,
    h.address,
    h.phone,
    h.timezone,
    h.display_message,
    h.announcement_enabled,
    h.avg_consultation_minutes,
    (now() at time zone h.timezone)::date,
    snap.current_token,
    snap.next_token,
    snap.waiting_count,
    (
      select count(*)::integer
        from queue_entries q
       where q.doctor_id = d.id
         and q.queue_date = (now() at time zone h.timezone)::date
    ),
    now()
  from doctors d
    join hospitals h on h.id = d.hospital_id
    cross join lateral compute_queue_snapshot(d.id, (now() at time zone h.timezone)::date) snap
  where d.id = p_doctor_id;
$$;

-- -----------------------------------------------------------------------------
-- 3. get_token_status — the patient's own record, now with the same timezone
-- -----------------------------------------------------------------------------
drop function if exists get_token_status(uuid);

create function get_token_status(p_public_id uuid)
returns table (
  public_id                 uuid,
  token_number              integer,
  status                    queue_status,
  patient_name              text,
  patient_type              patient_type,
  queue_date                date,
  created_at                timestamptz,
  called_at                 timestamptz,
  doctor_id                 uuid,
  doctor_name               text,
  department                text,
  room_number               text,
  hospital_name             text,
  hospital_phone            text,
  hospital_timezone         text,
  current_token             integer,
  next_token                integer,
  waiting_count             integer,
  patients_ahead            integer,
  avg_consultation_minutes  integer,
  announcement_enabled      boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    qe.public_id,
    qe.token_number,
    qe.status,
    qe.patient_name,
    qe.patient_type,
    qe.queue_date,
    qe.created_at,
    qe.called_at,
    d.id,
    d.name,
    d.department,
    d.room_number,
    h.name,
    h.phone,
    h.timezone,
    snap.current_token,
    snap.next_token,
    snap.waiting_count,
    -- Counted from actual rows, NOT by subtracting token numbers (spec §10).
    -- If token 25 was skipped, the patient holding 27 is told "1 patient
    -- ahead", not "2" — because 25 is no longer waiting for anything.
    (
      select count(*)::integer
        from queue_entries q2
       where q2.doctor_id = qe.doctor_id
         and q2.queue_date = qe.queue_date
         and q2.status = 'WAITING'
         and q2.token_number < qe.token_number
    ),
    h.avg_consultation_minutes,
    h.announcement_enabled
  from queue_entries qe
    join doctors d   on d.id = qe.doctor_id
    join hospitals h on h.id = qe.hospital_id
    cross join lateral compute_queue_snapshot(qe.doctor_id, qe.queue_date) snap
  where qe.public_id = p_public_id;
$$;

-- -----------------------------------------------------------------------------
-- Grants — a dropped function loses its privileges, so re-issue them.
-- These are the same grants 003 made: patients use both functions from an
-- unauthenticated phone, and nobody else may execute anything.
-- -----------------------------------------------------------------------------
revoke all on function get_public_queue(uuid) from public;
revoke all on function get_token_status(uuid) from public;

grant execute on function get_public_queue(uuid) to anon, authenticated;
grant execute on function get_token_status(uuid) to anon, authenticated;

-- No new indexes: 001 already created
--   doctors (hospital_id, is_active, display_order, name)
-- which serves both the hospital-scoped registration list and the dashboard.
