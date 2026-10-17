create table public.dsa_problem_definitions (
 id uuid primary key default gen_random_uuid(),
 content_item_id uuid not null references public.content_items(id) on delete restrict,
 practice_resource_id uuid not null references public.practice_resources(id) on delete restrict,
 current_version_id uuid,
 created_at timestamptz not null default now(),
 unique(practice_resource_id)
);
create table public.dsa_problem_versions (
 id uuid primary key default gen_random_uuid(),
 definition_id uuid not null references public.dsa_problem_definitions(id) on delete restrict,
 version_number integer not null check(version_number>0),
 specification jsonb not null default '{}'::jsonb check(jsonb_typeof(specification)='object'),
 provenance jsonb not null default '{}'::jsonb check(jsonb_typeof(provenance)='object'),
 source_sha256 text check(source_sha256 is null or source_sha256 ~ '^[a-f0-9]{64}$'),
 status text not null default 'pending' check(status in ('pending','fetched','normalized','needs_review','verified','published','failed')),
 created_at timestamptz not null default now(),
 verified_at timestamptz,
 unique(definition_id,version_number),
 unique(id,definition_id)
);
alter table public.dsa_problem_definitions add constraint dsa_definition_current_version_fk foreign key(current_version_id,id) references public.dsa_problem_versions(id,definition_id) deferrable initially deferred;
create table public.dsa_problem_ingestion_jobs (
 id uuid primary key default gen_random_uuid(),
 definition_id uuid not null references public.dsa_problem_definitions(id) on delete restrict,
 status text not null default 'queued' check(status in ('queued','running','needs_review','completed','failed')),
 attempts integer not null default 0 check(attempts>=0),
 error_code text,
 error_detail text,
 started_at timestamptz,
 completed_at timestamptz,
 created_at timestamptz not null default now()
);
create index dsa_ingestion_job_status_idx on public.dsa_problem_ingestion_jobs(status,created_at);
create table public.dsa_test_suites (
 id uuid primary key default gen_random_uuid(),
 problem_version_id uuid not null references public.dsa_problem_versions(id) on delete restrict,
 suite_version integer not null check(suite_version>0),
 checker_type text not null default 'exact' check(checker_type in ('exact','unordered','numeric_tolerance','custom')),
 status text not null default 'draft' check(status in ('draft','needs_review','verified','published')),
 oracle_metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 unique(problem_version_id,suite_version)
);
create table public.dsa_test_cases (
 id uuid primary key default gen_random_uuid(),
 suite_id uuid not null references public.dsa_test_suites(id) on delete restrict,
 ordinal integer not null check(ordinal>=0),
 category text not null check(category in ('official','boundary','edge','adversarial','randomized','performance')),
 visibility text not null default 'hidden' check(visibility in ('public','hidden')),
 input_json jsonb,
 expected_json jsonb,
 fixture_ref text,
 validation_status text not null default 'pending' check(validation_status in ('pending','verified','rejected')),
 provenance jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 unique(suite_id,ordinal),
 check(input_json is not null or fixture_ref is not null)
);
create index dsa_test_cases_suite_idx on public.dsa_test_cases(suite_id,visibility);
create table public.dsa_language_runtimes (
 id uuid primary key default gen_random_uuid(),
 language text not null,
 runtime_version text not null,
 image_digest text,
 configuration jsonb not null default '{}'::jsonb,
 enabled boolean not null default false,
 created_at timestamptz not null default now(),
 unique(language,runtime_version)
);
alter table public.dsa_problem_definitions enable row level security;
alter table public.dsa_problem_versions enable row level security;
alter table public.dsa_problem_ingestion_jobs enable row level security;
alter table public.dsa_test_suites enable row level security;
alter table public.dsa_test_cases enable row level security;
alter table public.dsa_language_runtimes enable row level security;
revoke all on public.dsa_problem_definitions,public.dsa_problem_versions,public.dsa_problem_ingestion_jobs,public.dsa_test_suites,public.dsa_test_cases,public.dsa_language_runtimes from anon,authenticated;
