-- Rebuild 8 precision-affected latest V2 problem test suites with exact PostgreSQL numeric arithmetic.
-- New review-only suite versions; source suites and learner data stay unchanged.
-- Never claim hosted judge readiness, since the Next.js judge rejects unsafe JS integers.
do $exact$
declare x record; f record; old_count int; source_hash text; new_suite uuid;
input_fixed jsonb; output_fixed jsonb; vals jsonb; outputs jsonb;
len int; i int; j int; N int; K int;
number_val numeric; product_val numeric; temp_val numeric; a numeric; b numeric; swap_val numeric; cat numeric[];
bit_count int; bit_index int; valid_power boolean; repaired int;
begin
for x in select src.problem_number,src.case_count,src.source_digest,s.id source_suite_id,s.problem_version_id,s.suite_version,s.checker_type,s.oracle_metadata
 from(values
(12,32,'ac5526c441bd35d793024d79ced44a12'),
(78,31,'f5b6362fa89e4a9c667041102f170235'),
(336,28,'f9c7cdcc0119a8bf88c4e0f4f7f50a57'),
(337,30,'7d5605a8a1591eefb7af72e51a16e742'),
(353,32,'cda30f2cd2da10d748c9737df0dd6569'),
(388,31,'ce025c27e23f0948a0579937d9506d95'),
(390,30,'b1403aeddfecc1f3756b39be55c4acfc'),
(391,32,'563fe211d89d97fdb8306ec1d70ab67a')
 ) src(problem_number,case_count,source_digest)
 join public.content_items ci on substring(ci.slug from '^ultimate-dsa-([0-9]+)-')::int=src.problem_number
 join public.dsa_problem_definitions d on d.content_item_id=ci.id
 join public.dsa_problem_versions v on v.definition_id=d.id and v.version_number=2
 join public.dsa_test_suites s on s.problem_version_id=v.id
 and s.id=(select s2.id from public.dsa_test_suites s2 where s2.problem_version_id=v.id order by s2.suite_version desc,s2.created_at desc limit 1)
loop
 select count(*),md5(string_agg(ordinal::text||':'||input_json::text||':'||expected_json::text,'|' order by ordinal)) into old_count,source_hash
 from public.dsa_test_cases where suite_id=x.source_suite_id;
 if old_count<>x.case_count or source_hash<>x.source_digest then raise exception 'Source snapshot changed for %',x.problem_number;end if;
 if exists(select 1 from public.dsa_test_suites where problem_version_id=x.problem_version_id and suite_version=x.suite_version+1) then raise exception 'Target version exists for %',x.problem_number;end if;
 insert into public.dsa_test_suites(problem_version_id,suite_version,checker_type,status,oracle_metadata)
 values(x.problem_version_id,x.suite_version+1,x.checker_type,'needs_review',x.oracle_metadata||jsonb_build_object(
 'repair_kind','lossless_postgres_numeric_regeneration','repair_version','exact_integer_math_v1_20261016',
 'source_suite_id',x.source_suite_id::text,'source_fixture_snapshot_md5',x.source_digest,
 'reference_input_recovery',case when x.problem_number in (390,391) then 'reconstructed_powers_of_two' when x.problem_number=388 then 'preserve_existing_numeric_and_recompute;restore_64bit_all_ones_boundary' else 'original_input_unchanged' end,
 'mathematical_fixture_values_verified',false,'json_number_transport_review_required',true,'provider_verified',false,'judge_ready',false,'publish_approved',false))
 returning id into new_suite;
 insert into public.dsa_test_cases(suite_id,ordinal,category,visibility,input_json,expected_json,fixture_ref,validation_status,provenance)
 select new_suite,t.ordinal,t.category,t.visibility,t.input_json,t.expected_json,t.fixture_ref,'pending',
 t.provenance||jsonb_build_object('repair_source_case_id',t.id::text,'repair_source_suite_id',x.source_suite_id::text,
 'repair_version','exact_integer_math_v1_20261016','original_data_retained',true,'provider_execution_verified',false)
 from public.dsa_test_cases t where t.suite_id=x.source_suite_id;
 repaired:=0;
 for f in select t.id,t.ordinal,t.input_json,t.expected_json from public.dsa_test_cases t where t.suite_id=new_suite order by t.ordinal
 loop
  input_fixed:=f.input_json; output_fixed:=f.expected_json;
  if x.problem_number in (12,78) then
    vals:=f.input_json->case when x.problem_number=12 then 'nums' else 'array' end;
    len:=jsonb_array_length(vals);outputs:='[]'::jsonb;
    for i in 0..len-1 loop
      product_val:=1;
      for j in 0..len-1 loop
        if j<>i then product_val:=product_val*(vals->>j)::numeric;end if;
      end loop;
      outputs:=outputs||jsonb_build_array(product_val);
    end loop;
    output_fixed:=outputs;
  elsif x.problem_number=336 then
    N:=(f.input_json->>'n')::int;a:=1;b:=1;
    for i in 2..N loop swap_val:=a+b;a:=b;b:=swap_val;end loop;
    output_fixed:=to_jsonb(b);
  elsif x.problem_number=337 then
    N:=(f.input_json->>'n')::int;K:=(f.input_json->>'k')::int;product_val:=1;
    for i in (N-K+1)..N loop product_val:=product_val*i;end loop;
    output_fixed:=to_jsonb(product_val);
  elsif x.problem_number=353 then
    N:=(f.input_json->>'n')::int;cat:=array_fill(0::numeric,ARRAY[N+1]);cat[1]:=1;
    for i in 1..N loop
      number_val:=0;
      for j in 0..i-1 loop number_val:=number_val+cat[j+1]*cat[i-j];end loop;
      cat[i+1]:=number_val;
    end loop;
    output_fixed:=to_jsonb(cat[N+1]);
  elsif x.problem_number=388 then
    -- The original imported 64-bit-max boundary was rounded. Restore it exactly.
    if f.ordinal=7 and (f.expected_json::text)::int=64 then
      input_fixed:=jsonb_set(input_fixed,'{n}',to_jsonb(power(2::numeric,64)-1));
    end if;
    number_val:=(input_fixed->>'n')::numeric;bit_count:=0;
    while number_val>0 loop
      if mod(number_val,2)=1 then bit_count:=bit_count+1;end if;
      number_val:=trunc(number_val/2);
    end loop;
    output_fixed:=to_jsonb(bit_count);
  elsif x.problem_number=390 then
    number_val:=(f.input_json->>'n')::numeric;
    if f.expected_json='true'::jsonb and number_val>1 then
      -- Recover originally authored power-of-two boundary if imported float rounded it.
      bit_index:=round(ln(number_val)/ln(2::numeric))::int;
      temp_val:=power(2::numeric,bit_index);
      if temp_val<>number_val and abs(temp_val-number_val)/temp_val<0.000000000001 then
        input_fixed:=jsonb_set(input_fixed,'{n}',to_jsonb(temp_val));
        number_val:=temp_val;
      end if;
    end if;
    valid_power:=number_val>0;
    while number_val>1 and valid_power loop
      if mod(number_val,2)<>0 then valid_power:=false;exit;end if;
      number_val:=trunc(number_val/2);
    end loop;
    output_fixed:=to_jsonb(valid_power and number_val=1);
  elsif x.problem_number=391 then
    number_val:=(f.input_json->>'n')::numeric;
    K:=(f.expected_json::text)::int;
    if K>0 and number_val>1 then
      temp_val:=power(2::numeric,K-1);
      if temp_val<>number_val and abs(temp_val-number_val)/temp_val<0.000000000001 then
         input_fixed:=jsonb_set(input_fixed,'{n}',to_jsonb(temp_val));
         number_val:=temp_val;
      end if;
    end if;
    bit_index:=0;valid_power:=number_val>0;
    while number_val>0 and valid_power loop
       if mod(number_val,2)=1 then
         if number_val<>1 then valid_power:=false;end if;
       end if;
       number_val:=trunc(number_val/2);bit_index:=bit_index+1;
    end loop;
    if valid_power then output_fixed:=to_jsonb(bit_index);else output_fixed:=to_jsonb(-1);end if;
  end if;
  if f.input_json is distinct from input_fixed or f.expected_json is distinct from output_fixed then
    repaired:=repaired+1;
    update public.dsa_test_cases set input_json=input_fixed,expected_json=output_fixed,
      provenance=provenance||jsonb_build_object('exact_numeric_repaired',true,'repair_algorithm','plpgsql_numeric_exact','before_fixture_version',x.suite_version)
    where id=f.id;
  end if;
 end loop;
 if (select count(*) from public.dsa_test_cases where suite_id=new_suite)<>x.case_count then raise exception 'Case count changed %',x.problem_number;end if;
 update public.dsa_test_suites set oracle_metadata=oracle_metadata||jsonb_build_object('repaired_case_count',repaired) where id=new_suite;
end loop;
end $exact$;
