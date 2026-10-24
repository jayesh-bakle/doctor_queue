-- =============================================================================
-- 010_big_hospital_hardening.sql
-- Doctor Queue System — changes for a 1,000–2,000 patient/day hospital
--
-- Run AFTER 009_hospital_changes.sql. Safe to re-run.
--
-- What this migration changes:
--
--   1. Raises the per-doctor daily ceiling from 500 to 2,000. A big hospital
--      can legitimately register more than 500 patients for one doctor in a
--      day; 500 was sized for a small clinic.
--
--   2. Adds `get_unexported_entries()`, an anti-join that returns only the
--      terminal queue rows that have not yet been copied to a hospital's
--      Sheet. The old export function downloaded every export mark and every
--      terminal row before filtering in JavaScript. At 2,000 patients/day that
--      is hundreds of thousands of rows per run; this does the filtering in
--      Postgres and returns at most the requested batch.
--
--   3. Adds a partial index for that anti-join.
--
-- The function returns patient names and mobile numbers, so it is executable
-- only by the service role used by the Edge Function. It is never exposed to
-- anon or authenticated clients.
-- =============================================================================

-- =============================================================================
-- 1. Raise the daily ceiling
-- =============================================================================
alter table hospitals
  alter column max_daily_tokens set default 2000;

-- Move hospitals that still have the old default. A hospital that deliberately
-- chose 500 can set it back; a big hospital should not silently stop at 500.
update hospitals
   set max_daily_tokens = 2000
 where max_daily_tokens = 500;


-- =============================================================================
-- 2. Index for the pending-export scan
-- =============================================================================
create index if not exists queue_entries_export_pending_idx
  on queue_entries (hospital_id, queue_date, token_number)
  where status in ('COMPLETED', 'SKIPPED');


-- =============================================================================
-- 3. get_unexported_entries — one bounded anti-join per export run
-- =============================================================================
create or replace function get_unexported_entries(
  p_hospital_id uuid,
  p_limit       integer default 5000
)
returns table (
  id                   uuid,
  queue_date           date,
  token_number         integer,
  patient_name         text,
  mobile               text,
  patient_type         patient_type,
  status               queue_status,
  created_at           timestamptz,
  called_at            timestamptz,
  completed_at         timestamptz,
  doctor_id            uuid,
  doctor_name          text,
  department           text,
  room_number          text,
  doctor_display_order integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    qe.id,
    qe.queue_date,
    qe.token_number,
    qe.patient_name,
    qe.mobile,
    qe.patient_type,
    qe.status,
    qe.created_at,
    qe.called_at,
    qe.completed_at,
    qe.doctor_id,
    d.name,
    d.department,
    d.room_number,
    d.display_order
  from queue_entries qe
    join doctors d
      on d.id = qe.doctor_id
     and d.hospital_id = qe.hospital_id
  where qe.hospital_id = p_hospital_id
    and qe.status in ('COMPLETED', 'SKIPPED')
    and not exists (
      select 1
        from hospital_export_marks m
       where m.entry_id = qe.id
         and m.hospital_id = p_hospital_id
    )
  order by qe.queue_date, d.display_order, d.name, qe.token_number, qe.id
  limit least(greatest(coalesce(p_limit, 5000), 1), 5000);
$$;

revoke all on function get_unexported_entries(uuid, integer)
  from public, anon, authenticated;
grant execute on function get_unexported_entries(uuid, integer) to service_role;
