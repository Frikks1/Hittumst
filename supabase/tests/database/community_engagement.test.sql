begin;
set local search_path=extensions,public,private;
select no_plan();
insert into auth.sessions(id,user_id) select md5('pgtap-session:'||id::text)::uuid,id from auth.users on conflict do nothing;
update private.meetup_feature_config set enabled=true,expanded_launch_gates_passed=true where id=1;
update private.commerce_configuration set mode='sandbox';
insert into private.member_subscriptions(account_id,tier,paid_until,source) select id,'plebba_kongur',now()+interval '1 month','sandbox' from public.profiles
on conflict(account_id) do update set tier=excluded.tier,paid_until=excluded.paid_until;
create function pg_temp.member(p_id uuid) returns void language plpgsql as $$begin
 perform set_config('request.jwt.claim.sub',p_id::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_id,'session_id',md5('pgtap-session:'||p_id::text)::uuid,'role','authenticated')::text,true);
end $$;
create function pg_temp.event(p_n integer) returns uuid language sql immutable as $$select ('96000000-0000-0000-0000-'||lpad(p_n::text,12,'0'))::uuid$$;
insert into public.meetups(id,host_id,title,description,category,starts_at,access_mode,location_visibility,general_area,capacity,prohibited_services_attested_at,status,published_at)
select pg_temp.event(n),'10000000-0000-0000-0000-000000000001','Community test gathering','A synthetic gathering with no external participants','community',now()+interval '3 days','open','protected','reykjavik',1,now(),'published',now() from generate_series(1,4) n;
insert into private.meetup_locations(meetup_id,exact_point,discovery_point)
select id,st_setsrid(st_makepoint(-21.9511,64.1482),4326)::geography,st_setsrid(st_makepoint(-21.9511,64.1482),4326)::geography from public.meetups where id::text like '96000000-%';
update public.meetups set access_mode='private',event_profile='{"customTags":[],"rules":"Be kind","prerequisites":"","sections":[],"joinMode":"request","minAge":18,"maxAge":null,"ageLimits":[],"genderLimits":[]}' where id=pg_temp.event(2);
update public.meetups set event_profile='{"customTags":[],"rules":"","prerequisites":"","sections":[],"joinMode":"invite","minAge":18,"maxAge":null,"ageLimits":[],"genderLimits":[]}' where id=pg_temp.event(3);
select ok(not has_table_privilege('authenticated','private.community_follows','select'),'follower identities are inaccessible even to hosts');
select ok(not has_table_privilege('authenticated','private.community_applications','select'),'applications are not directly exposed');
select ok(not has_table_privilege('authenticated','private.community_waitlist','select'),'queue identities are private');
select ok(not has_function_privilege('authenticated','private.community_promote(uuid)','execute'),'clients cannot call internal promotion directly');
select ok(not has_function_privilege('anon','public.community_get_state(uuid)','execute'),'anonymous callers cannot inspect community state');
set local role authenticated;
select pg_temp.member('10000000-0000-0000-0000-000000000002');
select lives_ok($$select public.community_set_follow('event',pg_temp.event(1),true,true)$$,'follow event independently of joining');
select lives_ok($$select public.community_set_follow('host','10000000-0000-0000-0000-000000000001',true,true)$$,'follow creator independently');
select is(public.community_get_state(pg_temp.event(1))#>>'{follows,event,count}','1','follower count is public');
select ok((public.community_get_state(pg_temp.event(1))#>'{follows,event}')::text not like '%10000000%','follow metadata contains no identities');
select ok(exists(select 1 from jsonb_array_elements(public.community_list_following()) e where e->>'id'=pg_temp.event(1)::text),'Following view includes followed events');
reset role;
select is((select count(*) from private.meetup_join_reservations where meetup_id=pg_temp.event(1)),0::bigint,'following reserves no monthly attendance allowance');
select is((select count(*) from public.meetup_participations where meetup_id=pg_temp.event(1)),0::bigint,'following creates no RSVP');
set local role authenticated;
select pg_temp.member('10000000-0000-0000-0000-000000000002');
select lives_ok($$select public.join_meetup(pg_temp.event(1))$$,'public event has one confirmed attendee');
select pg_temp.member('10000000-0000-0000-0000-000000000003');
select is(public.community_get_state(pg_temp.event(1))->>'canJoinWaitlist','true','full public event permits eligible waitlist entry');
select lives_ok($$select public.community_waitlist_action(pg_temp.event(1),'join')$$,'eligible person can queue for full event');
select is(public.community_get_state(pg_temp.event(1))#>>'{waitlist,status}','waiting','queueing does not book an attendance');
select pg_temp.member('10000000-0000-0000-0000-000000000002');
select lives_ok($$select public.leave_meetup(pg_temp.event(1))$$,'departure releases a seat and offers to the queue');
select throws_ok($$select public.join_meetup(pg_temp.event(1))$$,'23514','meetup_full','legacy direct join cannot steal an offered place');
select pg_temp.member('10000000-0000-0000-0000-000000000003');
select is(public.community_get_state(pg_temp.event(1))#>>'{waitlist,status}','offered','released seat is offered rather than booked');
select throws_ok($$select public.join_meetup(pg_temp.event(1))$$,'55000','waitlist_acceptance_required','legacy join cannot silently accept an offer');
select lives_ok($$select public.community_waitlist_action(pg_temp.event(1),'accept')$$,'explicit acceptance confirms offered place');
reset role;
select is((select status from public.meetup_participations where meetup_id=pg_temp.event(1) and profile_id='10000000-0000-0000-0000-000000000003'),'joined','accepted offer records a normal participant');
select is((select count(*) from private.meetup_join_reservations where meetup_id=pg_temp.event(1) and released_at is null),1::bigint,'only accepted participation consumes the allowance');
-- Populate an application event at capacity without a fake new application.
insert into public.meetup_participations(meetup_id,profile_id,status,requested_at,responded_at,responded_by) values(pg_temp.event(2),'10000000-0000-0000-0000-000000000002','approved',now(),now(),'10000000-0000-0000-0000-000000000001');
set local role authenticated;
select pg_temp.member('10000000-0000-0000-0000-000000000001');
select lives_ok($$select public.community_set_questions(pg_temp.event(2),array['What would you like to do?'])$$,'host configures an application question');
select pg_temp.member('10000000-0000-0000-0000-000000000003');
select throws_ok($$select public.request_meetup_access(pg_temp.event(2))$$,'22023','community_application_required','legacy request cannot bypass introduction and rules');
select throws_ok($$select public.community_apply(pg_temp.event(2),'Hello',array['Play games'],false)$$,'22023','invalid_application','application requires explicit rules acceptance');
select lives_ok($$select public.community_apply(pg_temp.event(2),'I enjoy meeting people',array['Play games'],true)$$,'valid introduction and answers submit');
select throws_ok($$select public.community_list_applications(pg_temp.event(2))$$,'42501','meetup_host_required','applicants cannot see other applications');
select pg_temp.member('10000000-0000-0000-0000-000000000001');
select is(jsonb_array_length(public.community_list_applications(pg_temp.event(2))),1,'host sees application inbox');
select throws_ok($$select public.community_set_questions(pg_temp.event(2),array['A different question'])$$,'55000','application_questions_locked','questions cannot change after answers arrive');
reset role;
update public.meetups set event_profile=jsonb_set(event_profile,'{rules}','"Be kind and punctual"') where id=pg_temp.event(2);
set local role authenticated;
select pg_temp.member('10000000-0000-0000-0000-000000000001');
select throws_ok($$select public.community_decide_application(pg_temp.event(2),'10000000-0000-0000-0000-000000000003',true)$$,'55000','application_rules_changed','host cannot approve old acceptance after changing rules');
select pg_temp.member('10000000-0000-0000-0000-000000000003');
select is(public.community_get_state(pg_temp.event(2))->>'canApply','true','pending applicants can update their rule acceptance');
select lives_ok($$select public.community_apply(pg_temp.event(2),'I enjoy meeting people',array['Play games'],true)$$,'applicant explicitly accepts current rules again');
select pg_temp.member('10000000-0000-0000-0000-000000000001');
select lives_ok($$select public.community_decide_application(pg_temp.event(2),'10000000-0000-0000-0000-000000000003',true)$$,'approval when full queues applicant');
select pg_temp.member('10000000-0000-0000-0000-000000000003');
select is(public.community_get_state(pg_temp.event(2))#>>'{ownApplication,status}','waitlisted','approved full event is visibly waitlisted');
select throws_ok($$select public.community_waitlist_action(pg_temp.event(3),'join')$$,'42501','waitlist_not_eligible','invitation event cannot be queued without invitation');
select pg_temp.member('10000000-0000-0000-0000-000000000002');
select lives_ok($$select public.leave_meetup(pg_temp.event(2))$$,'departure offers approved applicant a place');
select pg_temp.member('10000000-0000-0000-0000-000000000003');
select lives_ok($$select public.community_waitlist_action(pg_temp.event(2),'accept')$$,'approved applicant explicitly accepts');
-- Announcements respect audience and never put sensitive text into notifications.
select pg_temp.member('10000000-0000-0000-0000-000000000001');
select lives_ok($$select public.community_publish_announcement(pg_temp.event(1),'participants','Private arrival code 4321')$$,'host sends participant-only announcement');
select pg_temp.member('10000000-0000-0000-0000-000000000002');
select is(jsonb_array_length(public.community_list_announcements(pg_temp.event(1))),0,'following does not expose participant-only content');
select pg_temp.member('10000000-0000-0000-0000-000000000003');
select is(jsonb_array_length(public.community_list_announcements(pg_temp.event(1))),1,'accepted participant reads arrival announcement');
reset role;
select ok(not exists(select 1 from public.notifications where meetup_id=pg_temp.event(1) and payload::text like '%4321%'),'push and in-app notification payloads omit announcement content');
select is((select count(*) from public.notifications where meetup_id=pg_temp.event(1) and kind='community_announcement'),1::bigint,'participant-only announcement notifies only admitted participant');
-- A removed/blocked participant must lose participant-only announcement access.
update public.meetup_participations set status='removed',removed_at=now() where meetup_id=pg_temp.event(1) and profile_id='10000000-0000-0000-0000-000000000003';
set local role authenticated;
select pg_temp.member('10000000-0000-0000-0000-000000000003');
select is(jsonb_array_length(public.community_list_announcements(pg_temp.event(1))),0,'removed participant loses arrival details');
-- Host and event overlap produces a single notice at publication.
reset role;
update public.meetups set status='draft',published_at=null where id=pg_temp.event(1);
update public.meetups set status='published',published_at=now() where id=pg_temp.event(1);
select is((select count(*) from public.notifications where meetup_id=pg_temp.event(1) and kind='community_published' and recipient_id='10000000-0000-0000-0000-000000000002'),1::bigint,'overlapping event and creator follows deduplicate publication notice');
-- Stale offers expire and free capacity without automatically booking anyone.
update private.community_waitlist set status='offered',offer_expires_at=now()-interval '1 second' where meetup_id=pg_temp.event(1) and profile_id='10000000-0000-0000-0000-000000000003';
select private.community_promote(pg_temp.event(1));
select is((select status from private.community_waitlist where meetup_id=pg_temp.event(1) and profile_id='10000000-0000-0000-0000-000000000003'),'expired','expired offer is released');

-- Pending covers are host choices but are never exposed as readable media.
set local role authenticated;
select pg_temp.member('10000000-0000-0000-0000-000000000001');
select set_config('test.community_video',public.reserve_media_upload('meetup',pg_temp.event(4),'video')::text,true);
select lives_ok($$select public.community_set_cover(pg_temp.event(4),(current_setting('test.community_video')::jsonb->>'id')::uuid)$$,'host may select a pending inspected-video cover');
select is(public.community_get_state(pg_temp.event(4))->'cover','null'::jsonb,'pending cover exposes neither video nor path');
insert into storage.objects(bucket_id,name,metadata) values('media-quarantine',current_setting('test.community_video')::jsonb->>'path','{"mimetype":"video/mp4","size":24}');
select set_config('test.community_claim',gen_random_uuid()::text,true);
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.claim_media_upload(current_setting('test.community_claim')::uuid);
select ok(public.finish_media_upload((current_setting('test.community_video')::jsonb->>'id')::uuid,current_setting('test.community_claim')::uuid,24,60000,
 pg_temp.event(4)::text||'/'||(current_setting('test.community_video')::jsonb->>'id')||'.mp4',
 pg_temp.event(4)::text||'/'||(current_setting('test.community_video')::jsonb->>'id')||'-thumb.jpg',null),'worker accepts a validated meetup video poster');
set local role authenticated;
select pg_temp.member('10000000-0000-0000-0000-000000000002');
select is(public.community_get_state(pg_temp.event(4))#>>'{cover,kind}','video','approved cover is exposed');
select ok(public.community_get_state(pg_temp.event(4))#>>'{cover,posterPath}' like '%-thumb.jpg','video cover includes private poster path');
select lives_ok($$select public.community_set_follow('event',pg_temp.event(4),true,true)$$,'event follower opts into reminders');
reset role;
update public.meetups set starts_at=now()+interval '20 hours' where id=pg_temp.event(4);
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.process_hittumst_lifecycle();
select public.process_hittumst_lifecycle();
reset role;
select is((select count(*) from public.notifications where meetup_id=pg_temp.event(4) and recipient_id='10000000-0000-0000-0000-000000000002' and kind='community_reminder'),1::bigint,'24-hour follower reminder is delivered once across retries and overlapping host follow');
update public.meetups set starts_at=now()+interval '50 minutes' where id=pg_temp.event(4);
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.process_hittumst_lifecycle();
select public.process_hittumst_lifecycle();
reset role;
select is((select count(*) from public.notifications where meetup_id=pg_temp.event(4) and recipient_id='10000000-0000-0000-0000-000000000002' and kind='community_reminder'),2::bigint,'one-hour reminder is independently deduplicated');
set local role authenticated;
select pg_temp.member('10000000-0000-0000-0000-000000000002');
select set_config('test.community_notice',(select id::text from public.notifications where meetup_id=pg_temp.event(4) and kind='community_reminder' order by created_at desc,id limit 1),true);
select is(public.resolve_notification(current_setting('test.community_notice')::uuid)->>'id',pg_temp.event(4)::text,'new community notification resolves to authorized event');
reset role;
select ok(private.message_notification_access(current_setting('test.community_notice')::uuid,'10000000-0000-0000-0000-000000000002'),'push delivery authorizes current follower');
insert into public.blocks(blocker_id,blocked_id) values('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001');
select ok(not private.message_notification_access(current_setting('test.community_notice')::uuid,'10000000-0000-0000-0000-000000000002'),'pending community push loses access after a block');
set local role authenticated;
select pg_temp.member('10000000-0000-0000-0000-000000000002');
select throws_ok($$select public.resolve_notification(current_setting('test.community_notice')::uuid)$$,'42501','notification_unavailable','notification navigation rechecks blocks');
reset role;
delete from public.blocks where blocker_id='10000000-0000-0000-0000-000000000002' and blocked_id='10000000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.member('10000000-0000-0000-0000-000000000001');
select lives_ok($$select public.cancel_meetup(pg_temp.event(4))$$,'host cancels followed event');
reset role;
select is((select count(*) from public.notifications where meetup_id=pg_temp.event(4) and recipient_id='10000000-0000-0000-0000-000000000002' and kind='meetup_cancelled'),1::bigint,'event followers receive cancellation even after event leaves discovery');
-- Committed event sponsors have priority; amounts never buy a higher tier.
reset role;
insert into public.meetups(id,host_id,title,description,category,starts_at,access_mode,location_visibility,general_area,capacity,prohibited_services_attested_at,status,published_at)
values(pg_temp.event(5),'10000000-0000-0000-0000-000000000001','Sponsor priority test','Synthetic waitlist ordering test','community',now()+interval '3 days','open','protected','reykjavik',1,now(),'published',now());
insert into private.meetup_locations(meetup_id,exact_point,discovery_point) select pg_temp.event(5),exact_point,discovery_point from private.meetup_locations where meetup_id=pg_temp.event(1);
insert into private.community_waitlist(meetup_id,profile_id,queued_at)
select pg_temp.event(5),case when n=4 then '90000000-0000-0000-0000-000000000001'::uuid else ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid end,now()+(n*interval '1 second') from generate_series(2,4) n;
update private.finance_state set state=jsonb_set(state,'{contributions}',coalesce(state->'contributions','{}')||jsonb_build_object(
 'priority-small',jsonb_build_object('id','priority-small','eventId',pg_temp.event(5),'memberId','10000000-0000-0000-0000-000000000003','amount',500,'reversed',false),
 'priority-large',jsonb_build_object('id','priority-large','eventId',pg_temp.event(5),'memberId','90000000-0000-0000-0000-000000000001','amount',5000,'reversed',false))) where id;
select ok(not has_function_privilege('authenticated','private.community_sponsor_rank(uuid,uuid)','execute'),'sponsor identities cannot be queried through queue ranking');
select is(private.community_state(pg_temp.event(5),'10000000-0000-0000-0000-000000000003')#>>'{waitlist,position}','1','sponsor precedes earlier nonsponsor');
select is(private.community_state(pg_temp.event(5),'90000000-0000-0000-0000-000000000001')#>>'{waitlist,position}','2','larger contribution does not overtake earlier sponsor');
select is(private.community_promote(pg_temp.event(5)),1,'only one place is reserved');
select is((select status from private.community_waitlist where meetup_id=pg_temp.event(5) and profile_id='10000000-0000-0000-0000-000000000003'),'offered','first sponsor receives offer');
update private.finance_state set state=jsonb_set(state,'{contributions,priority-large,reversed}','true') where id;
select is(private.community_state(pg_temp.event(5),'10000000-0000-0000-0000-000000000002')#>>'{waitlist,position}','1','reversal removes priority for future offers');
select is(private.community_promote(pg_temp.event(5)),0,'later sponsorship cannot displace a reserved offer');
select is(private.community_sponsor_rank(pg_temp.event(1),'10000000-0000-0000-0000-000000000003'),1,'sponsorship only gives priority at its own occurrence');
update private.community_waitlist set status='declined',offer_expires_at=null where meetup_id=pg_temp.event(5) and profile_id='10000000-0000-0000-0000-000000000003';
select is(private.community_promote(pg_temp.event(5)),1,'declined sponsor offer releases the place');
select is((select status from private.community_waitlist where meetup_id=pg_temp.event(5) and profile_id='10000000-0000-0000-0000-000000000002'),'offered','oldest nonsponsor is offered the released place');
select * from finish();
rollback;
