begin;
-- Real synthetic sessions for member JWT fixtures; rows roll back with this test.
insert into auth.sessions(id,user_id) select md5('pgtap-session:'||id::text)::uuid,id from auth.users;
set local search_path=extensions,public,private;
select no_plan();
select ok(not has_function_privilege('authenticated','public.claim_media_cleanup(uuid)','execute'),'members cannot claim media cleanup');
select ok(not has_function_privilege('authenticated','public.fail_media_upload(uuid,uuid,boolean)','execute'),'members cannot forge processing outcomes');
select ok(not has_table_privilege('authenticated','private.media_cleanup_jobs','select'),'cleanup paths stay private');
insert into public.albums(id,owner_id,name) values('94000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Recovery fixture');
insert into private.media_uploads(id,owner_id,album_id,media_type,object_path) values
 ('94000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000001','image','10000000-0000-0000-0000-000000000001/recovery');
insert into storage.objects(bucket_id,name,owner_id) values ('media-quarantine','10000000-0000-0000-0000-000000000001/recovery','10000000-0000-0000-0000-000000000001');
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('test.media_claim','94000000-0000-0000-0000-000000000003',true);
select throws_ok($$select public.claim_media_upload(null)$$,'P0001','claim_required','null media claims are rejected');
select is(public.claim_media_upload(current_setting('test.media_claim')::uuid)->>'id','94000000-0000-0000-0000-000000000002','worker claims available uploaded content');
select is(public.claim_media_upload(gen_random_uuid()),null::jsonb,'a second worker cannot claim the same lease');
select ok(not public.fail_media_upload('94000000-0000-0000-0000-000000000002',null,true),'missing claim cannot reject media');
select ok(not public.fail_media_upload('94000000-0000-0000-0000-000000000002',gen_random_uuid(),true),'stale claim cannot reject media');
select ok(public.fail_media_upload('94000000-0000-0000-0000-000000000002',current_setting('test.media_claim')::uuid,false),'transient failure schedules retry');
select is(public.claim_media_upload(gen_random_uuid()),null::jsonb,'retry backoff prevents a hot loop');
reset role;
update private.media_uploads set expires_at=now()-interval '1 second' where id='94000000-0000-0000-0000-000000000002';
set local role service_role;
select is((public.claim_media_upload(current_setting('test.media_claim')::uuid)->>'attempts')::integer,2,'recovery increments persisted attempts');
select ok(not public.finish_media_upload('94000000-0000-0000-0000-000000000002',null,100,null,'x','x',null),'missing claim cannot publish content');
select throws_ok($$select public.finish_media_upload('94000000-0000-0000-0000-000000000002',current_setting('test.media_claim')::uuid,100,null,'x','another-owner/thumbnail.jpg',null)$$,'P0001','invalid_verified_thumbnail','thumbnail must match verified owner and job');
select ok(public.finish_media_upload('94000000-0000-0000-0000-000000000002',current_setting('test.media_claim')::uuid,100,null,
 '10000000-0000-0000-0000-000000000001/94000000-0000-0000-0000-000000000001/94000000-0000-0000-0000-000000000002.jpg',
 '10000000-0000-0000-0000-000000000001/94000000-0000-0000-0000-000000000001/94000000-0000-0000-0000-000000000002-thumb.jpg',null),'approved upload finalizes');
select set_config('test.cleanup',public.claim_media_cleanup(current_setting('test.media_claim')::uuid)::text,true);
select is(jsonb_array_length(current_setting('test.cleanup')::jsonb),1,'approval atomically queues raw cleanup');
select is(jsonb_array_length(public.claim_media_cleanup(gen_random_uuid())),0,'concurrent cleanup worker cannot duplicate the claim');
select throws_ok($$select public.finish_media_cleanup((current_setting('test.cleanup')::jsonb->0->>'id')::uuid,current_setting('test.media_claim')::uuid,true)$$,'P0001','media_cleanup_incomplete','cannot report raw deletion while bytes metadata remains');
select ok(public.finish_media_cleanup((current_setting('test.cleanup')::jsonb->0->>'id')::uuid,current_setting('test.media_claim')::uuid,false),'storage outage schedules cleanup retry');
reset role;
select is((select status from private.media_cleanup_jobs limit 1),'pending','cleanup failure remains durable after publication');

-- Own-file delivery: no peer media, no quarantined payload and no revoked session.
insert into auth.sessions(id,user_id) values('94000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001');
insert into storage.objects(id,bucket_id,name,owner_id) values
 ('94000000-0000-0000-0000-000000000005','profile-photos','10000000-0000-0000-0000-000000000001/export.jpg','10000000-0000-0000-0000-000000000001'),
 ('94000000-0000-0000-0000-000000000006','profile-photos','10000000-0000-0000-0000-000000000002/peer.jpg','10000000-0000-0000-0000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('request.jwt.claims','{"aal":"aal2","session_id":"94000000-0000-0000-0000-000000000004"}',true);
select lives_ok($$select public.get_account_media('94000000-0000-0000-0000-000000000005')$$,'active own session can download owned media');
select throws_ok($$select public.get_account_media('94000000-0000-0000-0000-000000000006')$$,'42501','media_unavailable','peer files cannot be exported');
select is(jsonb_array_length(public.export_my_account()->'mediaManifest'),1,'export lists only owned normal media, not quarantine or peer objects');
select ok(not public.get_financial_access(),'MFA alone cannot grant financial control');
reset role;
update auth.users set raw_app_meta_data=raw_app_meta_data||'{"financial_operator":true}' where id='10000000-0000-0000-0000-000000000001';
set local role authenticated;
select ok(public.get_financial_access(),'current protected financial role plus active MFA session authorizes review');
select set_config('request.jwt.claims','{"aal":"aal1","session_id":"94000000-0000-0000-0000-000000000004"}',true);
select ok(not public.get_financial_access(),'financial review requires MFA');
select set_config('request.jwt.claims','{"aal":"aal2","session_id":"94000000-0000-0000-0000-000000000004"}',true);
reset role;
delete from auth.sessions where id='94000000-0000-0000-0000-000000000004';
set local role authenticated;
select ok(not public.get_financial_access(),'revoked financial session loses access before JWT expires');
select throws_ok($$select public.get_account_media('94000000-0000-0000-0000-000000000005')$$,'42501','account_unavailable','revoked media session loses access before JWT expires');
select * from finish();
rollback;
