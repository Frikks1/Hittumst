begin;
set local search_path=extensions,public,private;
select no_plan();
insert into auth.sessions(id,user_id) select md5('pgtap-session:'||id::text)::uuid,id from auth.users on conflict do nothing;
update private.meetup_feature_config set enabled=true,expanded_launch_gates_passed=true where id=1;
insert into private.member_subscriptions(account_id,tier,paid_until,source) select id,'plebba_kongur',now()+interval '1 month','sandbox' from public.profiles
on conflict(account_id) do update set tier=excluded.tier,paid_until=excluded.paid_until;
create function pg_temp.sponsor_member(p_id uuid) returns void language plpgsql as $$begin
  perform set_config('request.jwt.claim.sub',p_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_id,'session_id',md5('pgtap-session:'||p_id::text)::uuid,'role','authenticated')::text,true);
end $$;
create function pg_temp.sponsor_event(p_n integer) returns uuid language sql immutable as $$select ('97500000-0000-0000-0000-'||lpad(p_n::text,12,'0'))::uuid$$;
create function pg_temp.sponsor_receipt(p_id text,p_event uuid,p_member uuid,p_amount integer,p_at text) returns void language plpgsql as $$begin
  update private.finance_state set state=jsonb_set(jsonb_set(state,'{contributions}',coalesce(state->'contributions','{}')||jsonb_build_object(p_id,
    jsonb_build_object('id',p_id,'eventId',p_event,'memberId',p_member,'amount',p_amount,'reversed',false))),'{journal}',
    coalesce(state->'journal','[]')||jsonb_build_array(jsonb_build_object('id',p_id,'kind','contribution','at',p_at,
      'entries',jsonb_build_array(jsonb_build_object('account','pool:'||p_event::text,'amount',p_amount))))) where id;
end $$;
insert into public.meetup_series(id,host_id,title,frequency,interval_value,monthly_pattern,occurrence_count,status)
values(pg_temp.sponsor_event(99),'10000000-0000-0000-0000-000000000001','Synthetic sponsorship series','monthly',1,'{"kind":"day_of_month","day":10}',3,'published');
insert into public.meetups(id,host_id,title,description,category,starts_at,access_mode,location_visibility,general_area,capacity,prohibited_services_attested_at,status,published_at,series_id,occurrence_index)
select pg_temp.sponsor_event(n),'10000000-0000-0000-0000-000000000001','Sponsor read model test','Synthetic support history and private roster checks','community',now()+interval '3 days','open','protected','reykjavik',12,now(),'published',now(),case when n<=3 then pg_temp.sponsor_event(99) end,case when n<=3 then n end from generate_series(1,4) n;
insert into public.meetup_participations(id,meetup_id,profile_id,status,joined_at,rsvp_visibility)
values
 ('97600000-0000-0000-0000-000000000001',pg_temp.sponsor_event(1),'10000000-0000-0000-0000-000000000002','joined',now()-interval '3 hours','private'),
 ('97600000-0000-0000-0000-000000000002',pg_temp.sponsor_event(1),'10000000-0000-0000-0000-000000000003','joined',now()-interval '2 hours','private'),
 ('97600000-0000-0000-0000-000000000003',pg_temp.sponsor_event(1),'90000000-0000-0000-0000-000000000001','joined',now()-interval '1 hour','private');
select pg_temp.sponsor_receipt('support-current',pg_temp.sponsor_event(1),'10000000-0000-0000-0000-000000000003',1000,(now()-interval '1 hour')::text);
select pg_temp.sponsor_receipt('support-two',pg_temp.sponsor_event(2),'10000000-0000-0000-0000-000000000003',700,(date_trunc('month',now())-interval '1 month'+interval '1 day')::text);
select pg_temp.sponsor_receipt('support-three',pg_temp.sponsor_event(3),'10000000-0000-0000-0000-000000000003',500,(date_trunc('month',now())-interval '2 months'+interval '1 day')::text);
select pg_temp.sponsor_receipt('support-larger',pg_temp.sponsor_event(1),'90000000-0000-0000-0000-000000000001',5000,(now()-interval '30 minutes')::text);
select pg_temp.sponsor_receipt('support-other-series',pg_temp.sponsor_event(4),'10000000-0000-0000-0000-000000000003',9000,(date_trunc('month',now())-interval '3 months'+interval '1 day')::text);
select pg_temp.sponsor_receipt('different-occurrence',pg_temp.sponsor_event(2),'10000000-0000-0000-0000-000000000002',500,(now()-interval '2 hours')::text);
-- Journal timestamps are the engine's offset-bearing ISO wire contract.
update private.finance_state set state=jsonb_set(state,'{journal}',(select jsonb_agg(case when tx->>'id' like 'support-%' or tx->>'id'='different-occurrence'
  then jsonb_set(tx,'{at}',to_jsonb(to_char((tx->>'at')::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))) else tx end)
  from jsonb_array_elements(state->'journal') tx)) where id;
select ok(not has_function_privilege('anon','public.list_meetup_sponsors(uuid)','execute'),'anonymous callers cannot read sponsor identities/history');
select ok(not has_table_privilege('authenticated','private.finance_state','select'),'sponsor projection exposes no raw ledger access');
select ok(not has_function_privilege('authenticated','private.sponsorship_committed_at(text)','execute'),'timestamp helper is not exposed');
set local role authenticated;
select pg_temp.sponsor_member('10000000-0000-0000-0000-000000000001');
select is(public.list_meetup_participants(pg_temp.sponsor_event(1))#>>'{0,profile,id}','10000000-0000-0000-0000-000000000003','host participant list puts active sponsor first');
select is(public.list_meetup_participants(pg_temp.sponsor_event(1))#>>'{1,profile,id}','90000000-0000-0000-0000-000000000001','larger amount does not outrank earlier sponsor');
select is(public.list_meetup_participants(pg_temp.sponsor_event(1))#>>'{2,isSponsor}','false','other-occurrence support does not mark this attendee as sponsor');
select is(public.list_meetup_participants(pg_temp.sponsor_event(1))#>>'{0,rsvpVisibility}','private','host roster explicitly preserves private RSVP');
select is(public.list_public_meetup_roster(pg_temp.sponsor_event(1),null,1)#>>'{items,0,profile,id}','10000000-0000-0000-0000-000000000003','host page starts with sponsor despite lower nonsponsor UUID');
select is(public.list_public_meetup_roster(pg_temp.sponsor_event(1),'97600000-0000-0000-0000-000000000002',1)#>>'{items,0,profile,id}','90000000-0000-0000-0000-000000000001','cursor stays inside sponsor group on second page');
select is(public.list_public_meetup_roster(pg_temp.sponsor_event(1),'97600000-0000-0000-0000-000000000003',1)#>>'{items,0,profile,id}','10000000-0000-0000-0000-000000000002','cursor crosses to smaller UUID nonsponsor without dropping it');
select is(jsonb_array_length(public.list_meetup_sponsors(pg_temp.sponsor_event(1))),2,'only current-occurrence committed sponsors appear');
select is(public.list_meetup_sponsors(pg_temp.sponsor_event(1))#>>'{0,amount}','1000','current principal amount excludes other occurrences and fees');
select is(public.list_meetup_sponsors(pg_temp.sponsor_event(1))#>>'{0,contributingMonths}','3','verified same-series commits span three Iceland calendar months');
select is(public.list_meetup_sponsors(pg_temp.sponsor_event(1))#>>'{0,cumulativeAmount}','2200','cumulative valid support excludes unrelated series');
select is(public.list_meetup_sponsors(pg_temp.sponsor_event(1))#>>'{0,repeatSupport}','true','history records repeat support without implying a mandate');
select is(jsonb_array_length(public.list_public_meetup_roster(pg_temp.sponsor_event(1),'97600000-0000-0000-0000-000000000099',1)->'items'),0,'unknown roster cursor does not restart the list');
select ok(not (public.list_meetup_sponsors(pg_temp.sponsor_event(1))->0) ? 'status','sponsor disclosure reveals no participation status');
select ok(not (public.list_meetup_sponsors(pg_temp.sponsor_event(1))->0) ? 'recurring','sponsor disclosure reveals no invented recurring pledge');
select pg_temp.sponsor_member('10000000-0000-0000-0000-000000000002');
select is(jsonb_array_length(public.list_public_meetup_roster(pg_temp.sponsor_event(1),null,50)->'items'),0,'nonhost still cannot see any private RSVP');
select throws_ok($$select public.list_meetup_participants(pg_temp.sponsor_event(1))$$,'42501','meetup_host_required','participant cannot use host roster API');
reset role;
update private.finance_state set state=jsonb_set(state,'{contributions,support-three,refundReason}','"rejected"') where id;
set local role authenticated;
select is(public.list_meetup_sponsors(pg_temp.sponsor_event(1))#>>'{0,contributingMonths}','2','refunded historical contribution removes its support month');
select is(public.list_meetup_sponsors(pg_temp.sponsor_event(1))#>>'{0,cumulativeAmount}','1700','refunded historical principal is not recognized');
select is(public.list_meetup_sponsors(pg_temp.sponsor_event(1))#>>'{0,repeatSupport}','true','two committed support months truthfully show repeat support');
reset role;
update private.finance_state set state=state#-'{contributions,support-three,refundReason}' where id;
update public.profiles set is_profile_visible=false where id='10000000-0000-0000-0000-000000000003';
set local role authenticated;
select pg_temp.sponsor_member('10000000-0000-0000-0000-000000000002');
select is(public.list_meetup_sponsors(pg_temp.sponsor_event(1))#>'{0,profile}','null'::jsonb,'hidden sponsor profile becomes a masked row');
select ok(public.list_meetup_sponsors(pg_temp.sponsor_event(1))::text not like '%10000000-0000-0000-0000-000000000003%','masked row carries no hidden member ID');
reset role;
insert into public.blocks(blocker_id,blocked_id) values('10000000-0000-0000-0000-000000000002','90000000-0000-0000-0000-000000000001');
set local role authenticated;
select is(jsonb_array_length(public.list_meetup_sponsors(pg_temp.sponsor_event(1))),1,'mutual blocks omit sponsor identity and history');
reset role;
delete from public.blocks where blocker_id='10000000-0000-0000-0000-000000000002' and blocked_id='90000000-0000-0000-0000-000000000001';
update public.profiles set special_category_consent_at=null where id='10000000-0000-0000-0000-000000000003';
set local role authenticated;
select is(jsonb_array_length(public.list_meetup_sponsors(pg_temp.sponsor_event(1))),1,'withdrawn sensitive consent removes support disclosure');
reset role;
update public.profiles set special_category_consent_at=now() where id='10000000-0000-0000-0000-000000000003';
insert into private.media_restore_quarantine(account_id,restore_id) values('10000000-0000-0000-0000-000000000003',pg_temp.sponsor_event(90));
set local role authenticated;
select is(jsonb_array_length(public.list_meetup_sponsors(pg_temp.sponsor_event(1))),1,'restored account quarantine removes sponsor disclosure');
reset role;
delete from private.media_restore_quarantine where account_id='10000000-0000-0000-0000-000000000003';
update private.finance_state set state=jsonb_set(state,'{contributions,support-current,reversed}','true') where id;
set local role authenticated;
select pg_temp.sponsor_member('10000000-0000-0000-0000-000000000001');
select is(public.list_meetup_participants(pg_temp.sponsor_event(1))#>>'{0,profile,id}','90000000-0000-0000-0000-000000000001','reversal removes sponsor display priority');
select is(jsonb_array_length(public.list_meetup_sponsors(pg_temp.sponsor_event(1))),1,'reversed current contribution removes sponsor row');
reset role;
update private.finance_state set state=jsonb_set(state,'{contributions,support-larger,refundReason}','"cancelled"') where id;
set local role authenticated;
select is(public.list_meetup_participants(pg_temp.sponsor_event(1))#>>'{0,profile,id}','10000000-0000-0000-0000-000000000002','refunded support returns to original nonsponsor order');
select is(jsonb_array_length(public.list_meetup_sponsors(pg_temp.sponsor_event(1))),0,'refunded contributions are not valid support');
reset role;
select pg_temp.sponsor_receipt('bad-date',pg_temp.sponsor_event(1),'10000000-0000-0000-0000-000000000003',500,'not-a-date');
select pg_temp.sponsor_receipt('bad-calendar',pg_temp.sponsor_event(1),'10000000-0000-0000-0000-000000000003',500,'2026-99-99T00:00:00Z');
select pg_temp.sponsor_receipt('bad-offset',pg_temp.sponsor_event(1),'10000000-0000-0000-0000-000000000003',500,'2026-06-01T00:00:00+99:99');
select pg_temp.sponsor_receipt('future-receipt',pg_temp.sponsor_event(1),'10000000-0000-0000-0000-000000000003',500,to_char((now()+interval '1 month') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
update private.finance_state set state=jsonb_set(state,'{contributions,no-journal}',jsonb_build_object('id','no-journal','eventId',pg_temp.sponsor_event(1),'memberId','10000000-0000-0000-0000-000000000003','amount',500,'reversed',false)) where id;
set local role authenticated;
select is(jsonb_array_length(public.list_meetup_sponsors(pg_temp.sponsor_event(1))),0,'malformed historical timestamps are excluded without fabricating dates');
reset role;
update private.finance_state set state=state#-'{contributions,support-larger,refundReason}' where id;
set local role authenticated;
select is(jsonb_array_length(public.list_meetup_sponsors(pg_temp.sponsor_event(1))),1,'deletion test begins with one visible active sponsor');
reset role;
update public.profiles set deletion_requested_at=now() where id='90000000-0000-0000-0000-000000000001';
set local role authenticated;
select is(jsonb_array_length(public.list_meetup_sponsors(pg_temp.sponsor_event(1))),0,'deleted sponsors disclose no identity/history');
reset role;
insert into public.blocks(blocker_id,blocked_id) values('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001');
set local role authenticated;
select pg_temp.sponsor_member('10000000-0000-0000-0000-000000000002');
select throws_ok($$select public.list_meetup_sponsors(pg_temp.sponsor_event(1))$$,'42501','meetup_not_visible','blocked host prevents access to complete sponsor projection');
select * from finish();
rollback;
