-- =============================================================================
-- 005_sheet_export.sql
-- Doctor Queue System — bookkeeping for the Google Sheets export
--
-- The export runs as a Supabase Edge Function (see
-- `supabase/functions/daily-sheet-export/`). It needs one thing from the
-- database that the schema did not have: a way to know which finished entries
-- have already been copied to the Sheet, so a retry does not duplicate them.
--
-- `exported_at` is that marker. It is written only by the edge function, using
-- the service role; no RPC returns it, so it never reaches a patient's phone.
--
-- Safe to re-run.
-- =============================================================================

alter table queue_entries
  add column if not exists exported_at timestamptz;

comment on column queue_entries.exported_at is
  'When the Google Sheets export last copied this row. NULL = not yet exported. '
  'Written by the daily-sheet-export edge function; never shown in the UI.';

-- The incremental export runs every few minutes and looks only at finished rows
-- that have not been copied yet. A partial index keeps that lookup tiny no
-- matter how many years of history the table accumulates.
create index if not exists queue_entries_pending_export_idx
  on queue_entries (queue_date, doctor_id, token_number)
  where exported_at is null
    and status in ('COMPLETED', 'SKIPPED');
