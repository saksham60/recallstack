-- Direct independent JS algorithms verified 719/719 stored fixture outputs for 23 V2 problems.
-- This is fixture-oracle evidence only. No official hosted judge or source-contract certification.
-- The 23 per-suite expected MD5 digests bind each check to the immutable input/output snapshot.
do $audit$
declare e record; n integer:=0; ncases integer; hash_now text; npublic int; nhidden int; nrejected int; new_attempt integer;
begin
 for e in
   select * from (values
('2e03c917-8318-41b9-bdd4-ffdce9f52198'::uuid,'a86c6ece-464c-45b0-9ce9-f05089f4d400'::uuid,32,'630276e7d147d21b2e46b7034aa3c648',7),
('46daa15f-6021-449c-b339-ac16cadb11ca'::uuid,'e0f6fdd9-c5ba-4008-8089-191b9578ab5b'::uuid,32,'ac5526c441bd35d793024d79ced44a12',12),
('ff4cad17-b0d3-4527-8b43-327b3a5b1142'::uuid,'ba44ebfd-047e-47f0-b030-a39266b1594d'::uuid,30,'ca18d2d1dbd1fcb0ef9e0017a279ec1a',13),
('6c76d59e-0dba-46dc-8a1f-78d52bb8285d'::uuid,'af93c72d-5ccd-411b-9a19-8a84fb964c76'::uuid,32,'bf05bd581b6ec6822b39b7566fa84369',20),
('13c310f6-2ebd-4161-a681-1507c5741b37'::uuid,'2c5d8ba5-9f6b-42da-98ed-6e84877cbfef'::uuid,31,'6059690506569677411aa0c1a8ac75fe',26),
('9b72c98c-b1d2-48a6-8f4e-2ef2f9d59ca0'::uuid,'e7e9a62d-882c-4a57-9557-81fb9c658d10'::uuid,31,'a90799099db5d9fbc042052687bb9237',31),
('3bfd4cc8-0c05-4340-95f8-13c8c09f3389'::uuid,'728830c2-0907-4d69-b8ca-c239bb4cfe08'::uuid,32,'0c453802ac5e74fe176de9fd62d2a001',37),
('08c9154c-eb9f-4173-818b-4e74101c9b05'::uuid,'409bc119-ab7f-41be-a4c2-d172862751ed'::uuid,31,'707eff44d30d542c170361e05bea0ea1',39),
('a8a90117-2102-4219-8dc2-1990eaecca62'::uuid,'7ba939b5-6560-42aa-9446-3f497c08186a'::uuid,30,'225773f1c010e6ac461ba558c0ecbeda',41),
('ad6c8129-89ec-4798-8918-6f3e936b45a2'::uuid,'664afe9c-a5eb-405f-9243-cc352cb91c41'::uuid,31,'1e7ab4d87d835ce98b3b0daf1835926a',43),
('2fa855ac-4267-4769-8fe6-509478d4a455'::uuid,'91fc5ffc-9254-46ab-9bde-b5e4c404e9b7'::uuid,31,'6d621639f26cd92680eae689561ac601',44),
('04209e41-7e54-4f17-8cf4-8c4d9599b31e'::uuid,'db9b0329-f79d-4324-9fd3-c1536301ae63'::uuid,32,'ff33bea4360043f52d38053ffffea872',48),
('ab76d8aa-aa88-4301-bab3-2b2270232a37'::uuid,'2ee56b98-55b2-438a-9c5c-19d49932426e'::uuid,30,'ac5a7929414635c5ac2a7b0edaf90cf1',55),
('fbfe0579-bc90-4889-afbd-e7713c866ff6'::uuid,'232ca922-6398-4777-9d6c-f843366ee8e5'::uuid,32,'3cdaf62877f0e1cad36d5d3691742b3a',58),
('bc91a8be-e3f4-44e6-a713-55811459e975'::uuid,'a2ba582e-55ad-4118-b96e-738f65ff125f'::uuid,32,'014fcac8260d45142a958476f2d3b4cb',71),
('c30b1459-3abb-4f9c-8df9-899a79917018'::uuid,'70ceeb3d-41eb-49f6-b593-0246fe82e76d'::uuid,30,'cae35a3a2b5b53d7eba98169f787bfcc',73),
('7df5fd45-30c2-45b9-9736-45d0721bbf6c'::uuid,'6085a51d-4db4-412f-8892-fa0a47fbea24'::uuid,32,'989e37f057f9b317592c8e68c591ceb1',75),
('52f0cf72-a54e-42c5-8e6d-b80e7cdf04de'::uuid,'4a4e6651-f3eb-451f-96e0-c950e981c699'::uuid,31,'27d2068b7ab8c90156abcfd7c2ad0782',77),
('f4264291-8511-4943-98be-15ab34da0515'::uuid,'0261a61a-9d7d-4201-9a00-4c3e64344b66'::uuid,31,'f5b6362fa89e4a9c667041102f170235',78),
('c03e593d-e019-48ac-beed-ed43c7d9ddc1'::uuid,'91c39f10-7cb9-4cdb-b8da-87f0f564cf43'::uuid,30,'6cc28d89a722b47f7c2cf6f702a9ef9b',79),
('53fdc4c6-c6a5-478d-b5cd-929c7e3ef5b7'::uuid,'8e8212fe-0db2-43ef-a243-4c2f09dd2c3f'::uuid,32,'1319c803bae3e32f9a6adbde9eb6d8c6',82),
('897b259b-cf57-4af9-af14-d7e51561c176'::uuid,'4665fe85-7bac-4ded-9e65-1a911cbc25b4'::uuid,32,'74ab0589225e6aee9599b0d499b9755e',83),
('b145ad91-da50-499f-8d6a-e181e4867bb8'::uuid,'fc677d49-b982-4269-a187-3a2118f12082'::uuid,32,'cc6d4074a3715488bd83ec49c3d65d80',84)
   ) as x(problem_version_id,suite_id,fixture_count,fixture_md5,problem_number)
 loop
   if not exists (select 1 from public.dsa_problem_versions v
       where v.id=e.problem_version_id and v.version_number=2)
      or (select s.id from public.dsa_test_suites s
           where s.problem_version_id=e.problem_version_id
           order by s.suite_version desc,s.created_at desc limit 1) is distinct from e.suite_id
      then raise exception 'STALE_PROBLEM_VERSION_OR_SUITE: %',e.problem_number; end if;
   select count(*), md5(string_agg(t.ordinal::text||':'||t.input_json::text||':'||t.expected_json::text,'|' order by t.ordinal)),
          count(*) filter(where t.visibility='public'),
          count(*) filter(where t.visibility='hidden'),
          count(*) filter(where t.validation_status='rejected')
     into ncases,hash_now,npublic,nhidden,nrejected
     from public.dsa_test_cases t where t.suite_id=e.suite_id;
   if ncases<>e.fixture_count or hash_now<>e.fixture_md5 or npublic=0 or nhidden=0 or nrejected<>0
      then raise exception 'FIXTURE_SET_CHANGED_OR_INVALID: %',e.problem_number; end if;
   if not exists (select 1 from dsa_execution_private.certification_checks c
       where c.suite_id=e.suite_id and c.check_name='independent_oracle'
         and c.verifier_version='independent-js-oracle-batch4-20261016-v1') then
     select coalesce(max(c.attempt_number),0)+1 into new_attempt
       from dsa_execution_private.certification_checks c
       where c.problem_version_id=e.problem_version_id and c.suite_id=e.suite_id
       and c.check_name='independent_oracle';
     insert into dsa_execution_private.certification_checks
       (problem_version_id,suite_id,check_name,attempt_number,result,
        evidence,source_references,verifier,verifier_version,failure_code)
     values (e.problem_version_id,e.suite_id,'independent_oracle',new_attempt,'passed',
       jsonb_build_object('method','independent_js_oracle','problem_number',e.problem_number,
       'cases_checked',e.fixture_count,'cases_matched',e.fixture_count,
       'fixture_set_digest_md5',e.fixture_md5,
       'test_visibility','public_and_hidden','official_judge_verified',false,
       'reference_solution_replayed',false,'provider_sandbox_verified',false,
       'scope','fixture_expected_values_only'),
       '[]'::jsonb,'ReasonAI independent deterministic JS verifier',
       'independent-js-oracle-batch4-20261016-v1',null);
   end if;
   n:=n+1;
 end loop;
 if n<>23 then raise exception 'EXPECTED_23_ORACLE_ROWS_GOT_%',n; end if;
end
$audit$;