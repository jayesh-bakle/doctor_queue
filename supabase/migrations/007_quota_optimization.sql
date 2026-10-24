-- =============================================================================
-- 007_quota_optimization.sql
-- Doctor Queue System — free-tier quota optimization
--
-- Run AFTER 006_multi_hospital_support.sql. Safe to re-run.
--
-- What this migration adds, and why:
--
--   1. A tiny `get_token_pulse()` RPC. Patient phones poll it every 15–45
--      seconds instead of holding a Realtime websocket. At 50–60 waiting
--      patients a websocket fan-out exceeds the free Realtime message quota,
--      so this is the single biggest quota change in the project.
--
--   2. `queue_entries.updated_at`, so the staff dashboard can fetch only the
--      rows that changed instead of re-reading the whole day's queue on every
--      event.
--
--   3. Statement-level realtime triggers. A single action (for example
--      call_next_patient) now emits one event per doctor/day rather than one
--      per updated row.
--
--   4. `get_public_hospital_queue()` for the shared waiting-room TV: one row
--      per active doctor, still containing no patient data.
--
--   5. Retention: `prune_queue_history()` removes old queue_events and entries
--      that have been exported, keeping the database inside the free 500 MB.
--
--   6. Per-hospital Sheet bookkeeping (`hospital_sheet_exports` and
--      `hospital_export_marks`) because each clinic now has its own Sheet.
-- =============================================================================


-- =============================================================================
-- 1. queue_entries.updated_at — the delta cursor for the staff dashboard
-- =============================================================================
alter table queue_entries
  add column if not exists updated_at timestamptz not null default now();

create or replace function set_queue_entry_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists queue_entries_set_updated_at on queue_entries;
create trigger queue_entries_set_updated_at
  before update on queue_entries
  for each row execute function set_queue_entry_updated_at();


-- =============================================================================
-- 2. Indexes for the hot paths and for pruning
-- =============================================================================
-- The dashboard only ever reads active rows; a partial index keeps the scan
-- small no matter how many completed rows the day has accumulated.
create index if not exists queue_entries_active_idx
  on queue_entries (doctor_id, queue_date, token_number)
  where status in ('WAITING', 'CALLED', 'IN_CONSULTATION');

-- Retention and the Sheet export both filter by hospital and date.
create index if not exists queue_entries_hospital_date_idx
  on queue_entries (hospital_id, queue_date);

-- The shared TV subscribes by hospital, not by doctor.
create index if not exists queue_events_hospital_idx
  on queue_events (hospital_id, id desc);

-- The nightly prune deletes by age.
create index if not exists queue_events_created_at_idx
  on queue_events (created_at);


-- =============================================================================
-- 3. compute_queue_snapshot — one index scan instead of three subqueries
-- =============================================================================
-- Called on every pulse, every TV read and every realtime event, so this runs
-- far more often than any other query in the system.
create or replace function compute_queue_snapshot(p_doctor_id uuid, p_queue_date date)
returns table (current_token integer, next_token integer, waiting_count integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    (min(token_number) filter (where status in ('CALLED', 'IN_CONSULTATION')))::integer,
    (min(token_number) filter (where status = 'WAITING'))::integer,
    (count(*)       filter (where status = 'WAITING'))::integer
  from queue_entries
  where doctor_id = p_doctor_id
    and queue_date = p_queue_date;
$$;


-- =============================================================================
-- 4. get_token_pulse — the tiny payload a patient's phone polls
-- =============================================================================
-- Returns only the fields that change. The page loads the full record once
-- through get_token_status(), then merges these fields on each poll. It still
-- returns only the row for the unguessable public_id that was supplied.
create or replace function get_token_pulse(p_public_id uuid)
returns table (
  public_id     uuid,
  status        queue_status,
  token_number  integer,
  current_token integer,
  next_token    integer,
  patients_ahead integer,
  waiting_count integer,
  updated_at    timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    qe.public_id,
    qe.status,
    qe.token_number,
    snap.current_token,
    snap.next_token,
    (
      select count(*)::integer
        from queue_entries q2
       where q2.doctor_id = qe.doctor_id
         and q2.queue_date = qe.queue_date
         and q2.status = 'WAITING'
         and q2.token_number < qe.token_number
    ),
    snap.waiting_count,
    qe.updated_at
  from queue_entries qe
    cross join lateral compute_queue_snapshot(qe.doctor_id, qe.queue_date) snap
  where qe.public_id = p_public_id;
$$;

revoke all on function get_token_pulse(uuid) from public;
grant execute on function get_token_pulse(uuid) to anon, authenticated;


-- =============================================================================
-- 5. get_public_hospital_queue — one shared TV per hospital
-- =============================================================================
-- One row per active doctor. A LEFT JOIN keeps the hospital visible even when
-- it has no active doctors yet. Contains no patient name, mobile, age or
-- clinical detail — by construction, because it selects no such columns.
create or replace function get_public_hospital_queue(p_hospital_id uuid)
returns table (
  hospital_id              uuid,
  hospital_name            text,
  hospital_address         text,
  hospital_phone           text,
  hospital_timezone        text,
  display_message          text,
  announcement_enabled     boolean,
  avg_consultation_minutes integer,
  queue_date               date,
  doctor_id                uuid,
  doctor_name              text,
  department               text,
  room_number              text,
  display_order            integer,
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
    h.id,
    h.name,
    h.address,
    h.phone,
    h.timezone,
    h.display_message,
    h.announcement_enabled,
    h.avg_consultation_minutes,
    (now() at time zone h.timezone)::date,
    d.id,
    d.name,
    d.department,
    d.room_number,
    d.display_order,
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
  from hospitals h
    left join lateral (
      select dd.*
        from doctors dd
       where dd.hospital_id = h.id
         and dd.is_active
       order by dd.display_order, dd.name
    ) d on true
    cross join lateral compute_queue_snapshot(d.id, (now() at time zone h.timezone)::date) snap
  where h.id = p_hospital_id
  order by d.display_order nulls last, d.name;
$$;

revoke all on function get_public_hospital_queue(uuid) from public;
grant execute on function get_public_hospital_queue(uuid) to anon, authenticated;


-- =============================================================================
-- 6. Statement-level realtime triggers — one event per doctor/day per action
-- =============================================================================
-- The row-level trigger in 003/004 emitted one queue_events row per changed
-- entry. call_next_patient changes two entries in one transaction, so every
-- call cost two broadcasts. These transition-table triggers collapse a whole
-- statement into one event per doctor/day.
--
-- The JOIN on doctors preserves the 004 guard: during a cascade delete from
-- `doctors` the parent row is already gone, so no event is written and the
-- cascade can complete.
create or replace function emit_queue_events_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into queue_events (
    hospital_id, doctor_id, queue_date, event_type,
    current_token, next_token, waiting_count
  )
  select
    d.hospital_id, d.doctor_id, d.queue_date, 'INSERT',
    snap.current_token, snap.next_token, coalesce(snap.waiting_count, 0)
  from (select distinct hospital_id, doctor_id, queue_date from new_rows) d
    join doctors doc on doc.id = d.doctor_id
    cross join lateral compute_queue_snapshot(d.doctor_id, d.queue_date) snap;

  return null;
end;
$$;

create or replace function emit_queue_events_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into queue_events (
    hospital_id, doctor_id, queue_date, event_type,
    current_token, next_token, waiting_count
  )
  select
    d.hospital_id, d.doctor_id, d.queue_date, 'UPDATE',
    snap.current_token, snap.next_token, coalesce(snap.waiting_count, 0)
  from (select distinct hospital_id, doctor_id, queue_date from new_rows) d
    join doctors doc on doc.id = d.doctor_id
    cross join lateral compute_queue_snapshot(d.doctor_id, d.queue_date) snap;

  return null;
end;
$$;

create or replace function emit_queue_events_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into queue_events (
    hospital_id, doctor_id, queue_date, event_type,
    current_token, next_token, waiting_count
  )
  select
    d.hospital_id, d.doctor_id, d.queue_date, 'DELETE',
    snap.current_token, snap.next_token, coalesce(snap.waiting_count, 0)
  from (select distinct hospital_id, doctor_id, queue_date from old_rows) d
    join doctors doc on doc.id = d.doctor_id
    cross join lateral compute_queue_snapshot(d.doctor_id, d.queue_date) snap;

  return null;
end;
$$;

-- Remove the old row-level trigger and its function.
drop trigger if exists queue_entries_emit_event on queue_entries;
drop function if exists emit_queue_event();

drop trigger if exists queue_entries_emit_insert on queue_entries;
drop trigger if exists queue_entries_emit_update on queue_entries;
drop trigger if exists queue_entries_emit_delete on queue_entries;

create trigger queue_entries_emit_insert
  after insert on queue_entries
  referencing new table as new_rows
  for each statement execute function emit_queue_events_insert();

create trigger queue_entries_emit_update
  after update on queue_entries
  referencing new table as new_rows
  for each statement execute function emit_queue_events_update();

create trigger queue_entries_emit_delete
  after delete on queue_entries
  referencing old table as old_rows
  for each statement execute function emit_queue_events_delete();

revoke all on function emit_queue_events_insert() from public, anon, authenticated;
revoke all on function emit_queue_events_update() from public, anon, authenticated;
revoke all on function emit_queue_events_delete() from public, anon, authenticated;

-- We only subscribe to INSERT, so the full-row replica identity is unnecessary.
alter table queue_events replica identity default;


-- =============================================================================
-- 7. call_next_patient — one UPDATE so the statement trigger emits one event
-- =============================================================================
create or replace function call_next_patient(p_doctor_id uuid)
returns table (
  called_token      integer,
  called_public_id  uuid,
  out_doctor_id     uuid,
  doctor_name       text,
  department        text,
  room_number       text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doctor     doctors%rowtype;
  v_tz         text;
  v_date       date;
  v_next_id    uuid;
  v_next_pub   uuid;
  v_next_token integer;
begin
  select * into v_doctor from doctors d where d.id = p_doctor_id;
  if not found then
    raise exception 'DOCTOR_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not is_staff_of(v_doctor.hospital_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  select h.timezone into v_tz from hospitals h where h.id = v_doctor.hospital_id;
  v_date := (now() at time zone v_tz)::date;

  perform pg_advisory_xact_lock(hashtext('queue|' || p_doctor_id::text || '|' || v_date::text));

  select qe.id, qe.public_id, qe.token_number
    into v_next_id, v_next_pub, v_next_token
    from queue_entries qe
   where qe.doctor_id = p_doctor_id
     and qe.queue_date = v_date
     and qe.status = 'WAITING'
   order by qe.token_number
   limit 1;

  -- Close out whoever was being seen and call the next patient in a single
  -- statement. This keeps the realtime feed to one event for the whole action.
  update queue_entries qe
     set status = case
           when qe.status in ('CALLED', 'IN_CONSULTATION') then 'COMPLETED'
           when qe.id = v_next_id then 'CALLED'
           else qe.status
         end,
         completed_at = case
           when qe.status in ('CALLED', 'IN_CONSULTATION') then now()
           else qe.completed_at
         end,
         called_at = case
           when qe.id = v_next_id then now()
           else qe.called_at
         end
   where qe.doctor_id = p_doctor_id
     and qe.queue_date = v_date
     and (qe.status in ('CALLED', 'IN_CONSULTATION') or qe.id = v_next_id);

  if v_next_id is null then
    return;
  end if;

  return query
    select v_next_token, v_next_pub, v_doctor.id, v_doctor.name,
           v_doctor.department, v_doctor.room_number;
end;
$$;


-- =============================================================================
-- 8. Retention settings and per-hospital Sheet bookkeeping
-- =============================================================================
alter table hospitals
  add column if not exists retention_days integer not null default 90
  check (retention_days between 7 and 3650);

alter table hospitals
  add column if not exists max_daily_tokens integer not null default 2000
  check (max_daily_tokens between 1 and 5000);

create table if not exists hospital_sheet_exports (
  hospital_id    uuid primary key references hospitals (id) on delete cascade,
  spreadsheet_id text not null,
  tab            text not null default 'Queue',
  enabled        boolean not null default true,
  created_at     timestamptz not null default now()
);

alter table hospital_sheet_exports enable row level security;
revoke all on hospital_sheet_exports from anon, authenticated;

-- One row per (entry, hospital) that has been copied to that hospital's Sheet.
-- A single queue_entries.exported_at cannot express "exported to Clinic A but
-- not Clinic B" once each clinic has its own spreadsheet.
create table if not exists hospital_export_marks (
  entry_id    uuid not null references queue_entries (id) on delete cascade,
  hospital_id uuid not null references hospitals (id) on delete cascade,
  exported_at timestamptz not null default now(),
  primary key (entry_id, hospital_id)
);

create index if not exists hospital_export_marks_hospital_idx
  on hospital_export_marks (hospital_id, entry_id);

alter table hospital_export_marks enable row level security;
revoke all on hospital_export_marks from anon, authenticated;


-- =============================================================================
-- 9. prune_queue_history — keep the database inside the free 500 MB
-- =============================================================================
-- queue_events is a live feed only: subscribers refetch after a reconnect, so
-- two days is ample. Queue entries are kept for the hospital's retention_days
-- and only removed once every enabled Sheet export has marked them (or the
-- hospital has no Sheet configured), so a broken export cannot lose history.
create or replace function prune_queue_history()
returns table (events_deleted bigint, entries_deleted bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_events  bigint;
  v_entries bigint;
begin
  delete from queue_events
   where created_at < now() - interval '2 days';
  get diagnostics v_events = row_count;

  delete from queue_entries qe
   using hospitals h
   where qe.hospital_id = h.id
     and qe.queue_date < (now() at time zone h.timezone)::date - h.retention_days
     and qe.status in ('COMPLETED', 'SKIPPED')
     and not exists (
       select 1
         from hospital_sheet_exports e
        where e.hospital_id = qe.hospital_id
          and e.enabled
          and not exists (
            select 1
              from hospital_export_marks m
             where m.entry_id = qe.id
               and m.hospital_id = e.hospital_id
          )
     );
  get diagnostics v_entries = row_count;

  return query select v_events, v_entries;
end;
$$;

revoke all on function prune_queue_history() from public, anon, authenticated;

-- Schedule it once a day. If pg_cron is not enabled the migration still
-- succeeds; the function can be scheduled later from the Supabase dashboard.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'prune-queue-history') then
      perform cron.unschedule('prune-queue-history');
    end if;
    perform cron.schedule(
      'prune-queue-history',
      '5 0 * * *',
      'select public.prune_queue_history()'
    );
  end if;
exception
  when others then
    raise notice 'pg_cron not configured; schedule prune_queue_history() manually: %', sqlerrm;
end;
$$;
