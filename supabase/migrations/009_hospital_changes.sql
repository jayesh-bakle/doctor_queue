-- =============================================================================
-- 009_hospital_changes.sql
-- Doctor Queue System — keep the shared TV in step with reception
--
-- Run AFTER 008_daily_token_cap.sql. Safe to re-run.
--
-- The TV reads active doctors through `get_public_hospital_queue()`, but its
-- Realtime subscription only hears `queue_events`. Adding, editing, reordering
-- or deactivating a doctor therefore did not change the TV until the next queue
-- event arrived.
--
-- Subscribing directly to `doctors` is not reliable here: the anon role only
-- sees active rows, so deactivations and deletes are filtered out by RLS before
-- Realtime can deliver them. This migration adds a tiny, PII-free signal table
-- instead. The TV receives an opaque "something changed" row and refetches the
-- active-doctor list through the existing RPC.
-- =============================================================================


-- =============================================================================
-- 1. The signal table
-- =============================================================================
-- Deliberately no foreign key on `hospital_id`. This is an ephemeral signal,
-- not history: a foreign key here would make the cascade from a hospital delete
-- try to insert a child row after its parent had already gone. Rows are pruned
-- after two days, and a stale signal is harmless.
create table if not exists hospital_changes (
  id          bigint generated always as identity primary key,
  hospital_id uuid not null,
  created_at  timestamptz not null default now()
);

create index if not exists hospital_changes_hospital_idx
  on hospital_changes (hospital_id, id desc);

create index if not exists hospital_changes_created_at_idx
  on hospital_changes (created_at);


-- =============================================================================
-- 2. RLS — readable by the public because it carries no public information
-- =============================================================================
alter table hospital_changes enable row level security;

drop policy if exists hospital_changes_public_read on hospital_changes;
create policy hospital_changes_public_read
  on hospital_changes for select
  to anon, authenticated
  using (true);

revoke all on hospital_changes from anon, authenticated;
grant select on hospital_changes to anon, authenticated;


-- =============================================================================
-- 3. Trigger on doctors
-- =============================================================================
-- Runs for every doctor change, including deactivation and deletion. The TV
-- does not use the row contents; the insert is only a prompt to refetch.
create or replace function emit_hospital_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hospital_id uuid;
begin
  if tg_op = 'DELETE' then
    v_hospital_id := old.hospital_id;
  else
    v_hospital_id := new.hospital_id;
  end if;

  insert into hospital_changes (hospital_id) values (v_hospital_id);
  return null;
end;
$$;

revoke all on function emit_hospital_change() from public, anon, authenticated;

drop trigger if exists doctors_emit_hospital_change on doctors;
create trigger doctors_emit_hospital_change
  after insert or update or delete on doctors
  for each row execute function emit_hospital_change();


-- =============================================================================
-- 4. Realtime publication
-- =============================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table hospital_changes;
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end if;
end $$;


-- =============================================================================
-- 5. Prune the signal table with the rest of the live feed
-- =============================================================================
-- A TV that has been offline longer than two days refetches on reconnect, so
-- old signal rows are no longer useful. Keep the existing return shape.
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

  delete from hospital_changes
   where created_at < now() - interval '2 days';

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
