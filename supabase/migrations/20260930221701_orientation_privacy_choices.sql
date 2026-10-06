-- Keep legacy profile tags valid while requiring a privacy answer to stand alone.
-- This also protects direct profile updates and the older onboarding endpoint.
alter table public.profiles add constraint profiles_orientation_privacy_exclusive
  check (not identity_tags && array['not_applicable','prefer_not_to_say']::text[] or cardinality(identity_tags)=1);

create or replace function private.complete_onboarding_profile_impl(p_input jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); identity_values text[]; intent_values text[];
  video_values text[]; interest_values text[]; social_values jsonb; item jsonb;
begin
  if caller is null or not private.has_current_session() then raise exception using errcode='42501',message='active_session_required'; end if;
  perform 1 from public.profiles p where p.id=caller and p.deletion_requested_at is null
    and p.moderation_status<>'banned' and (p.moderation_status<>'suspended' or p.suspended_until<=now()) for update;
  if not found then raise exception using errcode='42501',message='account_unavailable'; end if;
  if p_input is null or jsonb_typeof(p_input)<>'object' then raise exception using errcode='22023',message='invalid_onboarding_input'; end if;
  if p_input->'sensitiveDataConsent' is distinct from 'true'::jsonb or p_input->'privacyAccepted' is distinct from 'true'::jsonb
    or p_input->'termsAccepted' is distinct from 'true'::jsonb or p_input->'guidelinesAccepted' is distinct from 'true'::jsonb then
    raise exception using errcode='22023',message='explicit_consent_required'; end if;
  if p_input->>'dateOfBirth' is null or char_length(btrim(coalesce(p_input->>'displayName',''))) not between 2 and 50
    or (p_input->>'locale') is null or (p_input->>'locale') not in ('is','en') then
    raise exception using errcode='22023',message='invalid_onboarding_profile'; end if;
  if jsonb_typeof(p_input->'identity') is distinct from 'array' or jsonb_typeof(p_input->'lookingFor') is distinct from 'array'
    or jsonb_typeof(coalesce(p_input->'videos','[]')) is distinct from 'array'
    or jsonb_typeof(coalesce(p_input->'interests','[]')) is distinct from 'array'
    or jsonb_typeof(coalesce(p_input->'socials','[]')) is distinct from 'array' then
    raise exception using errcode='22023',message='invalid_profile_customization'; end if;
  select array_agg(value) into identity_values from jsonb_array_elements_text(p_input->'identity');
  select array_agg(value) into intent_values from jsonb_array_elements_text(p_input->'lookingFor');
  select coalesce(array_agg(btrim(value)),'{}') into video_values from jsonb_array_elements_text(coalesce(p_input->'videos','[]'));
  select coalesce(array_agg(btrim(value)),'{}') into interest_values from jsonb_array_elements_text(coalesce(p_input->'interests','[]'));
  social_values:=coalesce(p_input->'socials','[]');
  if coalesce(cardinality(identity_values),0) not between 1 and 10
    or exists(select 1 from unnest(identity_values) value where value is null)
    or not identity_values <@ array['gay','bi','queer','trans','nonbinary','lesbian','not_applicable','prefer_not_to_say']
    or coalesce(cardinality(intent_values),0) not between 1 and 10 or not intent_values <@ array['chat','dates','friends','relationship'] then
    raise exception using errcode='22023',message='invalid_profile_identity'; end if;
  if identity_values && array['not_applicable','prefer_not_to_say']::text[] and cardinality(identity_values)<>1 then
    raise exception using errcode='22023',message='orientation_privacy_choice_exclusive'; end if;
  if cardinality(video_values)>3 or cardinality(interest_values)>12 or jsonb_array_length(social_values)>7
    or exists(select 1 from unnest(video_values)v where v is null or char_length(v)>2000 or v !~ '^https://[^[:space:]/?#]+')
    or exists(select 1 from unnest(interest_values)v where v is null or char_length(v) not between 1 and 80) then
    raise exception using errcode='22023',message='invalid_profile_customization'; end if;
  for item in select value from jsonb_array_elements(social_values) loop
    if jsonb_typeof(item)<>'object' or item->>'platform' is null or item->>'platform' not in ('instagram','tiktok','x','discord','steam','youtube','website')
      or char_length(btrim(coalesce(item->>'handle',''))) not between 1 and 500 then
      raise exception using errcode='22023',message='invalid_profile_social'; end if;
  end loop;
  perform private.complete_onboarding_impl(
    (p_input->>'dateOfBirth')::date,btrim(p_input->>'displayName'),nullif(btrim(p_input->>'pronouns'),''),identity_values,intent_values,
    p_input->>'bio',p_input->>'region','2026-08-31','2026-08-31','2026-08-31',true,p_input->>'locale');
  update public.profiles set videos=video_values,socials=social_values,interests=interest_values where id=caller;
end; $$;
revoke all on function private.complete_onboarding_profile_impl(jsonb) from public,anon,authenticated,service_role;
grant execute on function private.complete_onboarding_profile_impl(jsonb) to authenticated;
notify pgrst,'reload schema';
