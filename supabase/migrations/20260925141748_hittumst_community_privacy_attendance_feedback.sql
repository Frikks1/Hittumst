-- Community privacy is independent of RSVP preferences and commerce.
create table private.community_attendance_codes (
  meetup_id uuid not null references public.meetups(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  primary key(meetup_id,code_hash)
);
create table private.community_attendance (
  meetup_id uuid references public.meetups(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  source text not null check (source in ('checkin','moderator')),
  recorded_at timestamptz not null default now(),
  primary key(meetup_id,profile_id)
);
create index community_attendance_profile on private.community_attendance(profile_id,meetup_id);
create table private.community_attendance_reviews (
  id uuid primary key default gen_random_uuid(),
  meetup_id uuid not null references public.meetups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check(length(btrim(reason)) between 20 and 2000),
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolution_reason text,
  unique(meetup_id,profile_id)
);
create index community_attendance_review_queue on private.community_attendance_reviews(status,created_at);
create table private.community_recommendations (
  id uuid primary key default gen_random_uuid(),
  meetup_id uuid not null,
  author_id uuid not null,
  recommended boolean not null,
  body text not null default '' check(length(body)<=2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(meetup_id,author_id) references private.community_attendance(meetup_id,profile_id) on delete cascade,
  unique(meetup_id,author_id)
);
create index community_recommendations_author on private.community_recommendations(author_id,meetup_id);
alter table private.community_attendance_codes enable row level security;
alter table private.community_attendance enable row level security;
alter table private.community_attendance_reviews enable row level security;
alter table private.community_recommendations enable row level security;
revoke all on private.community_attendance_codes,private.community_attendance,private.community_attendance_reviews,private.community_recommendations from public,anon,authenticated,service_role;

-- Keeping a personal profile hidden must not cancel its published gatherings.
create or replace function private.meetup_current_user_can_host() returns boolean
language sql stable security definer set search_path='' as $$
 select private.account_is_active() and private.meetup_feature_is_enabled()
   and private.meetup_actor_is_active((select auth.uid()))
   and exists(select 1 from public.profiles where id=(select auth.uid()) and meetup_hosting_restricted_at is null);
$$;
create or replace function private.propagate_profile_meetup_restriction() returns trigger
language plpgsql security definer set search_path='' as $$
declare event_row record; reason text;
begin
 if not private.meetup_actor_is_active(new.id) or new.deletion_requested_at is not null then
   update public.meetup_participations set status='removed',removed_at=now()
   where profile_id=new.id and status in ('joined','approved','pending');
 end if;
 if private.meetup_actor_is_active(new.id) and new.meetup_hosting_restricted_at is null and new.deletion_requested_at is null then return new; end if;
 reason:=case when new.special_category_consent_at is null then 'host_consent_withdrawn'
   when new.meetup_hosting_restricted_at is not null then 'host_restricted' else 'host_account_ineligible' end;
 for event_row in update public.meetups set status='moderation_hidden',moderation_reason=reason,cancelled_at=null
   where host_id=new.id and status='published' returning id,title loop
   perform private.capture_meetup_revision(event_row.id,'moderation_removed',(select auth.uid()));
   perform private.notify_meetup_participants(event_row.id,'meetup_moderated',jsonb_build_object('title',event_row.title,'state','hidden'));
 end loop;
 return new;
end; $$;
-- Do not auto-restore previously moderated events: only future visibility changes
-- stop hiding them. Existing moderation decisions remain intact.
create function private.community_event_visible(p_meetup uuid,p_viewer uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.meetup_feature_is_enabled() and private.meetup_actor_is_active(p_viewer)
   and exists(select 1 from public.meetups m join public.profiles h on h.id=m.host_id
     join public.profiles v on v.id=p_viewer
     where m.id=p_meetup and m.status='published' and h.deletion_requested_at is null
       and v.deletion_requested_at is null and h.meetup_hosting_restricted_at is null
       and private.meetup_actor_is_active(h.id) and not private.meetup_block_exists(h.id,p_viewer)
       and (not m.is_explicit or v.adult_content_opted_in_at is not null));
$$;
create or replace function private.meetup_is_discoverable(p_meetup_id uuid,p_viewer_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.community_event_visible(p_meetup_id,p_viewer_id)
   and exists(select 1 from public.meetups m join private.meetup_locations l on l.meetup_id=m.id
     where m.id=p_meetup_id and m.effective_end>=now());
$$;
-- The pre-expansion payload is the only remaining location gate tied to profile
-- visibility. Preserve every other condition in this security-sensitive helper.
do $$
declare source text;
begin
 source:=pg_get_functiondef('private.meetup_payload_before_hittumst(uuid,uuid,boolean)'::regprocedure);
 if position('and hp.is_profile_visible' in source)=0 then raise exception 'missing_host_visibility_location_guard'; end if;
 execute replace(source,'and hp.is_profile_visible','');
 source:=pg_get_functiondef('private.admin_moderate_meetup_impl(uuid,text,text,uuid)'::regprocedure);
 if position('and p.is_profile_visible' in source)=0 then raise exception 'missing_host_visibility_restore_guard'; end if;
 execute replace(source,'and p.is_profile_visible','');
end $$;

-- Old visibility columns are retained for old clients and exports, but cannot
-- make attendance public through any API, including direct writes.
create function private.community_private_participation() returns trigger
language plpgsql security definer set search_path='' as $$
begin new.rsvp_visibility:='private'; new.history_visibility:='private'; return new; end; $$;
create trigger community_private_participation before insert or update on public.meetup_participations
for each row execute function private.community_private_participation();
create function private.community_private_profile_rsvp() returns trigger
language plpgsql security definer set search_path='' as $$
begin new.meetup_rsvp_visibility_default:='private'; return new; end; $$;
create trigger community_private_profile_rsvp before insert or update of meetup_rsvp_visibility_default on public.profiles
for each row execute function private.community_private_profile_rsvp();
update public.profiles set meetup_rsvp_visibility_default='private' where meetup_rsvp_visibility_default<>'private';
update public.meetup_participations set rsvp_visibility='private',history_visibility='private'
where rsvp_visibility<>'private' or history_visibility<>'private';
create or replace function private.effective_rsvp_visibility(p_meetup public.meetups,p_participation public.meetup_participations)
returns text language sql immutable security definer set search_path='' as $$ select 'private'::text; $$;
create or replace function private.set_meetup_rsvp_visibility_impl(p_meetup_id uuid,p_visibility text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
 if p_visibility<>'private' then raise exception using errcode='22023',message='attendance_visibility_private'; end if;
 update public.meetup_participations set rsvp_visibility='private' where meetup_id=p_meetup_id and profile_id=(select auth.uid());
end; $$;
create or replace function private.set_meetup_history_visibility_impl(p_meetup_id uuid,p_visibility text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
 if p_visibility<>'private' then raise exception using errcode='22023',message='attendance_visibility_private'; end if;
 update public.meetup_participations set history_visibility='private' where meetup_id=p_meetup_id and profile_id=(select auth.uid());
end; $$;
create or replace function private.list_profile_meetup_history_impl(p_profile_id uuid,p_cursor timestamptz default null,p_limit integer default 50)
returns jsonb language sql stable security definer set search_path='' as $$ select '{"items":[],"nextCursor":null}'::jsonb; $$;
create or replace function private.list_profile_upcoming_meetups_impl(p_profile_id uuid,p_cursor timestamptz default null,p_limit integer default 50)
returns jsonb language sql stable security definer set search_path='' as $$ select '{"items":[],"nextCursor":null}'::jsonb; $$;
create or replace function private.list_public_meetup_roster_impl(p_meetup_id uuid,p_cursor uuid default null,p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); n integer:=least(greatest(coalesce(p_limit,50),1),50); result jsonb;
begin
 if not private.account_is_active() or not private.meetup_actor_is_active(caller) then raise exception using errcode='42501',message='account_unavailable'; end if;
 if not private.meetup_is_host(p_meetup_id,caller) then return '{"items":[],"nextCursor":null}'::jsonb; end if;
 if not private.meetup_current_user_can_host() then raise exception using errcode='42501',message='meetup_host_not_eligible'; end if;
 with candidates as (
   select mp.id,private.meetup_request_payload(mp.meetup_id,mp.profile_id) payload
   from public.meetup_participations mp where mp.meetup_id=p_meetup_id and mp.profile_id is not null
     and mp.status in ('joined','approved') and (p_cursor is null or mp.id>p_cursor) order by mp.id limit n+1
 ), page as (select * from candidates order by id limit n)
 select jsonb_build_object('items',coalesce((select jsonb_agg(payload order by id) from page),'[]'),
   'nextCursor',case when (select count(*) from candidates)>n then (select id::text from page order by id desc limit 1) else null end) into result;
 return result;
end; $$;

alter function private.meetup_payload(uuid,uuid,boolean) rename to meetup_payload_before_community_privacy;
create function private.meetup_payload(p_meetup_id uuid,p_viewer_id uuid,p_include_description boolean default true) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; host_row public.profiles%rowtype;
begin
 result:=private.meetup_payload_before_community_privacy(p_meetup_id,p_viewer_id,p_include_description);
 select p.* into host_row from public.profiles p join public.meetups m on m.host_id=p.id where m.id=p_meetup_id;
 result:=result||jsonb_build_object('rsvpVisibility','private');
 result:=jsonb_set(result,'{capabilities,canViewRoster}',to_jsonb(coalesce(host_row.id=p_viewer_id and private.meetup_current_user_can_host(),false)));
 if result ? 'viewerState' and result->'viewerState'<>'null'::jsonb then
   result:=jsonb_set(result,'{viewerState}',(result->'viewerState')||'{"rsvpVisibility":"private","historyVisibility":"private"}'::jsonb);
 end if;
 if host_row.id is not null then
   result:=jsonb_set(result,'{host}',(result->'host')||jsonb_build_object('profileVisible',host_row.is_profile_visible));
   if not host_row.is_profile_visible then result:=jsonb_set(result,'{host}',jsonb_build_object('id',host_row.id,'displayName',host_row.display_name,'profileVisible',false)); end if;
 end if;
 return result;
end; $$;
revoke all on function private.meetup_payload_before_community_privacy(uuid,uuid,boolean),private.meetup_payload(uuid,uuid,boolean) from public,anon,authenticated,service_role;

-- Rotating credentials confirm physical/online attendance without touching the
-- finance state, entitlement allowances, sponsorship settlement, or payouts.
create function private.create_meetup_attendance_code_impl(p_meetup_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.meetups%rowtype; code text; expiry timestamptz;
begin
 perform private.assert_meetup_feature_enabled();
 if not private.meetup_current_user_can_host() then raise exception using errcode='42501',message='meetup_host_required'; end if;
 select * into m from public.meetups where id=p_meetup_id and host_id=(select auth.uid()) for update;
 if m.id is null or m.status<>'published' then raise exception using errcode='42501',message='meetup_host_required'; end if;
 if now()<m.starts_at or now()>m.effective_end then raise exception using errcode='22023',message='attendance_checkin_closed'; end if;
 code:=upper(encode(extensions.gen_random_bytes(6),'hex'));
 expiry:=least(now()+interval '60 seconds',m.effective_end);
 delete from private.community_attendance_codes where meetup_id=m.id and expires_at<=now();
 insert into private.community_attendance_codes(meetup_id,code_hash,expires_at)
 values(m.id,encode(extensions.digest(code,'sha256'),'hex'),expiry)
 on conflict(meetup_id,code_hash) do nothing;
 return jsonb_build_object('code',code,'expiresAt',expiry);
end; $$;
create function private.record_meetup_attendance_impl(p_meetup_id uuid,p_code text) returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); m public.meetups%rowtype;
begin
 perform private.assert_meetup_feature_enabled();
 if not private.account_is_active() or not private.meetup_actor_is_active(caller) then raise exception using errcode='42501',message='account_unavailable'; end if;
 select * into m from public.meetups where id=p_meetup_id for update;
 if m.id is null or m.host_id=caller or not private.community_event_visible(m.id,caller)
   or not private.meetup_has_attendee_access(m.id,caller) then raise exception using errcode='42501',message='accepted_attendee_required'; end if;
 if now()<m.starts_at or now()>m.effective_end then raise exception using errcode='22023',message='attendance_checkin_closed'; end if;
 if not exists(select 1 from private.community_attendance_codes where meetup_id=m.id and expires_at>clock_timestamp()
   and code_hash=encode(extensions.digest(upper(regexp_replace(coalesce(p_code,''),'[[:space:]-]','','g')),'sha256'),'hex')) then
   raise exception using errcode='22023',message='invalid_attendance_code'; end if;
 insert into private.community_attendance(meetup_id,profile_id,source) values(m.id,caller,'checkin') on conflict do nothing;
end; $$;
create function private.request_meetup_attendance_review_impl(p_meetup_id uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); m public.meetups%rowtype;
begin
 perform private.assert_meetup_feature_enabled();
 if not private.account_is_active() or not private.meetup_actor_is_active(caller) then raise exception using errcode='42501',message='account_unavailable'; end if;
 select * into m from public.meetups where id=p_meetup_id;
 if m.id is null or m.host_id=caller or m.effective_end>now() or m.published_at is null
   or not exists(select 1 from public.meetup_participations where meetup_id=m.id and profile_id=caller
     and (status in ('joined','approved','left','removed') and (joined_at is not null or responded_at is not null))) then
   raise exception using errcode='42501',message='completed_participation_required'; end if;
 if exists(select 1 from private.community_attendance where meetup_id=m.id and profile_id=caller) then return; end if;
 if p_reason is null or length(btrim(p_reason)) not between 20 and 2000 then raise exception using errcode='22023',message='attendance_review_reason_required'; end if;
 insert into private.community_attendance_reviews(meetup_id,profile_id,reason) values(m.id,caller,btrim(p_reason))
 on conflict(meetup_id,profile_id) do update set reason=excluded.reason
 where community_attendance_reviews.status='pending';
end; $$;
create function private.staff_list_meetup_attendance_reviews_impl() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.account_is_active() or not private.is_admin() then raise exception using errcode='42501',message='staff_mfa_required'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'meetupId',r.meetup_id,'meetupTitle',m.title,
   'profileId',r.profile_id,'displayName',p.display_name,'reason',r.reason,'status',r.status,'createdAt',r.created_at) order by r.created_at)
   from private.community_attendance_reviews r join public.meetups m on m.id=r.meetup_id join public.profiles p on p.id=r.profile_id where r.status='pending'),'[]');
end; $$;
create function private.staff_resolve_meetup_attendance_review_impl(p_request_id uuid,p_approved boolean,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare request_row private.community_attendance_reviews%rowtype; caller uuid:=(select auth.uid());
begin
 if not private.account_is_active() or not private.is_admin() then raise exception using errcode='42501',message='staff_mfa_required'; end if;
 if p_approved is null or p_reason is null or length(btrim(p_reason)) not between 20 and 2000 then raise exception using errcode='22023',message='resolution_reason_required'; end if;
 select * into request_row from private.community_attendance_reviews where id=p_request_id for update;
 if request_row.id is null or request_row.status<>'pending' then raise exception using errcode='22023',message='attendance_review_not_pending'; end if;
 if request_row.profile_id=caller or exists(select 1 from public.meetups where id=request_row.meetup_id and host_id=caller) then raise exception using errcode='42501',message='independent_reviewer_required'; end if;
 update private.community_attendance_reviews set status=case when p_approved then 'approved' else 'rejected' end,
   resolved_at=now(),resolved_by=caller,resolution_reason=btrim(p_reason) where id=request_row.id;
 if p_approved then insert into private.community_attendance(meetup_id,profile_id,source) values(request_row.meetup_id,request_row.profile_id,'moderator') on conflict do nothing; end if;
 insert into private.admin_audit_log(actor_id,action,target_type,target_id,details)
 values(caller,'meetup.attendance_review','meetup',request_row.meetup_id::text,jsonb_build_object('requestId',request_row.id,'approved',p_approved,'reason',btrim(p_reason)));
end; $$;

-- Aggregate every verdict, independently of the displayed review page. Legacy
-- stars are kept as a separate historical metric and never converted into votes.
create function private.community_feedback_summary(p_meetups uuid[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
   'positive',(select count(*) from private.community_recommendations where meetup_id=any(p_meetups) and recommended),
   'negative',(select count(*) from private.community_recommendations where meetup_id=any(p_meetups) and not recommended),
   'total',(select count(*) from private.community_recommendations where meetup_id=any(p_meetups)),
   'legacyCount',(select count(*) from private.meetup_reviews where meetup_id=any(p_meetups)),
   'legacyAverage',(select round(avg(rating),2) from private.meetup_reviews where meetup_id=any(p_meetups)));
$$;
create function private.community_can_review(p_meetup uuid,p_author uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.community_attendance a join public.meetups m on m.id=a.meetup_id
   where a.meetup_id=p_meetup and a.profile_id=p_author and m.host_id<>p_author
     and m.published_at is not null and m.effective_end<=now() and m.status<>'moderation_hidden');
$$;
create function private.get_meetup_community_feedback_impl(p_meetup_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); m public.meetups%rowtype; reviews jsonb; own_review jsonb; series_events uuid[]; public_visible boolean;
begin
 perform private.assert_meetup_feature_enabled();
 if not private.account_is_active() or not private.meetup_actor_is_active(caller) then raise exception using errcode='42501',message='account_unavailable'; end if;
 select * into m from public.meetups where id=p_meetup_id;
 if m.id is null then raise exception using errcode='P0002',message='meetup_not_found'; end if;
 public_visible:=private.community_event_visible(m.id,caller) or (m.host_id=caller and private.meetup_current_user_can_host());
 if not public_visible and not exists(select 1 from private.community_attendance where meetup_id=m.id and profile_id=caller)
   and not exists(select 1 from private.meetup_reviews where meetup_id=m.id and author_id=caller) then
   raise exception using errcode='42501',message='meetup_not_visible'; end if;
 -- A blocked former attendee can manage their own feedback without regaining
 -- event/member content access. No individual recommendation is in public rows.
 if public_visible and private.meetup_diagnosis_eligible(m.id,caller) then
   select coalesce(jsonb_agg(payload order by created_at desc,id),'[]') into reviews from (
     select id,created_at,jsonb_build_object('id',id,'body',body,'createdAt',created_at,'legacyRating',null) payload
     from private.community_recommendations where meetup_id=m.id and body<>''
     union all
     select id,created_at,jsonb_build_object('id',id,'body',body,'createdAt',created_at,'legacyRating',rating) payload
     from private.meetup_reviews where meetup_id=m.id
     order by created_at desc,id limit 100
   ) rows;
 end if;
 select jsonb_build_object('recommended',recommended,'body',body) into own_review
 from private.community_recommendations where meetup_id=m.id and author_id=caller;
 if m.series_id is not null and public_visible then
   select array_agg(id) into series_events from public.meetups
   where series_id=m.series_id and effective_end<=now() and private.community_event_visible(id,caller);
 end if;
 return jsonb_build_object('summary',private.community_feedback_summary(case when public_visible then array[m.id] else '{}'::uuid[] end),
   'reviews',coalesce(reviews,'[]'::jsonb),'canReview',private.community_can_review(m.id,caller),'ownReview',own_review,
   'attendanceReviewStatus',(select status from private.community_attendance_reviews where meetup_id=m.id and profile_id=caller),
   'seriesSummary',case when m.series_id is not null and public_visible then private.community_feedback_summary(coalesce(series_events,'{}'::uuid[])) else null end);
end; $$;
create function private.save_meetup_recommendation_impl(p_meetup_id uuid,p_recommended boolean,p_body text default '') returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid());
begin
 perform private.assert_meetup_feature_enabled();
 if not private.account_is_active() or not private.meetup_actor_is_active(caller) then raise exception using errcode='42501',message='account_unavailable'; end if;
 perform 1 from public.meetups where id=p_meetup_id for share;
 if not private.community_can_review(p_meetup_id,caller) then raise exception using errcode='42501',message='recorded_attendance_required'; end if;
 if p_recommended is null or length(coalesce(p_body,''))>2000 then raise exception using errcode='22023',message='invalid_recommendation'; end if;
 insert into private.community_recommendations(meetup_id,author_id,recommended,body)
 values(p_meetup_id,caller,p_recommended,btrim(coalesce(p_body,'')))
 on conflict(meetup_id,author_id) do update set recommended=excluded.recommended,body=excluded.body,updated_at=now();
end; $$;
create function private.delete_meetup_recommendation_impl(p_meetup_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
 delete from private.community_recommendations where meetup_id=p_meetup_id and author_id=(select auth.uid());
end; $$;
create function private.get_host_community_summary_impl(p_host_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); host_row public.profiles%rowtype; event_ids uuid[]; past_events jsonb; upcoming_events jsonb;
begin
 perform private.assert_meetup_feature_enabled();
 if not private.account_is_active() or not private.meetup_actor_is_active(caller) then raise exception using errcode='42501',message='account_unavailable'; end if;
 select * into host_row from public.profiles where id=p_host_id;
 if host_row.id is null or not private.meetup_actor_is_active(p_host_id) or host_row.deletion_requested_at is not null
   or host_row.meetup_hosting_restricted_at is not null or private.meetup_block_exists(p_host_id,caller) then
   raise exception using errcode='42501',message='host_not_available'; end if;
 if not host_row.is_profile_visible and p_host_id<>caller and not exists(select 1 from public.meetups where host_id=p_host_id and private.community_event_visible(id,caller)) then
   raise exception using errcode='42501',message='host_not_available'; end if;
 select array_agg(id) into event_ids from public.meetups where host_id=p_host_id and effective_end<=now() and private.community_event_visible(id,caller);
 select coalesce(jsonb_agg(payload order by starts_at desc,id),'[]') into past_events from (
   select m.id,m.starts_at,jsonb_build_object('id',m.id,'title',m.title,'startsAt',m.starts_at,'cover',null,
     'feedback',private.community_feedback_summary(array[m.id])) payload from public.meetups m
   where m.id=any(coalesce(event_ids,'{}'::uuid[])) order by m.starts_at desc,m.id limit 50
 ) rows;
 select coalesce(jsonb_agg(payload order by starts_at,id),'[]') into upcoming_events from (
   select m.id,m.starts_at,private.meetup_payload(m.id,caller,false) payload from public.meetups m
   where m.host_id=p_host_id and m.starts_at>=now() and private.meetup_is_discoverable(m.id,caller)
   order by m.starts_at,m.id limit 50
 ) rows;
 return jsonb_build_object('hostId',p_host_id,'displayName',host_row.display_name,'profileVisible',host_row.is_profile_visible,
   'followerCount',0,'following',false,'notifications',false,'reputation',private.community_feedback_summary(coalesce(event_ids,'{}'::uuid[])),
   'pastGatherings',past_events,'upcomingGatherings',upcoming_events);
end; $$;

-- Public archive media obey the same moderation, blocks, adult preferences and
-- diagnosis restrictions as safe event archives. Quarantined media is not linked.
create or replace function private.can_read_meetup_media(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select private.account_is_active() and private.meetup_feature_is_enabled() and private.meetup_actor_is_active((select auth.uid()))
   and exists(select 1 from private.meetup_media mm join public.meetups m on m.id=mm.meetup_id
     where mm.storage_path=p_path and private.meetup_diagnosis_eligible(m.id,(select auth.uid())) and not private.meetup_block_exists(m.host_id,(select auth.uid()))
       and ((m.host_id=(select auth.uid()) and private.meetup_current_user_can_host()) or private.community_event_visible(m.id,(select auth.uid()))));
$$;
alter function private.get_meetup_impl(uuid) rename to get_meetup_before_community_archive;
create function private.get_meetup_impl(p_meetup_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
 if private.community_event_visible(p_meetup_id,(select auth.uid())) then
   return private.meetup_payload(p_meetup_id,(select auth.uid()),true);
 end if;
 return private.get_meetup_before_community_archive(p_meetup_id);
end; $$;
revoke all on function private.get_meetup_before_community_archive(uuid) from public,anon,authenticated,service_role;
revoke all on function private.get_meetup_impl(uuid) from public,anon,authenticated,service_role;
grant execute on function private.get_meetup_impl(uuid) to authenticated;

-- Old clients cannot keep writing stars or recover author identity through the
-- legacy action endpoint. Historical feedback remains labelled and anonymous.
alter function private.meetup_profile_action_impl(uuid,text,jsonb) rename to meetup_profile_action_before_community_feedback;
create function private.meetup_profile_action_impl(p_meetup_id uuid,p_action text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if p_action='reviews' then return private.get_meetup_community_feedback_impl(p_meetup_id)->'reviews'; end if;
 if p_action='review' then raise exception using errcode='22023',message='use_meetup_recommendation'; end if;
 if p_action='delete_review' then
   if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
   delete from private.meetup_reviews where meetup_id=p_meetup_id and author_id=(select auth.uid());
   return 'null'::jsonb;
 end if;
 return private.meetup_profile_action_before_community_feedback(p_meetup_id,p_action,p_input);
end; $$;
revoke all on function private.meetup_profile_action_before_community_feedback(uuid,text,jsonb),private.meetup_profile_action_impl(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.meetup_profile_action_impl(uuid,text,jsonb) to authenticated;

create function public.get_meetup_community_feedback(p_meetup_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.get_meetup_community_feedback_impl(p_meetup_id);$$;
create function public.save_meetup_recommendation(p_meetup_id uuid,p_recommended boolean,p_body text default '') returns void language sql security invoker set search_path='' as $$select private.save_meetup_recommendation_impl(p_meetup_id,p_recommended,p_body);$$;
create function public.delete_meetup_recommendation(p_meetup_id uuid) returns void language sql security invoker set search_path='' as $$select private.delete_meetup_recommendation_impl(p_meetup_id);$$;
create function public.get_host_community_summary(p_host_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.get_host_community_summary_impl(p_host_id);$$;
create function public.create_meetup_attendance_code(p_meetup_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.create_meetup_attendance_code_impl(p_meetup_id);$$;
create function public.record_meetup_attendance(p_meetup_id uuid,p_code text) returns void language sql security invoker set search_path='' as $$select private.record_meetup_attendance_impl(p_meetup_id,p_code);$$;
create function public.request_meetup_attendance_review(p_meetup_id uuid,p_reason text) returns void language sql security invoker set search_path='' as $$select private.request_meetup_attendance_review_impl(p_meetup_id,p_reason);$$;
create function public.staff_list_meetup_attendance_reviews() returns jsonb language sql stable security invoker set search_path='' as $$select private.staff_list_meetup_attendance_reviews_impl();$$;
create function public.staff_resolve_meetup_attendance_review(p_request_id uuid,p_approved boolean,p_reason text) returns void language sql security invoker set search_path='' as $$select private.staff_resolve_meetup_attendance_review_impl(p_request_id,p_approved,p_reason);$$;

revoke all on function private.community_event_visible(uuid,uuid),private.community_private_participation(),private.community_private_profile_rsvp(),
 private.community_feedback_summary(uuid[]),private.community_can_review(uuid,uuid) from public,anon,authenticated,service_role;
do $$
declare rpc text; args text;
begin
 for rpc,args in values
 ('get_meetup_community_feedback','uuid'),('save_meetup_recommendation','uuid,boolean,text'),('delete_meetup_recommendation','uuid'),
 ('get_host_community_summary','uuid'),('create_meetup_attendance_code','uuid'),('record_meetup_attendance','uuid,text'),
 ('request_meetup_attendance_review','uuid,text'),('staff_list_meetup_attendance_reviews',''),('staff_resolve_meetup_attendance_review','uuid,boolean,text') loop
   execute format('revoke all on function public.%I(%s),private.%I(%s) from public,anon,authenticated,service_role',rpc,args,rpc||'_impl',args);
   execute format('grant execute on function public.%I(%s),private.%I(%s) to authenticated',rpc,args,rpc||'_impl',args);
 end loop;
end $$;
notify pgrst,'reload schema';



-- Finance reads only real check-ins. Support-approved feedback eligibility must
-- never become payout evidence; settlement itself still owns financial policy.
create function private.community_checkin_receipts_impl(p_meetup_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_service_role();
 return coalesce((select jsonb_object_agg(profile_id::text,recorded_at) from private.community_attendance where meetup_id=p_meetup_id and source='checkin'),'{}'::jsonb);
end; $$;
create function public.community_checkin_receipts(p_meetup_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$select private.community_checkin_receipts_impl(p_meetup_id);$$;
revoke all on function private.community_checkin_receipts_impl(uuid),public.community_checkin_receipts(uuid) from public,anon,authenticated,service_role;
grant execute on function private.community_checkin_receipts_impl(uuid),public.community_checkin_receipts(uuid) to service_role;



-- The owner can always find their recorded gatherings for feedback, including
-- after a host removes or blocks them. This grants no participant/content access.
create function private.list_my_community_attendance_impl() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=(select auth.uid());
begin
 perform private.assert_meetup_feature_enabled();
 if not private.account_is_active() or not private.meetup_actor_is_active(caller) then raise exception using errcode='42501',message='account_unavailable'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('meetupId',m.id,'title',m.title,'effectiveEnd',m.effective_end,
   'canReview',private.community_can_review(m.id,caller)) order by m.effective_end desc,m.id)
 from public.meetups m where exists(select 1 from private.community_attendance a where a.meetup_id=m.id and a.profile_id=caller)
   or exists(select 1 from private.community_attendance_reviews r where r.meetup_id=m.id and r.profile_id=caller)),'[]'::jsonb);
end; $$;
create function public.list_my_community_attendance() returns jsonb
language sql stable security invoker set search_path='' as $$select private.list_my_community_attendance_impl();$$;
revoke all on function private.list_my_community_attendance_impl(),public.list_my_community_attendance() from public,anon,authenticated,service_role;
grant execute on function private.list_my_community_attendance_impl(),public.list_my_community_attendance() to authenticated;

create index community_attendance_reviews_profile on private.community_attendance_reviews(profile_id,meetup_id);
create index community_attendance_reviews_resolver on private.community_attendance_reviews(resolved_by) where resolved_by is not null;
notify pgrst,'reload schema';
