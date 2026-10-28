-- =============================================================================
-- 013_security_hardening.sql
-- Doctor Queue System — settings and doctor deletion are enforced in the database
--
-- Run AFTER 012_i18n_content.sql. Safe to re-run.
--
-- Two gaps this closes:
--
--   1. Any authenticated staff member could update their hospital's settings by
--      calling PostgREST directly. The UI only showed Settings to an ADMIN, but
--      the database policy did not enforce that. Settings are now ADMIN-only.
--
--   2. The dashboard refused to delete a doctor who had queue history, but that
--      check lived only in the browser. A direct PostgREST DELETE cascaded
--      through queue_entries and destroyed the patient records. Direct DELETE is
--      revoked; deletion now goes through delete_doctor(), which checks the
--      caller's hospital and refuses when any queue entry exists.
--
-- Doctor creation and editing remain available to every staff member of the
-- hospital, as before. The RLS policy still scopes both to that hospital.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Hospital settings — ADMIN only
-- -----------------------------------------------------------------------------
drop policy if exists hospitals_staff_update on hospitals;
create policy hospitals_staff_update
  on hospitals for update
  to authenticated
  using (
    id = current_staff_hospital()
    and current_staff_role() = 'ADMIN'
  )
  with check (
    id = current_staff_hospital()
    and current_staff_role() = 'ADMIN'
  );

-- There is no INSERT policy for hospitals, so this grant could never succeed.
-- Revoke it explicitly so a future policy cannot accidentally expose creation.
revoke insert on hospitals from authenticated;


-- -----------------------------------------------------------------------------
-- 2. Doctor deletion — role-checked RPC, history checked inside the transaction
-- -----------------------------------------------------------------------------
-- Split the old `for all` policy so no policy grants DELETE. Direct INSERT and
-- UPDATE remain available to every staff member of the hospital.
drop policy if exists doctors_staff_write on doctors;

drop policy if exists doctors_staff_insert on doctors;
create policy doctors_staff_insert
  on doctors for insert
  to authenticated
  with check (hospital_id = current_staff_hospital());

drop policy if exists doctors_staff_update on doctors;
create policy doctors_staff_update
  on doctors for update
  to authenticated
  using (hospital_id = current_staff_hospital())
  with check (hospital_id = current_staff_hospital());

revoke delete on doctors from anon, authenticated;

create or replace function delete_doctor(p_doctor_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doctor  doctors%rowtype;
  v_history integer;
begin
  if p_doctor_id is null then
    raise exception 'DOCTOR_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_doctor from doctors d where d.id = p_doctor_id;
  if not found then
    raise exception 'DOCTOR_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not is_staff_of(v_doctor.hospital_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  -- Checked in the same transaction as the delete. The browser check remains as
  -- a fast, friendly refusal, but this is the guarantee.
  select count(*)::integer
    into v_history
    from queue_entries qe
   where qe.doctor_id = p_doctor_id;

  if v_history > 0 then
    raise exception 'DOCTOR_HAS_HISTORY' using errcode = 'P0001';
  end if;

  delete from doctors where id = p_doctor_id;
end;
$$;

revoke all on function delete_doctor(uuid) from public, anon, authenticated;
grant execute on function delete_doctor(uuid) to authenticated;
