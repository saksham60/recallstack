"""Validate existing imported interfaces without replaying the 375 fixture suites.

Private cached exports are inputs; output contains only IDs and source/interface
digests. Database admission independently verifies the current source digests.
"""
import ast
import hashlib
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
rows = []
for file in sorted((root / ".next/cache/dsa-v3-private").glob("catalog-*.json")):
    rows.extend(json.loads(file.read_text(encoding="utf-8"))["items"])
assert len(rows) == 375 and len({r["problem_version_id"] for r in rows}) == 375
proofs = []
for row in rows:
    source = row["provenance"]["reference_solution_python"]
    tree = ast.parse(source)
    solve = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "solve"]
    assert len(solve) == 1, row["slug"]
    args = solve[0].args
    assert len(args.posonlyargs) + len(args.args) == 1 and not args.vararg and not args.kwarg and not args.kwonlyargs, row["slug"]
    assert row["specification"]["function_contract"]["function"] == "solve", row["slug"]
    compile(tree, "private-reference.py", "exec")
    proofs.append({"slug": row["slug"], "referenceSha256": hashlib.sha256(source.encode()).hexdigest()})
output = root / ".next/cache/dsa-provisional-interface-proofs.json"
output.write_text(json.dumps(proofs, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"validatedInterfaces": len(proofs), "fixtureReplays": 0, "method": "AST single JSON parameter, explicit published solve interface, compile only"}))
harness = re.search(r'HARNESS_SHA256 = "([a-f0-9]{64})"', (root / 'src/lib/dsa-execution/python/harness.generated.ts').read_text())[1]
seed = """-- Only interface source hashes are seeded. No reference solution, fixture, certificate or review is changed.
-- Reuse completed independent checks; this migration does NOT replay or fabricate them.
do $install$
declare installed integer;
begin
 if exists(select 1 from dsa_execution_private.provisional_contracts) then raise exception 'PROVISIONAL_REGISTRY_NOT_EMPTY'; end if;
 with source_proofs as (select * from jsonb_to_recordset($proofs$PROOFS$proofs$::jsonb) as p(slug text,"referenceSha256" text)),
 picked as (
 select i.slug,v.*,s.id suite_id,s.checker_type,o.id oracle_id,o.evidence oracle_evidence,f.id integrity_id,
   (select count(*) from public.dsa_test_cases where suite_id=s.id) case_count,
   (select md5(string_agg(ordinal::text||':'||input_json::text||':'||expected_json::text,'|' order by ordinal)) from public.dsa_test_cases where suite_id=s.id) snapshot_md5,
   p."referenceSha256" reference_sha
 from source_proofs p join public.content_items i on i.slug=p.slug and i.archived_at is null and i.type::text='problem'
 join public.dsa_problem_definitions d on d.content_item_id=i.id join public.dsa_problem_versions v on v.id=d.current_version_id and v.status='published'
 join lateral(select * from public.dsa_test_suites where problem_version_id=v.id order by suite_version desc,created_at desc,id desc limit 1)s on true
 join lateral(select * from dsa_execution_private.certification_checks where problem_version_id=v.id and suite_id=s.id and check_name='independent_oracle' order by verified_at desc,id desc limit 1)o on o.result='passed'
 join lateral(select * from dsa_execution_private.certification_checks where problem_version_id=v.id and suite_id=s.id and check_name='fixture_integrity' order by verified_at desc,id desc limit 1)f on f.result='passed'
 where encode(sha256(convert_to(v.provenance->>'reference_solution_python','UTF8')),'hex')=p."referenceSha256"
   and v.specification#>>'{function_contract,function}'='solve'
 ), eligible as (
 select *,case slug
   when 'ultimate-dsa-098-knight-tour' then 'knight_tour'
   when 'ultimate-dsa-110-arithmetic-expressions' then 'arithmetic_expression'
   when 'ultimate-dsa-125-linked-list-in-zig-zag-fashion' then 'zigzag_multiset'
   when 'ultimate-dsa-188-rearrange-characters-string-such-that-no-two-adjacent-are-same' then 'nonadjacent_characters'
   when 'ultimate-dsa-238-delete-node-in-a-bst' then 'exact_json'
   else case when checker_type='exact' then 'exact_json' end end fixed_checker
 from picked where case_count between 2 and 100
 and coalesce(oracle_evidence->>'fixture_snapshot_md5',oracle_evidence->>'fixture_set_digest_md5',snapshot_md5)=snapshot_md5
 and not exists(select 1 from public.dsa_test_cases t where t.suite_id=picked.suite_id and (t.validation_status='rejected' or t.input_json is null or t.expected_json is null or t.fixture_ref is not null))
 and exists(select 1 from public.dsa_test_cases where suite_id=picked.suite_id and visibility='public')
 and exists(select 1 from public.dsa_test_cases where suite_id=picked.suite_id and visibility='hidden')
 )
 insert into dsa_execution_private.provisional_contracts(problem_version_id,suite_id,contract,reference_sha256,interface_sha256,fixtures_sha256,harness_sha256,oracle_check_id,integrity_check_id,validation_evidence)
 select id,suite_id,jsonb_build_object('entrypoint','solve','inputMode','single','checker',fixed_checker,'integerEncoding','tagged-v1'),reference_sha,
 encode(sha256(convert_to(jsonb_build_object('statement',specification->'problem_statement','interface',specification->'function_contract')::text,'UTF8')),'hex'),
 dsa_execution_private.v3_fixture_sha(suite_id),'HARNESS',oracle_id,integrity_id,
 jsonb_build_object('interfaceValidation','AST compile and one JSON parameter; published interface explicitly names solve',
 'fixtureEvidence','Existing latest independent_oracle and fixture_integrity passed checks; no replay',
 'initialSnapshotMd5',snapshot_md5,'checker',fixed_checker,'officialCertification',false)
 from eligible where fixed_checker is not null;
 get diagnostics installed = row_count;
 if installed<>375 then raise exception 'EXPECTED_375_VALIDATED_CONTRACTS_GOT_%',installed; end if;
end $install$;
""".replace('PROOFS', json.dumps(proofs, separators=(',', ':'))).replace('HARNESS', harness)
(root / '.next/cache/dsa-provisional-seed.sql').write_text(seed, encoding='utf-8')
