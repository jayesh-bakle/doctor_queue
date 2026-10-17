-- =============================================================================
-- seed.sql
-- Doctor Queue System — sample data for local development and demos
--
-- Run AFTER all four migrations. Safe to re-run.
--
-- UUIDs are fixed so that QR codes, TV display URLs and printed posters stay
-- valid across database rebuilds.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Hospital
-- -----------------------------------------------------------------------------
insert into hospitals (id, name, address, phone, timezone, announcement_enabled, display_message, avg_consultation_minutes)
values (
  '11111111-1111-1111-1111-111111111111',
  'श्री गणेश हॉस्पिटल',
  'मुख्य रस्ता, शिवाजी नगर, पुणे, महाराष्ट्र ४११००५',
  '+91 20 1234 5678',
  'Asia/Kolkata',
  true,
  'कृपया आपल्या क्रमांकाची वाट पाहा.',
  10
)
on conflict (id) do update set
  name      = excluded.name,
  address   = excluded.address,
  phone     = excluded.phone,
  timezone  = excluded.timezone,
  display_message = excluded.display_message;

-- -----------------------------------------------------------------------------
-- Doctors
-- -----------------------------------------------------------------------------
insert into doctors (id, hospital_id, name, department, room_number, is_active, display_order)
values
  (
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    'डॉ. अमोल देशमुख',
    'सामान्य वैद्यक',
    '१',
    true,
    1
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    '11111111-1111-1111-1111-111111111111',
    'डॉ. स्वप्नील पाटील',
    'कान-नाक-घसा',
    '२',
    true,
    2
  )
on conflict (id) do update set
  name        = excluded.name,
  department  = excluded.department,
  room_number = excluded.room_number,
  is_active   = excluded.is_active;


-- =============================================================================
-- Staff accounts
-- =============================================================================
-- Postgres cannot create Supabase Auth users, so staff are created in two steps.
--
-- STEP 1 — Supabase Dashboard -> Authentication -> Users -> "Add user"
--          Enter an email and password, tick "Auto Confirm User", and copy the
--          new user's UUID.
--
-- STEP 2 — Run the statement below with that UUID:
--
--   insert into staff_users (id, hospital_id, full_name, role)
--   values (
--     '<paste-auth-user-uuid-here>',
--     '11111111-1111-1111-1111-111111111111',
--     'रिसेप्शन',
--     'RECEPTION'
--   )
--   on conflict (id) do update set
--     hospital_id = excluded.hospital_id,
--     full_name   = excluded.full_name,
--     role        = excluded.role;
--
-- Until a staff user exists, /staff/login will authenticate but the dashboard
-- will show an empty queue. That is the RLS policy working correctly: the user
-- is valid but is not yet attached to a hospital.
-- =============================================================================


-- =============================================================================
-- Sample queue data (development only)
-- =============================================================================
-- Registers a handful of patients for TODAY in the hospital's timezone, using
-- the real register_patient() function so token numbering, queue_date and
-- queue_events all behave exactly as they do in production.
--
-- Commented out by default. Uncomment to load, or just use the in-app demo
-- controls when running with VITE_DEMO_MODE=true.
-- -----------------------------------------------------------------------------
-- do $$
-- declare
--   v_names text[] := array['संदीप जाधव', 'अमोल पाटील', 'प्रिया शिंदे', 'राहुल मोरे', 'स्नेहा कुलकर्णी'];
--   v_name  text;
-- begin
--   foreach v_name in array v_names loop
--     perform register_patient(
--       '22222222-2222-2222-2222-222222222222',
--       v_name,
--       '9876543210',
--       'NEW'
--     );
--   end loop;
-- end $$;
