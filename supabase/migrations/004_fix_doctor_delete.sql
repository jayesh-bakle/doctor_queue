-- =============================================================================
-- 004 — let a doctor be deleted without the realtime trigger blocking it
--
-- `queue_entries_emit_event` runs AFTER DELETE on queue_entries and writes a
-- row to queue_events naming the doctor. Deleting a doctor cascades to their
-- queue_entries, and Postgres removes the parent row *before* the cascade
-- touches the children — so by the time the trigger fires, the doctor no
-- longer exists and the trigger's INSERT violates
-- `queue_events_doctor_id_fkey`:
--
--   ERROR 23503: insert or update on table "queue_events" violates foreign
--   key constraint "queue_events_doctor_id_fkey"
--
-- The cascade could never complete, which made `delete from doctors`
-- impossible for any doctor who had ever had a patient.
--
-- The fix is to skip the event when its doctor is gone. That is correct as
-- well as necessary: nobody is subscribed to a doctor who no longer exists,
-- so the event would have no audience even if it could be stored.
--
-- Applied idempotently, so it is safe to run more than once.
-- =============================================================================

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

  -- During a cascade delete from `doctors` the parent row is already removed,
  -- so this event is both unstorable and pointless. Stop here.
  --
  -- The same guard covers `delete from queue_entries`, which also fires this
  -- trigger: while the doctor still exists the event is written as before.
  if not exists (select 1 from doctors d where d.id = v_doctor_id) then
    return null;
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

-- The trigger definition itself is unchanged — only the function body needed
-- the guard — but it is repeated here so this migration is self-contained and
-- can be applied to any database that reached 003.
drop trigger if exists queue_entries_emit_event on queue_entries;
create trigger queue_entries_emit_event
  after insert or update or delete on queue_entries
  for each row execute function emit_queue_event();
