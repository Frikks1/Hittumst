begin;
set local search_path=extensions,public,private;
select no_plan();
insert into auth.sessions(id,user_id) select md5('pgtap-session:'||id::text)::uuid,id from auth.users on conflict do nothing;
update private.meetup_feature_config set enabled=true,expanded_launch_gates_passed=true where id=1;
create function pg_temp.sv_member(p_n integer) returns void language plpgsql as $$
declare person uuid:=('10000000-0000-0000-0000-'||lpad(p_n::text,12,'0'))::uuid; begin
 perform set_config('request.jwt.claim.sub',person::text,true); perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',person,'session_id',md5('pgtap-session:'||person::text)::uuid,'role','authenticated')::text,true); end $$;
create function pg_temp.sv_id(p_n integer) returns uuid language sql immutable as $$select ('98100000-0000-0000-0000-'||lpad(p_n::text,12,'0'))::uuid$$;
create function pg_temp.sv_entry(p_n integer,p_kind text default 'story',p_extra jsonb default '{}') returns jsonb language sql immutable as $$
select jsonb_build_object('id',pg_temp.sv_id(p_n),'kind',p_kind,'title','Selected story','body','Curated text','meetupIds','[]'::jsonb,'review','',
'reviewIdentified',false,'rating',null,'showCount',false,'media','[]'::jsonb,'albumIds','[]'::jsonb,'showMembers',false)||p_extra$$;
insert into public.friendships(requester_id,addressee_id,status,responded_at) values
('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','accepted',now()),
('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','accepted',now()) on conflict do nothing;
insert into public.groups(id,owner_id,name) values
(pg_temp.sv_id(101),'10000000-0000-0000-0000-000000000002','Private audience group'),
(pg_temp.sv_id(102),'10000000-0000-0000-0000-000000000001','Another audience group');
insert into public.group_members(group_id,profile_id,role,status) values
(pg_temp.sv_id(101),'10000000-0000-0000-0000-000000000002','owner','active'),
(pg_temp.sv_id(101),'10000000-0000-0000-0000-000000000003','member','active'),
(pg_temp.sv_id(102),'10000000-0000-0000-0000-000000000001','owner','active'),
(pg_temp.sv_id(102),'10000000-0000-0000-0000-000000000002','member','active');
insert into public.albums(id,owner_id,name) values
(pg_temp.sv_id(201),'10000000-0000-0000-0000-000000000002','Private collection title'),
(pg_temp.sv_id(202),'10000000-0000-0000-0000-000000000001','Someone else collection');
insert into public.meetups(id,host_id,title,description,category,starts_at,ends_at,access_mode,location_visibility,general_area,prohibited_services_attested_at,status,published_at)
select pg_temp.sv_id(300+n),'10000000-0000-0000-0000-000000000001','Shared occurrence '||n,'Synthetic gathering','community',
now()-interval '2 days',now()-interval '1 day','open','protected','reykjavik',now(),'published',now() from generate_series(1,53) n;
insert into private.community_attendance(meetup_id,profile_id,source)
select pg_temp.sv_id(300+n),'10000000-0000-0000-0000-000000000002','moderator' from generate_series(1,53) n;
insert into private.community_attendance(meetup_id,profile_id,source)
select pg_temp.sv_id(300+n),'10000000-0000-0000-0000-000000000003','moderator' from generate_series(1,52) n;
select ok(not has_table_privilege('authenticated','private.showcase_group_member_preferences','update'),'member preferences require actor-bound RPC');
select ok(not has_function_privilege('authenticated','private.showcase_publish_impl(uuid,text,integer)','execute'),'legacy unscoped publisher cannot bypass target validation');
set local role authenticated;
select pg_temp.sv_member(2);
select set_config('test.sv.story',public.showcase_save(null,0,'passions','Scoped story','','list',null,jsonb_build_array(pg_temp.sv_entry(1)))->>'id',true);
select lives_ok($$select public.showcase_publish(current_setting('test.sv.story')::uuid,'group',1,pg_temp.sv_id(101),'{}')$$,'author can publish to an active joined group');
select is(public.showcase_get(current_setting('test.sv.story')::uuid)->>'audienceGroupName','Private audience group','owner receives authorized group label');
select pg_temp.sv_member(3);
select throws_ok($$select public.showcase_get(current_setting('test.sv.story')::uuid)$$,'42501','showcase_unavailable','parked showcase remains private: current member of selected audience group can read');
select throws_ok($$select public.showcase_get(current_setting('test.sv.story')::uuid)$$,'42501','showcase_unavailable','parked showcase remains private: peer receives no selected contact list');
select throws_ok($$select public.showcase_get(current_setting('test.sv.story')::uuid)$$,'42501','showcase_unavailable','parked showcase remains private: peer receives no raw sharing group target');
select pg_temp.sv_member(1);
select throws_ok($$select public.showcase_get(current_setting('test.sv.story')::uuid)$$,'42501','showcase_unavailable','outside-group viewer cannot read scoped story');
reset role;
update public.group_members set status='removed' where group_id=pg_temp.sv_id(101) and profile_id='10000000-0000-0000-0000-000000000003';
set local role authenticated;
select pg_temp.sv_member(3);
select throws_ok($$select public.showcase_get(current_setting('test.sv.story')::uuid)$$,'42501','showcase_unavailable','group membership removal withdraws audience access immediately');
reset role;
update public.group_members set status='active' where group_id=pg_temp.sv_id(101) and profile_id='10000000-0000-0000-0000-000000000003';
set local role authenticated;
select pg_temp.sv_member(2);
select lives_ok($$select public.showcase_publish(current_setting('test.sv.story')::uuid,'people',2,null,array['10000000-0000-0000-0000-000000000003'::uuid])$$,'author can publish to explicitly selected contact');
select pg_temp.sv_member(3);
select throws_ok($$select public.showcase_get(current_setting('test.sv.story')::uuid)$$,'42501','showcase_unavailable','parked showcase remains private: selected contact can read');
select pg_temp.sv_member(1);
select throws_ok($$select public.showcase_get(current_setting('test.sv.story')::uuid)$$,'42501','showcase_unavailable','other accepted friend is not implicitly a selected recipient');
select pg_temp.sv_member(2);
select lives_ok($$select public.showcase_publish(current_setting('test.sv.story')::uuid,'no_one',3)$$,'author can publish privately to no one');
select pg_temp.sv_member(3);
select throws_ok($$select public.showcase_get(current_setting('test.sv.story')::uuid)$$,'42501','showcase_unavailable','no-one audience remains private to author');
select pg_temp.sv_member(2);
select throws_ok($$select public.showcase_publish(current_setting('test.sv.story')::uuid,'people',4,null,'{}')$$,'22023','invalid_showcase_audience_scope','specific-people audience requires recipients');
select throws_ok($$select public.showcase_publish(current_setting('test.sv.story')::uuid,'group',4,null,'{}')$$,'22023','invalid_showcase_audience_scope','group audience requires a selected active group');
select throws_ok($$select public.showcase_publish(current_setting('test.sv.story')::uuid,'everyone',4,pg_temp.sv_id(101),'{}')$$,'22023','invalid_showcase_audience_scope','broad audience cannot carry unrelated hidden targets');
select set_config('test.sv.media_story',public.showcase_save(null,0,'creations','Scoped photograph','','gallery',null,jsonb_build_array(pg_temp.sv_entry(11)))->>'id',true);
select set_config('test.sv.media_upload',public.showcase_reserve_media(current_setting('test.sv.media_story')::uuid,pg_temp.sv_id(11),'photo','Chosen picture')::text,true);
reset role;
update private.media_uploads set status='processing',claim_id=pg_temp.sv_id(501),expires_at=now()+interval '10 minutes'
where id=(current_setting('test.sv.media_upload')::jsonb->>'id')::uuid;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select ok(public.finish_media_upload((current_setting('test.sv.media_upload')::jsonb->>'id')::uuid,pg_temp.sv_id(501),100,null,
current_setting('test.sv.media_story')||'/'||(current_setting('test.sv.media_upload')::jsonb->>'id')||'.jpg',null,null),'existing moderation pipeline approves scoped audience photo');
reset role;
insert into storage.objects(bucket_id,name) values('showcase-media',current_setting('test.sv.media_story')||'/'||(current_setting('test.sv.media_upload')::jsonb->>'id')||'.jpg');
set local role authenticated;
select pg_temp.sv_member(2);
select public.showcase_publish(current_setting('test.sv.media_story')::uuid,'group',2,pg_temp.sv_id(101),'{}');
select pg_temp.sv_member(3);
select is((select count(*)::int from storage.objects where name=current_setting('test.sv.media_story')||'/'||(current_setting('test.sv.media_upload')::jsonb->>'id')||'.jpg'),0,'parked showcase media stays private to its owner despite historical group sharing');
select pg_temp.sv_member(1);
select is((select count(*)::int from storage.objects where name=current_setting('test.sv.media_story')||'/'||(current_setting('test.sv.media_upload')::jsonb->>'id')||'.jpg'),0,'outside-group member cannot sign scoped showcase photo');
select pg_temp.sv_member(2);
select public.showcase_publish(current_setting('test.sv.media_story')::uuid,'group',3,pg_temp.sv_id(102),'{}');
select pg_temp.sv_member(3);
select is((select count(*)::int from storage.objects where name=current_setting('test.sv.media_story')||'/'||(current_setting('test.sv.media_upload')::jsonb->>'id')||'.jpg'),0,'changing target group withdraws old group source signing');
select pg_temp.sv_member(1);
select is((select count(*)::int from storage.objects where name=current_setting('test.sv.media_story')||'/'||(current_setting('test.sv.media_upload')::jsonb->>'id')||'.jpg'),0,'changing historical audience cannot enable parked showcase signing');
select pg_temp.sv_member(2);
select set_config('test.sv.person',public.showcase_save(null,0,'people','Favorite person','','list',null,jsonb_build_array(pg_temp.sv_entry(2,'person',
jsonb_build_object('personId','10000000-0000-0000-0000-000000000003'))))->>'id',true);
select lives_ok($$select public.showcase_publish(current_setting('test.sv.person')::uuid,'people',1,null,array['10000000-0000-0000-0000-000000000003'::uuid])$$,'identity disclosure requests consent for exact selected recipient scope');
select pg_temp.sv_member(3);
select set_config('test.sv.oldgrant',(select a->>'id' from jsonb_array_elements(public.showcase_list_approvals()) a where a->>'showcaseId'=current_setting('test.sv.person')),true);
select is((select a->'audiencePersonIds' from jsonb_array_elements(public.showcase_list_approvals()) a where a->>'showcaseId'=current_setting('test.sv.person')),
'["10000000-0000-0000-0000-000000000003"]'::jsonb,'approval recipient sees the exact proposed contact scope');
select public.showcase_respond_approval(current_setting('test.sv.oldgrant')::uuid,'approve');
select pg_temp.sv_member(2);
select lives_ok($$select public.showcase_publish(current_setting('test.sv.person')::uuid,'people',2,null,array['10000000-0000-0000-0000-000000000001'::uuid])$$,'changing selected recipients creates a fresh revision');
select pg_temp.sv_member(1);
select throws_ok($$select public.showcase_get(current_setting('test.sv.person')::uuid)$$,'42501','showcase_unavailable','previous narrower approval cannot authorize new contact scope');
select pg_temp.sv_member(3);
select throws_ok($$select public.showcase_respond_approval(current_setting('test.sv.oldgrant')::uuid,'approve')$$,'42501','showcase_approval_unavailable','old scope approval is stale');
select pg_temp.sv_member(2);
select is(jsonb_array_length(public.showcase_pickers()->'events'),53,'all verified completed occurrences are offered without a silent cap');
select is(jsonb_array_length(public.showcase_pickers('10000000-0000-0000-0000-000000000003')->'events'),52,'friend-specific picker intersects verified attendance');
select throws_ok($$select public.showcase_save(null,0,'people','Not shared','','list',null,jsonb_build_array(pg_temp.sv_entry(3,'person',jsonb_build_object(
'personId','10000000-0000-0000-0000-000000000003','meetupIds',jsonb_build_array(pg_temp.sv_id(353))))))$$,'22023','invalid_showcase_entry','friend-specific selection cannot forge a shared occurrence');
select set_config('test.sv.all',public.showcase_save(null,0,'people','All our selected occurrences','','list',null,jsonb_build_array(pg_temp.sv_entry(3,'person',jsonb_build_object(
'personId','10000000-0000-0000-0000-000000000003','showCount',true,'meetupIds',(select jsonb_agg(e->>'id') from jsonb_array_elements(public.showcase_pickers('10000000-0000-0000-0000-000000000003')->'events') e)))))->>'id',true);
select is(jsonb_array_length(public.showcase_get(current_setting('test.sv.all')::uuid)->'entries'->0->'meetupIds'),52,'explicit all selection saves more than fifty shared occurrences');
select public.showcase_publish(current_setting('test.sv.all')::uuid,'people',1,null,array['10000000-0000-0000-0000-000000000003'::uuid]);
select pg_temp.sv_member(3);
select is((select a->'snapshot'->'meetupIds' from jsonb_array_elements(public.showcase_list_approvals()) a where a->>'showcaseId'=current_setting('test.sv.all') and (a->>'countOnly')::boolean),'[]'::jsonb,'count-only consent preview omits occurrence identities');
select is((select a->'snapshot'->'media' from jsonb_array_elements(public.showcase_list_approvals()) a where a->>'showcaseId'=current_setting('test.sv.all') and (a->>'countOnly')::boolean),'[]'::jsonb,'count-only consent does not expose media or album references');
select pg_temp.sv_member(2);
select set_config('test.sv.albums',public.showcase_save(null,0,'creations','Linked collection','','list',null,jsonb_build_array(pg_temp.sv_entry(4,'story',
jsonb_build_object('albumIds',jsonb_build_array(pg_temp.sv_id(201))))))->>'id',true);
select public.showcase_publish(current_setting('test.sv.albums')::uuid,'everyone',1);
select is(public.showcase_get(current_setting('test.sv.albums')::uuid)->'entries'->0->'albums'->0->>'title','Private collection title','owner can see own selected album reference');
select pg_temp.sv_member(1);
select throws_ok($$select public.showcase_get(current_setting('test.sv.albums')::uuid)$$,'42501','showcase_unavailable','parked showcase remains private: unauthorized viewer cannot learn private album IDs');
select throws_ok($$select public.showcase_get(current_setting('test.sv.albums')::uuid)$$,'42501','showcase_unavailable','parked showcase remains private: unauthorized viewer cannot learn title or album link');
reset role;
insert into public.conversations(id,participant_low,participant_high,created_by)
values(pg_temp.sv_id(210),'10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002');
insert into public.conversation_members(conversation_id,user_id)
values(pg_temp.sv_id(210),'10000000-0000-0000-0000-000000000001'),(pg_temp.sv_id(210),'10000000-0000-0000-0000-000000000002') on conflict do nothing;
insert into public.album_shares(id,album_id,owner_id,recipient_id,conversation_id,status,expires_at,access_mode,shared_version,accepted_at)
values(pg_temp.sv_id(211),pg_temp.sv_id(201),'10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',pg_temp.sv_id(210),'accepted',now()+interval '1 hour','indefinite',1,now());
set local role authenticated;
select pg_temp.sv_member(1);
select throws_ok($$select public.showcase_get(current_setting('test.sv.albums')::uuid)$$,'42501','showcase_unavailable','parked showcase remains private: authorized viewer receives existing share route identifier');
reset role;
update public.album_shares set status='revoked' where id=pg_temp.sv_id(211);
set local role authenticated;
select pg_temp.sv_member(1);
select throws_ok($$select public.showcase_get(current_setting('test.sv.albums')::uuid)$$,'42501','showcase_unavailable','parked showcase remains private: revoked album share withdraws link and identifier immediately');
select throws_ok($$select public.showcase_get(current_setting('test.sv.albums')::uuid)$$,'42501','showcase_unavailable','parked showcase remains private: album withdrawal preserves independently shared story');
select pg_temp.sv_member(2);
select throws_ok($$select public.showcase_save(null,0,'creations','Not my album','','list',null,jsonb_build_array(pg_temp.sv_entry(5,'story',jsonb_build_object('albumIds',jsonb_build_array(pg_temp.sv_id(202))))))$$,'22023','invalid_showcase_entry','picker references only owned albums');
select set_config('test.sv.album_person',public.showcase_save(null,0,'people','Friend and collection','','list',null,jsonb_build_array(pg_temp.sv_entry(6,'person',
jsonb_build_object('personId','10000000-0000-0000-0000-000000000003','albumIds',jsonb_build_array(pg_temp.sv_id(201))))))->>'id',true);
select public.showcase_publish(current_setting('test.sv.album_person')::uuid,'everyone',1);
select pg_temp.sv_member(3);
select is((select a->'snapshot'->'albumIds' from jsonb_array_elements(public.showcase_list_approvals()) a where a->>'showcaseId'=current_setting('test.sv.album_person')),'[]'::jsonb,'approval snapshot itself cannot grant album title or ID access');
select pg_temp.sv_member(2);
select set_config('test.sv.members',public.showcase_save(null,0,'groups','Our group story','','list',null,jsonb_build_array(pg_temp.sv_entry(7,'group',
jsonb_build_object('groupId',pg_temp.sv_id(101),'showMembers',true))))->>'id',true);
select public.showcase_publish(current_setting('test.sv.members')::uuid,'everyone',1);
select pg_temp.sv_member(1);
select throws_ok($$select public.showcase_get(current_setting('test.sv.members')::uuid)$$,'42501','showcase_unavailable','parked showcase remains private: pending member consent withholds just that name from outsider');
select throws_ok($$select public.showcase_get(current_setting('test.sv.members')::uuid)$$,'42501','showcase_unavailable','parked showcase remains private: pending individual roster consent does not suppress manager-authorized story');
select pg_temp.sv_member(3);
select throws_ok($$select public.showcase_get(current_setting('test.sv.members')::uuid)$$,'42501','showcase_unavailable','parked showcase remains private: current group member retains already-authorized roster context');
select public.showcase_respond_approval((select (a->>'id')::uuid from jsonb_array_elements(public.showcase_list_approvals()) a where a->>'showcaseId'=current_setting('test.sv.members')),'approve');
select pg_temp.sv_member(1);
select throws_ok($$select public.showcase_get(current_setting('test.sv.members')::uuid)$$,'42501','showcase_unavailable','parked showcase remains private: individual member approval permits only its current name');
select pg_temp.sv_member(3);
select public.showcase_set_group_member_visibility(pg_temp.sv_id(101),false);
select public.showcase_set_group_member_visibility(pg_temp.sv_id(101),true);
select pg_temp.sv_member(1);
select throws_ok($$select public.showcase_get(current_setting('test.sv.members')::uuid)$$,'42501','showcase_unavailable','parked showcase remains private: hide then show cannot resurrect an outsider disclosure grant');
select pg_temp.sv_member(2);
select public.showcase_publish(current_setting('test.sv.members')::uuid,'everyone',2);
select pg_temp.sv_member(3);
select public.showcase_respond_approval((select (a->>'id')::uuid from jsonb_array_elements(public.showcase_list_approvals()) a where a->>'showcaseId'=current_setting('test.sv.members')),'approve');
reset role;
insert into public.group_members(group_id,profile_id,role,status) values(pg_temp.sv_id(101),'10000000-0000-0000-0000-000000000001','member','active');
set local role authenticated;
select pg_temp.sv_member(2);
select ok(not exists(select 1 from jsonb_array_elements(public.showcase_get(current_setting('test.sv.members')::uuid)->'entries'->0->'groupMembers') m where m->>'id'='10000000-0000-0000-0000-000000000001'),'new group members do not automatically enter a published roster');
reset role;
delete from public.group_members where group_id=pg_temp.sv_id(101) and profile_id='10000000-0000-0000-0000-000000000001';
insert into public.blocks(blocker_id,blocked_id) values('10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001');
set local role authenticated;
select pg_temp.sv_member(1);
select throws_ok($$select public.showcase_get(current_setting('test.sv.members')::uuid)$$,'42501','showcase_unavailable','parked showcase remains private: blocking removes a member name without exposing other roster changes');
reset role;
delete from public.blocks where blocker_id='10000000-0000-0000-0000-000000000003' and blocked_id='10000000-0000-0000-0000-000000000001';
update public.group_members set status='removed' where group_id=pg_temp.sv_id(101) and profile_id='10000000-0000-0000-0000-000000000003';
set local role authenticated;
select pg_temp.sv_member(1);
select throws_ok($$select public.showcase_get(current_setting('test.sv.members')::uuid)$$,'42501','showcase_unavailable','parked showcase remains private: membership withdrawal removes previously consented member name');
select pg_temp.sv_member(3);
select throws_ok($$select public.showcase_set_group_member_visibility(pg_temp.sv_id(101),false)$$,'42501','active_group_membership_required','former member cannot mutate current group preferences');
reset role;
update public.group_members set status='active' where group_id=pg_temp.sv_id(101) and profile_id='10000000-0000-0000-0000-000000000003';
delete from public.friendships where (requester_id='10000000-0000-0000-0000-000000000002' and addressee_id='10000000-0000-0000-0000-000000000003')
or (requester_id='10000000-0000-0000-0000-000000000003' and addressee_id='10000000-0000-0000-0000-000000000002');
set local role authenticated;
select pg_temp.sv_member(2);
select lives_ok($$select public.showcase_publish(current_setting('test.sv.story')::uuid,'people',4,null,array['10000000-0000-0000-0000-000000000003'::uuid])$$,'selected audience may contain current shared-group contact who is not a friend');
select throws_ok($$select public.showcase_pickers('10000000-0000-0000-0000-000000000003')$$,'42501','showcase_friend_unavailable','favorite-people attendance picker still requires accepted friendship');
select pg_temp.sv_member(3);
select throws_ok($$select public.showcase_get(current_setting('test.sv.story')::uuid)$$,'42501','showcase_unavailable','parked showcase remains private: selected active shared-group contact can read');
reset role;
update public.group_members set status='removed' where group_id=pg_temp.sv_id(101) and profile_id='10000000-0000-0000-0000-000000000003';
set local role authenticated;
select pg_temp.sv_member(3);
select throws_ok($$select public.showcase_get(current_setting('test.sv.story')::uuid)$$,'42501','showcase_unavailable','nonfriend shared-group contact loses access on leaving');
select pg_temp.sv_member(2);
select throws_ok($$select public.showcase_save(null,0,'groups','Removed sponsorship','','list',null,jsonb_build_array(pg_temp.sv_entry(8,'group',jsonb_build_object(
'groupId',pg_temp.sv_id(101),'requirements',jsonb_build_object('sponsorMeetupId',pg_temp.sv_id(301),'minSponsorIsk',5000)))))$$,'22023','invalid_showcase_entry','sponsorship requirement fields are rejected');
select throws_ok($$select public.showcase_save(null,0,'passions','Not a group','','list',null,jsonb_build_array(pg_temp.sv_entry(9,'story',jsonb_build_object('showMembers',true))))$$,'22023','invalid_showcase_entry','member display is group-only');
select ok(public.export_account()?'showcaseGroupMemberPreferences','account export includes own group showcase preferences');
reset role;
insert into public.friendships(requester_id,addressee_id,status,responded_at)
values('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','accepted',now()) on conflict do nothing;
insert into public.meetups(id,host_id,title,description,category,starts_at,ends_at,access_mode,location_visibility,general_area,prohibited_services_attested_at,status,published_at)
values(pg_temp.sv_id(555),'10000000-0000-0000-0000-000000000001','Private journal source','Synthetic gathering','community',now()-interval '2 days',now()-interval '1 day','private','protected','reykjavik',now(),'published',now());
insert into private.community_attendance(meetup_id,profile_id,source) values
(pg_temp.sv_id(555),'10000000-0000-0000-0000-000000000002','moderator'),
(pg_temp.sv_id(555),'10000000-0000-0000-0000-000000000003','moderator');
insert into private.media_uploads(id,owner_id,target_type,target_id,media_type,object_path,status,normalized_path)
values(pg_temp.sv_id(610),'10000000-0000-0000-0000-000000000001','meetup',pg_temp.sv_id(555),'image',
'10000000-0000-0000-0000-000000000001/'||pg_temp.sv_id(610)::text,'approved',pg_temp.sv_id(555)::text||'/'||pg_temp.sv_id(610)::text||'.jpg');
insert into private.meetup_media(id,meetup_id,storage_path,kind,position)
values(pg_temp.sv_id(610),pg_temp.sv_id(555),pg_temp.sv_id(555)::text||'/'||pg_temp.sv_id(610)::text||'.jpg','photo',0);
set local role authenticated;
select pg_temp.sv_member(2);
select set_config('test.sv.only_me',public.showcase_save(null,0,'together','Private journal','','list',null,jsonb_build_array(
pg_temp.sv_entry(12,'person',jsonb_build_object('personId','10000000-0000-0000-0000-000000000003','meetupIds',jsonb_build_array(pg_temp.sv_id(555)),
'media',jsonb_build_array(jsonb_build_object('id',pg_temp.sv_id(611),'sourceUploadId',pg_temp.sv_id(610),'kind','photo','caption','Private proposed picture')))),
pg_temp.sv_entry(13,'group',jsonb_build_object('groupId',pg_temp.sv_id(102),'showMembers',true))))->>'id',true);
select lives_ok($$select public.showcase_publish(current_setting('test.sv.only_me')::uuid,'no_one',1)$$,'only-me publication can retain privately authored references');
select pg_temp.sv_member(1);
select is((select count(*)::int from jsonb_array_elements(public.showcase_list_approvals()) a where a->>'showcaseId'=current_setting('test.sv.only_me')),0,'only-me sends no proposed entry to group manager, event host or uploader inbox');
select throws_ok($$select public.showcase_get(current_setting('test.sv.only_me')::uuid)$$,'42501','showcase_unavailable','only-me private proposed content is inaccessible to its host and group manager');
select pg_temp.sv_member(3);
select is((select count(*)::int from jsonb_array_elements(public.showcase_list_approvals()) a where a->>'showcaseId'=current_setting('test.sv.only_me')),0,'only-me sends no private entry to named person inbox');
select pg_temp.sv_member(2);
select public.showcase_publish(current_setting('test.sv.only_me')::uuid,'everyone',2);
select pg_temp.sv_member(1);
select ok((select count(*) from jsonb_array_elements(public.showcase_list_approvals()) a where a->>'showcaseId'=current_setting('test.sv.only_me'))>=3,'later external sharing creates fresh manager, host and uploader consent requests');
select pg_temp.sv_member(3);
select is((select count(*)::int from jsonb_array_elements(public.showcase_list_approvals()) a where a->>'showcaseId'=current_setting('test.sv.only_me') and a->>'role'='person'),1,'later external sharing creates fresh named person consent request');
reset role;
insert into public.groups(id,owner_id,name) values(pg_temp.sv_id(104),'10000000-0000-0000-0000-000000000001','Review-only group');
insert into public.group_members(group_id,profile_id,role,status) values
(pg_temp.sv_id(104),'10000000-0000-0000-0000-000000000001','owner','active'),
(pg_temp.sv_id(104),'10000000-0000-0000-0000-000000000002','member','active'),
(pg_temp.sv_id(104),'10000000-0000-0000-0000-000000000003','member','active');
insert into public.meetups(id,host_id,title,description,category,starts_at,ends_at,access_mode,location_visibility,general_area,prohibited_services_attested_at,status,published_at)
values(pg_temp.sv_id(556),'10000000-0000-0000-0000-000000000001','Private contributor source','Synthetic gathering','community',now()-interval '2 days',now()-interval '1 day','private','protected','reykjavik',now(),'published',now());
insert into private.community_attendance(meetup_id,profile_id,source) values
(pg_temp.sv_id(556),'10000000-0000-0000-0000-000000000002','moderator');
insert into private.media_uploads(id,owner_id,target_type,target_id,media_type,object_path,status,normalized_path)
values(pg_temp.sv_id(701),'10000000-0000-0000-0000-000000000001','meetup',pg_temp.sv_id(556),'image',
'10000000-0000-0000-0000-000000000001/'||pg_temp.sv_id(701)::text,'approved',pg_temp.sv_id(556)::text||'/'||pg_temp.sv_id(701)::text||'.jpg');
insert into private.meetup_media(id,meetup_id,storage_path,kind,position)
values(pg_temp.sv_id(701),pg_temp.sv_id(556),pg_temp.sv_id(556)::text||'/'||pg_temp.sv_id(701)::text||'.jpg','photo',0);
insert into storage.objects(bucket_id,name) values('meetup-media',pg_temp.sv_id(556)::text||'/'||pg_temp.sv_id(701)::text||'.jpg');
set local role authenticated;
select pg_temp.sv_member(2);
select set_config('test.sv.pending_member',public.showcase_save(null,0,'groups','Pending group representation','','list',null,jsonb_build_array(pg_temp.sv_entry(14,'group',
jsonb_build_object('groupId',pg_temp.sv_id(104),'showMembers',true,'meetupIds',jsonb_build_array(pg_temp.sv_id(556)),
'media',jsonb_build_array(jsonb_build_object('id',pg_temp.sv_id(702),'sourceUploadId',pg_temp.sv_id(701),'kind','photo','caption','Proposed group photo'))))))->>'id',true);
select public.showcase_publish(current_setting('test.sv.pending_member')::uuid,'everyone',1);
reset role;
select set_config('test.sv.member_grant',(select id::text from private.showcase_approvals where showcase_id=current_setting('test.sv.pending_member')::uuid
and scope='member:10000000-0000-0000-0000-000000000003'),true);
set local role authenticated;
select pg_temp.sv_member(3);
select is((select count(*)::int from jsonb_array_elements(public.showcase_list_approvals()) a where a->>'showcaseId'=current_setting('test.sv.pending_member')),0,'roster reviewer without original outing access gets no private context before host consent');
select is((select count(*)::int from storage.objects where name=pg_temp.sv_id(556)::text||'/'||pg_temp.sv_id(701)::text||'.jpg'),0,'pending roster request cannot unlock private borrowed media');
select throws_ok($$select public.showcase_respond_approval(current_setting('test.sv.member_grant')::uuid,'approve')$$,'42501','showcase_approval_unavailable','unknown private context cannot be approved through a guessed request ID');
select pg_temp.sv_member(1);
select ok(exists(select 1 from jsonb_array_elements(public.showcase_list_approvals()) a where a->>'showcaseId'=current_setting('test.sv.pending_member') and a->>'role'='host'),'original host retains its private-context review request');
select is((select count(*)::int from storage.objects where name=pg_temp.sv_id(556)::text||'/'||pg_temp.sv_id(701)::text||'.jpg'),1,'actual uploader retains original source preview access');
select public.showcase_respond_approval((select (a->>'id')::uuid from jsonb_array_elements(public.showcase_list_approvals()) a where a->>'showcaseId'=current_setting('test.sv.pending_member') and a->>'role'='host'),'approve');
select pg_temp.sv_member(3);
select is((select count(*)::int from jsonb_array_elements(public.showcase_list_approvals()) a where a->>'showcaseId'=current_setting('test.sv.pending_member')),1,'host-approved private excerpt becomes available to current opted-in roster reviewer');
select is((select count(*)::int from storage.objects where name=pg_temp.sv_id(556)::text||'/'||pg_temp.sv_id(701)::text||'.jpg'),0,'host context consent does not substitute for uploader media consent');
select pg_temp.sv_member(1);
select set_config('test.sv.uploader_grant',(select a->>'id' from jsonb_array_elements(public.showcase_list_approvals()) a where a->>'showcaseId'=current_setting('test.sv.pending_member') and a->>'role'='media'),true);
select public.showcase_respond_approval(current_setting('test.sv.uploader_grant')::uuid,'approve');
select pg_temp.sv_member(3);
select is((select count(*)::int from storage.objects where name=pg_temp.sv_id(556)::text||'/'||pg_temp.sv_id(701)::text||'.jpg'),0,'parked showcase roster review cannot unlock borrowed media after uploader consent');
select throws_ok($$select public.showcase_get(current_setting('test.sv.pending_member')::uuid)$$,'42501','showcase_unavailable','pending manager approval prevents ordinary public story access');
select pg_temp.sv_member(1);
select public.showcase_respond_approval(current_setting('test.sv.uploader_grant')::uuid,'revoke');
select pg_temp.sv_member(3);
select is((select count(*)::int from storage.objects where name=pg_temp.sv_id(556)::text||'/'||pg_temp.sv_id(701)::text||'.jpg'),0,'uploader withdrawal revokes scoped roster media signing');
select pg_temp.sv_member(1);
select public.showcase_respond_approval(current_setting('test.sv.uploader_grant')::uuid,'approve');
select public.showcase_respond_approval((select (a->>'id')::uuid from jsonb_array_elements(public.showcase_list_approvals()) a where a->>'showcaseId'=current_setting('test.sv.pending_member') and a->>'role'='host'),'revoke');
select pg_temp.sv_member(3);
select is((select count(*)::int from jsonb_array_elements(public.showcase_list_approvals()) a where a->>'showcaseId'=current_setting('test.sv.pending_member')),0,'host withdrawal removes the private excerpt from pending roster inbox');
select is((select count(*)::int from storage.objects where name=pg_temp.sv_id(556)::text||'/'||pg_temp.sv_id(701)::text||'.jpg'),0,'host withdrawal prevents private context media preview even with uploader approval');
select pg_temp.sv_member(1);
select public.showcase_respond_approval((select (a->>'id')::uuid from jsonb_array_elements(public.showcase_list_approvals()) a where a->>'showcaseId'=current_setting('test.sv.pending_member') and a->>'role'='host'),'approve');
select pg_temp.sv_member(3);
select public.showcase_set_group_member_visibility(pg_temp.sv_id(104),false);
select is((select count(*)::int from jsonb_array_elements(public.showcase_list_approvals()) a where a->>'showcaseId'=current_setting('test.sv.pending_member')),0,'member opt-out removes its pending excerpt request');
select is((select count(*)::int from storage.objects where name=pg_temp.sv_id(556)::text||'/'||pg_temp.sv_id(701)::text||'.jpg'),0,'opted-out member has no scoped approval media access');
select throws_ok($$select public.showcase_respond_approval(current_setting('test.sv.member_grant')::uuid,'approve')$$,'42501','showcase_approval_unavailable','opted-out member cannot reactivate private preview consent');
select public.showcase_set_group_member_visibility(pg_temp.sv_id(104),true);
select public.showcase_respond_approval(current_setting('test.sv.member_grant')::uuid,'approve');
select is((select count(*)::int from storage.objects where name=pg_temp.sv_id(556)::text||'/'||pg_temp.sv_id(701)::text||'.jpg'),0,'renewing old preview permission cannot reopen parked showcase media');
reset role;
update public.group_members set status='removed' where group_id=pg_temp.sv_id(104) and profile_id='10000000-0000-0000-0000-000000000003';
set local role authenticated;
select pg_temp.sv_member(3);
select is((select count(*)::int from jsonb_array_elements(public.showcase_list_approvals()) a where a->>'showcaseId'=current_setting('test.sv.pending_member')),0,'leaving group removes stale roster approval request');
select is((select count(*)::int from storage.objects where name=pg_temp.sv_id(556)::text||'/'||pg_temp.sv_id(701)::text||'.jpg'),0,'former member cannot sign media through stale roster approval');
select throws_ok($$select public.showcase_respond_approval(current_setting('test.sv.member_grant')::uuid,'approve')$$,'42501','showcase_approval_unavailable','former member cannot respond through stale request identifier');
select finish();
rollback;
