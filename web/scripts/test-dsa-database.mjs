// Disposable PostgreSQL/WASM. No network, provider calls, or production mutations.
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const db = new PGlite();
const sql = async (text, args = []) => (await db.query(text, args)).rows;
const scalar = async (text, args = []) =>
  Object.values((await sql(text, args))[0])[0];
const migration = async (name) => {
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/" + name, import.meta.url),
      "utf8",
    ),
  );
  console.log("Applied in disposable database:", name);
};
try {
  await db.exec(`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth;
 create table auth.users(id uuid primary key default gen_random_uuid());
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,service_role;
 create table public.profiles(id uuid primary key references auth.users(id));
 create table public.categories(id uuid primary key);
 create table public.domains(id uuid primary key,slug text,is_active boolean);
 create table public.content_items(id uuid primary key,domain_id uuid,type text,archived_at timestamptz,current_published_version_id uuid);
 create table public.content_versions(id uuid primary key,content_item_id uuid,status text,published_at timestamptz);
 create table public.practice_resources(id uuid primary key);
 create table public.dsa_explorer_boards(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),title text,grouping text,layout text,settings jsonb default '{}',revision bigint not null default 1,created_at timestamptz default now(),updated_at timestamptz default now());
 alter table public.dsa_explorer_boards enable row level security;
 create policy owner on public.dsa_explorer_boards for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
 grant select,insert,update,delete on public.dsa_explorer_boards to authenticated;
 create table public.dsa_companies(id uuid primary key,slug text,canonical_name text,review_status text);
 create table public.dsa_problem_companies(definition_id uuid,company_id uuid,source_block_id uuid);
 create table public.dsa_problem_company_sources(definition_id uuid,source_block_id uuid,review_status text);
 create function public.dsa_code_intelligence_enqueue(integer) returns integer language sql as $$select 0$$;
 create function public.dsa_code_intelligence_claim(integer) returns jsonb language sql as $$select '[]'::jsonb$$;
 `);
  for (const file of [
    "20261014062832_dsa_problem_ingestion_registry_v1.sql",
    "20261015172042_dsa_execution_jobs.sql",
    "20261016073423_dsa_certification_ledger_and_code_intelligence.sql",
    "20261017060223_dsa_v3_explorer_projection.sql",
    "20261017060229_dsa_v3_report_orchestration.sql",
    "20261017060241_dsa_v3_versioned_contracts_certification.sql",
    "20261017060319_dsa_provisional_submissions.sql",
    "20261017061057_dsa_report_activation_boundary.sql",
    "20261017083528_dsa_remove_report_attempt_ceiling.sql",
  ])
    await migration(file);
  await db.exec(
    "grant select,insert,update,delete on all tables in schema public to service_role; grant execute on all functions in schema public to service_role;",
  );
  // Restore explicit service exclusions after broad test-fixture grants.
  await db.exec(
    "revoke execute on function public.dsa_code_intelligence_enqueue(integer), public.dsa_code_intelligence_claim(integer) from service_role;",
  );
  const owner = randomUUID(),
    foreign = randomUUID(),
    domain = randomUUID(),
    problem = randomUUID(),
    base = randomUUID(),
    resource = randomUUID(),
    definition = randomUUID(),
    version = randomUUID(),
    suite = randomUUID();
  await db.exec(`insert into auth.users values('${owner}'),('${foreign}'); insert into public.profiles values('${owner}'),('${foreign}');
 insert into public.domains values('${domain}','dsa',true);
 insert into public.content_items values('${problem}','${domain}','problem',null,'${base}');
 insert into public.content_versions values('${base}','${problem}','published',now()); insert into public.practice_resources values('${resource}');
 insert into public.dsa_problem_definitions(id,content_item_id,practice_resource_id) values('${definition}','${problem}','${resource}');
 insert into public.dsa_problem_versions(id,definition_id,version_number,specification,provenance,status) values('${version}','${definition}',2,
 '{"title":"Local integer identity","function_contract":{"function":"solve"},"problem_statement":"Return the supplied integer"}',
 jsonb_build_object('reference_solution_python','def solve(p): return p[''n'']','quality_review_20261015','{"publish_approved":true}'::jsonb),'published');
 update public.dsa_problem_definitions set current_version_id='${version}' where id='${definition}';
 insert into public.dsa_test_suites(id,problem_version_id,suite_version,status) values('${suite}','${version}',1,'needs_review');
 insert into public.dsa_test_cases(suite_id,ordinal,category,visibility,input_json,expected_json) values
 ('${suite}',0,'official','public','{"n":9007199254740993}','9007199254740993'),
 ('${suite}',1,'edge','hidden','{"n":9007199254740995}','9007199254740995');
 insert into dsa_execution_private.certification_checks(problem_version_id,suite_id,check_name,attempt_number,result,evidence,verifier,verifier_version)
 select '${version}','${suite}',name,1,'passed','{"localFixture":true}','Local test','test-only' from unnest(array['independent_oracle','fixture_integrity'])name;
 insert into dsa_execution_private.provisional_contracts(problem_version_id,suite_id,contract,reference_sha256,interface_sha256,fixtures_sha256,harness_sha256,oracle_check_id,integrity_check_id,validation_evidence)
 select v.id,'${suite}','{"entrypoint":"solve","inputMode":"single","checker":"exact_json","integerEncoding":"tagged-v1"}',
 encode(sha256(convert_to(v.provenance->>'reference_solution_python','UTF8')),'hex'),
 encode(sha256(convert_to(jsonb_build_object('statement',v.specification->'problem_statement','interface',v.specification->'function_contract')::text,'UTF8')),'hex'),
 dsa_execution_private.v3_fixture_sha('${suite}'),repeat('a',64),
 (select id from dsa_execution_private.certification_checks where check_name='independent_oracle'),
 (select id from dsa_execution_private.certification_checks where check_name='fixture_integrity'),'{"testOnly":true}' from public.dsa_problem_versions v;
 `);
  const args = { problemId: problem, problemVersionId: version };
  const command = async (action, args) =>
    scalar("select public.dsa_execution_command($1,$2::jsonb)", [
      action,
      JSON.stringify(args),
    ]);
  const report = async (action, args) =>
    scalar("select public.dsa_report_command($1,$2::jsonb)", [
      action,
      JSON.stringify(args),
    ]);
  const available = await command("availability", args);
  assert.equal(available.submit.gradingLevel, "provisional");
  assert.ok(!available.submit.certificateId);
  assert.equal(available.run.cases.length, 1);
  assert.equal(available.submit.cases.length, 2);
  assert.deepEqual(available.run.cases[0].input, {
    n: { $reasonaiInteger: "9007199254740993" },
  });
  assert.equal(
    await scalar(
      "select count(*)::int from dsa_execution_private.certificates",
    ),
    0,
  );
  for (const role of ["anon", "authenticated"]) {
    assert.equal(
      await scalar(
        `select has_function_privilege('${role}','public.dsa_report_command(text,jsonb)','execute')`,
      ),
      false,
    );
    assert.equal(
      await scalar(
        `select has_function_privilege('${role}','public.dsa_execution_command(text,jsonb)','execute')`,
      ),
      false,
    );
    assert.equal(
      await scalar(
        `select has_table_privilege('${role}','dsa_execution_private.provisional_contracts','select')`,
      ),
      false,
    );
  }
  const request = {
    ...args,
    language: "python",
    code: 'def solve(p): return p["n"]',
    mode: "submit",
    idempotencyKey: randomUUID(),
  };
  await db.exec("set role service_role;");
  const created = await command("create", {
    userId: owner,
    request,
    hash: "b".repeat(64),
  });
  assert.equal(
    (await command("create", { userId: owner, request, hash: "b".repeat(64) }))
      .submissionId,
    created.submissionId,
  );
  assert.equal(
    await command("get", { userId: foreign, id: created.submissionId }),
    null,
  );
  const token = randomUUID();
  await command("claim", { id: created.submissionId, token });
  await command("finish", {
    id: created.submissionId,
    token,
    status: "completed",
    result: {
      verdict: "accepted",
      publicCases: [{ input: "PRIVATE_SENTINEL" }],
      passedTests: 2,
      totalTests: 2,
    },
  });
  const finished = await command("get", {
    userId: owner,
    id: created.submissionId,
  });
  assert.equal(finished.result.verdict, "provisional_pass");
  assert.equal(finished.result.gradingLevel, "provisional");
  assert.ok(!JSON.stringify(finished).includes("PRIVATE_SENTINEL"));
  assert.ok(!finished.result.totalTests);
  const premature = await report("dispatch", {model:"test-model",rubric:"dsa-code-intelligence:1",maxAttempts:1,createdAfter:"2099-01-01T00:00:00.000Z"});
  assert.equal(premature.length,0);
  const dispatch = await report("dispatch", {
    model: "test-model",
    rubric: "dsa-code-intelligence:1",
    maxAttempts: 1,
  });
  assert.equal(dispatch.length, 1);
  const claim = await report("claim", {
    id: dispatch[0].id,
    token: randomUUID(),
  });
  assert.equal(claim.packet.judge.gradingLevel, "provisional");
  assert.equal(claim.packet.judge.verdict, "provisional_pass");
  assert.ok(!JSON.stringify(claim.packet).includes("9007199254740995"));
  assert.ok(
    !claim.packet.plan && !claim.packet.cases && !claim.packet.judge.totalTests,
  );
  assert.equal(
    await report("finish", {
      id: claim.id,
      token: claim.token,
      document: { summary: "Explicit local test document" },
    }),
    true,
  );
  assert.equal(
    await report("get", {
      submissionId: created.submissionId,
      userId: foreign,
    }),
    null,
  );
  const saved = await report("get", {
    submissionId: created.submissionId,
    userId: owner,
  });
  assert.equal(saved.report.status, "completed");
  assert.equal(saved.sourceCode, request.code);
  assert.equal(
    (await report("history", { ...args, userId: owner })).items[0].result
      .verdict,
    "provisional_pass",
  );
  await report("dispatch", {
    model: "test-model",
    rubric: "dsa-code-intelligence:1",
    maxAttempts: 1,
  });
  assert.equal(
    (await report("get", { submissionId: created.submissionId, userId: owner }))
      .report.id,
    saved.report.id,
  );
  await db.exec("reset role;");
  await sql(
    "update public.dsa_test_cases set expected_json='42' where suite_id=$1 and visibility='hidden'",
    [suite],
  );
  assert.equal((await command("availability", args)).submit, null);
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claim.sub','${foreign}',false);`,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from public.dsa_code_intelligence_reports",
    ),
    0,
  );
  await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false);`);
  assert.equal(
    await scalar(
      "select count(*)::int from public.dsa_code_intelligence_reports",
    ),
    1,
  );
  await db.exec("reset role;");
  console.log(
    "PASS: migration compatibility, provisional admission, exact integer SQL transport, no certificate creation, owner isolation, idempotency, result redaction, report persistence/deduplication, and stale-fixture rejection.",
  );
} finally {
  await db.close();
}
