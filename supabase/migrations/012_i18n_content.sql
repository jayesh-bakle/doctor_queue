-- =============================================================================
-- 012_i18n_content.sql
-- Doctor Queue System — per-language department names and TV messages
--
-- The interface has been multilingual since the first release, but two pieces of
-- content were not: a doctor's department and the message shown on the waiting-
-- room TV. Both were a single string, so a Marathi screen could still show
-- "General Medicine" and an English sentence.
--
-- `department` and `display_message` remain the canonical English originals.
-- The new JSONB maps carry optional translations keyed by `en`, `mr` and `gu`.
-- The application reads selected language -> `en` -> the original column, so a
-- half-filled translation never produces a blank label.
--
-- This migration drops and recreates the RPCs that expose those columns, because
-- Postgres cannot add an OUT column with `create or replace`. Grants are
-- re-issued afterwards. `register_patient()` is deliberately unchanged: its
-- department field is not rendered by the patient flow, and leaving it alone
-- avoids a second drop/recreate for no user-visible benefit.
--
-- Safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Columns and backfill
-- -----------------------------------------------------------------------------
alter table hospitals
  add column if not exists display_message_i18n jsonb not null default '{}'::jsonb;

alter table doctors
  add column if not exists department_i18n jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'hospitals_display_message_i18n_object'
  ) then
    alter table hospitals
      add constraint hospitals_display_message_i18n_object
      check (jsonb_typeof(display_message_i18n) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'doctors_department_i18n_object'
  ) then
    alter table doctors
      add constraint doctors_department_i18n_object
      check (jsonb_typeof(department_i18n) = 'object');
  end if;
end
$$;

update hospitals
   set display_message_i18n = jsonb_build_object('en', display_message)
 where display_message_i18n = '{}'::jsonb
   and btrim(display_message) <> '';

update doctors
   set department_i18n = jsonb_build_object('en', department)
 where department_i18n = '{}'::jsonb
   and btrim(department) <> '';

-- -----------------------------------------------------------------------------
-- 2. get_public_queue — the per-doctor TV payload
-- -----------------------------------------------------------------------------
drop function if exists get_public_queue(uuid);

create function get_public_queue(p_doctor_id uuid)
returns table (
  doctor_id                uuid,
  doctor_name              text,
  department               text,
  department_i18n          jsonb,
  room_number              text,
  is_active                boolean,
  hospital_name            text,
  hospital_address         text,
  hospital_phone           text,
  hospital_timezone        text,
  display_message          text,
  display_message_i18n     jsonb,
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
    d.department_i18n,
    d.room_number,
    d.is_active,
    h.name,
    h.address,
    h.phone,
    h.timezone,
    h.display_message,
    h.display_message_i18n,
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
-- 3. get_token_status — the patient's own record
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
  department_i18n           jsonb,
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
    d.department_i18n,
    d.room_number,
    h.name,
    h.phone,
    h.timezone,
    snap.current_token,
    snap.next_token,
    snap.waiting_count,
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
-- 4. get_public_hospital_queue — the shared waiting-room TV
-- -----------------------------------------------------------------------------
drop function if exists get_public_hospital_queue(uuid);

create function get_public_hospital_queue(p_hospital_id uuid)
returns table (
  hospital_id              uuid,
  hospital_name            text,
  hospital_address         text,
  hospital_phone           text,
  hospital_timezone        text,
  display_message          text,
  display_message_i18n     jsonb,
  announcement_enabled     boolean,
  avg_consultation_minutes integer,
  queue_date               date,
  doctor_id                uuid,
  doctor_name              text,
  department               text,
  department_i18n          jsonb,
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
    h.display_message_i18n,
    h.announcement_enabled,
    h.avg_consultation_minutes,
    (now() at time zone h.timezone)::date,
    d.id,
    d.name,
    d.department,
    d.department_i18n,
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

-- -----------------------------------------------------------------------------
-- 5. call_next_patient — staff announcements need the localized department
-- -----------------------------------------------------------------------------
drop function if exists call_next_patient(uuid);

create function call_next_patient(p_doctor_id uuid)
returns table (
  called_token      integer,
  called_public_id  uuid,
  out_doctor_id     uuid,
  doctor_name       text,
  department        text,
  department_i18n   jsonb,
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
           v_doctor.department, v_doctor.department_i18n, v_doctor.room_number;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Grants — dropped functions lose their privileges
-- -----------------------------------------------------------------------------
revoke all on function get_public_queue(uuid) from public;
revoke all on function get_token_status(uuid) from public;
revoke all on function get_public_hospital_queue(uuid) from public;
revoke all on function call_next_patient(uuid) from public;

grant execute on function get_public_queue(uuid) to anon, authenticated;
grant execute on function get_token_status(uuid) to anon, authenticated;
grant execute on function get_public_hospital_queue(uuid) to anon, authenticated;
grant execute on function call_next_patient(uuid) to authenticated;
