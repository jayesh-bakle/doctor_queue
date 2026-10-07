-- =============================================================================
-- 003_queue_functions.sql
-- Doctor Queue System — token allocation, queue RPCs, realtime trigger
--
-- Run AFTER 002_rls.sql.
--
-- Every function here is SECURITY DEFINER with a pinned search_path. That is
-- what lets anon (a patient's phone, with no privileges on queue_entries) call
-- a narrow, audited operation without ever being able to read the table.
--
-- Errors are raised with a stable machine-readable code as the message (e.g.
-- 'NAME_REQUIRED'). The React client maps those codes to Marathi strings, so a
-- raw Postgres error never reaches a patient (spec §21).
-- =============================================================================


-- =============================================================================
-- 1. Token allocation
-- =============================================================================
--
-- This is the requirement the whole design turns on (spec §7): two patients
-- submitting at the same instant must not receive the same token.
--
-- The mechanism is a transaction-scoped advisory lock keyed on (doctor, day),
-- taken BEFORE the max() read below. Two concurrent registrations for the same
-- doctor:
--
--   T1: pg_advisory_xact_lock('queue|doc|2026-10-06')  -> acquired
--   T2: pg_advisory_xact_lock('queue|doc|2026-10-06')  -> BLOCKS
--   T1: max(token_number) = 26 -> inserts 27 -> COMMIT (lock released)
--   T2: unblocks, max(token_number) = 27 -> inserts 28 -> COMMIT
--
-- The lock releases automatically at commit or rollback, so a failed insert
-- cannot wedge a queue. `queue_entries_unique_token` is the backstop: if this
-- logic were ever wrong, the database would reject the duplicate rather than
-- hand two patients the same number.
--
-- The same lock key is used by call_next_patient(), so per doctor and day the
-- two operations are strictly serialized and cannot interleave.
-- =============================================================================
create or replace function register_patient(
  p_doctor_id    uuid,
  p_patient_name text,
  p_mobile       text default null,
  p_patient_type text default 'NEW'
)
returns table (
  public_id     uuid,
  token_number  integer,
  queue_date    date,
  doctor_id     uuid,
  doctor_name   text,
  department    text,
  room_number   text,
  hospital_name text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doctor   doctors%rowtype;
  v_hospital hospitals%rowtype;
  v_date     date;
  v_token    integer;
  v_name     text;
  v_mobile   text;
  v_type     patient_type;
  v_public   uuid;
begin
  -- ---- validate the patient's input -------------------------------------
  -- Collapse runs of whitespace so " संदीप   जाधव " becomes "संदीप जाधव".
  v_name := btrim(regexp_replace(coalesce(p_patient_name, ''), '\s+', ' ', 'g'));
  if v_name = '' then
    raise exception 'NAME_REQUIRED' using errcode = 'P0001';
  end if;
  if length(v_name) > 120 then
    raise exception 'NAME_TOO_LONG' using errcode = 'P0001';
  end if;

  -- Accept the shapes an Indian patient actually types: "98765 43210",
  -- "+91 9876543210", "09876543210" all normalise to 9876543210.
  v_mobile := regexp_replace(coalesce(p_mobile, ''), '[^0-9]', '', 'g');
  if length(v_mobile) = 12 and left(v_mobile, 2) = '91' then
    v_mobile := right(v_mobile, 10);
  elsif length(v_mobile) = 11 and left(v_mobile, 1) = '0' then
    v_mobile := right(v_mobile, 10);
  end if;
  v_mobile := nullif(v_mobile, '');
  if v_mobile is not null and v_mobile !~ '^[6-9][0-9]{9}$' then
    raise exception 'INVALID_MOBILE' using errcode = 'P0001';
  end if;

  begin
    v_type := coalesce(nullif(btrim(coalesce(p_patient_type, '')), ''), 'NEW')::patient_type;
  exception
    when invalid_text_representation then
      raise exception 'INVALID_PATIENT_TYPE' using errcode = 'P0001';
  end;

  -- ---- validate the doctor ----------------------------------------------
  if p_doctor_id is null then
    raise exception 'DOCTOR_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_doctor from doctors d where d.id = p_doctor_id;
  if not found then
    raise exception 'DOCTOR_NOT_FOUND' using errcode = 'P0001';
  end if;
  if not v_doctor.is_active then
    raise exception 'DOCTOR_INACTIVE' using errcode = 'P0001';
  end if;

  select * into v_hospital from hospitals h where h.id = v_doctor.hospital_id;
  if not found then
    raise exception 'HOSPITAL_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- ---- resolve the queue date in the HOSPITAL's timezone -----------------
  -- now() is timestamptz; `at time zone` converts it to the hospital's local
  -- wall clock. The date therefore rolls over at midnight IST, regardless of
  -- the patient's phone settings or where the database happens to run.
  v_date := (now() at time zone v_hospital.timezone)::date;

  -- ---- allocate the token, atomically -----------------------------------
  perform pg_advisory_xact_lock(hashtext('queue|' || v_doctor.id::text || '|' || v_date::text));

  select coalesce(max(qe.token_number), 0) + 1
    into v_token
    from queue_entries qe
   where qe.doctor_id = v_doctor.id
     and qe.queue_date = v_date;

  insert into queue_entries as qe (
    hospital_id, doctor_id, queue_date, token_number,
    patient_name, mobile, patient_type, status
  ) values (
    v_doctor.hospital_id, v_doctor.id, v_date, v_token,
    v_name, v_mobile, v_type, 'WAITING'
  )
  returning qe.public_id into v_public;

  return query
    select v_public, v_token, v_date, v_doctor.id, v_doctor.name,
           v_doctor.department, v_doctor.room_number, v_hospital.name;
end;
$$;


-- =============================================================================
-- 2. Patient-facing reads (no login required, keyed by the unguessable
--    public_id, and returning only the caller's own record)
-- =============================================================================
create or replace function get_token_status(p_public_id uuid)
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


-- The public TV payload. Contains no patient name, no mobile, no age and no
-- clinical detail — by construction, since it selects no such columns.
create or replace function get_public_queue(p_doctor_id uuid)
returns table (
  doctor_id                uuid,
  doctor_name              text,
  department               text,
  room_number              text,
  is_active                boolean,
  hospital_name            text,
  hospital_address         text,
  hospital_phone           text,
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


-- =============================================================================
-- 3. Staff authorization helper
-- =============================================================================
-- Loads an entry by public_id and refuses unless the caller is staff at the
-- entry's hospital. Every staff RPC starts with this.
create or replace function authorize_entry(p_public_id uuid)
returns queue_entries
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_entry queue_entries;
begin
  select * into v_entry from queue_entries qe where qe.public_id = p_public_id;
  if not found then
    raise exception 'TOKEN_NOT_FOUND' using errcode = 'P0001';
  end if;
  if not is_staff_of(v_entry.hospital_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  return v_entry;
end;
$$;


-- =============================================================================
-- 4. Reception actions
-- =============================================================================

-- The one-click primary action (spec §12).
--
-- All four effects happen in a single transaction, so the TV, the patient's
-- phone and the dashboard converge on the same state or on nothing at all:
--   1. the previously called patient is closed out as COMPLETED
--   2. the lowest-numbered WAITING patient becomes CALLED
--   3. queue_events fires, pushing the new token to every subscriber
--   4. the caller gets back the token + room to speak aloud
--
-- Two receptionists clicking at the same instant serialize on the advisory
-- lock; the second sees the first's committed result and calls the *following*
-- patient. Neither call is lost and no patient is called twice.
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

  -- Close out whoever was being seen. If reception called someone who never
  -- turned up, the next call implicitly completes them — matching how a paper
  -- register actually behaves.
  update queue_entries
     set status = 'COMPLETED', completed_at = now()
   where doctor_id = p_doctor_id
     and queue_date = v_date
     and status in ('CALLED', 'IN_CONSULTATION');

  select qe.id, qe.public_id, qe.token_number
    into v_next_id, v_next_pub, v_next_token
    from queue_entries qe
   where qe.doctor_id = p_doctor_id
     and qe.queue_date = v_date
     and qe.status = 'WAITING'
   order by qe.token_number
   limit 1;

  -- Nobody left waiting. Return zero rows rather than raising: "the queue is
  -- empty" is a normal outcome, not an error.
  if v_next_id is null then
    return;
  end if;

  update queue_entries
     set status = 'CALLED', called_at = now()
   where id = v_next_id;

  return query
    select v_next_token, v_next_pub, v_doctor.id, v_doctor.name,
           v_doctor.department, v_doctor.room_number;
end;
$$;


-- Re-announce the patient already at the desk, without advancing the queue.
-- Sets called_at = now() so the announcement fires again on every screen.
create or replace function recall_patient(p_public_id uuid)
returns table (
  token_number integer,
  doctor_name  text,
  room_number  text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entry  queue_entries;
  v_doctor doctors%rowtype;
begin
  v_entry := authorize_entry(p_public_id);

  if v_entry.status not in ('CALLED', 'IN_CONSULTATION') then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = 'P0001';
  end if;

  update queue_entries
     set status = 'CALLED', called_at = now()
   where id = v_entry.id;

  select * into v_doctor from doctors d where d.id = v_entry.doctor_id;

  return query select v_entry.token_number, v_doctor.name, v_doctor.room_number;
end;
$$;


create or replace function start_consultation(p_public_id uuid)
returns queue_status
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entry queue_entries;
begin
  v_entry := authorize_entry(p_public_id);

  if v_entry.status <> 'CALLED' then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = 'P0001';
  end if;

  update queue_entries set status = 'IN_CONSULTATION' where id = v_entry.id;
  return 'IN_CONSULTATION'::queue_status;
end;
$$;


-- WAITING -> SKIPPED (patient did not turn up when called).
-- CALLED   -> SKIPPED is also allowed, for the patient who was called and left.
create or replace function skip_patient(p_public_id uuid)
returns queue_status
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entry queue_entries;
begin
  v_entry := authorize_entry(p_public_id);

  if v_entry.status in ('COMPLETED', 'SKIPPED') then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = 'P0001';
  end if;

  update queue_entries
     set status = 'SKIPPED', completed_at = now()
   where id = v_entry.id;

  return 'SKIPPED'::queue_status;
end;
$$;


create or replace function complete_patient(p_public_id uuid)
returns queue_status
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entry queue_entries;
begin
  v_entry := authorize_entry(p_public_id);

  if v_entry.status in ('COMPLETED', 'SKIPPED') then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = 'P0001';
  end if;

  update queue_entries
     set status = 'COMPLETED', completed_at = now()
   where id = v_entry.id;

  return 'COMPLETED'::queue_status;
end;
$$;


-- =============================================================================
-- 5. Realtime trigger
-- =============================================================================
-- Every change to a queue entry appends a row to queue_events. That table has
-- no personal data, so it is safe to broadcast to the public TV and to every
-- patient's phone. This is the single realtime feed for the whole app.
create or replace function emit_queue_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doctor_id   uuid;
  v_queue_date  date;
  v_hospital_id uuid;
  v_snapshot    record;
begin
  if tg_op = 'DELETE' then
    v_doctor_id   := old.doctor_id;
    v_queue_date  := old.queue_date;
    v_hospital_id := old.hospital_id;
  else
    v_doctor_id   := new.doctor_id;
    v_queue_date  := new.queue_date;
    v_hospital_id := new.hospital_id;
  end if;

  select * into v_snapshot
    from compute_queue_snapshot(v_doctor_id, v_queue_date);

  insert into queue_events (
    hospital_id, doctor_id, queue_date, event_type,
    current_token, next_token, waiting_count
  ) values (
    v_hospital_id, v_doctor_id, v_queue_date, tg_op,
    v_snapshot.current_token,
    v_snapshot.next_token,
    coalesce(v_snapshot.waiting_count, 0)
  );

  return null;
end;
$$;

drop trigger if exists queue_entries_emit_event on queue_entries;
create trigger queue_entries_emit_event
  after insert or update or delete on queue_entries
  for each row execute function emit_queue_event();


-- =============================================================================
-- 6. Execution grants
--
-- Supabase grants EXECUTE on new public functions to anon/authenticated by
-- default. We revoke that wholesale and hand out exactly the entry points each
-- role needs, so internal helpers stay internal.
-- =============================================================================
revoke all on function register_patient(uuid, text, text, text) from public;
revoke all on function get_token_status(uuid)                   from public;
revoke all on function get_public_queue(uuid)                   from public;
revoke all on function call_next_patient(uuid)                  from public;
revoke all on function recall_patient(uuid)                     from public;
revoke all on function start_consultation(uuid)                 from public;
revoke all on function skip_patient(uuid)                       from public;
revoke all on function complete_patient(uuid)                   from public;

revoke all on function authorize_entry(uuid)          from public, anon, authenticated;
revoke all on function emit_queue_event()             from public, anon, authenticated;
revoke all on function compute_queue_snapshot(uuid, date) from public, anon, authenticated;
revoke all on function current_staff_hospital()       from public, anon;
revoke all on function current_staff_role()           from public, anon;
revoke all on function is_staff_of(uuid)              from public, anon;

-- Patients (unauthenticated).
grant execute on function register_patient(uuid, text, text, text) to anon, authenticated;
grant execute on function get_token_status(uuid)                   to anon, authenticated;
grant execute on function get_public_queue(uuid)                   to anon, authenticated;

-- Staff only. These re-check authorization internally via is_staff_of(), so
-- granting EXECUTE to authenticated is not itself the security boundary.
grant execute on function call_next_patient(uuid)  to authenticated;
grant execute on function recall_patient(uuid)     to authenticated;
grant execute on function start_consultation(uuid) to authenticated;
grant execute on function skip_patient(uuid)       to authenticated;
grant execute on function complete_patient(uuid)   to authenticated;

grant execute on function current_staff_hospital() to authenticated;
grant execute on function current_staff_role()     to authenticated;
grant execute on function is_staff_of(uuid)        to authenticated;
