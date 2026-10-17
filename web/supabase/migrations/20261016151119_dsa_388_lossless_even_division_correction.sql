-- Exact bitcount repair for new review-only #388 suite v3; original source suite remains unchanged.
-- Numeric /2 rounds odd large integers in PostgreSQL. Subtract parity FIRST to ensure exact even division.
do $$
declare r record; n numeric; bits int; changed int:=0; c int; h text;
begin
if (select s.id from public.dsa_test_suites s where s.problem_version_id='1e90d4a3-d6ff-413f-9c4d-9817e96a4479'::uuid order by s.suite_version desc,s.created_at desc limit 1) <> 'bb90dc1f-eff2-4cd6-9aae-14d60ea584f2'::uuid then raise exception 'Not latest repair version'; end if;
select count(*),md5(string_agg(ordinal::text||':'||input_json::text||':'||expected_json::text,'|' order by ordinal)) into c,h from public.dsa_test_cases where suite_id='bb90dc1f-eff2-4cd6-9aae-14d60ea584f2'::uuid;
if c<>31 or h<>'1efe44147e924899475089749c6b4bdb' then raise exception 'Review suite snapshot changed';end if;
for r in select id,input_json,expected_json from public.dsa_test_cases where suite_id='bb90dc1f-eff2-4cd6-9aae-14d60ea584f2'::uuid
loop
 n:=(r.input_json->>'n')::numeric;bits:=0;
 while n>0 loop
   bits:=bits+mod(n,2)::int;
   n:=(n-mod(n,2))/2;
 end loop;
 if to_jsonb(bits) is distinct from r.expected_json then
   update public.dsa_test_cases set expected_json=to_jsonb(bits),
   provenance=provenance||jsonb_build_object('exact_numeric_repaired',true,'division_strategy','subtract_bit_before_even_division','repair_math_version','exact_bitcount_v2') where id=r.id;
   changed:=changed+1;
 end if;
end loop;
if changed<>5 then raise exception 'Expected 5 corrections got %',changed;end if;
update public.dsa_test_suites set oracle_metadata=oracle_metadata||jsonb_build_object('lossless_bitcount_v2',true,'numeric_division_method','subtract_parity_then_divide','arithmetic_review_ready',true) where id='bb90dc1f-eff2-4cd6-9aae-14d60ea584f2'::uuid;
end $$;
