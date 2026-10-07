-- =============================================================================
-- 001_initial_schema.sql
-- Doctor Queue System — tables, types, indexes, constraints
--
-- Safe to re-run: every statement is guarded, and nothing here drops data.
-- Run this FIRST, then 002_rls.sql, then 003_queue_functions.sql.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
do $$ begin
  create type patient_type as enum ('NEW', 'FOLLOWUP');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type queue_status as enum ('WAITING', 'CALLED', 'IN_CONSULTATION', 'COMPLETED', 'SKIPPED');
exception when duplicate_object then null;
end $$;

-- -----------------------------------------------------------------------------
-- hospitals
--
-- Single-hospital deployment, but modelled as a table so the name is
-- configurable (spec §17) and a second branch is a data change, not a rewrite.
-- -----------------------------------------------------------------------------
create table if not exists hospitals (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null default 'आपल्या रुग्णालयाचे नाव',
  address                text,
  phone                  text,
  -- The authoritative clock for "what day is it in the queue". Never the
  -- browser's timezone (spec §7).
  timezone               text not null default 'Asia/Kolkata',
  announcement_enabled   boolean not null default true,
  display_message        text not null default 'कृपया आपल्या क्रमांकाची वाट पाहा.',
  avg_consultation_minutes integer not null default 10
    check (avg_consultation_minutes between 1 and 240),
  created_at             timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- doctors
-- -----------------------------------------------------------------------------
create table if not exists doctors (
  id            uuid primary key default gen_random_uuid(),
  hospital_id   uuid not null references hospitals (id) on delete cascade,
  name          text not null check (length(btrim(name)) between 1 and 120),
  department    text not null default '',
  room_number   text not null default '',
  is_active     boolean not null default true,
  -- Reception rarely wants doctors in alphabetical order; let them arrange it.
  display_order integer not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists doctors_hospital_active_idx
  on doctors (hospital_id, is_active, display_order, name);

-- -----------------------------------------------------------------------------
-- queue_entries
--
-- The only table holding personal data. Deliberately narrow: name, an optional
-- mobile, and queue state. There is nowhere here to put a diagnosis, and that
-- is the point (spec §37).
-- -----------------------------------------------------------------------------
create table if not exists queue_entries (
  id           uuid primary key default gen_random_uuid(),
  -- Handed to the patient instead of the primary key. Random, unguessable, and
  -- reveals only the one record it names.
  public_id    uuid not null unique default gen_random_uuid(),
  hospital_id  uuid not null references hospitals (id) on delete cascade,
  doctor_id    uuid not null references doctors (id) on delete cascade,
  -- Denormalised on purpose: the day the token belongs to, resolved in the
  -- hospital's timezone at insert time. Stored rather than derived so that a
  -- past day's queue still reads correctly tomorrow.
  queue_date   date not null,
  token_number integer not null check (token_number > 0),
  patient_name text not null check (length(btrim(patient_name)) between 1 and 120),
  mobile       text check (mobile is null or mobile ~ '^[6-9][0-9]{9}$'),
  patient_type patient_type not null default 'NEW',
  status       queue_status not null default 'WAITING',
  created_at   timestamptz not null default now(),
  called_at    timestamptz,
  completed_at timestamptz,

  -- The structural guarantee behind spec §7: even if the allocation logic were
  -- wrong, the database physically cannot hold two patients with the same
  -- token for the same doctor on the same day.
  constraint queue_entries_unique_token unique (doctor_id, queue_date, token_number)
);

-- Serves the hot queries: the waiting list, the patients-ahead count, and the
-- current/next token lookup.
create index if not exists queue_entries_doctor_date_status_idx
  on queue_entries (doctor_id, queue_date, status, token_number);

create index if not exists queue_entries_date_idx
  on queue_entries (queue_date);

-- -----------------------------------------------------------------------------
-- staff_users
--
-- Credentials live in Supabase Auth (auth.users). This table only maps an auth
-- user to a hospital and a role — no password column exists anywhere (spec §18).
-- -----------------------------------------------------------------------------
create table if not exists staff_users (
  id          uuid primary key references auth.users (id) on delete cascade,
  hospital_id uuid not null references hospitals (id) on delete cascade,
  full_name   text not null default '',
  role        text not null default 'RECEPTION' check (role in ('RECEPTION', 'ADMIN')),
  created_at  timestamptz not null default now()
);

create index if not exists staff_users_hospital_idx on staff_users (hospital_id);

-- -----------------------------------------------------------------------------
-- queue_events
--
-- The privacy firewall. This table is broadcast to the public TV and to patient
-- phones, and it has NO name or mobile column — so no query, no bug, and no
-- future feature can leak a patient name onto the public display through it.
--
-- Rows are appended by trigger whenever a queue entry changes (see 003).
-- -----------------------------------------------------------------------------
create table if not exists queue_events (
  id            bigserial primary key,
  hospital_id   uuid not null references hospitals (id) on delete cascade,
  doctor_id     uuid not null references doctors (id) on delete cascade,
  queue_date    date not null,
  event_type    text not null default 'UPDATE',
  current_token integer,
  next_token    integer,
  waiting_count integer not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists queue_events_doctor_idx
  on queue_events (doctor_id, id desc);
