-- =============================================================================
-- 008_daily_token_cap.sql
-- Doctor Queue System — hard ceiling on registrations per doctor per day
--
-- Run AFTER 007_quota_optimization.sql. Safe to re-run.
--
-- The anon key ships in the browser bundle, so anyone can call
-- register_patient() directly. Turnstile on the form raises the cost of that,
-- but a script with the anon key can still bypass the form. This cap is the
-- backstop: even a determined caller cannot create more than
-- `hospitals.max_daily_tokens` tokens for one doctor in one day, so one bad
-- actor cannot exhaust the shared free-tier database, egress or Realtime quota.
--
-- The limit is generous (2,000 by default after 010). A small hospital seeing
-- 250–300 patients a day will never reach it by accident, and a large hospital
-- can raise it per clinic without changing the function.
--
-- NOTE ON LOCKDOWN
-- ----------------
-- Once the `register-patient` Edge Function is deployed, the public RPC can be
-- closed to the anon role:
--
--   revoke execute on function register_patient(uuid, text, text, text) from anon;
--
-- The browser then reaches registration only through the function, which
-- verifies Turnstile first. This migration intentionally leaves the grant in
-- place so applying the SQL before deploying the function does not break
-- registration. Run the revoke only after the function is live.
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
  v_doctor      doctors%rowtype;
  v_hospital    hospitals%rowtype;
  v_date        date;
  v_token       integer;
  v_name        text;
  v_mobile      text;
  v_type        patient_type;
  v_public      uuid;
  v_today_count integer;
begin
  -- ---- validate the patient's input -------------------------------------
  v_name := btrim(regexp_replace(coalesce(p_patient_name, ''), '\s+', ' ', 'g'));
  if v_name = '' then
    raise exception 'NAME_REQUIRED' using errcode = 'P0001';
  end if;
  if length(v_name) > 120 then
    raise exception 'NAME_TOO_LONG' using errcode = 'P0001';
  end if;

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
  v_date := (now() at time zone v_hospital.timezone)::date;

  -- ---- enforce the daily ceiling ----------------------------------------
  -- Counted before the advisory lock so a full queue does not make every
  -- caller wait behind the lock just to be rejected.
  select count(*)::integer
    into v_today_count
    from queue_entries qe
   where qe.doctor_id = v_doctor.id
     and qe.queue_date = v_date;

  if v_today_count >= v_hospital.max_daily_tokens then
    raise exception 'QUEUE_FULL' using errcode = 'P0001';
  end if;

  -- ---- allocate the token, atomically -----------------------------------
  perform pg_advisory_xact_lock(hashtext('queue|' || v_doctor.id::text || '|' || v_date::text));

  -- Re-check under the lock: two callers that both saw 499 just before the
  -- lock would otherwise both insert and take the day to 501.
  select count(*)::integer
    into v_today_count
    from queue_entries qe
   where qe.doctor_id = v_doctor.id
     and qe.queue_date = v_date;

  if v_today_count >= v_hospital.max_daily_tokens then
    raise exception 'QUEUE_FULL' using errcode = 'P0001';
  end if;

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
