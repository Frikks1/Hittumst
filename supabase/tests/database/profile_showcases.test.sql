begin;
set local search_path=extensions,public,private;
select no_plan();
insert into auth.sessions(id,user_id) select md5('pgtap-session:'||id::text)::uuid,id from auth.users on conflict do nothing;
update private.meetup_feature_config set enabled=true,expanded_launch_gates_passed=true where id=1;
create function pg_temp.sc_member(p_n integer) returns void language plpgsql as $$
declare person uuid:=('10000000-0000-0000-0000-'||lpad(p_n::text,12,'0'))::uuid; begin
 perform set_config('request.jwt.claim.sub',person::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',person,'session_id',md5('pgtap-session:'||person::text)::uuid,'role','authenticated')::text,true); end $$;
create function pg_temp.sc_event(p_n integer) returns uuid language sql immutable as $$select ('97700000-0000-0000-0000-'||lpad(p_n::text,12,'0'))::uuid$$;
create function pg_temp.sc_entry(p_n integer,p_kind text default 'story',p_extra jsonb default '{}') returns jsonb language sql immutable as $$
select jsonb_build_object('id',('97800000-0000-0000-0000-'||lpad(p_n::text,12,'0'))::uuid,'kind',p_kind,'title','',
'body','Selected memories','meetupIds','[]'::jsonb,'review','','reviewIdentified',false,'rating',null,'showCount',false,'media','[]'::jsonb)||p_extra$$;
insert into public.meetup_series(id,host_id,title,frequency,interval_value,occurrence_count,status)
values('97900000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Synthetic weekly gathering','weekly',1,3,'published');
insert into public.meetups(id,host_id,title,description,category,starts_at,ends_at,access_mode,location_visibility,general_area,capacity,prohibited_services_attested_at,status,published_at,series_id,occurrence_index)
select pg_temp.sc_event(n),'10000000-0000-0000-0000-000000000001','Showcase occurrence '||n,'Synthetic gathering','community',now()-interval '2 days',now()-interval '1 day',
case when n=3 then 'private' else 'open' end,'protected','reykjavik',8,now(),'published',now(),
case when n in(1,2) then '97900000-0000-0000-0000-000000000001'::uuid else null end,case when n in(1,2) then n else null end from generate_series(1,4) n;
update public.meetups set starts_at=now()+interval '1 day',ends_at=now()+interval '2 days' where id=pg_temp.sc_event(4);
insert into private.community_attendance(meetup_id,profile_id,source)
select pg_temp.sc_event(n),p,'moderator' from generate_series(1,3) n cross join unnest(array[
'10000000-0000-0000-0000-000000000002'::uuid,'10000000-0000-0000-0000-000000000003'::uuid]) p;
insert into public.friendships(requester_id,addressee_id,status,responded_at)
values('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','accepted',now()) on conflict do nothing;
insert into public.groups(id,owner_id,name) values('97600000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Synthetic group');
insert into public.group_members(group_id,profile_id,role,status) values
('97600000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','owner','active'),
('97600000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','member','active');
select ok(not has_table_privilege('authenticated','private.profile_showcases','select'),'showcase raw data is private');
select ok(not has_table_privilege('authenticated','private.showcase_approvals','update'),'consent cannot be written directly');
select ok(not has_function_privilege('anon','public.showcase_list_own()','execute'),'anonymous users cannot read showcases');
select ok(not has_function_privilege('authenticated','private.showcase_payload(private.profile_showcases,boolean)','execute'),'unchecked payload builder is internal');
select is((select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname in('profile_showcases','showcase_approvals','showcase_media') and c.relrowsecurity),3::bigint,'all showcase tables enable RLS');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'showcase_%' and p.prosecdef),'public endpoints are security invokers');
set local role authenticated;
select pg_temp.sc_member(2);
select set_config('test.sc.story',(public.showcase_save(null,0,'passions','What I enjoy','','list',null,jsonb_build_array(pg_temp.sc_entry(1)))->>'id'),true);
select is((public.showcase_get(current_setting('test.sc.story')::uuid)->>'revision')::int,1,'new draft revision begins at one');
select is(public.showcase_get(current_setting('test.sc.story')::uuid)->>'status','draft','new showcase is private draft');
select lives_ok($$select public.showcase_publish(current_setting('test.sc.story')::uuid,'everyone',1)$$,'ordinary story can publish');
select is((public.showcase_get(current_setting('test.sc.story')::uuid)->>'revision')::int,2,'publish advances the revision');
select throws_ok($$select public.showcase_publish(current_setting('test.sc.story')::uuid,'everyone',1)$$,'40001','showcase_revision_conflict','stale clients cannot publish');
select pg_temp.sc_member(1);
select is(jsonb_array_length(public.showcase_list_profile('10000000-0000-0000-0000-000000000002')),0,'parked showcases are absent from peer profiles even when formerly published');
select throws_ok($$select public.showcase_delete(current_setting('test.sc.story')::uuid)$$,'42501','showcase_unavailable','peer cannot delete a showcase');
select pg_temp.sc_member(2);
select throws_ok($$select public.showcase_save(null,0,'hittingar','Unverified','','list',null,jsonb_build_array(pg_temp.sc_entry(2,'event',jsonb_build_object('meetupIds',jsonb_build_array(pg_temp.sc_event(4))))))$$,'22023','invalid_showcase_entry','future or unverified attendance is excluded');
select is(jsonb_array_length(public.showcase_pickers()->'events'),3,'attendance picker has only verified past occurrences');
select ok(exists(select 1 from jsonb_array_elements(public.showcase_pickers()->'requirementEvents') e where e->>'id'=pg_temp.sc_event(4)::text),'informational requirements can select an upcoming event');
select set_config('test.sc.people',(public.showcase_save(null,0,'people','Favorite people','','gallery',null,jsonb_build_array(pg_temp.sc_entry(3,'person',jsonb_build_object(
'personId','10000000-0000-0000-0000-000000000003','meetupIds',jsonb_build_array(pg_temp.sc_event(1)),'showCount',true))))->>'id'),true);
select lives_ok($$select public.showcase_publish(current_setting('test.sc.people')::uuid,'everyone',1)$$,'favorite person publication requests consent');
select pg_temp.sc_member(1);
select throws_ok($$select public.showcase_get(current_setting('test.sc.people')::uuid)$$,'42501','showcase_unavailable','all-pending showcase metadata is withheld');
select pg_temp.sc_member(3);
select is(jsonb_array_length(public.showcase_list_approvals()),2,'identity and full count approvals are separate');
select is((public.showcase_list_approvals()->0->'snapshot'->>'verifiedCount')::int,2,'approval preview shows full shared series count');
select set_config('test.sc.old_approval',(select value->>'id' from jsonb_array_elements(public.showcase_list_approvals()) where not (value->>'countOnly')::boolean),true);
select lives_ok($$select public.showcase_respond_approval((select (value->>'id')::uuid from jsonb_array_elements(public.showcase_list_approvals()) where not (value->>'countOnly')::boolean),'approve')$$,'featured friend can approve exact identity entry');
select pg_temp.sc_member(1);
select throws_ok($$select public.showcase_get(current_setting('test.sc.people')::uuid)$$,'42501','showcase_unavailable','parked showcase remains private: identity approval makes the entry visible');
select throws_ok($$select public.showcase_get(current_setting('test.sc.people')::uuid)$$,'42501','showcase_unavailable','parked showcase remains private: count stays omitted without its separate approval');
select pg_temp.sc_member(3);
select lives_ok($$select public.showcase_respond_approval((select (value->>'id')::uuid from jsonb_array_elements(public.showcase_list_approvals()) where (value->>'countOnly')::boolean),'approve')$$,'friend independently approves full count');
select pg_temp.sc_member(1);
select throws_ok($$select public.showcase_get(current_setting('test.sc.people')::uuid)$$,'42501','showcase_unavailable','parked showcase remains private: shared verified count includes unselected occurrences of selected series');
select throws_ok($$select public.showcase_get(current_setting('test.sc.people')::uuid)$$,'42501','showcase_unavailable','parked showcase remains private: curated projection contains no protected event data');
reset role;
insert into public.meetups(id,host_id,title,description,category,starts_at,ends_at,access_mode,location_visibility,general_area,prohibited_services_attested_at,status,published_at,series_id,occurrence_index)
values(pg_temp.sc_event(5),'10000000-0000-0000-0000-000000000001','Another occurrence','Synthetic gathering','community',now()-interval '3 days',now()-interval '2 days','open','protected','reykjavik',now(),'published',now(),'97900000-0000-0000-0000-000000000001',3);
insert into private.community_attendance(meetup_id,profile_id,source) values
(pg_temp.sc_event(5),'10000000-0000-0000-0000-000000000002','moderator'),(pg_temp.sc_event(5),'10000000-0000-0000-0000-000000000003','moderator');
set local role authenticated;
select pg_temp.sc_member(1);
select throws_ok($$select public.showcase_get(current_setting('test.sc.people')::uuid)$$,'42501','showcase_unavailable','parked showcase remains private: new visits do not expand the frozen published count');
reset role;
delete from private.community_attendance where meetup_id=pg_temp.sc_event(2) and profile_id='10000000-0000-0000-0000-000000000003';
set local role authenticated;
select pg_temp.sc_member(1);
select throws_ok($$select public.showcase_get(current_setting('test.sc.people')::uuid)$$,'42501','showcase_unavailable','parked showcase remains private: withdrawn snapshot contributor revokes the frozen count');
reset role;
insert into private.community_attendance(meetup_id,profile_id,source) values(pg_temp.sc_event(2),'10000000-0000-0000-0000-000000000003','moderator');
set local role authenticated;
select pg_temp.sc_member(3);
select lives_ok($$select public.showcase_respond_approval((select (value->>'id')::uuid from jsonb_array_elements(public.showcase_list_approvals()) where not (value->>'countOnly')::boolean),'revoke')$$,'person consent is revocable');
select pg_temp.sc_member(1);
select throws_ok($$select public.showcase_get(current_setting('test.sc.people')::uuid)$$,'42501','showcase_unavailable','revoking consent hides the whole now-empty showcase');
select pg_temp.sc_member(2);
select lives_ok($$select public.showcase_save(current_setting('test.sc.people')::uuid,2,'people','Updated favorite people','','gallery',null,
jsonb_build_array(pg_temp.sc_entry(3,'person',jsonb_build_object('personId','10000000-0000-0000-0000-000000000003','body','A revised description','meetupIds',jsonb_build_array(pg_temp.sc_event(1)),'showCount',true))))$$,'editing content creates a fresh draft');
select is((public.showcase_get(current_setting('test.sc.people')::uuid)->>'revision')::int,3,'editing increments revision');
select lives_ok($$select public.showcase_publish(current_setting('test.sc.people')::uuid,'friends',3)$$,'changing audience requires new revision consent');
select pg_temp.sc_member(3);
select throws_ok($$select public.showcase_respond_approval(current_setting('test.sc.old_approval')::uuid,'approve')$$,'42501','showcase_approval_unavailable','approval of a previous body or audience is stale');
select is(jsonb_array_length(public.showcase_list_approvals()),2,'inbox contains only exact current revision requests');
select pg_temp.sc_member(2);
select set_config('test.sc.private',(public.showcase_save(null,0,'hittingar','Selected private gathering','','list',null,jsonb_build_array(pg_temp.sc_entry(4,'event',jsonb_build_object(
'meetupIds',jsonb_build_array(pg_temp.sc_event(3)),'rating',5,'review','My chosen attributed review','reviewIdentified',true))))->>'id'),true);
select lives_ok($$select public.showcase_publish(current_setting('test.sc.private')::uuid,'everyone',1)$$,'private occurrence requests its host approval');
select pg_temp.sc_member(1);
select is((select count(*)::int from jsonb_array_elements(public.showcase_list_approvals()) where value->>'role'='host'),1,'host can inspect private contribution request');
select lives_ok($$select public.showcase_respond_approval((select (value->>'id')::uuid from jsonb_array_elements(public.showcase_list_approvals()) where value->>'role'='host'),'approve')$$,'host approves selected excerpt');
select throws_ok($$select public.showcase_get(current_setting('test.sc.private')::uuid)$$,'42501','showcase_unavailable','parked showcase remains private: selected occurrence title is safely projected');
reset role;
insert into private.media_uploads(id,owner_id,target_type,target_id,media_type,object_path,status,normalized_path)
values('97400000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','meetup',pg_temp.sc_event(3),'image',
'10000000-0000-0000-0000-000000000001/97400000-0000-0000-0000-000000000001','approved',pg_temp.sc_event(3)::text||'/97400000-0000-0000-0000-000000000001.jpg');
insert into private.meetup_media(id,meetup_id,storage_path,kind,position)
values('97400000-0000-0000-0000-000000000001',pg_temp.sc_event(3),pg_temp.sc_event(3)::text||'/97400000-0000-0000-0000-000000000001.jpg','photo',0);
insert into storage.objects(bucket_id,name) values('meetup-media',pg_temp.sc_event(3)::text||'/97400000-0000-0000-0000-000000000001.jpg');
set local role authenticated;
select pg_temp.sc_member(2);
select set_config('test.sc.reuse',(public.showcase_save(null,0,'hittingar','Selected media reuse','','gallery',null,jsonb_build_array(pg_temp.sc_entry(8,'event',jsonb_build_object(
'meetupIds',jsonb_build_array(pg_temp.sc_event(3)),'media',jsonb_build_array(jsonb_build_object('id','97400000-0000-0000-0000-000000000002','sourceUploadId','97400000-0000-0000-0000-000000000001','kind','photo','caption','Only this picture'))))))->>'id'),true);
select is((select count(*)::int from storage.objects where bucket_id='meetup-media' and name=pg_temp.sc_event(3)::text||'/97400000-0000-0000-0000-000000000001.jpg'),0,'selecting borrowed private gallery media in a draft does not unlock its bytes');
select lives_ok($$select public.showcase_publish(current_setting('test.sc.reuse')::uuid,'everyone',1)$$,'selected source reuse requests scoped consent');
select is((select count(*)::int from storage.objects where bucket_id='meetup-media' and name=pg_temp.sc_event(3)::text||'/97400000-0000-0000-0000-000000000001.jpg'),0,'pending source reuse cannot be signed by the showcase creator');
select pg_temp.sc_member(1);
select is((select value->'snapshot'->'media'->0->>'storagePath' from jsonb_array_elements(public.showcase_list_approvals()) where value->>'showcaseId'=current_setting('test.sc.reuse') and value->>'role'='media'),pg_temp.sc_event(3)::text||'/97400000-0000-0000-0000-000000000001.jpg','uploader preview contains the exact approved source bytes');
select lives_ok($$select public.showcase_respond_approval((select (value->>'id')::uuid from jsonb_array_elements(public.showcase_list_approvals()) where value->>'showcaseId'=current_setting('test.sc.reuse') and value->>'role'='host'),'approve')$$,'host can approve private context separately');
select throws_ok($$select public.showcase_get(current_setting('test.sc.reuse')::uuid)$$,'42501','showcase_unavailable','context approval cannot substitute for uploader reuse permission');
select lives_ok($$select public.showcase_respond_approval((select (value->>'id')::uuid from jsonb_array_elements(public.showcase_list_approvals()) where value->>'showcaseId'=current_setting('test.sc.reuse') and value->>'role'='media'),'approve')$$,'uploader approves only the selected source reuse');
select throws_ok($$select public.showcase_get(current_setting('test.sc.reuse')::uuid)$$,'42501','showcase_unavailable','parked showcase remains private: consented source renders chosen caption');
select pg_temp.sc_member(2);
select is((select count(*)::int from storage.objects where bucket_id='meetup-media' and name=pg_temp.sc_event(3)::text||'/97400000-0000-0000-0000-000000000001.jpg'),0,'parked showcases cannot unlock borrowed private event media after historical consent');
reset role;
update private.media_uploads set status='rejected' where id='97400000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.sc_member(1);
select throws_ok($$select public.showcase_get(current_setting('test.sc.reuse')::uuid)$$,'42501','showcase_unavailable','source moderation withdrawal revokes the entry');
select pg_temp.sc_member(3);
select is((select count(*)::int from storage.objects where bucket_id='meetup-media' and name=pg_temp.sc_event(3)::text||'/97400000-0000-0000-0000-000000000001.jpg'),0,'withdrawn source cannot be newly signed through a showcase');
select pg_temp.sc_member(2);
select set_config('test.sc.group',(public.showcase_save(null,0,'groups','My community','','list',null,jsonb_build_array(pg_temp.sc_entry(5,'group',jsonb_build_object(
'groupId','97600000-0000-0000-0000-000000000001','groupName','Custom community name','requirements',jsonb_build_object('minAge',21,'maxAge',60,'memberType','Plebb','meetupId',pg_temp.sc_event(4),'text','Informational joining guide')))))->>'id'),true);
select lives_ok($$select public.showcase_publish(current_setting('test.sc.group')::uuid,'everyone',1)$$,'active member requests group representation approval');
select pg_temp.sc_member(1);
select lives_ok($$select public.showcase_respond_approval((select (value->>'id')::uuid from jsonb_array_elements(public.showcase_list_approvals()) where value->>'role'='group'),'approve')$$,'group owner approves representation');
select throws_ok($$select public.showcase_get(current_setting('test.sc.group')::uuid)$$,'42501','showcase_unavailable','parked showcase remains private: requirements are explicitly display only');
select throws_ok($$select public.showcase_get(current_setting('test.sc.group')::uuid)$$,'42501','showcase_unavailable','parked showcase remains private: sponsorship requirements are absent from the group payload');
select pg_temp.sc_member(2);
select throws_ok($$select public.showcase_save(null,0,'groups','Bad ages','','list',null,jsonb_build_array(pg_temp.sc_entry(6,'group',jsonb_build_object('groupId','97600000-0000-0000-0000-000000000001','requirements',jsonb_build_object('minAge',60,'maxAge',21)))))$$,'22023','invalid_showcase_entry','inverted requirement ages are rejected');
select throws_ok($$select public.showcase_save(null,0,'groups','Bad sponsor','','list',null,jsonb_build_array(pg_temp.sc_entry(6,'group',jsonb_build_object('groupId','97600000-0000-0000-0000-000000000001','requirements',jsonb_build_object('minSponsorIsk',100)))))$$,'22023','invalid_showcase_entry','removed sponsorship requirement fields are rejected');
select throws_ok($$select public.showcase_save(null,0,'passions','Unsafe derived values','','list',null,jsonb_build_array(pg_temp.sc_entry(7)||'{"verifiedCount":999}'::jsonb))$$,'22023','invalid_showcase_entry','client cannot forge verified counts');
select set_config('test.sc.upload',public.showcase_reserve_media(current_setting('test.sc.story')::uuid,'97800000-0000-0000-0000-000000000001','photo','A selected picture')::text,true);
select is(public.showcase_get(current_setting('test.sc.story')::uuid)->'entries'->0->'media'->0->>'status','pending','owner sees quarantine upload progress');
select throws_ok($$select public.showcase_publish(current_setting('test.sc.story')::uuid,'everyone',3)$$,'42501','showcase_media_pending','unreviewed bytes cannot publish');
reset role;
update private.media_uploads set status='processing',claim_id='97500000-0000-0000-0000-000000000001',expires_at=now()+interval '10 minutes' where id=(current_setting('test.sc.upload')::jsonb->>'id')::uuid;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select ok(public.finish_media_upload((current_setting('test.sc.upload')::jsonb->>'id')::uuid,'97500000-0000-0000-0000-000000000001',100,null,
current_setting('test.sc.story')||'/'||(current_setting('test.sc.upload')::jsonb->>'id')||'.jpg',null,null),'existing media worker can approve a showcase photo');
reset role;
insert into storage.objects(bucket_id,name) values('showcase-media',current_setting('test.sc.story')||'/'||(current_setting('test.sc.upload')::jsonb->>'id')||'.jpg');
set local role authenticated;
select pg_temp.sc_member(2);
select is(public.showcase_get(current_setting('test.sc.story')::uuid)->'entries'->0->'media'->0->>'status','approved','owner refresh sees approved media');
select lives_ok($$select public.showcase_publish(current_setting('test.sc.story')::uuid,'friends',3)$$,'owner publishes moderated picture to friends');
select pg_temp.sc_member(1);
select is((select count(*)::int from storage.objects where bucket_id='showcase-media'),0,'nonfriend cannot sign friends-only showcase media');
select pg_temp.sc_member(3);
select is((select count(*)::int from storage.objects where bucket_id='showcase-media'),0,'accepted friends cannot sign parked showcase media');
select pg_temp.sc_member(2);
select lives_ok($$select public.showcase_unpublish(current_setting('test.sc.story')::uuid)$$,'unpublish revokes profile media access');
select pg_temp.sc_member(3);
select is((select count(*)::int from storage.objects where bucket_id='showcase-media'),0,'unpublished media cannot be newly signed by peer');
reset role;
update public.group_members set status='removed' where group_id='97600000-0000-0000-0000-000000000001' and profile_id='10000000-0000-0000-0000-000000000002';
set local role authenticated;
select pg_temp.sc_member(1);
select throws_ok($$select public.showcase_get(current_setting('test.sc.group')::uuid)$$,'42501','showcase_unavailable','leaving a group withdraws its showcase contribution');
reset role;
update private.media_uploads set status='approved' where id='97400000-0000-0000-0000-000000000001';
insert into public.groups(id,owner_id,name) values('97600000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Admin-approved group');
insert into public.group_members(group_id,profile_id,role,status) values
('97600000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','owner','active'),
('97600000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','member','active'),
('97600000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','admin','active');
set local role authenticated;
select pg_temp.sc_member(2);
-- Remove the earlier approved showcase's independent source grant before testing this pending request.
select public.showcase_unpublish(current_setting('test.sc.reuse')::uuid);
select set_config('test.sc.admin_group',(public.showcase_save(null,0,'groups','Admin representation','','list',null,jsonb_build_array(pg_temp.sc_entry(9,'group',jsonb_build_object(
'groupId','97600000-0000-0000-0000-000000000002','meetupIds',jsonb_build_array(pg_temp.sc_event(3)),
'media',jsonb_build_array(jsonb_build_object('id','97400000-0000-0000-0000-000000000003','sourceUploadId','97400000-0000-0000-0000-000000000001','kind','photo','caption','Chosen group photo'))))))->>'id'),true);
select lives_ok($$select public.showcase_publish(current_setting('test.sc.admin_group')::uuid,'everyone',1)$$,'member can request group admin review');
select pg_temp.sc_member(3);
select is((select count(*)::int from jsonb_array_elements(public.showcase_list_approvals()) a where a->>'showcaseId'=current_setting('test.sc.admin_group') and a->>'role'='group'),1,'active admin receives group request addressed originally to owner');
select is((select count(*)::int from storage.objects where bucket_id='meetup-media' and name=pg_temp.sc_event(3)::text||'/97400000-0000-0000-0000-000000000001.jpg'),0,'pending admin cannot sign another uploader media before exact reuse consent');
select lives_ok($$select public.showcase_respond_approval((select (value->>'id')::uuid from jsonb_array_elements(public.showcase_list_approvals()) where value->>'showcaseId'=current_setting('test.sc.admin_group') and value->>'role'='group'),'approve')$$,'active admin other than group owner can approve exact revision');
select is((select value->>'recipientId' from jsonb_array_elements(public.showcase_list_approvals()) where value->>'showcaseId'=current_setting('test.sc.admin_group') and value->>'role'='group'),'10000000-0000-0000-0000-000000000003','group consent identifies the actual approving admin');
select pg_temp.sc_member(1);
select public.showcase_respond_approval((value->>'id')::uuid,'approve') from jsonb_array_elements(public.showcase_list_approvals()) where value->>'showcaseId'=current_setting('test.sc.admin_group') and value->>'role' in('host','media');
select throws_ok($$select public.showcase_get(current_setting('test.sc.admin_group')::uuid)$$,'42501','showcase_unavailable','parked showcase remains private: admin and contributor approvals publish scoped group entry');
reset role;
update public.group_members set role='member' where group_id='97600000-0000-0000-0000-000000000002' and profile_id='10000000-0000-0000-0000-000000000003';
set local role authenticated;
select pg_temp.sc_member(1);
select throws_ok($$select public.showcase_get(current_setting('test.sc.admin_group')::uuid)$$,'42501','showcase_unavailable','approving admin authority loss withdraws group representation');
select pg_temp.sc_member(2);
select set_config('test.sc.score',(public.showcase_save(null,0,'hittingar','My personal score','','list',null,jsonb_build_array(pg_temp.sc_entry(10,'event',jsonb_build_object('meetupIds',jsonb_build_array(pg_temp.sc_event(1)),'rating',4))))->>'id'),true);
select lives_ok($$select public.showcase_publish(current_setting('test.sc.score')::uuid,'everyone',1)$$,'personal event rating can publish without written review');
select pg_temp.sc_member(1);
select throws_ok($$select public.showcase_get(current_setting('test.sc.score')::uuid)$$,'42501','showcase_unavailable','parked showcase remains private: personal showcase score is preserved independently of community feedback');
select pg_temp.sc_member(2);
select ok(not (select value?'posterPath' from jsonb_array_elements(public.showcase_pickers()->'media') where value->>'sourceUploadId'='97400000-0000-0000-0000-000000000001'),'photo source omits optional poster path instead of returning null');
select is((select value->>'meetupId' from jsonb_array_elements(public.showcase_pickers()->'media') where value->>'sourceUploadId'='97400000-0000-0000-0000-000000000001'),pg_temp.sc_event(3)::text,'source picker identifies its occurrence');
select ok(public.export_account()?&array['showcases','showcaseApprovals','showcaseMedia'],'account export includes showcase data and consent history');
select lives_ok($$select public.showcase_save(current_setting('test.sc.story')::uuid,5,'passions','What I enjoy','','list',null,jsonb_build_array(pg_temp.sc_entry(1)))$$,'removing owned attachment saves a fresh draft');
reset role;
select is((select count(*)::int from private.showcase_media where showcase_id=current_setting('test.sc.story')::uuid),0,'detached owned attachment is removed from approved content');
select ok(exists(select 1 from private.media_cleanup_jobs where bucket='showcase-media' and name=current_setting('test.sc.story')||'/'||(current_setting('test.sc.upload')::jsonb->>'id')||'.jpg'),'detached owned attachment queues normalized bytes');
select is((select status from private.media_uploads where id='97400000-0000-0000-0000-000000000001'),'approved','detaching owned media does not delete reused uploader originals');
set local role authenticated;
select pg_temp.sc_member(2);
select set_config('test.sc.detached_pending',public.showcase_reserve_media(current_setting('test.sc.story')::uuid,'97800000-0000-0000-0000-000000000001','video','Pending clip')::text,true);
reset role;
update private.media_uploads set status='processing',claim_id='97500000-0000-0000-0000-000000000002',expires_at=now()+interval '10 minutes'
where id=(current_setting('test.sc.detached_pending')::jsonb->>'id')::uuid;
set local role authenticated;
select pg_temp.sc_member(2);
select lives_ok($$select public.showcase_save(current_setting('test.sc.story')::uuid,7,'passions','What I enjoy','','list',null,jsonb_build_array(pg_temp.sc_entry(1)))$$,'owner can remove a pending processor attachment');
reset role;
select is((select status from private.media_uploads where id=(current_setting('test.sc.detached_pending')::jsonb->>'id')::uuid),'rejected','detached pending upload is cancelled');
select ok(exists(select 1 from private.media_cleanup_jobs where bucket='showcase-media' and name=current_setting('test.sc.story')||'/'||(current_setting('test.sc.detached_pending')::jsonb->>'id')||'.mp4' and available_at>=now()+interval '9 minutes'),'pending cleanup respects its previous processor lease');
set local role authenticated;
select pg_temp.sc_member(2);
select lives_ok($$select public.showcase_delete(current_setting('test.sc.story')::uuid)$$,'owner deletes showcase with moderated media');
reset role;
select ok(exists(select 1 from private.media_cleanup_jobs where bucket='showcase-media' and name=current_setting('test.sc.story')||'/'||(current_setting('test.sc.upload')::jsonb->>'id')||'.jpg'),'deletion queues normalized showcase bytes');
select ok(exists(select 1 from private.media_cleanup_jobs where bucket='media-quarantine' and name=current_setting('test.sc.upload')::jsonb->>'path'),'deletion preserves cleanup of quarantine input');
delete from auth.sessions where id=md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid;
set local role authenticated;
select pg_temp.sc_member(2);
select throws_ok($$select public.showcase_list_own()$$,'42501','active_account_required','expired auth session denies private showcase reads');
select throws_ok($$select public.showcase_save(null,0,'passions','No live session','','list',null,jsonb_build_array(pg_temp.sc_entry(11)))$$,'42501','active_account_required','expired auth session denies showcase writes');
reset role;
insert into auth.sessions(id,user_id) values(md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid,'10000000-0000-0000-0000-000000000002');
update public.profiles set is_profile_visible=false where id='10000000-0000-0000-0000-000000000002';
set local role authenticated;
select pg_temp.sc_member(1);
select is(jsonb_array_length(public.showcase_list_profile('10000000-0000-0000-0000-000000000002')),0,'hidden owner profile removes published showcase discovery');
select pg_temp.sc_member(2);
select ok(jsonb_array_length(public.showcase_list_own())>0,'hidden profile owner can still manage private drafts');
reset role;
update public.profiles set is_profile_visible=true where id='10000000-0000-0000-0000-000000000002';
insert into public.blocks(blocker_id,blocked_id) values('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001');
set local role authenticated;
select pg_temp.sc_member(1);
select is(jsonb_array_length(public.showcase_list_profile('10000000-0000-0000-0000-000000000002')),0,'blocking revokes showcase profile disclosure');
select finish();
rollback;
