-- Community engagement is independent of booking allowances and commerce.
create table private.community_follows (
 profile_id uuid not null references public.profiles(id) on delete cascade,
 target_type text not null check(target_type in ('event','series','host')),
 target_id uuid not null,
 notifications boolean not null default true,
 created_at timestamptz not null default now(),
 primary key(profile_id,target_type,target_id)
);
create index community_follows_target on private.community_follows(target_type,target_id);
create table private.community_settings (
 meetup_id uuid primary key references public.meetups(id) on delete cascade,
 cover_media_id uuid, -- Pending owned uploads are resolved only after verification.
 application_questions text[] not null default '{}' check(cardinality(application_questions)<=2)
);
alter table private.meetup_media add column poster_path text;
create table private.community_applications (
 meetup_id uuid not null references public.meetups(id) on delete cascade,
 profile_id uuid not null references public.profiles(id) on delete cascade,
 introduction text not null check(length(btrim(introduction)) between 1 and 1000),
 answers text[] not null default '{}', questions_snapshot text[] not null default '{}', rules_snapshot text not null default '', rules_accepted boolean not null check(rules_accepted),
 status text not null default 'pending' check(status in ('pending','approved','declined','joined')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(meetup_id,profile_id)
);
create table private.community_waitlist (
 meetup_id uuid not null references public.meetups(id) on delete cascade,
 profile_id uuid not null references public.profiles(id) on delete cascade,
 status text not null default 'waiting' check(status in ('waiting','offered','accepted','declined','expired')),
 queued_at timestamptz not null default clock_timestamp(), offer_expires_at timestamptz,
 primary key(meetup_id,profile_id)
);
create index community_waitlist_queue on private.community_waitlist(meetup_id,queued_at,profile_id) where status in ('waiting','offered');
create table private.community_announcements (
 id uuid primary key default gen_random_uuid(), meetup_id uuid not null references public.meetups(id) on delete cascade,
 audience text not null check(audience in ('followers','participants')),
 body text not null check(length(btrim(body)) between 1 and 4000), created_at timestamptz not null default now()
);
create index community_announcements_meetup on private.community_announcements(meetup_id,created_at desc);
create table private.community_deliveries (
 recipient_id uuid not null references public.profiles(id) on delete cascade,
 meetup_id uuid not null references public.meetups(id) on delete cascade,
 kind text not null, delivery_key text not null,
 primary key(recipient_id,meetup_id,kind,delivery_key)
);
alter table private.community_follows enable row level security;
alter table private.community_settings enable row level security;
alter table private.community_applications enable row level security;
alter table private.community_waitlist enable row level security;
alter table private.community_announcements enable row level security;
alter table private.community_deliveries enable row level security;
revoke all on private.community_follows,private.community_settings,private.community_applications,private.community_waitlist,private.community_announcements,private.community_deliveries from public,anon,authenticated,service_role;

create function private.community_require_actor() returns uuid language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=(select auth.uid());
begin
 perform private.assert_meetup_feature_enabled();
 if caller is null or not private.has_current_session() or not private.account_is_active() or not private.meetup_actor_is_active(caller) then
 raise exception using errcode='42501',message='active_account_required'; end if;
 return caller;
end $$;
create function private.community_follow_payload(p_type text,p_target uuid,p_viewer uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('count',count(*),'following',coalesce(bool_or(profile_id=p_viewer),false),
 'notifications',coalesce(bool_or(profile_id=p_viewer and notifications),true))
 from private.community_follows where target_type=p_type and target_id=p_target;
$$;
create function private.community_cover_payload(p_meetup uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',mm.id,'kind',mm.kind,'storagePath',mm.storage_path,'posterPath',mm.poster_path)
 from private.community_settings s join private.meetup_media mm on mm.id=s.cover_media_id and mm.meetup_id=s.meetup_id
 where s.meetup_id=p_meetup and private.meetup_diagnosis_eligible(p_meetup,(select auth.uid())) and not exists(select 1 from private.media_uploads u where u.id=mm.id and u.status<>'approved');
$$;
create function private.community_application_payload(p_meetup uuid,p_profile uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('profileId',a.profile_id,'displayName',p.display_name,'introduction',a.introduction,'answers',a.answers,
 'rulesAccepted',a.rules_accepted,'status',case when w.status='offered' then 'offered' when w.status='waiting' then 'waitlisted' else a.status end,'createdAt',a.created_at)
 from private.community_applications a join public.profiles p on p.id=a.profile_id
 left join private.community_waitlist w on w.meetup_id=a.meetup_id and w.profile_id=a.profile_id
 where a.meetup_id=p_meetup and a.profile_id=p_profile;
$$;
-- Only committed, unreversed sponsorship of this occurrence earns queue priority.
-- Read the ledger without taking its lock: commerce takes ledger then event locks.
create function private.community_sponsor_rank(p_meetup uuid,p_profile uuid) returns integer
language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from private.finance_state f,
 lateral jsonb_each(coalesce(f.state->'contributions','{}'::jsonb)) c
 where f.id and c.value->>'eventId'=p_meetup::text and c.value->>'memberId'=p_profile::text
 and coalesce((c.value->>'amount')::numeric,0)>0 and not coalesce((c.value->>'reversed')::boolean,false)
 and c.value->>'refundReason' is null) then 0 else 1 end;
$$;
revoke all on function private.community_sponsor_rank(uuid,uuid) from public,anon,authenticated,service_role;

create function private.community_state(p_meetup uuid,p_viewer uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin return (select jsonb_build_object('meetupId',m.id,'cover',private.community_cover_payload(m.id),'coverMediaId',case when m.host_id=p_viewer then s.cover_media_id else null end,
 'follows',jsonb_build_object('event',private.community_follow_payload('event',m.id,p_viewer),'host',private.community_follow_payload('host',m.host_id,p_viewer),
 'series',case when m.series_id is null then null else private.community_follow_payload('series',m.series_id,p_viewer) end),
 'canApply',m.access_mode='private' and m.starts_at>now() and m.host_id<>p_viewer and private.meetup_is_discoverable(m.id,p_viewer) and private.meetup_profile_eligible(m.id,p_viewer,true) and not exists(select 1 from public.meetup_participations where meetup_id=m.id and profile_id=p_viewer and status not in ('left','withdrawn','pending')),
 'canJoinWaitlist',m.capacity is not null and private.community_available_seats(m.id)=0 and private.community_queue_eligible(m.id,p_viewer),
 'applicationQuestions',coalesce(s.application_questions,'{}'::text[]),'ownApplication',private.community_application_payload(m.id,p_viewer),
 'waitlist',(select jsonb_build_object('status',w.status,'position',case when w.status='waiting' then (select count(*) from private.community_waitlist q where q.meetup_id=m.id and q.status='waiting' and (private.community_sponsor_rank(m.id,q.profile_id),q.queued_at,q.profile_id)<=(private.community_sponsor_rank(m.id,w.profile_id),w.queued_at,w.profile_id)) else null end,'offerExpiresAt',w.offer_expires_at)
 from private.community_waitlist w where w.meetup_id=m.id and w.profile_id=p_viewer and w.status in ('waiting','offered')))
 from public.meetups m left join private.community_settings s on s.meetup_id=m.id where m.id=p_meetup); end
$$;
-- Add summaries to discovery without ever exposing follower identities.
alter function private.meetup_payload(uuid,uuid,boolean) rename to meetup_payload_before_community_engagement;
create function private.meetup_payload(p_meetup_id uuid,p_viewer_id uuid,p_include_description boolean default true) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; reserved integer; cap integer;
begin
 result:=private.meetup_payload_before_community_engagement(p_meetup_id,p_viewer_id,p_include_description);
 select capacity into cap from public.meetups where id=p_meetup_id;
 select count(*) into reserved from private.community_waitlist where meetup_id=p_meetup_id and status='offered' and offer_expires_at>now();
 result:=result||jsonb_build_object('cover',private.community_cover_payload(p_meetup_id),'follows',private.community_state(p_meetup_id,p_viewer_id)->'follows','reservedPlaces',reserved);
 if cap is not null and reserved+(select count(*) from public.meetup_participations where meetup_id=p_meetup_id and status in ('joined','approved'))>=cap then
 result:=jsonb_set(jsonb_set(result,'{capabilities,canJoin}','false'),'{isFull}','true'); end if;
 return result;
end $$;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check(kind in (
 'meetup_joined','meetup_access_requested','meetup_request_approved','meetup_request_declined','meetup_materially_changed','meetup_cancelled',
 'meetup_participant_removed','meetup_participant_reinstated','meetup_moderated','meetup_confirmation_required','meetup_starts_soon','meetup_finish','direct_message','group_message',
 'community_published','community_announcement','community_waitlist_offer','community_reminder'));
create function private.community_notify(p_recipient uuid,p_meetup uuid,p_kind text,p_key text,p_payload jsonb default '{}') returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.meetup_actor_is_active(p_recipient) or exists(select 1 from public.meetups where id=p_meetup and private.meetup_block_exists(host_id,p_recipient)) then return; end if;
 insert into private.community_deliveries values(p_recipient,p_meetup,p_kind,p_key) on conflict do nothing;
 if found then perform private.enqueue_meetup_notification(p_recipient,p_kind,p_meetup,p_payload); end if;
end $$;
create function private.community_follower_recipients(p_meetup uuid,p_include_host boolean default false) returns setof uuid language sql stable security definer set search_path='' as $$
 select distinct f.profile_id from private.community_follows f join public.meetups m on m.id=p_meetup
 where f.notifications and (f.target_type='event' and f.target_id=m.id or f.target_type='series' and f.target_id=m.series_id or p_include_host and f.target_type='host' and f.target_id=m.host_id)
 and f.profile_id<>m.host_id and private.meetup_feature_is_enabled() and m.status in ('published','cancelled')
 and private.meetup_actor_is_active(f.profile_id) and private.meetup_actor_is_active(m.host_id) and not private.meetup_block_exists(m.host_id,f.profile_id)
 and private.meetup_diagnosis_eligible(m.id,f.profile_id)
 and exists(select 1 from public.profiles h join public.profiles v on v.id=f.profile_id where h.id=m.host_id and h.deletion_requested_at is null and v.deletion_requested_at is null and h.meetup_hosting_restricted_at is null and (not m.is_explicit or v.adult_content_opted_in_at is not null));
$$;
-- Existing material change/cancellation paths retain operational notices for attendees.
create or replace function private.notify_meetup_participants(p_meetup_id uuid,p_kind text,p_payload jsonb default '{}') returns void language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
 for recipient in select profile_id from public.meetup_participations where meetup_id=p_meetup_id and profile_id is not null and status in ('joined','approved')
 union select private.community_follower_recipients(p_meetup_id,false)
 loop perform private.enqueue_meetup_notification(recipient,p_kind,p_meetup_id,p_payload); end loop;
end $$;
create function private.community_publication_notice() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
 if new.status<>'published' or tg_op='UPDATE' and old.status='published' then return new; end if;
 for recipient in select private.community_follower_recipients(new.id,true) loop
 perform private.community_notify(recipient,new.id,'community_published','published'); end loop;
 return new;
end $$;
create trigger zz_community_publication after insert or update of status on public.meetups for each row execute function private.community_publication_notice();

create function private.community_available_seats(p_meetup uuid) returns integer language sql stable security definer set search_path='' as $$
 select greatest(0,coalesce(m.capacity,2147483647)-(select count(*) from public.meetup_participations where meetup_id=m.id and status in ('joined','approved'))::integer-
 (select count(*) from private.community_waitlist where meetup_id=m.id and status='offered' and offer_expires_at>now())::integer) from public.meetups m where m.id=p_meetup;
$$;
create function private.community_queue_eligible(p_meetup uuid,p_profile uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(exists(select 1 from public.meetups m where m.id=p_meetup and m.status='published' and m.starts_at>now()
 and m.host_id<>p_profile and private.meetup_actor_is_active(p_profile) and private.meetup_is_discoverable(m.id,p_profile)
 and private.meetup_profile_eligible(m.id,p_profile,true)
 and not exists(select 1 from public.meetup_participations where meetup_id=m.id and profile_id=p_profile and status in ('joined','approved','removed','declined'))
 and (m.access_mode<>'private' or exists(select 1 from private.community_applications a where a.meetup_id=m.id and a.profile_id=p_profile and a.status='approved'))),false);
$$;
create function private.community_promote(p_meetup uuid) returns integer language plpgsql security definer set search_path='' as $$
declare m public.meetups; candidate record; available integer; promoted integer:=0;
begin
 select * into m from public.meetups where id=p_meetup for update;
 if m.id is null then return 0; end if;
 update private.community_waitlist set offer_expires_at=least(offer_expires_at,m.starts_at) where meetup_id=m.id and status='offered';
 update private.community_waitlist set status='expired',offer_expires_at=null where meetup_id=m.id and status='offered'
 and (offer_expires_at<=now() or m.status<>'published' or m.starts_at<=now() or not private.community_queue_eligible(m.id,profile_id));
 if m.status<>'published' or m.starts_at<=now() then return 0; end if;
 available:=private.community_available_seats(m.id);
 for candidate in select profile_id from private.community_waitlist where meetup_id=m.id and status='waiting' order by private.community_sponsor_rank(m.id,profile_id),queued_at,profile_id for update loop
 exit when available<=0;
 if private.community_queue_eligible(m.id,candidate.profile_id) then
 update private.community_waitlist set status='offered',offer_expires_at=least(now()+interval '24 hours',m.starts_at) where meetup_id=m.id and profile_id=candidate.profile_id;
 perform private.community_notify(candidate.profile_id,m.id,'community_waitlist_offer',clock_timestamp()::text);
 available:=available-1; promoted:=promoted+1;
 end if;
 end loop;
 return promoted;
end $$;
-- Every old/new RSVP path shares the same row lock and reservation check.
create function private.community_guard_admission() returns trigger language plpgsql security definer set search_path='' as $$
declare m public.meetups;
begin
 if new.status not in ('joined','approved') or tg_op='UPDATE' and old.status in ('joined','approved') and old.meetup_id=new.meetup_id and old.profile_id=new.profile_id then return new; end if;
 select * into m from public.meetups where id=new.meetup_id for update;
 if not exists(select 1 from private.community_waitlist where meetup_id=new.meetup_id and profile_id=new.profile_id and status='accepted') then perform private.community_promote(new.meetup_id); end if;
 if private.community_available_seats(new.meetup_id)<=0 then raise exception using errcode='23514',message='meetup_full'; end if;
 return new;
end $$;
create trigger aa_community_admission before insert or update on public.meetup_participations for each row execute function private.community_guard_admission();
create function private.community_participation_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and old.status in ('joined','approved') and new.status not in ('joined','approved') then perform private.community_promote(new.meetup_id); end if;
 return new;
end $$;
create trigger zz_community_seats_released after update on public.meetup_participations for each row execute function private.community_participation_changed();

create function private.community_get_state_impl(p_meetup_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.community_require_actor();
begin
 perform private.get_meetup_impl(p_meetup_id);
 perform private.community_promote(p_meetup_id);
 return private.community_state(p_meetup_id,caller);
end $$;
create function private.community_set_follow_impl(p_target_type text,p_target_id uuid,p_following boolean,p_notifications boolean default true) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.community_require_actor(); allowed boolean;
begin
 if p_target_type not in ('host','event','series') or p_target_id is null or p_following is null then raise exception using errcode='22023',message='invalid_follow'; end if;
 -- Unfollowing remains possible after a target becomes unavailable.
 if not p_following then delete from private.community_follows where profile_id=caller and target_type=p_target_type and target_id=p_target_id;
 return private.community_follow_payload(p_target_type,p_target_id,caller); end if;
 if p_target_type='event' then allowed:=private.meetup_is_discoverable(p_target_id,caller);
 elsif p_target_type='series' then allowed:=exists(select 1 from public.meetups where series_id=p_target_id and private.meetup_is_discoverable(id,caller));
 else allowed:=p_target_id<>caller and not private.meetup_block_exists(caller,p_target_id) and private.meetup_actor_is_active(p_target_id)
 and (exists(select 1 from public.profiles where id=p_target_id and is_profile_visible) or exists(select 1 from public.meetups where host_id=p_target_id and private.meetup_is_discoverable(id,caller))); end if;
 if not coalesce(allowed,false) then raise exception using errcode='42501',message='follow_target_unavailable'; end if;
 insert into private.community_follows(profile_id,target_type,target_id,notifications) values(caller,p_target_type,p_target_id,coalesce(p_notifications,true))
 on conflict(profile_id,target_type,target_id) do update set notifications=excluded.notifications;
 return private.community_follow_payload(p_target_type,p_target_id,caller);
end $$;
create function private.community_list_following_impl() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=private.community_require_actor();
begin
 return coalesce((select jsonb_agg(private.meetup_payload(m.id,caller,false) order by m.starts_at,m.id) from public.meetups m where m.starts_at>now() and private.meetup_is_discoverable(m.id,caller)
 and exists(select 1 from private.community_follows f where f.profile_id=caller and (f.target_type='event' and f.target_id=m.id or f.target_type='series' and f.target_id=m.series_id or f.target_type='host' and f.target_id=m.host_id))),'[]');
end $$;
create function private.community_require_host(p_meetup uuid) returns void language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.community_require_actor();
begin
 perform 1 from public.meetups where id=p_meetup and host_id=caller and status in ('draft','published') for update;
 if not found or not private.meetup_current_user_can_host() then raise exception using errcode='42501',message='meetup_host_required'; end if;
end $$;
create function private.community_set_cover_impl(p_meetup_id uuid,p_media_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.community_require_host(p_meetup_id);
 if p_media_id is not null and not exists(select 1 from private.meetup_media mm where mm.meetup_id=p_meetup_id and mm.id=p_media_id
 and not exists(select 1 from private.media_uploads u where u.id=mm.id and u.status<>'approved'))
 and not exists(select 1 from private.media_uploads u where u.id=p_media_id and u.owner_id=(select auth.uid()) and u.target_type='meetup' and u.target_id=p_meetup_id and u.status in ('reserved','processing','approved')) then raise exception using errcode='42501',message='approved_event_media_required'; end if;
 insert into private.community_settings(meetup_id,cover_media_id) values(p_meetup_id,p_media_id) on conflict(meetup_id) do update set cover_media_id=excluded.cover_media_id;
end $$;
create function private.community_set_questions_impl(p_meetup_id uuid,p_questions text[]) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.community_require_host(p_meetup_id);
 if p_questions is null or cardinality(p_questions)>2 or exists(select 1 from unnest(p_questions) q where q is null or length(btrim(q)) not between 1 and 200) then raise exception using errcode='22023',message='invalid_application_questions'; end if;
 if exists(select 1 from private.community_applications where meetup_id=p_meetup_id) then raise exception using errcode='55000',message='application_questions_locked'; end if;
 insert into private.community_settings(meetup_id,application_questions) values(p_meetup_id,p_questions) on conflict(meetup_id) do update set application_questions=excluded.application_questions;
end $$;

create function private.community_apply_impl(p_meetup_id uuid,p_introduction text,p_answers text[],p_rules_accepted boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.community_require_actor(); m public.meetups; questions text[];
begin
 select * into m from public.meetups where id=p_meetup_id for update;
 if m.id is null or m.access_mode<>'private' or m.starts_at<=now() or not private.meetup_is_discoverable(m.id,caller) or m.host_id=caller then raise exception using errcode='42501',message='application_unavailable'; end if;
 select application_questions into questions from private.community_settings where meetup_id=m.id;
 if p_introduction is null or length(btrim(p_introduction)) not between 1 and 1000 or p_rules_accepted is distinct from true or p_answers is null
 or cardinality(p_answers)<>cardinality(coalesce(questions,'{}'::text[])) or exists(select 1 from unnest(p_answers) a where a is null or length(a)>1000) then raise exception using errcode='22023',message='invalid_application'; end if;
 if exists(select 1 from private.community_applications where meetup_id=m.id and profile_id=caller and status<>'pending') then raise exception using errcode='55000',message='application_already_decided'; end if;
 insert into private.community_applications(meetup_id,profile_id,introduction,answers,questions_snapshot,rules_snapshot,rules_accepted) values(m.id,caller,btrim(p_introduction),p_answers,coalesce(questions,'{}'::text[]),coalesce(m.event_profile->>'rules',''),true)
 on conflict(meetup_id,profile_id) do update set introduction=excluded.introduction,answers=excluded.answers,questions_snapshot=excluded.questions_snapshot,rules_snapshot=excluded.rules_snapshot,updated_at=now();
 if not exists(select 1 from public.meetup_participations where meetup_id=m.id and profile_id=caller and status='pending') then perform private.request_meetup_access_impl(m.id); end if;
 return private.community_application_payload(m.id,caller);
end $$;
create function private.community_list_applications_impl(p_meetup_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.community_require_host(p_meetup_id);
 return coalesce((select jsonb_agg(private.community_application_payload(p_meetup_id,a.profile_id) order by a.created_at,a.profile_id) from private.community_applications a
 where a.meetup_id=p_meetup_id and not private.meetup_block_exists((select auth.uid()),a.profile_id)),'[]');
end $$;
create function private.community_decide_application_impl(p_meetup_id uuid,p_profile_id uuid,p_approve boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.meetups; app private.community_applications;
begin
 perform private.community_require_host(p_meetup_id);
 select * into m from public.meetups where id=p_meetup_id;
 select * into app from private.community_applications where meetup_id=p_meetup_id and profile_id=p_profile_id for update;
 if app.profile_id is null or app.status<>'pending' or p_approve is null or m.status<>'published' or m.starts_at<=now() then raise exception using errcode='55000',message='pending_application_required'; end if;
 if p_approve and app.rules_snapshot is distinct from coalesce(m.event_profile->>'rules','') then raise exception using errcode='55000',message='application_rules_changed'; end if;
 if p_approve and (not private.meetup_profile_eligible(m.id,p_profile_id,true) or not private.meetup_is_discoverable(m.id,p_profile_id)) then raise exception using errcode='42501',message='meetup_participation_restricted'; end if;
 perform private.community_promote(m.id);
 if p_approve and private.community_available_seats(m.id)=0 then
 update private.community_applications set status='approved',updated_at=now() where meetup_id=m.id and profile_id=p_profile_id;
 insert into private.community_waitlist(meetup_id,profile_id) values(m.id,p_profile_id) on conflict(meetup_id,profile_id) do update set status='waiting',queued_at=clock_timestamp(),offer_expires_at=null;
 perform private.enqueue_meetup_notification(p_profile_id,'meetup_request_approved',m.id,'{"waitlisted":true}');
 else
 perform private.respond_to_meetup_request_before_community(m.id,p_profile_id,p_approve);
 update private.community_applications set status=case when p_approve then 'joined' else 'declined' end,updated_at=now() where meetup_id=m.id and profile_id=p_profile_id;
 end if;
 return private.community_application_payload(m.id,p_profile_id);
end $$;
-- Preserve historic requests, route enriched requests through waitlist-aware decisions.
alter function private.respond_to_meetup_request_impl(uuid,uuid,boolean) rename to respond_to_meetup_request_before_community;
create function private.respond_to_meetup_request_impl(p_meetup_id uuid,p_profile_id uuid,p_approve boolean) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.community_applications where meetup_id=p_meetup_id and profile_id=p_profile_id) then
 perform private.community_decide_application_impl(p_meetup_id,p_profile_id,p_approve);
 return private.meetup_request_payload(p_meetup_id,p_profile_id); end if;
 return private.respond_to_meetup_request_before_community(p_meetup_id,p_profile_id,p_approve);
end $$;
-- A current application-mode event cannot bypass its introduction and rules via old clients.
alter function private.request_meetup_access_impl(uuid) rename to request_meetup_access_before_community;
create function private.request_meetup_access_impl(p_meetup_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.meetups where id=p_meetup_id and event_profile->>'joinMode'='request')
 and not exists(select 1 from private.community_applications where meetup_id=p_meetup_id and profile_id=(select auth.uid()) and status='pending' and rules_accepted) then
 raise exception using errcode='22023',message='community_application_required'; end if;
 return private.request_meetup_access_before_community(p_meetup_id);
end $$;
create function private.community_waitlist_action_impl(p_meetup_id uuid,p_action text) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.community_require_actor(); m public.meetups; entry private.community_waitlist;
begin
 select * into m from public.meetups where id=p_meetup_id for update;
 if m.id is null then raise exception using errcode='P0002',message='meetup_not_found'; end if;
 if p_action in ('leave','decline') then
 update private.community_waitlist set status='declined',offer_expires_at=null where meetup_id=m.id and profile_id=caller and status in ('waiting','offered');
 perform private.community_promote(m.id);
 if private.community_event_visible(m.id,caller) or m.host_id=caller then return private.community_state(m.id,caller); else return null; end if; end if;
 perform private.get_meetup_impl(m.id);
 perform private.community_promote(m.id);
 if not private.community_queue_eligible(m.id,caller) then raise exception using errcode='42501',message='waitlist_not_eligible'; end if;
 if p_action='join' then
 if m.capacity is null or private.community_available_seats(m.id)>0 then raise exception using errcode='55000',message='meetup_has_available_places'; end if;
 insert into private.community_waitlist(meetup_id,profile_id) values(m.id,caller) on conflict(meetup_id,profile_id) do update set
 status=case when private.community_waitlist.status in ('waiting','offered') then private.community_waitlist.status else 'waiting' end,
 queued_at=case when private.community_waitlist.status in ('waiting','offered') then private.community_waitlist.queued_at else clock_timestamp() end,
 offer_expires_at=case when private.community_waitlist.status='offered' then private.community_waitlist.offer_expires_at else null end;
 elsif p_action='accept' then
 select * into entry from private.community_waitlist where meetup_id=m.id and profile_id=caller for update;
 if entry.status is distinct from 'offered' or entry.offer_expires_at<=now() then raise exception using errcode='55000',message='waitlist_offer_expired'; end if;
 -- Remove only this reservation; the admission trigger still counts every other offer.
 update private.community_waitlist set status='accepted',offer_expires_at=null where meetup_id=m.id and profile_id=caller;
 perform private.consume_meetup_participation_quota(m.id,caller);
 insert into public.meetup_participations(meetup_id,profile_id,status,requested_at,joined_at,responded_at,responded_by)
 values(m.id,caller,case when m.access_mode='private' then 'approved' else 'joined' end,case when m.access_mode='private' then now() end,now(),case when m.access_mode='private' then now() end,case when m.access_mode='private' then m.host_id end)
 on conflict(meetup_id,profile_id) where profile_id is not null do update set status=excluded.status,joined_at=now(),responded_at=excluded.responded_at,
 responded_by=excluded.responded_by,left_at=null,removed_at=null;
 update private.community_applications set status='joined',updated_at=now() where meetup_id=m.id and profile_id=caller;
 perform private.enqueue_meetup_notification(m.host_id,'meetup_joined',m.id,jsonb_build_object('profileId',caller));
 else raise exception using errcode='22023',message='invalid_waitlist_action'; end if;
 return private.community_state(m.id,caller);
end $$;
-- Old join calls must not consume an offered place without explicit acceptance.
alter function private.join_meetup_impl(uuid) rename to join_meetup_before_community;
create function private.join_meetup_impl(p_meetup_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.community_waitlist where meetup_id=p_meetup_id and profile_id=(select auth.uid()) and status in ('waiting','offered')) then raise exception using errcode='55000',message='waitlist_acceptance_required'; end if;
 return private.join_meetup_before_community(p_meetup_id);
end $$;

create function private.community_list_announcements_impl(p_meetup_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=private.community_require_actor();
begin
 perform private.get_meetup_impl(p_meetup_id);
 if not private.meetup_diagnosis_eligible(p_meetup_id,caller) then return '[]'::jsonb; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'meetupId',a.meetup_id,'body',a.body,'audience',a.audience,'createdAt',a.created_at) order by a.created_at desc,a.id)
 from private.community_announcements a join public.meetups m on m.id=a.meetup_id where a.meetup_id=p_meetup_id and
 (m.host_id=caller or a.audience='followers' or exists(select 1 from public.meetup_participations where meetup_id=m.id and profile_id=caller and status in ('joined','approved')))),'[]');
end $$;
create function private.community_publish_announcement_impl(p_meetup_id uuid,p_audience text,p_body text) returns jsonb language plpgsql security definer set search_path='' as $$
declare announcement private.community_announcements; recipient uuid;
begin
 perform private.community_require_host(p_meetup_id);
 if p_audience is null or p_audience not in ('followers','participants') or p_body is null or length(btrim(p_body)) not between 1 and 4000 then raise exception using errcode='22023',message='invalid_announcement'; end if;
 if exists(select 1 from private.community_announcements where meetup_id=p_meetup_id and created_at>now()-interval '1 minute') then raise exception using errcode='54000',message='announcement_rate_limited'; end if;
 insert into private.community_announcements(meetup_id,audience,body) values(p_meetup_id,p_audience,btrim(p_body)) returning * into announcement;
 for recipient in select profile_id from public.meetup_participations where meetup_id=p_meetup_id and status in ('joined','approved')
 union select f from private.community_follower_recipients(p_meetup_id,false) f where p_audience='followers'
 loop
 -- Body may include sensitive arrival details and therefore never enters the push payload.
 perform private.community_notify(recipient,p_meetup_id,'community_announcement',announcement.id::text,jsonb_build_object('announcementId',announcement.id,'audience',p_audience));
 end loop;
 return jsonb_build_object('id',announcement.id,'meetupId',announcement.meetup_id,'body',announcement.body,'audience',announcement.audience,'createdAt',announcement.created_at);
end $$;

-- Verified meetup video posters share their video's existing storage authorization.
alter function private.finish_media_impl(uuid,uuid,integer,integer,text,text,text) rename to finish_media_before_community;
create function private.finish_media_impl(p_id uuid,p_claim uuid,p_bytes integer,p_duration integer,p_path text,p_thumbnail text,p_reason text) returns boolean language plpgsql security definer set search_path='' as $$
declare job private.media_uploads; result boolean;
begin
 perform private.require_service_role();
 select * into job from private.media_uploads where id=p_id for update;
 if job.target_type='meetup' and job.media_type='video' then
 if p_thumbnail is not null and p_thumbnail is distinct from job.target_id::text||'/'||job.id::text||'-thumb.jpg' then raise exception 'invalid_verified_media'; end if;
 result:=private.finish_media_before_community(p_id,p_claim,p_bytes,p_duration,p_path,null,p_reason);
 if result and p_reason is null then update private.meetup_media set poster_path=p_thumbnail where id=p_id; end if;
 return result;
 end if;
 return private.finish_media_before_community(p_id,p_claim,p_bytes,p_duration,p_path,p_thumbnail,p_reason);
end $$;
alter function private.can_read_meetup_media(text) rename to can_read_meetup_media_before_community;
create function private.can_read_meetup_media(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select private.can_read_meetup_media_before_community(p_path) or exists(select 1 from private.meetup_media mm where mm.poster_path=p_path and private.can_read_meetup_media_before_community(mm.storage_path));
$$;
-- Renaming a function keeps the old OID in existing policy expressions. Rebind it.
drop policy meetup_media_read on storage.objects;
create policy meetup_media_read on storage.objects for select to authenticated
using(bucket_id='meetup-media' and (private.can_read_meetup_media(name) or private.can_write_meetup_media(name)));
create function private.community_cleanup_poster() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.poster_path is not null and not exists(select 1 from private.meetup_media where poster_path=old.poster_path) then
 insert into private.media_cleanup_jobs(bucket,name) values('meetup-media',old.poster_path) on conflict do nothing; end if;
 return old;
end $$;
create trigger community_media_poster_cleanup after delete on private.meetup_media for each row execute function private.community_cleanup_poster();
create function private.community_inherit_settings() returns trigger language plpgsql security definer set search_path='' as $$
declare root_id uuid; root_cover private.meetup_media; copied_id uuid;
begin
 if new.series_id is null or new.occurrence_index<=1 then return new; end if;
 select id into root_id from public.meetups where series_id=new.series_id and occurrence_index=1;
 select mm.* into root_cover from private.community_settings s join private.meetup_media mm on mm.id=s.cover_media_id where s.meetup_id=root_id;
 if root_cover.id is not null then
 select id into copied_id from private.meetup_media where meetup_id=new.id and storage_path=root_cover.storage_path;
 update private.meetup_media set poster_path=root_cover.poster_path where id=copied_id;
 end if;
 insert into private.community_settings(meetup_id,cover_media_id,application_questions)
 select new.id,copied_id,application_questions from private.community_settings where meetup_id=root_id on conflict do nothing;
 return new;
end $$;
create trigger zz_community_inherit after insert on public.meetups for each row execute function private.community_inherit_settings();

-- Use the existing service-role lifecycle worker; no second scheduler or device timer.
-- Suppress the legacy two-hour notice; the unified one-hour notice below replaces it.
alter function private.enqueue_meetup_notification(uuid,text,uuid,jsonb) rename to enqueue_meetup_notification_before_community;
create function private.enqueue_meetup_notification(p_recipient_id uuid,p_kind text,p_meetup_id uuid,p_payload jsonb default '{}') returns uuid language plpgsql security definer set search_path='' as $$
begin
 if p_kind='meetup_starts_soon' then return null; end if;
 return private.enqueue_meetup_notification_before_community(p_recipient_id,p_kind,p_meetup_id,p_payload);
end $$;
alter function private.process_hittumst_lifecycle_impl() rename to process_hittumst_lifecycle_before_community;
create function private.process_hittumst_lifecycle_impl() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; event record; recipient uuid; promoted integer:=0; reminder integer; key text;
begin
 perform private.require_service_role();
 if not pg_try_advisory_xact_lock(hashtextextended('hittumst-lifecycle',0)) then return jsonb_build_object('alreadyRunning',true); end if;
 result:=private.process_hittumst_lifecycle_before_community();
 for event in select distinct m.id from public.meetups m join private.community_waitlist w on w.meetup_id=m.id where w.status in ('waiting','offered') order by m.id loop
 promoted:=promoted+private.community_promote(event.id); end loop;
 for event in select id,starts_at from public.meetups where status='published' and starts_at>now() and starts_at<=now()+interval '24 hours' loop
 reminder:=case when event.starts_at<=now()+interval '1 hour' then 1 else 24 end;
 key:=event.starts_at::text||':'||reminder::text;
 for recipient in select profile_id from public.meetup_participations where meetup_id=event.id and status in ('joined','approved')
 union select private.community_follower_recipients(event.id,false) loop
 -- The confirmation request is already an operational 24-hour reminder.
 if reminder=24 and exists(select 1 from public.notifications where recipient_id=recipient and meetup_id=event.id and kind='meetup_confirmation_required' and created_at>=event.starts_at-interval '24 hours') then continue; end if;
 perform private.community_notify(recipient,event.id,'community_reminder',key,jsonb_build_object('hoursBefore',reminder));
 end loop;
 end loop;
 return result||jsonb_build_object('waitlistOffers',promoted);
end $$;
-- Past host reputation uses the same moderated covers as discovery cards.
alter function private.get_host_community_summary_impl(uuid) rename to get_host_community_summary_before_engagement;
create function private.get_host_community_summary_impl(p_host_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 result:=private.get_host_community_summary_before_engagement(p_host_id);
 result:=result||jsonb_build_object('followerCount',(private.community_follow_payload('host',p_host_id,(select auth.uid()))->'count'),
 'following',private.community_follow_payload('host',p_host_id,(select auth.uid()))->'following','notifications',private.community_follow_payload('host',p_host_id,(select auth.uid()))->'notifications');
 if jsonb_typeof(result->'pastGatherings')='array' then
 result:=jsonb_set(result,'{pastGatherings}',coalesce((select jsonb_agg(e||jsonb_build_object('cover',private.community_cover_payload((e->>'id')::uuid))) from jsonb_array_elements(result->'pastGatherings') e),'[]'));
 end if;
 return result;
end $$;


create function private.community_capacity_edit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.capacity is not null and new.capacity is distinct from old.capacity and new.capacity <
 (select count(*) from public.meetup_participations where meetup_id=new.id and status in ('joined','approved'))+
 (select count(*) from private.community_waitlist where meetup_id=new.id and status='offered' and offer_expires_at>now()) then
 raise exception using errcode='23514',message='capacity_conflicts_with_reserved_places'; end if;
 return new;
end $$;
create trigger community_capacity_edit before update of capacity on public.meetups for each row execute function private.community_capacity_edit();
create function private.community_remove_follow_target() returns trigger language plpgsql security definer set search_path='' as $$
begin
 delete from private.community_follows where target_id=old.id and target_type=case tg_table_name when 'profiles' then 'host' when 'meetup_series' then 'series' else 'event' end;
 return old;
end $$;
create trigger community_deleted_host after delete on public.profiles for each row execute function private.community_remove_follow_target();
create trigger community_deleted_event after delete on public.meetups for each row execute function private.community_remove_follow_target();
create trigger community_deleted_series after delete on public.meetup_series for each row execute function private.community_remove_follow_target();


-- Resolve and device delivery both reauthorize new notifications against current access.
alter function private.message_notification_access(uuid,uuid) rename to message_notification_access_before_community;
create function private.message_notification_access(p_notification_id uuid,p_recipient uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare n public.notifications; admitted boolean;
begin
 if not private.message_notification_access_before_community(p_notification_id,p_recipient) then return false; end if;
 select * into n from public.notifications where id=p_notification_id and recipient_id=p_recipient;
 if n.kind not like 'community_%' then return true; end if;
 if not private.community_event_visible(n.meetup_id,p_recipient) then return false; end if;
 admitted:=exists(select 1 from public.meetup_participations where meetup_id=n.meetup_id and profile_id=p_recipient and status in ('joined','approved'));
 if n.kind='community_waitlist_offer' then
 return exists(select 1 from private.community_waitlist where meetup_id=n.meetup_id and profile_id=p_recipient and status='offered' and offer_expires_at>now());
 elsif n.kind='community_announcement' then
 return exists(select 1 from private.community_announcements where id=(n.payload->>'announcementId')::uuid and meetup_id=n.meetup_id and (admitted or audience='followers' and p_recipient in (select private.community_follower_recipients(n.meetup_id,false))));
 elsif n.kind='community_reminder' then return admitted or p_recipient in(select private.community_follower_recipients(n.meetup_id,false));
 else return p_recipient in(select private.community_follower_recipients(n.meetup_id,true)); end if;
end $$;
revoke all on function private.message_notification_access_before_community(uuid,uuid),private.message_notification_access(uuid,uuid) from public,anon,authenticated,service_role;

create function public.community_get_state(p_meetup_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.community_get_state_impl(p_meetup_id);$$;
create function public.community_set_follow(p_target_type text,p_target_id uuid,p_following boolean,p_notifications boolean default true) returns jsonb language sql security invoker set search_path='' as $$select private.community_set_follow_impl(p_target_type,p_target_id,p_following,p_notifications);$$;
create function public.community_list_following() returns jsonb language sql stable security invoker set search_path='' as $$select private.community_list_following_impl();$$;
create function public.community_set_cover(p_meetup_id uuid,p_media_id uuid) returns void language sql security invoker set search_path='' as $$select private.community_set_cover_impl(p_meetup_id,p_media_id);$$;
create function public.community_set_questions(p_meetup_id uuid,p_questions text[]) returns void language sql security invoker set search_path='' as $$select private.community_set_questions_impl(p_meetup_id,p_questions);$$;
create function public.community_apply(p_meetup_id uuid,p_introduction text,p_answers text[],p_rules_accepted boolean) returns jsonb language sql security invoker set search_path='' as $$select private.community_apply_impl(p_meetup_id,p_introduction,p_answers,p_rules_accepted);$$;
create function public.community_list_applications(p_meetup_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.community_list_applications_impl(p_meetup_id);$$;
create function public.community_decide_application(p_meetup_id uuid,p_profile_id uuid,p_approve boolean) returns jsonb language sql security invoker set search_path='' as $$select private.community_decide_application_impl(p_meetup_id,p_profile_id,p_approve);$$;
create function public.community_waitlist_action(p_meetup_id uuid,p_action text) returns jsonb language sql security invoker set search_path='' as $$select private.community_waitlist_action_impl(p_meetup_id,p_action);$$;
create function public.community_publish_announcement(p_meetup_id uuid,p_audience text,p_body text) returns jsonb language sql security invoker set search_path='' as $$select private.community_publish_announcement_impl(p_meetup_id,p_audience,p_body);$$;
create function public.community_list_announcements(p_meetup_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.community_list_announcements_impl(p_meetup_id);$$;
-- Private implementation functions are granted only where an invoker wrapper needs them.
do $$ declare fn record; begin
 for fn in select p.oid::regprocedure as signature,p.proname,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private') and (p.proname in ('community_require_actor','community_follow_payload','community_cover_payload','community_application_payload','community_state','community_notify','community_follower_recipients','community_publication_notice','community_available_seats','community_queue_eligible','community_promote','community_guard_admission','community_participation_changed','community_get_state_impl','community_set_follow_impl','community_list_following_impl','community_require_host','community_set_cover_impl','community_set_questions_impl','community_apply_impl','community_list_applications_impl','community_decide_application_impl','community_waitlist_action_impl','community_list_announcements_impl','community_publish_announcement_impl','community_cleanup_poster','community_inherit_settings','community_capacity_edit','community_remove_follow_target','community_get_state','community_set_follow','community_list_following','community_set_cover','community_set_questions','community_apply','community_list_applications','community_decide_application','community_waitlist_action','community_publish_announcement','community_list_announcements') or p.proname in (
 'meetup_payload_before_community_engagement','meetup_payload','respond_to_meetup_request_before_community','respond_to_meetup_request_impl',
 'request_meetup_access_before_community','request_meetup_access_impl','join_meetup_before_community','join_meetup_impl',
 'finish_media_before_community','finish_media_impl','can_read_meetup_media_before_community','can_read_meetup_media',
 'enqueue_meetup_notification_before_community','enqueue_meetup_notification','process_hittumst_lifecycle_before_community','process_hittumst_lifecycle_impl',
 'get_host_community_summary_before_engagement','get_host_community_summary_impl')) loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',fn.signature);
 if fn.nspname='public' or fn.proname in ('community_get_state_impl','community_set_follow_impl','community_list_following_impl','community_set_cover_impl',
 'community_set_questions_impl','community_apply_impl','community_list_applications_impl','community_decide_application_impl','community_waitlist_action_impl',
 'community_publish_announcement_impl','community_list_announcements_impl','respond_to_meetup_request_impl','request_meetup_access_impl','join_meetup_impl','can_read_meetup_media','get_host_community_summary_impl') then
 execute format('grant execute on function %s to authenticated',fn.signature);
 elsif fn.proname in ('finish_media_impl','process_hittumst_lifecycle_impl') then execute format('grant execute on function %s to service_role',fn.signature); end if;
 end loop;
end $$;
notify pgrst,'reload schema';

