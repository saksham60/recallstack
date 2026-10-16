-- Independent JS brute force/DP oracles verified 750/750 candidate expected outputs across 24 v2 problems.
-- Exact source fixture digests checked in the transaction; no hidden inputs are stored here.
-- Official hosted judge readiness, API security and checker contracts remain separate.
do $audit$
declare e record; count_rows integer:=0; suite_cases integer; suite_md5 text; pub int; hid int; rejected int; attempt integer;
begin
 for e in
    select * from (values
('33fda518-556d-47fa-967b-e0f90ba4da89'::uuid,'ed0b9428-1a7e-4c61-8439-9f045c88a0c1'::uuid,30,'f922121a60d56d49ada61d034a16d92f',21),
('d50cbc6e-d4ba-46e8-bfa2-d4639fbd8c57'::uuid,'58c8b2e7-2a54-4f31-9949-da361880b1bb'::uuid,32,'4542f983c9d09a6c0b2056699bf168fd',22),
('c6794723-9aef-4946-98a4-50386ac738a5'::uuid,'f27ae725-6e66-4d0a-b7e7-e43858c5f11f'::uuid,28,'c9e3ea1e808cb7f1155d2d4a27050d00',25),
('a4cb9c6b-0824-460a-95c4-4d3e33312af9'::uuid,'6f552c4b-142d-43a7-b6c6-ea51db800a63'::uuid,32,'28fd9112d84fafd762bb84d117f3f0ee',42),
('4cab8c39-f3d1-4289-ab24-b8bbdef70255'::uuid,'a6e938b7-d682-48c5-b2f1-ac61bb01b4fc'::uuid,32,'799c29592627c7795958d5cc97feb489',47),
('588d2dcd-c9c3-484f-be8c-19dd2ea59301'::uuid,'6f82248f-132a-48fa-8d66-a39c1793a1bc'::uuid,32,'40acb01f6750e11a295a5408425466af',50),
('4a6b64d1-9d63-4820-a7c5-85413779a8fb'::uuid,'11f13b4d-889d-4e36-878e-4594d8fb72b6'::uuid,32,'a0b23dec4aa0d0aa22348322a9fdd37c',53),
('4d020c68-b5fc-4f22-92d7-1d0080ec8420'::uuid,'38643835-e6a2-4289-a60c-689476f38605'::uuid,32,'901809637a479a9b6383c0488e713157',57),
('5986554b-6545-42c0-b6e7-2c732b1a41c1'::uuid,'51cbca32-ec60-4273-b787-c062eab93b4b'::uuid,28,'986b0814290e12bc63c8f8e4afa24289',59),
('157cfbf7-e046-4bea-8797-bbe5ddc27865'::uuid,'4c6bd9ca-6f87-40df-a19b-02d365d19b47'::uuid,32,'7c2621c6a7360caa337468fa17edb17f',60),
('cab52c14-bfa6-4293-9f7a-e8fcb1a0a7e4'::uuid,'269524ea-883d-4c6d-9ec6-d63dd8b7fe4b'::uuid,32,'8d211de1df158d6d3d4ce921835bcd4f',61),
('22cd7e88-7597-42b2-a720-e03b206f94de'::uuid,'adc5e803-3f94-44f6-af53-ae004a054b03'::uuid,29,'b7d615ce371cf43a3179cc4c978f5580',62),
('3dce819d-730e-48b5-b805-29e2c740377b'::uuid,'779afc23-3f8f-449b-b46d-047d342e2f31'::uuid,32,'0a649c661567d02e8f905ae896843d8c',65),
('0fa83d08-9d99-4927-868a-004b5f469ee4'::uuid,'658418b1-89d5-4953-82e7-2eb8087b8c33'::uuid,32,'3293c0e6614094e6e6f44e7dc0ce9735',68),
('dc4f23f2-2e9b-4a77-92b0-547b6e1de4e6'::uuid,'775dbeac-faaf-4de5-82f1-dd02e3c372b0'::uuid,32,'6e5957aeda75ff4cf8786bc4975776c3',70),
('18cc5965-964b-4c32-8339-25750853e933'::uuid,'1f9522c4-4ae0-4d48-87c6-c0bd235c9a79'::uuid,32,'4ead93cb02743da9443e764b196ed47d',72),
('efc57e8b-c97c-450c-b5aa-108980550d4d'::uuid,'255f9876-46d0-4b10-8553-901d737fd44f'::uuid,32,'3a41c379f9bb2741f61b2a075472fc63',74),
('ea729901-ec1b-401f-b878-1ba63aeaf4b2'::uuid,'fc7f1d8a-4dd2-4681-bc42-d945fa8d1b1a'::uuid,29,'c131ef94e34a878a53898c790b7cdcaf',80),
('5d11c99f-c7fa-486e-8035-2a4987711174'::uuid,'37801798-bd17-4a39-9f8d-d2bcfc66948c'::uuid,32,'09fcf9cee315b688c03c68b50c2fb0ce',81),
('1fe0f1ba-ceb8-4d1b-a8cf-3cd05af00b50'::uuid,'31d5b018-9832-4659-9efa-e3532e082629'::uuid,31,'70278ad8f20c2981a8adfad1d8ef8e53',85),
('8ea27c16-fb29-4432-b203-92b08df00e09'::uuid,'f82f1af8-5bf3-4d1d-8e69-7d2c729d7e62'::uuid,32,'51cc1aa53184468dc8d61f49759b1944',86),
('dd652ab9-0a23-4d40-a32e-b83166675e2f'::uuid,'620ff01c-97ea-4e67-8514-21b09e0b0af6'::uuid,32,'9d7a98cff69c4f59ba18a4ae785cdd00',87),
('a5a6036c-1547-4ac0-92e0-a651c289ab2c'::uuid,'4635527a-35fe-495f-a701-4400f753196f'::uuid,32,'56a85d307723f82c35185f762d6365b1',91),
('589d9211-0003-41e4-a428-bf1929c00894'::uuid,'feddcfdd-07e6-42f3-a8b5-0aec9c1d624a'::uuid,31,'4ddd0423def4d05e77b460debe6a5527',96)
    ) as x(problem_version_id,suite_id,expected_cases,expected_md5,problem_number)
 loop
   if not exists(select 1 from public.dsa_problem_versions d
      where d.id=e.problem_version_id and d.version_number=2) or
      (select s.id from public.dsa_test_suites s
       where s.problem_version_id=e.problem_version_id
       order by s.suite_version desc,s.created_at desc limit 1) is distinct from e.suite_id
   then raise exception 'SUITE_OR_VERSION_CHANGED: %',e.problem_number; end if;
   select count(*),md5(string_agg(t.ordinal::text||':'||t.input_json::text||':'||t.expected_json::text,'|' order by t.ordinal)),
       count(*) filter(where t.visibility='public'),
       count(*) filter(where t.visibility='hidden'),
       count(*) filter(where t.validation_status='rejected')
   into suite_cases,suite_md5,pub,hid,rejected
   from public.dsa_test_cases t where t.suite_id=e.suite_id;
   if suite_cases<>e.expected_cases or suite_md5<>e.expected_md5 or pub=0 or hid=0 or rejected<>0
      then raise exception 'SUITE_FIXTURE_CHANGED: %',e.problem_number; end if;
   if not exists(select 1 from dsa_execution_private.certification_checks c
        where c.suite_id=e.suite_id and c.check_name='independent_oracle'
        and c.verifier_version='independent-js-oracle-batch5-20261016-v1') then
     select coalesce(max(c.attempt_number),0)+1 into attempt
     from dsa_execution_private.certification_checks c
     where c.problem_version_id=e.problem_version_id and c.suite_id=e.suite_id and c.check_name='independent_oracle';
     insert into dsa_execution_private.certification_checks
       (problem_version_id,suite_id,check_name,attempt_number,result,evidence,source_references,verifier,verifier_version,failure_code)
     values(e.problem_version_id,e.suite_id,'independent_oracle',attempt,'passed',
        jsonb_build_object('method','independent_js_oracle','problem_number',e.problem_number,
        'cases_checked',e.expected_cases,'cases_matched',e.expected_cases,
        'fixture_set_digest_md5',e.expected_md5,'scope','fixture_expected_values_only',
        'source_contract_verified',false,'hosted_judge_verified',false,
        'official_certificate_issued',false),
        '[]'::jsonb,'ReasonAI independent deterministic JS verifier',
        'independent-js-oracle-batch5-20261016-v1',null);
   end if;
   count_rows:=count_rows+1;
 end loop;
 if count_rows<>24 then raise exception 'EXPECTED_24_ORACLE_ROWS_GOT_%',count_rows; end if;
end
$audit$;