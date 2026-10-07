-- =============================================================================
-- 002_rls.sql
-- Doctor Queue System — helper functions, row level security, grants, realtime
--
-- Run AFTER 001_initial_schema.sql, BEFORE 003_queue_functions.sql.
--
-- The security model in one paragraph:
--   anon  (a patient's phone, unauthenticated) has NO privileges at all on
--         queue_entries. Everything a patient does goes through SECURITY
--         DEFINER RPCs that return only what that specific caller should see.
--   anon  may read exactly one table directly: queue_events, which is designed
--         to be public and contains no personal data.
--   authenticated (staff) may read the full queue for their own hospital only.
--         All state changes still go through RPCs so the status machine can't
--         be bypassed.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper: which hospital does the logged-in staff member belong to?
--
-- SECURITY DEFINER so it can read staff_users without triggering the RLS policy
-- on staff_users, which would otherwise recurse infinitely.
-- -----------------------------------------------------------------------------
create or replace function current_staff_hospital()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.hospital_id from staff_users s where s.id = auth.uid();
$$;

create or replace function current_staff_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.role from staff_users s where s.id = auth.uid();
$$;

-- Used by staff-only RPCs to authorize the caller before touching data.
create or replace function is_staff_of(p_hospital_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from staff_users s
     where s.id = auth.uid()
       and s.hospital_id = p_hospital_id
  );
$$;

-- -----------------------------------------------------------------------------
-- Helper: the public (PII-free) view of a doctor's queue for a given day.
--
-- "Current token" and "next token" are DERIVED from entry statuses rather than
-- stored on the doctor row. One source of truth means the display can never
-- drift out of sync with the queue (spec §10).
-- -----------------------------------------------------------------------------
create or replace function compute_queue_snapshot(p_doctor_id uuid, p_queue_date date)
returns table (current_token integer, next_token integer, waiting_count integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    (
      select min(qe.token_number)
        from queue_entries qe
       where qe.doctor_id = p_doctor_id
         and qe.queue_date = p_queue_date
         and qe.status in ('CALLED', 'IN_CONSULTATION')
    )::integer,
    (
      select min(qe.token_number)
        from queue_entries qe
       where qe.doctor_id = p_doctor_id
         and qe.queue_date = p_queue_date
         and qe.status = 'WAITING'
    )::integer,
    (
      select count(*)::integer
        from queue_entries qe
       where qe.doctor_id = p_doctor_id
         and qe.queue_date = p_queue_date
         and qe.status = 'WAITING'
    );
$$;

-- -----------------------------------------------------------------------------
-- Enable RLS everywhere. Default-deny: with RLS on and no matching policy, a
-- query returns zero rows.
-- -----------------------------------------------------------------------------
alter table hospitals     enable row level security;
alter table doctors       enable row level security;
alter table queue_entries enable row level security;
alter table staff_users   enable row level security;
alter table queue_events  enable row level security;

-- -----------------------------------------------------------------------------
-- hospitals — public read. Name, address and phone are things the hospital
-- prints on its own signage; nothing here is personal.
-- -----------------------------------------------------------------------------
drop policy if exists hospitals_public_read on hospitals;
create policy hospitals_public_read
  on hospitals for select
  to anon, authenticated
  using (true);

-- -----------------------------------------------------------------------------
-- doctors — patients may see ACTIVE doctors only, because that is the list the
-- registration form offers. Inactive doctors stay hidden from the public but
-- remain visible to staff so their history is intact.
-- -----------------------------------------------------------------------------
drop policy if exists doctors_anon_read_active on doctors;
create policy doctors_anon_read_active
  on doctors for select
  to anon
  using (is_active = true);

drop policy if exists doctors_staff_read on doctors;
create policy doctors_staff_read
  on doctors for select
  to authenticated
  using (hospital_id = current_staff_hospital());

-- -----------------------------------------------------------------------------
-- queue_entries — staff of the owning hospital may read the queue.
--
-- There is deliberately NO policy for anon. Combined with the REVOKE below,
-- a patient's browser cannot list patients, read another patient's name, or
-- write anything directly. Note that no UPDATE policy exists for anyone: even
-- staff change status through RPCs, so the legal transitions are enforced in
-- one place.
-- -----------------------------------------------------------------------------
drop policy if exists queue_entries_staff_read on queue_entries;
create policy queue_entries_staff_read
  on queue_entries for select
  to authenticated
  using (hospital_id = current_staff_hospital());

-- -----------------------------------------------------------------------------
-- staff_users — a staff member can read their own row (to render their name in
-- the dashboard header). Not their colleagues'.
-- -----------------------------------------------------------------------------
drop policy if exists staff_users_self_read on staff_users;
create policy staff_users_self_read
  on staff_users for select
  to authenticated
  using (id = auth.uid());

-- -----------------------------------------------------------------------------
-- queue_events — the public, PII-free realtime feed.
--
-- This is the ONLY table anon reads directly. The TV page and every patient's
-- phone subscribe here; because the table has no name or mobile column, the
-- public display cannot leak personal data even if a future change asks it to.
-- -----------------------------------------------------------------------------
drop policy if exists queue_events_public_read on queue_events;
create policy queue_events_public_read
  on queue_events for select
  to anon, authenticated
  using (true);

-- =============================================================================
-- Grants
--
-- RLS filters rows; grants decide whether the role may touch the table at all.
-- Both are needed. The explicit REVOKEs matter because Supabase's default
-- privileges grant anon broad access to new tables in the public schema.
-- =============================================================================

-- anon: no direct access to personal data, ever.
revoke all on queue_entries from anon;
revoke all on staff_users   from anon;
revoke all on doctors       from anon;
revoke all on hospitals     from anon;

-- anon: read the public feed.
grant select on queue_events to anon;

-- anon: read the hospital name for the registration header, and the active
-- doctor list for the dropdown.
grant select on hospitals to anon;
grant select on doctors   to anon;

-- authenticated (staff): read their hospital's queue.
grant select on hospitals     to authenticated;
grant select on doctors       to authenticated;
grant select on queue_entries to authenticated;
grant select on queue_events  to authenticated;
grant select on staff_users   to authenticated;

-- Neither role may write tables directly — writes happen only inside the
-- SECURITY DEFINER functions defined in 003.
revoke insert, update, delete on queue_entries from anon, authenticated;
revoke insert, update, delete on queue_events  from anon, authenticated;
revoke insert, update, delete on doctors       from anon, authenticated;
revoke insert, update, delete on hospitals     from anon, authenticated;

-- Staff manage doctors and settings through the dashboard, so they do need
-- write access to those two configuration tables.
grant insert, update, delete on doctors   to authenticated;
grant insert, update on hospitals         to authenticated;

drop policy if exists doctors_staff_write on doctors;
create policy doctors_staff_write
  on doctors for all
  to authenticated
  using (hospital_id = current_staff_hospital())
  with check (hospital_id = current_staff_hospital());

drop policy if exists hospitals_staff_update on hospitals;
create policy hospitals_staff_update
  on hospitals for update
  to authenticated
  using (id = current_staff_hospital())
  with check (id = current_staff_hospital());

-- =============================================================================
-- Realtime
--
-- Only queue_events is published. Publishing queue_entries would stream patient
-- names to every subscriber whose RLS lets them see the row — and an anon
-- subscriber whose policy denies the row silently receives nothing at all,
-- which is a confusing failure mode. Broadcasting a table with no PII sidesteps
-- both problems.
-- =============================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table queue_events;
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end if;
end $$;

-- Full replica identity so realtime payloads carry the complete new row.
alter table queue_events replica identity full;
