-- Synthetic local-only fixtures. Never replace these with real member data.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'aron@example.test', crypt('local-only-password', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"language":"is"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bjarni@example.test', crypt('local-only-password', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"language":"is"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'noa@example.test', crypt('local-only-password', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"language":"en"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'moderator@example.test', crypt('local-only-password', gen_salt('bf')), now(), '{"provider":"email","providers":["email"],"role":"admin","display_name":"Sólveig"}', '{}', now(), now(), '', '', '', '')
on conflict (id) do nothing;

update public.profiles set
  display_name = case id
    when '10000000-0000-0000-0000-000000000001' then 'Aron'
    when '10000000-0000-0000-0000-000000000002' then 'Bjarni'
    when '10000000-0000-0000-0000-000000000003' then 'Nóa'
    else 'Sólveig'
  end,
  date_of_birth = case id
    when '10000000-0000-0000-0000-000000000001' then date '1997-04-12'
    when '10000000-0000-0000-0000-000000000002' then date '1995-02-18'
    when '10000000-0000-0000-0000-000000000003' then date '2001-11-04'
    else date '1990-01-01'
  end,
  pronouns = case when id = '10000000-0000-0000-0000-000000000003' then 'hán/háns' else 'hann/hans' end,
  identity_tags = case id
    when '10000000-0000-0000-0000-000000000003' then array['nonbinary', 'queer']
    else array['gay']
  end,
  looking_for = array['chat', 'dates'],
  bio = 'Synthetic local development profile.',
  region = 'hofudborgarsvaedid',
  terms_accepted_version = '2026-08-31', terms_accepted_at = now(),
  privacy_accepted_version = '2026-08-31', privacy_accepted_at = now(),
  guidelines_accepted_version = '2026-08-31', guidelines_accepted_at = now(),
  special_category_consent_at = now(), onboarding_completed_at = now(), last_active_at = now()
where id in (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003',
  '90000000-0000-0000-0000-000000000001'
);

insert into private.private_locations (
  profile_id, cell_center, verified_at, last_submission_at, rate_window_started_at, rate_window_count
)
values
  ('10000000-0000-0000-0000-000000000001', extensions.st_setsrid(extensions.st_makepoint(-21.94, 64.15), 4326)::extensions.geography, now(), now(), now(), 1),
  ('10000000-0000-0000-0000-000000000002', extensions.st_setsrid(extensions.st_makepoint(-21.93, 64.15), 4326)::extensions.geography, now(), now(), now(), 1),
  ('10000000-0000-0000-0000-000000000003', extensions.st_setsrid(extensions.st_makepoint(-21.91, 64.14), 4326)::extensions.geography, now(), now(), now(), 1)
on conflict (profile_id) do update set verified_at = now(), last_submission_at = now();

insert into public.profile_photos (
  id, profile_id, storage_path, position, approval_status, reviewed_at, reviewed_by
)
values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002/profile.jpg', 1, 'approved', now(), '90000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003/pending.jpg', 1, 'pending', null, null)
on conflict (id) do nothing;

insert into public.reports (
  id, reporter_id, reported_id, category, details, status
)
values (
  '50000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  'harassment', 'Synthetic report used to exercise the local moderation queue.', 'open'
)
on conflict (id) do nothing;
