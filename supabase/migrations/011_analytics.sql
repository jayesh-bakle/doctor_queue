-- =============================================================================
-- 011_analytics.sql
-- Doctor Queue System — monthly analytics, hospital dashboards, platform admin
--
-- Run AFTER 009_hospital_changes.sql and 010_big_hospital_hardening.sql.
--
-- Design notes:
--   * queue_entries is retained for only `hospitals.retention_days` (90 by
--     default). These aggregate tables keep the history after the raw rows are
--     pruned, so a monthly chart does not disappear after three months.
--   * The browser never reads analytics tables directly. Every read goes
--     through a SECURITY DEFINER RPC that checks the caller's hospital/role.
--   * Aggregates contain no patient names or mobile numbers.
--   * Daily rows use queue_date (the hospital's local queue day). Hourly rows
--     use created_at converted to the hospital's timezone.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Platform administrators
--
-- A platform admin is an auth user who may read every hospital's aggregates.
-- They still need a normal staff_users row to sign in through the existing
-- staff login, but their analytics access is not limited to that hospital.
-- -----------------------------------------------------------------------------
create table if not exists platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table platform_admins enable row level security;
revoke all on platform_admins from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Aggregate tables
-- -----------------------------------------------------------------------------

create table if not exists analytics_hospital_daily (
  hospital_id         uuid not null references hospitals (id) on delete cascade,
  stat_date           date not null,
  registered          integer not null default 0,
  new_patients        integer not null default 0,
  followup_patients   integer not null default 0,
  completed           integer not null default 0,
  skipped             integer not null default 0,
  waiting             integer not null default 0,
  called              integer not null default 0,
  wait_seconds_sum    bigint not null default 0,
  wait_count          integer not null default 0,
  consult_seconds_sum bigint not null default 0,
  consult_count       integer not null default 0,
  peak_hour           smallint,
  refreshed_at        timestamptz not null default now(),
  primary key (hospital_id, stat_date)
);

create index if not exists analytics_hospital_daily_date_idx
  on analytics_hospital_daily (stat_date);

create table if not exists analytics_doctor_daily (
  hospital_id         uuid not null references hospitals (id) on delete cascade,
  doctor_id           uuid not null,
  stat_date           date not null,
  doctor_name         text not null default '',
  registered          integer not null default 0,
  new_patients        integer not null default 0,
  followup_patients   integer not null default 0,
  completed           integer not null default 0,
  skipped             integer not null default 0,
  waiting             integer not null default 0,
  called              integer not null default 0,
  wait_seconds_sum    bigint not null default 0,
  wait_count          integer not null default 0,
  consult_seconds_sum bigint not null default 0,
  consult_count       integer not null default 0,
  refreshed_at        timestamptz not null default now(),
  primary key (hospital_id, doctor_id, stat_date)
);

create index if not exists analytics_doctor_daily_hospital_date_idx
  on analytics_doctor_daily (hospital_id, stat_date);

create table if not exists analytics_hourly (
  hospital_id       uuid not null references hospitals (id) on delete cascade,
  doctor_id         uuid not null,
  stat_date         date not null,
  hour              smallint not null check (hour between 0 and 23),
  registered        integer not null default 0,
  new_patients      integer not null default 0,
  followup_patients integer not null default 0,
  completed         integer not null default 0,
  skipped           integer not null default 0,
  refreshed_at      timestamptz not null default now(),
  primary key (hospital_id, doctor_id, stat_date, hour)
);

create index if not exists analytics_hourly_hospital_date_idx
  on analytics_hourly (hospital_id, stat_date);

alter table analytics_hospital_daily enable row level security;
alter table analytics_doctor_daily   enable row level security;
alter table analytics_hourly         enable row level security;

revoke all on analytics_hospital_daily from anon, authenticated;
revoke all on analytics_doctor_daily   from anon, authenticated;
revoke all on analytics_hourly         from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Indexes that make the refresh and today's live summary predictable
-- -----------------------------------------------------------------------------
create index if not exists queue_entries_hospital_date_status_idx
  on queue_entries (hospital_id, queue_date, status);

create index if not exists queue_entries_hospital_date_doctor_idx
  on queue_entries (hospital_id, queue_date, doctor_id);

create index if not exists queue_entries_hospital_created_idx
  on queue_entries (hospital_id, created_at);

-- -----------------------------------------------------------------------------
-- 4. Access helpers
-- -----------------------------------------------------------------------------
create or replace function is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from platform_admins pa where pa.user_id = auth.uid()
  );
$$;

revoke all on function is_platform_admin() from public, anon;
grant execute on function is_platform_admin() to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Refresh
--
-- Recomputes every aggregate for the requested inclusive date range. It is
-- deliberately service-role/cron only: a staff member must never be able to
-- trigger a full-table refresh for every hospital.
-- -----------------------------------------------------------------------------
create or replace function refresh_analytics(p_from date, p_to date)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'INVALID_DATE_RANGE' using errcode = 'P0001';
  end if;

  if p_to - p_from > 366 then
    raise exception 'RANGE_TOO_LARGE' using errcode = 'P0001';
  end if;

  -- Hospital-wide daily totals and weighted wait/consultation averages.
  with daily as (
    select
      qe.hospital_id,
      qe.queue_date as stat_date,
      count(*)::integer as registered,
      count(*) filter (where qe.patient_type = 'NEW')::integer as new_patients,
      count(*) filter (where qe.patient_type = 'FOLLOWUP')::integer as followup_patients,
      count(*) filter (where qe.status = 'COMPLETED')::integer as completed,
      count(*) filter (where qe.status = 'SKIPPED')::integer as skipped,
      count(*) filter (where qe.status = 'WAITING')::integer as waiting,
      count(*) filter (where qe.status in ('CALLED', 'IN_CONSULTATION'))::integer as called,
      coalesce(
        sum(extract(epoch from (qe.called_at - qe.created_at)))
          filter (where qe.called_at is not null),
        0
      )::bigint as wait_seconds_sum,
      count(*) filter (where qe.called_at is not null)::integer as wait_count,
      coalesce(
        sum(extract(epoch from (qe.completed_at - qe.called_at)))
          filter (where qe.completed_at is not null and qe.called_at is not null),
        0
      )::bigint as consult_seconds_sum,
      count(*) filter (where qe.completed_at is not null and qe.called_at is not null)::integer
        as consult_count
    from queue_entries qe
    where qe.queue_date between p_from and p_to
    group by qe.hospital_id, qe.queue_date
  ),
  peak as (
    select hospital_id, stat_date, hour
    from (
      select
        counts.hospital_id,
        counts.stat_date,
        counts.hour,
        row_number() over (
          partition by counts.hospital_id, counts.stat_date
          order by counts.registered desc, counts.hour asc
        ) as rn
      from (
        select
          qe.hospital_id,
          qe.queue_date as stat_date,
          extract(hour from (qe.created_at at time zone h.timezone))::smallint as hour,
          count(*)::integer as registered
        from queue_entries qe
        join hospitals h on h.id = qe.hospital_id
        where qe.queue_date between p_from and p_to
        group by
          qe.hospital_id,
          qe.queue_date,
          h.timezone,
          extract(hour from (qe.created_at at time zone h.timezone))
      ) counts
    ) ranked
    where ranked.rn = 1
  )
  insert into analytics_hospital_daily (
    hospital_id, stat_date, registered, new_patients, followup_patients,
    completed, skipped, waiting, called,
    wait_seconds_sum, wait_count, consult_seconds_sum, consult_count,
    peak_hour, refreshed_at
  )
  select
    d.hospital_id, d.stat_date, d.registered, d.new_patients, d.followup_patients,
    d.completed, d.skipped, d.waiting, d.called,
    d.wait_seconds_sum, d.wait_count, d.consult_seconds_sum, d.consult_count,
    p.hour, now()
  from daily d
  left join peak p on p.hospital_id = d.hospital_id and p.stat_date = d.stat_date
  on conflict (hospital_id, stat_date) do update set
    registered = excluded.registered,
    new_patients = excluded.new_patients,
    followup_patients = excluded.followup_patients,
    completed = excluded.completed,
    skipped = excluded.skipped,
    waiting = excluded.waiting,
    called = excluded.called,
    wait_seconds_sum = excluded.wait_seconds_sum,
    wait_count = excluded.wait_count,
    consult_seconds_sum = excluded.consult_seconds_sum,
    consult_count = excluded.consult_count,
    peak_hour = excluded.peak_hour,
    refreshed_at = now();

  -- Per-doctor daily totals.
  with daily as (
    select
      qe.hospital_id,
      qe.doctor_id,
      qe.queue_date as stat_date,
      coalesce(d.name, '') as doctor_name,
      count(*)::integer as registered,
      count(*) filter (where qe.patient_type = 'NEW')::integer as new_patients,
      count(*) filter (where qe.patient_type = 'FOLLOWUP')::integer as followup_patients,
      count(*) filter (where qe.status = 'COMPLETED')::integer as completed,
      count(*) filter (where qe.status = 'SKIPPED')::integer as skipped,
      count(*) filter (where qe.status = 'WAITING')::integer as waiting,
      count(*) filter (where qe.status in ('CALLED', 'IN_CONSULTATION'))::integer as called,
      coalesce(
        sum(extract(epoch from (qe.called_at - qe.created_at)))
          filter (where qe.called_at is not null),
        0
      )::bigint as wait_seconds_sum,
      count(*) filter (where qe.called_at is not null)::integer as wait_count,
      coalesce(
        sum(extract(epoch from (qe.completed_at - qe.called_at)))
          filter (where qe.completed_at is not null and qe.called_at is not null),
        0
      )::bigint as consult_seconds_sum,
      count(*) filter (where qe.completed_at is not null and qe.called_at is not null)::integer
        as consult_count
    from queue_entries qe
    left join doctors d on d.id = qe.doctor_id
    where qe.queue_date between p_from and p_to
    group by qe.hospital_id, qe.doctor_id, qe.queue_date, d.name
  )
  insert into analytics_doctor_daily (
    hospital_id, doctor_id, stat_date, doctor_name,
    registered, new_patients, followup_patients, completed, skipped, waiting, called,
    wait_seconds_sum, wait_count, consult_seconds_sum, consult_count,
    refreshed_at
  )
  select
    d.hospital_id, d.doctor_id, d.stat_date, d.doctor_name,
    d.registered, d.new_patients, d.followup_patients, d.completed, d.skipped,
    d.waiting, d.called,
    d.wait_seconds_sum, d.wait_count, d.consult_seconds_sum, d.consult_count,
    now()
  from daily d
  on conflict (hospital_id, doctor_id, stat_date) do update set
    doctor_name = excluded.doctor_name,
    registered = excluded.registered,
    new_patients = excluded.new_patients,
    followup_patients = excluded.followup_patients,
    completed = excluded.completed,
    skipped = excluded.skipped,
    waiting = excluded.waiting,
    called = excluded.called,
    wait_seconds_sum = excluded.wait_seconds_sum,
    wait_count = excluded.wait_count,
    consult_seconds_sum = excluded.consult_seconds_sum,
    consult_count = excluded.consult_count,
    refreshed_at = now();

  -- Per-doctor hourly registrations, used for the peak-hour chart.
  with hourly as (
    select
      qe.hospital_id,
      qe.doctor_id,
      qe.queue_date as stat_date,
      extract(hour from (qe.created_at at time zone h.timezone))::smallint as hour,
      count(*)::integer as registered,
      count(*) filter (where qe.patient_type = 'NEW')::integer as new_patients,
      count(*) filter (where qe.patient_type = 'FOLLOWUP')::integer as followup_patients,
      count(*) filter (where qe.status = 'COMPLETED')::integer as completed,
      count(*) filter (where qe.status = 'SKIPPED')::integer as skipped
    from queue_entries qe
    join hospitals h on h.id = qe.hospital_id
    where qe.queue_date between p_from and p_to
    group by
      qe.hospital_id,
      qe.doctor_id,
      qe.queue_date,
      h.timezone,
      extract(hour from (qe.created_at at time zone h.timezone))
  )
  insert into analytics_hourly (
    hospital_id, doctor_id, stat_date, hour,
    registered, new_patients, followup_patients, completed, skipped,
    refreshed_at
  )
  select
    h.hospital_id, h.doctor_id, h.stat_date, h.hour,
    h.registered, h.new_patients, h.followup_patients, h.completed, h.skipped,
    now()
  from hourly h
  on conflict (hospital_id, doctor_id, stat_date, hour) do update set
    registered = excluded.registered,
    new_patients = excluded.new_patients,
    followup_patients = excluded.followup_patients,
    completed = excluded.completed,
    skipped = excluded.skipped,
    refreshed_at = now();
end;
$$;

revoke all on function refresh_analytics(date, date) from public, anon, authenticated;
grant execute on function refresh_analytics(date, date) to service_role;

-- Backfill the last 90 days. Older raw rows are already gone in most projects,
-- so this is the maximum history that can be reconstructed automatically.
do $$
begin
  perform public.refresh_analytics(
    (now() at time zone 'Asia/Kolkata')::date - 90,
    (now() at time zone 'Asia/Kolkata')::date + 1
  );
exception
  when others then
    raise notice 'analytics backfill skipped: %', sqlerrm;
end $$;

-- Refresh recent days often, and a wider window once a night for late status
-- corrections. pg_cron is optional; the migration still succeeds without it.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'analytics-refresh-recent') then
      perform cron.unschedule('analytics-refresh-recent');
    end if;
    perform cron.schedule(
      'analytics-refresh-recent',
      '*/15 * * * *',
      $cron$select public.refresh_analytics(
        (now() at time zone 'Asia/Kolkata')::date - 2,
        (now() at time zone 'Asia/Kolkata')::date + 1
      )$cron$
    );

    if exists (select 1 from cron.job where jobname = 'analytics-refresh-nightly') then
      perform cron.unschedule('analytics-refresh-nightly');
    end if;
    perform cron.schedule(
      'analytics-refresh-nightly',
      '30 20 * * *',
      $cron$select public.refresh_analytics(
        (now() at time zone 'Asia/Kolkata')::date - 7,
        (now() at time zone 'Asia/Kolkata')::date + 1
      )$cron$
    );
  else
    raise notice 'pg_cron not configured; schedule public.refresh_analytics() manually';
  end if;
exception
  when others then
    raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Read RPCs
-- -----------------------------------------------------------------------------

-- Today's live summary for the reception dashboard. Uses queue_entries directly
-- so it is not delayed by the 15-minute aggregate refresh.
create or replace function get_today_summary(p_hospital_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_timezone text;
  v_today date;
  v_peak_hour smallint;
begin
  if p_hospital_id is null then
    raise exception 'HOSPITAL_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not (is_staff_of(p_hospital_id) or is_platform_admin()) then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  select h.timezone into v_timezone from hospitals h where h.id = p_hospital_id;
  if not found then
    raise exception 'HOSPITAL_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_today := (now() at time zone v_timezone)::date;

  select extract(hour from (qe.created_at at time zone v_timezone))::smallint
    into v_peak_hour
    from queue_entries qe
   where qe.hospital_id = p_hospital_id
     and qe.queue_date = v_today
   group by extract(hour from (qe.created_at at time zone v_timezone))
   order by count(*) desc, extract(hour from (qe.created_at at time zone v_timezone)) asc
   limit 1;

  return jsonb_build_object(
    'date', v_today,
    'registered', (
      select count(*)::integer from queue_entries qe
       where qe.hospital_id = p_hospital_id and qe.queue_date = v_today
    ),
    'newPatients', (
      select count(*)::integer from queue_entries qe
       where qe.hospital_id = p_hospital_id and qe.queue_date = v_today
         and qe.patient_type = 'NEW'
    ),
    'followupPatients', (
      select count(*)::integer from queue_entries qe
       where qe.hospital_id = p_hospital_id and qe.queue_date = v_today
         and qe.patient_type = 'FOLLOWUP'
    ),
    'completed', (
      select count(*)::integer from queue_entries qe
       where qe.hospital_id = p_hospital_id and qe.queue_date = v_today
         and qe.status = 'COMPLETED'
    ),
    'skipped', (
      select count(*)::integer from queue_entries qe
       where qe.hospital_id = p_hospital_id and qe.queue_date = v_today
         and qe.status = 'SKIPPED'
    ),
    'waiting', (
      select count(*)::integer from queue_entries qe
       where qe.hospital_id = p_hospital_id and qe.queue_date = v_today
         and qe.status = 'WAITING'
    ),
    'called', (
      select count(*)::integer from queue_entries qe
       where qe.hospital_id = p_hospital_id and qe.queue_date = v_today
         and qe.status in ('CALLED', 'IN_CONSULTATION')
    ),
    'avgWaitSeconds', (
      select case
        when count(*) filter (where qe.called_at is not null) = 0 then null
        else round(
          avg(extract(epoch from (qe.called_at - qe.created_at)))
            filter (where qe.called_at is not null)
        )::integer
      end
      from queue_entries qe
      where qe.hospital_id = p_hospital_id and qe.queue_date = v_today
    ),
    'avgConsultSeconds', (
      select case
        when count(*) filter (where qe.completed_at is not null and qe.called_at is not null) = 0 then null
        else round(
          avg(extract(epoch from (qe.completed_at - qe.called_at)))
            filter (where qe.completed_at is not null and qe.called_at is not null)
        )::integer
      end
      from queue_entries qe
      where qe.hospital_id = p_hospital_id and qe.queue_date = v_today
    ),
    'peakHour', v_peak_hour
  );
end;
$$;

revoke all on function get_today_summary(uuid) from public, anon;
grant execute on function get_today_summary(uuid) to authenticated;

-- Hospital analytics for a hospital ADMIN, or a platform admin drilling into
-- one hospital. Reception is deliberately excluded: it gets get_today_summary.
create or replace function get_hospital_analytics(
  p_hospital_id uuid,
  p_from date,
  p_to date,
  p_doctor_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_summary jsonb;
  v_daily jsonb;
  v_doctors jsonb;
  v_hourly jsonb;
  v_peak_hour smallint;
begin
  if p_hospital_id is null then
    raise exception 'HOSPITAL_NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'INVALID_DATE_RANGE' using errcode = 'P0001';
  end if;

  if p_to - p_from > 366 then
    raise exception 'RANGE_TOO_LARGE' using errcode = 'P0001';
  end if;

  if not (is_staff_of(p_hospital_id) or is_platform_admin()) then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  if not (is_platform_admin() or current_staff_role() = 'ADMIN') then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'registered', coalesce(sum(d.registered), 0)::integer,
    'newPatients', coalesce(sum(d.new_patients), 0)::integer,
    'followupPatients', coalesce(sum(d.followup_patients), 0)::integer,
    'completed', coalesce(sum(d.completed), 0)::integer,
    'skipped', coalesce(sum(d.skipped), 0)::integer,
    'waiting', coalesce(sum(d.waiting), 0)::integer,
    'called', coalesce(sum(d.called), 0)::integer,
    'avgWaitSeconds', case
      when coalesce(sum(d.wait_count), 0) = 0 then null
      else round(sum(d.wait_seconds_sum)::numeric / sum(d.wait_count))::integer
    end,
    'avgConsultSeconds', case
      when coalesce(sum(d.consult_count), 0) = 0 then null
      else round(sum(d.consult_seconds_sum)::numeric / sum(d.consult_count))::integer
    end
  )
  into v_summary
  from analytics_doctor_daily d
  where d.hospital_id = p_hospital_id
    and d.stat_date between p_from and p_to
    and (p_doctor_id is null or d.doctor_id = p_doctor_id);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', d.stat_date,
        'registered', d.registered,
        'newPatients', d.new_patients,
        'followupPatients', d.followup_patients,
        'completed', d.completed,
        'skipped', d.skipped,
        'waiting', d.waiting,
        'called', d.called,
        'avgWaitSeconds', case
          when d.wait_count = 0 then null
          else round(d.wait_seconds_sum::numeric / d.wait_count)::integer
        end,
        'avgConsultSeconds', case
          when d.consult_count = 0 then null
          else round(d.consult_seconds_sum::numeric / d.consult_count)::integer
        end,
        'peakHour', null
      )
      order by d.stat_date
    ),
    '[]'::jsonb
  )
  into v_daily
  from (
    select
      d.stat_date,
      sum(d.registered)::integer as registered,
      sum(d.new_patients)::integer as new_patients,
      sum(d.followup_patients)::integer as followup_patients,
      sum(d.completed)::integer as completed,
      sum(d.skipped)::integer as skipped,
      sum(d.waiting)::integer as waiting,
      sum(d.called)::integer as called,
      sum(d.wait_seconds_sum)::bigint as wait_seconds_sum,
      sum(d.wait_count)::integer as wait_count,
      sum(d.consult_seconds_sum)::bigint as consult_seconds_sum,
      sum(d.consult_count)::integer as consult_count
    from analytics_doctor_daily d
    where d.hospital_id = p_hospital_id
      and d.stat_date between p_from and p_to
      and (p_doctor_id is null or d.doctor_id = p_doctor_id)
    group by d.stat_date
  ) d;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'doctorId', d.doctor_id,
        'doctorName', d.doctor_name,
        'registered', d.registered,
        'completed', d.completed,
        'skipped', d.skipped,
        'avgWaitSeconds', case
          when d.wait_count = 0 then null
          else round(d.wait_seconds_sum::numeric / d.wait_count)::integer
        end,
        'avgConsultSeconds', case
          when d.consult_count = 0 then null
          else round(d.consult_seconds_sum::numeric / d.consult_count)::integer
        end
      )
      order by d.registered desc, d.doctor_name
    ),
    '[]'::jsonb
  )
  into v_doctors
  from (
    select
      d.doctor_id,
      max(d.doctor_name) as doctor_name,
      sum(d.registered)::integer as registered,
      sum(d.completed)::integer as completed,
      sum(d.skipped)::integer as skipped,
      sum(d.wait_seconds_sum)::bigint as wait_seconds_sum,
      sum(d.wait_count)::integer as wait_count,
      sum(d.consult_seconds_sum)::bigint as consult_seconds_sum,
      sum(d.consult_count)::integer as consult_count
    from analytics_doctor_daily d
    where d.hospital_id = p_hospital_id
      and d.stat_date between p_from and p_to
      and (p_doctor_id is null or d.doctor_id = p_doctor_id)
    group by d.doctor_id
  ) d;

  select h.hour
    into v_peak_hour
    from (
      select h.hour, sum(h.registered)::integer as registered
      from analytics_hourly h
      where h.hospital_id = p_hospital_id
        and h.stat_date between p_from and p_to
        and (p_doctor_id is null or h.doctor_id = p_doctor_id)
      group by h.hour
      order by sum(h.registered) desc, h.hour asc
      limit 1
    ) h;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'hour', h.hour,
        'registered', h.registered,
        'completed', h.completed,
        'skipped', h.skipped
      )
      order by h.hour
    ),
    '[]'::jsonb
  )
  into v_hourly
  from (
    select
      h.hour,
      sum(h.registered)::integer as registered,
      sum(h.completed)::integer as completed,
      sum(h.skipped)::integer as skipped
    from analytics_hourly h
    where h.hospital_id = p_hospital_id
      and h.stat_date between p_from and p_to
      and (p_doctor_id is null or h.doctor_id = p_doctor_id)
    group by h.hour
  ) h;

  v_summary := v_summary || jsonb_build_object('peakHour', v_peak_hour);

  return jsonb_build_object(
    'summary', v_summary,
    'daily', v_daily,
    'doctors', v_doctors,
    'hourly', v_hourly
  );
end;
$$;

revoke all on function get_hospital_analytics(uuid, date, date, uuid) from public, anon;
grant execute on function get_hospital_analytics(uuid, date, date, uuid) to authenticated;

-- Platform-wide analytics. This is the only RPC that intentionally spans every
-- hospital, and only a row in platform_admins can call it.
create or replace function get_platform_analytics(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_summary jsonb;
  v_daily jsonb;
  v_hospitals jsonb;
  v_hourly jsonb;
  v_peak_hour smallint;
begin
  if not is_platform_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'INVALID_DATE_RANGE' using errcode = 'P0001';
  end if;

  if p_to - p_from > 366 then
    raise exception 'RANGE_TOO_LARGE' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'registered', coalesce(sum(d.registered), 0)::integer,
    'newPatients', coalesce(sum(d.new_patients), 0)::integer,
    'followupPatients', coalesce(sum(d.followup_patients), 0)::integer,
    'completed', coalesce(sum(d.completed), 0)::integer,
    'skipped', coalesce(sum(d.skipped), 0)::integer,
    'waiting', coalesce(sum(d.waiting), 0)::integer,
    'called', coalesce(sum(d.called), 0)::integer,
    'avgWaitSeconds', case
      when coalesce(sum(d.wait_count), 0) = 0 then null
      else round(sum(d.wait_seconds_sum)::numeric / sum(d.wait_count))::integer
    end,
    'avgConsultSeconds', case
      when coalesce(sum(d.consult_count), 0) = 0 then null
      else round(sum(d.consult_seconds_sum)::numeric / sum(d.consult_count))::integer
    end
  )
  into v_summary
  from analytics_hospital_daily d
  where d.stat_date between p_from and p_to;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', d.stat_date,
        'registered', d.registered,
        'completed', d.completed,
        'skipped', d.skipped,
        'newPatients', d.new_patients,
        'followupPatients', d.followup_patients,
        'avgWaitSeconds', case
          when d.wait_count = 0 then null
          else round(d.wait_seconds_sum::numeric / d.wait_count)::integer
        end,
        'avgConsultSeconds', case
          when d.consult_count = 0 then null
          else round(d.consult_seconds_sum::numeric / d.consult_count)::integer
        end
      )
      order by d.stat_date
    ),
    '[]'::jsonb
  )
  into v_daily
  from (
    select
      d.stat_date,
      sum(d.registered)::integer as registered,
      sum(d.completed)::integer as completed,
      sum(d.skipped)::integer as skipped,
      sum(d.new_patients)::integer as new_patients,
      sum(d.followup_patients)::integer as followup_patients,
      sum(d.wait_seconds_sum)::bigint as wait_seconds_sum,
      sum(d.wait_count)::integer as wait_count,
      sum(d.consult_seconds_sum)::bigint as consult_seconds_sum,
      sum(d.consult_count)::integer as consult_count
    from analytics_hospital_daily d
    where d.stat_date between p_from and p_to
    group by d.stat_date
  ) d;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'hospitalId', d.hospital_id,
        'hospitalName', d.hospital_name,
        'registered', d.registered,
        'completed', d.completed,
        'skipped', d.skipped,
        'avgWaitSeconds', case
          when d.wait_count = 0 then null
          else round(d.wait_seconds_sum::numeric / d.wait_count)::integer
        end,
        'avgConsultSeconds', case
          when d.consult_count = 0 then null
          else round(d.consult_seconds_sum::numeric / d.consult_count)::integer
        end
      )
      order by d.registered desc, d.hospital_name
    ),
    '[]'::jsonb
  )
  into v_hospitals
  from (
    select
      d.hospital_id,
      max(h.name) as hospital_name,
      sum(d.registered)::integer as registered,
      sum(d.completed)::integer as completed,
      sum(d.skipped)::integer as skipped,
      sum(d.wait_seconds_sum)::bigint as wait_seconds_sum,
      sum(d.wait_count)::integer as wait_count,
      sum(d.consult_seconds_sum)::bigint as consult_seconds_sum,
      sum(d.consult_count)::integer as consult_count
    from analytics_hospital_daily d
    join hospitals h on h.id = d.hospital_id
    where d.stat_date between p_from and p_to
    group by d.hospital_id
  ) d;

  select h.hour
    into v_peak_hour
    from (
      select h.hour, sum(h.registered)::integer as registered
      from analytics_hourly h
      where h.stat_date between p_from and p_to
      group by h.hour
      order by sum(h.registered) desc, h.hour asc
      limit 1
    ) h;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'hour', h.hour,
        'registered', h.registered,
        'completed', h.completed,
        'skipped', h.skipped
      )
      order by h.hour
    ),
    '[]'::jsonb
  )
  into v_hourly
  from (
    select
      h.hour,
      sum(h.registered)::integer as registered,
      sum(h.completed)::integer as completed,
      sum(h.skipped)::integer as skipped
    from analytics_hourly h
    where h.stat_date between p_from and p_to
    group by h.hour
  ) h;

  v_summary := v_summary || jsonb_build_object('peakHour', v_peak_hour);

  return jsonb_build_object(
    'summary', v_summary,
    'daily', v_daily,
    'hospitals', v_hospitals,
    'hourly', v_hourly
  );
end;
$$;

revoke all on function get_platform_analytics(date, date) from public, anon;
grant execute on function get_platform_analytics(date, date) to authenticated;
